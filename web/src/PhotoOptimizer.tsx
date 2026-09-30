import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Download,
  ImageDown,
  RotateCcw,
  RotateCw,
  Undo2,
  Redo2,
  Upload,
  X,
  HardDrive,
  ChevronUp,
  ChevronDown,
  SlidersHorizontal,
  FolderOpen,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  defaultPhotoRecipe,
  rotatePhoto,
  photoModifications,
  type PhotoRecipe,
} from './photo-edit';
import { editPhotoTask } from './photo-edit-client';
import {
  localPhotos,
  saveLocalPhoto,
  updateLocalPhoto,
  removeLocalPhoto,
  type LocalPhoto,
} from './photo-local';
import type { CampusPhoto } from './types';
import { processes } from './process-monitor';
import { registerPhotoRecovery } from './update-safety';
import { thumbnailSize } from './photo-thumbnail';
import PhotoCompare, { type PhotoTool } from './PhotoCompare';
import { preparePhotoCodecs } from './photo-codecs';
import type { ReactNode } from 'react';
import './photo-optimizer.css';

export interface PhotoOptimizerRequest {
  files?: File[];
  photo?: CampusPhoto;
  localId?: string;
  metadata?: Partial<CampusPhoto>;
  replacesJob?: string;
  original?: CampusPhoto;
}
function useBlob(blob?: Blob) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!blob) {
      setUrl('');
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}
const bytes = (n: number) =>
  n < 1048576
    ? `${(n / 1024).toFixed(1)} KiB`
    : `${(n / 1048576).toFixed(2)} MiB`;
export default function PhotoOptimizer({
  owner,
  target,
  request,
  onClose,
  onReady,
  protectedIds = [],
  details,
}: {
  owner: string;
  target: string;
  request: PhotoOptimizerRequest;
  onClose: () => void;
  onReady: (photos: LocalPhoto[], replacesJob?: string) => boolean | void;
  protectedIds?: string[];
  details?: ReactNode;
}) {
  const [items, setItems] = useState<LocalPhoto[]>([]),
    [selected, setSelected] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [prepared, setPrepared] = useState(false),
    [tool, setTool] = useState<PhotoTool>('navigate'),
    [panel, setPanel] = useState<'edit' | 'details' | 'files' | null>(() =>
      matchMedia('(max-width: 599px) and (orientation: portrait)').matches
        ? null
        : 'edit',
    ),
    [previewBusy, setPreviewBusy] = useState(false),
    [previewPaused, setPreviewPaused] = useState(false),
    [past, setPast] = useState<PhotoRecipe[]>([]),
    [future, setFuture] = useState<PhotoRecipe[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const renderBatch = useRef<
    (batch: LocalPhoto[], queue: boolean, automatic?: boolean) => Promise<void>
  >(async () => {});
  const activity = useSyncExternalStore(
    processes.subscribe,
    processes.snapshot,
  );
  const activeStage = activity
    .filter((p) => p.state === 'running')
    .at(-1)?.stage;
  const pause = useRef(false),
    [paused, setPaused] = useState(false);
  const pending = useRef<Promise<unknown>>(Promise.resolve()),
    controller = useRef<AbortController | null>(null),
    alive = useRef(true),
    previewController = useRef<AbortController | null>(null);
  const unsaved = useRef(false);
  useEffect(() => {
    const unregister = registerPhotoRecovery(pending, () =>
      pending.current.then(() => {}),
    );
    const warn = (e: BeforeUnloadEvent) => {
      if (unsaved.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      unregister();
      window.removeEventListener('beforeunload', warn);
    };
  }, []);
  const current = items.find((p) => p.id === selected),
    sourceUrl = useBlob(current?.source),
    outputUrl = useBlob(current?.output);
  const save = (value: LocalPhoto) => {
    unsaved.current = true;
    setItems((old) => old.map((p) => (p.id === value.id ? value : p)));
    pending.current = pending.current
      .catch(() => {})
      .then(() =>
        updateLocalPhoto(owner, value.id, { recipe: value.recipe }, true),
      );
    const write = pending.current;
    void write.then(
      () => {
        if (pending.current === write) unsaved.current = false;
      },
      () => {},
    );
    void pending.current.catch(() => {
      if (alive.current)
        setError(
          'Local storage is full or unavailable. Keep this panel open and download your work before leaving.',
        );
    });
  };
  useEffect(() => {
    alive.current = true;
    const abort = new AbortController();
    void (async () => {
      try {
        let existing = await localPhotos(owner, target);
        if (abort.signal.aborted) return;
        const added: LocalPhoto[] = [];
        if (request.photo) {
          const original = existing.find(
            (p) => p.photoId === request.photo!.id,
          );
          if (original) {
            existing = existing.map((p) =>
              p.id === original.id
                ? { ...p, original: request.photo, metadata: request.photo! }
                : p,
            );
            setItems(
              request.replacesJob
                ? existing.filter((p) => p.id === original.id)
                : existing,
            );
            setSelected(original.id);
            return;
          }
          const response = await fetch(request.photo.url, {
            signal: abort.signal,
          });
          if (!response.ok)
            throw Error(
              'This photograph is unavailable offline. Load it while connected first.',
            );
          const file = await response.blob();
          if (!(await thumbnailSize(file)))
            throw Error('Use a valid still image up to 40 megapixels.');
          added.push({
            id: crypto.randomUUID(),
            owner,
            target,
            filename: `${request.photo.caption || 'Photograph'}.webp`,
            source: file,
            recipe: defaultPhotoRecipe(),
            original: request.original || request.photo,
            metadata: request.photo,
            sourceModifications: request.photo.modifications,
            updated: Date.now(),
          });
          setNotice(
            'Editing the available gallery image. Its full-resolution original is not stored on this device.',
          );
        }
        if (
          (request.files?.length || 0) > 20 ||
          (request.files || []).reduce((n, f) => n + f.size, 0) >
            100 * 1024 * 1024
        )
          throw Error('Choose at most 20 images and 100 MiB per batch.');
        for (const file of request.files || []) {
          if (
            !file.size ||
            file.size > 25 * 1024 * 1024 ||
            !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
            !(await thumbnailSize(file))
          )
            throw Error(
              'Choose JPEG, PNG or WebP images up to 25 MiB and 40 megapixels each.',
            );
          added.push({
            id: crypto.randomUUID(),
            owner,
            target,
            filename: file.name,
            source: file,
            recipe: defaultPhotoRecipe(),
            metadata: request.metadata || {},
            sourceModifications: request.metadata?.modifications,
            updated: Date.now(),
          });
        }
        if (abort.signal.aborted) return;
        // New files are prepared together, not only when each one is selected.
        // Keep originals in recovery before starting any automatic encoding.
        if (request.files?.length) setBusy(true);
        existing = [...existing, ...added];
        setItems(
          request.replacesJob
            ? existing.filter((p) => p.id === (request.localId || added[0]?.id))
            : existing,
        );
        setSelected(request.localId || added[0]?.id || existing[0]?.id || '');
        for (const p of added) {
          unsaved.current = true;
          const write = (pending.current = pending.current.then(() =>
            saveLocalPhoto(owner, p),
          ));
          await write;
          if (pending.current === write) unsaved.current = false;
          if (abort.signal.aborted) return;
        }
        if (request.files?.length)
          await renderBatch.current(added, false, true);
      } catch (e) {
        if (!abort.signal.aborted) {
          setBusy(false);
          setError((e as Error).message);
        }
      }
    })();
    return () => {
      alive.current = false;
      abort.abort();
      controller.current?.abort();
      previewController.current?.abort();
    };
  }, [owner, target, request]);
  const change = (patch: Partial<PhotoRecipe>) => {
    if (!current) return;
    setPreviewPaused(false);
    const geometryChanged =
      patch.crop ||
      patch.rotation !== undefined ||
      patch.flipX !== undefined ||
      patch.flipY !== undefined;
    if (geometryChanged) {
      patch = { ...patch, masks: [] };
      if (current.recipe.masks.length)
        setNotice(
          'Geometry changed. Mark privacy areas again before uploading.',
        );
    }
    setPast((p) => [...p.slice(-39), current.recipe]);
    setFuture([]);
    save({
      ...current,
      recipe: { ...current.recipe, ...patch },
      output: undefined,
    });
    setError('');
  };
  const history = (undo: boolean) => {
    if (!current) return;
    const list = undo ? past : future,
      r = list.at(-1);
    if (!r) return;

    setTool('navigate');

    (undo ? setPast : setFuture)(list.slice(0, -1));
    (undo ? setFuture : setPast)((v) => [...v, current.recipe]);
    save({ ...current, recipe: r, output: undefined });
  };
  const render = async (
    batch: LocalPhoto[],
    queue: boolean,
    automatic = false,
  ) => {
    previewController.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError('');
    setPreviewPaused(false);
    const process = processes.begin(
      automatic
        ? 'Compress added photos'
        : queue
          ? 'Prepare photos for upload'
          : 'Optimise photographs',
      `0 of ${batch.length}`,
      () => abort.abort(),
    );
    try {
      await pending.current;
      const ready: LocalPhoto[] = [];
      const failures: string[] = [];
      const oversized: string[] = [];
      for (let i = 0; i < batch.length; i++) {
        while (pause.current) {
          process.update(
            `Batch paused before image ${i + 1}`,
            i,
            batch.length,
            'images',
          );
          await new Promise((resolve) => setTimeout(resolve, 200));
          abort.signal.throwIfAborted();
        }
        const p = batch[i];
        process.update(
          `Image ${i + 1} of ${batch.length} · ${p.filename}`,
          i,
          batch.length,
          'images',
        );
        try {
          const recipe = queue
            ? {
                ...p.recipe,
                format: 'image/webp' as const,
                width: Math.min(1600, p.recipe.width),
                targetKiB: 250,
              }
            : p.recipe;
          const reusable =
            p.output &&
            p.width &&
            p.height &&
            JSON.stringify(recipe) === JSON.stringify(p.recipe);
          const out = reusable
            ? {
                blob: p.output!,
                width: p.width!,
                height: p.height!,
                quality: p.outputQuality ?? recipe.quality,
                targetMet:
                  !recipe.targetKiB ||
                  p.output!.size <= recipe.targetKiB * 1024,
              }
            : await editPhotoTask(p.source, recipe, abort.signal, p.filename);
          abort.signal.throwIfAborted();
          const next = {
            ...p,
            recipe,
            output: out.blob,
            width: out.width,
            height: out.height,
            outputQuality: out.quality,
            metadata: {
              ...p.metadata,
              modifications: [
                p.sourceModifications ?? p.original?.modifications,
                photoModifications(recipe),
              ]
                .filter(Boolean)
                .join('; '),
            },
          };
          await updateLocalPhoto(
            owner,
            next.id,
            {
              recipe,
              metadata: next.metadata,
              width: next.width,
              height: next.height,
              outputQuality: next.outputQuality,
            },
            false,
            next.output,
          );
          abort.signal.throwIfAborted();
          setItems((old) => old.map((v) => (v.id === next.id ? next : v)));
          ready.push(next);
          if (!out.targetMet) {
            oversized.push(p.filename);
            setNotice(
              'The size target could not be met at these settings. Reduce dimensions or quality; the original is retained.',
            );
            if (queue)
              throw Error(
                `${p.filename} exceeds 250 KiB. Lower dimensions or quality, then try again.`,
              );
          }
          process.update(
            `Saved ${i + 1} of ${batch.length} locally`,
            i + 1,
            batch.length,
            'images',
          );
        } catch (error) {
          if (!automatic || abort.signal.aborted) throw error;
          failures.push(`${p.filename}: ${(error as Error).message}`);
        }
      }
      if (failures.length) {
        const message = `${ready.length} of ${batch.length} photos compressed. Originals retained. ${failures.join(' ')}`;
        setPreviewPaused(true);
        setError(message);
        process.fail(Error(message));
      } else {
        process.finish(queue ? 'Ready for private upload' : 'Saved locally');
        if (automatic)
          setNotice(
            `${ready.length} ${ready.length === 1 ? 'photo' : 'photos'} compressed locally. ${oversized.length ? `${oversized.length} exceed the size target at the quality floor; reduce dimensions before using for the map. ` : 'Review the result or adjust settings before using for the map. '}Originals retained.`,
          );
      }
      if (queue) {
        if (!onReady(ready, request.replacesJob)) onClose();
        else setPanel('details');
      }
    } catch (e) {
      process.fail(e);
      if (alive.current) {
        setPreviewPaused(true);
        setError((e as Error).message);
      }
    } finally {
      if (alive.current) setBusy(false);
      controller.current = null;
      pause.current = false;
      setPaused(false);
    }
  };
  renderBatch.current = render;
  const close = async () => {
    controller.current?.abort();
    previewController.current?.abort();
    try {
      await pending.current;
      onClose();
    } catch {
      setError(
        'Recovery did not finish saving. Download the image or free device storage before closing.',
      );
    }
  };
  const prepare = async () => {
    setError('');
    try {
      if (
        !('serviceWorker' in navigator) ||
        !navigator.serviceWorker.controller
      )
        throw Error(
          'Finish installing the app cache while online, then reopen this tool.',
        );
      await navigator.serviceWorker.ready;
      await preparePhotoCodecs();
      // The worker and editor are precached with this app version; exercise the actual codec too.
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      const blob = await new Promise<Blob>((resolve) =>
        c.toBlob((b) => resolve(b!), 'image/png'),
      );
      await editPhotoTask(
        blob,
        defaultPhotoRecipe(),
        new AbortController().signal,
        'Check offline image tools',
      );
      const persistent = await navigator.storage?.persist?.();
      setPrepared(true);
      setNotice(
        persistent
          ? 'Image tools ready offline. Local originals retained until you remove them.'
          : 'Image tools ready offline. Browser storage may be cleared under storage pressure; download important originals.',
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };
  const range = (
    label: string,
    key:
      | 'rotation'
      | 'exposure'
      | 'contrast'
      | 'saturation'
      | 'temperature'
      | 'quality',
    min: number,
    max: number,
    step: number,
  ) => (
    <label>
      {label}
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={current!.recipe[key]}
        onChange={(e) => change({ [key]: Number(e.target.value) })}
      />
      <output>
        {key === 'quality'
          ? Math.round(current!.recipe[key] * 100)
          : current!.recipe[key].toFixed(2)}
      </output>
    </label>
  );
  // Editing stays interactive; obsolete previews are cancelled before they can replace a newer draft.
  useEffect(() => {
    if (
      !current ||
      current.output ||
      busy ||
      previewPaused ||
      tool !== 'navigate'
    )
      return;
    const photo = current,
      abort = new AbortController();
    previewController.current = abort;
    const timer = setTimeout(() => {
      setPreviewBusy(true);
      void editPhotoTask(
        photo.source,
        photo.recipe,
        abort.signal,
        photo.filename,
      )
        .then(async (out) => {
          abort.signal.throwIfAborted();
          const next = {
            ...photo,
            output: out.blob,
            width: out.width,
            height: out.height,
            outputQuality: out.quality,
          };
          pending.current = pending.current
            .catch(() => {})
            .then(async () => {
              if (
                !abort.signal.aborted &&
                itemsRef.current.find((v) => v.id === photo.id)?.recipe ===
                  photo.recipe
              )
                await updateLocalPhoto(
                  owner,
                  next.id,
                  {
                    recipe: next.recipe,
                    width: next.width,
                    height: next.height,
                    outputQuality: next.outputQuality,
                  },
                  false,
                  next.output,
                );
            });
          await pending.current;
          if (!abort.signal.aborted) {
            setItems((old) =>
              old.map((v) =>
                v.id === photo.id && v.recipe === photo.recipe ? next : v,
              ),
            );
            if (!out.targetMet)
              setNotice(
                'Size target not reached at the quality floor. Reduce dimensions or change the target. Your original is retained.',
              );
          }
        })
        .catch((e) => {
          if (!abort.signal.aborted) setError((e as Error).message);
        })
        .finally(() => {
          if (!abort.signal.aborted) setPreviewBusy(false);
        });
    }, 450);
    return () => {
      clearTimeout(timer);
      abort.abort();
      setPreviewBusy(false);
    };
  }, [current, owner, busy, previewPaused, tool]);
  const saving = current?.output
    ? 100 * (1 - current.output.size / current.source.size)
    : 0;
  const outputName = current
    ? current.filename.replace(/\.[^.]+$/, '') +
      '-edited.' +
      current.recipe.format.split('/')[1]
    : '';
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) void close();
      }}
    >
      <DialogContent
        positioning="viewport"
        showCloseButton={false}
        className="photo-optimizer"
      >
        <DialogTitle className="sr-only">Edit & optimise photos</DialogTitle>
        <DialogDescription className="sr-only">
          Compare the original with your edited image. Compression stays on this
          device. Upload and publication are separate.
        </DialogDescription>
        {current && (
          <PhotoCompare
            source={sourceUrl}
            output={outputUrl}
            tool={tool}
            onCancel={() => setTool('navigate')}
            onRegion={(rect) => {
              if (tool === 'crop') change({ crop: rect, masks: [] });
              else if (tool !== 'navigate')
                change({
                  masks: [...current.recipe.masks, { ...rect, mode: tool }],
                });
              setTool('navigate');
            }}
          />
        )}
        <header className="photo-editor-header">
          <button
            className="photo-editor-back"
            aria-label="Close image editor"
            title="Close image editor"
            onClick={() => void close()}
          >
            <X />
          </button>
          <span className="photo-editor-filename">
            {current?.filename || 'Photo editor'}
          </span>
          <div className="photo-editor-actions">
            <button
              aria-label="Local image drafts"
              title="Local images & offline tools"
              aria-pressed={panel === 'files'}
              onClick={() => setPanel((p) => (p === 'files' ? null : 'files'))}
            >
              <FolderOpen />
            </button>
            {details && (
              <button
                aria-label="Photo details"
                title="Caption, building & credits"
                aria-pressed={panel === 'details'}
                onClick={() =>
                  setPanel((p) => (p === 'details' ? null : 'details'))
                }
              >
                <Info />
              </button>
            )}
            <button
              aria-label="Image settings"
              title="Image settings"
              aria-pressed={panel === 'edit'}
              onClick={() => setPanel((p) => (p === 'edit' ? null : 'edit'))}
            >
              <SlidersHorizontal />
            </button>
            <Button
              aria-label="Use for map"
              title="Prepare the edited photo for the map"
              disabled={busy || !current}
              onClick={() => current && void render([current], true)}
            >
              <Upload />
              <span>Use for map</span>
            </Button>
          </div>
        </header>
        {(error || notice || busy || previewBusy || tool !== 'navigate') && (
          <div className="photo-editor-status" aria-live="polite">
            {error ? (
              <span role="alert">{error}</span>
            ) : busy || previewBusy ? (
              <span>{activeStage || 'Compressing preview…'}</span>
            ) : (
              <span>
                {tool !== 'navigate'
                  ? 'Drag a rectangle on the image. Escape cancels.'
                  : notice}
              </span>
            )}
            {busy && (
              <>
                <button
                  onClick={() => {
                    pause.current = !pause.current;
                    setPaused(pause.current);
                  }}
                >
                  {paused ? 'Resume batch' : 'Pause after this image'}
                </button>
                <button onClick={() => controller.current?.abort()}>
                  Cancel processing
                </button>
              </>
            )}
            {notice && !busy && !previewBusy && (
              <button
                aria-label="Dismiss image notice"
                onClick={() => setNotice('')}
              >
                <X />
              </button>
            )}
          </div>
        )}
        <aside className="photo-source-panel">
          <h3>Original</h3>
          <div className="photo-source-name">
            {current?.filename || 'Choose an image'}
          </div>
        </aside>
        {panel === 'files' && (
          <section
            className="photo-floating-panel photo-files-panel"
            aria-label="Local images and offline tools"
          >
            <h3>
              Local images{' '}
              <button
                aria-label="Collapse local images"
                onClick={() => setPanel(null)}
              >
                <ChevronDown />
              </button>
            </h3>
            <div className="photo-panel-scroll">
              <nav aria-label="Local image drafts">
                {items.map((p) => (
                  <button
                    disabled={busy}
                    aria-pressed={selected === p.id}
                    key={p.id}
                    onClick={() => {
                      setSelected(p.id);
                      setPast([]);
                      setFuture([]);
                      setPreviewPaused(false);
                      setTool('navigate');
                    }}
                  >
                    {p.filename}
                    <small>
                      {bytes(p.source.size)}
                      {p.output
                        ? ' → ' + bytes(p.output.size)
                        : ' · Original retained'}
                    </small>
                  </button>
                ))}
              </nav>
              {!items.length && (
                <p>No local photos. Add photos from the gallery.</p>
              )}
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void prepare()}
              >
                <HardDrive />
                {prepared ? 'Ready offline' : 'Prepare for offline use'}
              </Button>
              <p>
                {items.length} images ·{' '}
                {bytes(
                  items.reduce(
                    (n, p) => n + p.source.size + (p.output?.size || 0),
                    0,
                  ),
                )}{' '}
                stored for this gallery.
              </p>
              <details>
                <summary>Batch tools</summary>
                <div className="photo-batch-tools">
                  {' '}
                  <Button
                    variant="outline"
                    disabled={busy || !current || items.length < 2}
                    onClick={() => {
                      for (const p of items)
                        save({
                          ...p,
                          recipe: {
                            ...p.recipe,
                            width: current!.recipe.width,
                            quality: current!.recipe.quality,
                            targetKiB: current!.recipe.targetKiB,
                            format: current!.recipe.format,
                          },
                          output: undefined,
                        });
                    }}
                  >
                    Apply compression settings to batch
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || !items.length}
                    onClick={() => void render(items, false)}
                  >
                    Optimise batch
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || !items.length}
                    onClick={() => void render(items, true)}
                  >
                    Use batch for map
                  </Button>
                </div>
              </details>
              {current && (
                <Button
                  variant="destructive"
                  disabled={busy || protectedIds.includes(current.id)}
                  title={
                    protectedIds.includes(current.id)
                      ? 'Remove this image from the upload queue first'
                      : undefined
                  }
                  onClick={() => {
                    previewController.current?.abort();
                    void pending.current
                      .then(() => removeLocalPhoto(owner, current.id))
                      .then(() => {
                        setItems((v) => v.filter((p) => p.id !== current.id));
                        setSelected(
                          items.find((p) => p.id !== current.id)?.id || '',
                        );
                      })
                      .catch((e) => setError(e.message));
                  }}
                >
                  Remove local files
                </Button>
              )}
              <p>
                Powered by{' '}
                <a
                  href="https://github.com/GoogleChromeLabs/squoosh"
                  target="_blank"
                  rel="noreferrer"
                >
                  Squoosh codecs
                </a>
                .{' '}
                <a
                  href="/photo-codecs/e8d35e0/README.md"
                  target="_blank"
                  rel="noreferrer"
                >
                  Licences
                </a>
              </p>
            </div>
          </section>
        )}
        {details && panel === 'details' && (
          <section
            className="photo-floating-panel photo-details-panel"
            aria-label="Photo metadata"
          >
            <h3>
              Photo details{' '}
              <button
                aria-label="Collapse photo details"
                onClick={() => setPanel(null)}
              >
                <ChevronDown />
              </button>
            </h3>
            <div className="photo-panel-scroll">{details}</div>
          </section>
        )}
        {current && (
          <section
            className="photo-floating-panel photo-edit-panel"
            data-expanded={panel === 'edit'}
            aria-label="Image settings"
          >
            <h3>
              <button
                className="photo-panel-toggle"
                aria-expanded={panel === 'edit'}
                onClick={() => setPanel((p) => (p === 'edit' ? null : 'edit'))}
              >
                Edit & compress{' '}
                {panel === 'edit' ? <ChevronDown /> : <ChevronUp />}
              </button>
            </h3>
            {panel === 'edit' && (
              <div className="photo-panel-scroll photo-opt-controls">
                <fieldset disabled={busy}>
                  <div className="photo-edit-history">
                    <Button
                      variant="ghost"
                      disabled={!past.length}
                      onClick={() => history(true)}
                    >
                      <Undo2 />
                      Undo
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={!future.length}
                      onClick={() => history(false)}
                    >
                      <Redo2 />
                      Redo
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => change(defaultPhotoRecipe())}
                    >
                      Reset
                    </Button>
                  </div>
                  <details>
                    <summary>Crop & orientation</summary>{' '}
                    <select
                      aria-label="Crop aspect ratio"
                      defaultValue="free"
                      onChange={(e) => {
                        const aspect = Number(e.target.value);
                        if (!aspect) {
                          setTool('crop');
                          return;
                        }
                        const image = new Image();
                        image.onload = () => {
                          const actual = image.width / image.height;
                          change({
                            crop:
                              actual > aspect
                                ? {
                                    x: (1 - aspect / actual) / 2,
                                    y: 0,
                                    width: aspect / actual,
                                    height: 1,
                                  }
                                : {
                                    x: 0,
                                    y: (1 - actual / aspect) / 2,
                                    width: 1,
                                    height: actual / aspect,
                                  },
                            masks: [],
                          });
                        };
                        image.src = sourceUrl;
                      }}
                    >
                      <option value="free">Free crop</option>
                      <option value="1">Square · 1:1</option>
                      <option value="1.333333">Landscape · 4:3</option>
                      <option value="1.777778">Wide · 16:9</option>
                      <option value="0.75">Portrait · 3:4</option>
                    </select>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setTool('crop');
                      }}
                    >
                      Draw crop
                    </Button>
                    <div className="photo-opt-fields">
                      {(['x', 'y', 'width', 'height'] as const).map((key) => (
                        <label key={key}>
                          Crop {key} (%)
                          <input
                            type="number"
                            min={key === 'width' || key === 'height' ? 1 : 0}
                            max="100"
                            value={Math.round(current.recipe.crop[key] * 100)}
                            onChange={(e) => {
                              const next = {
                                ...current.recipe.crop,
                                [key]: Math.max(
                                  key === 'width' || key === 'height'
                                    ? 0.01
                                    : 0,
                                  Math.min(1, Number(e.target.value) / 100),
                                ),
                              };
                              next.width = Math.min(next.width, 1 - next.x);
                              next.height = Math.min(next.height, 1 - next.y);
                              change({ crop: next, masks: [] });
                            }}
                          />
                        </label>
                      ))}
                    </div>
                    <div className="photo-opt-toolbar">
                      <Button
                        variant="outline"
                        aria-label="Rotate left"
                        onClick={() =>
                          change({
                            rotation: rotatePhoto(current.recipe.rotation, -90),
                            masks: [],
                          })
                        }
                      >
                        <RotateCcw />
                      </Button>
                      <Button
                        variant="outline"
                        aria-label="Rotate right"
                        onClick={() =>
                          change({
                            rotation: rotatePhoto(current.recipe.rotation, 90),
                            masks: [],
                          })
                        }
                      >
                        <RotateCw />
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          change({ flipX: !current.recipe.flipX, masks: [] })
                        }
                      >
                        Flip horizontal
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          change({ flipY: !current.recipe.flipY, masks: [] })
                        }
                      >
                        Flip vertical
                      </Button>
                    </div>
                    {range('Straighten', 'rotation', -180, 180, 1)}
                  </details>
                  <details>
                    <summary>Light & colour</summary>
                    {range('Exposure', 'exposure', -2, 2, 0.05)}
                    {range('Contrast', 'contrast', 0, 2, 0.05)}
                    {range('Saturation', 'saturation', 0, 2, 0.05)}
                    {range('Temperature', 'temperature', -1, 1, 0.05)}
                  </details>
                  <details>
                    <summary>
                      Privacy areas ({current.recipe.masks.length})
                    </summary>
                    <p>
                      Draw on the preview. Use solid redaction for sensitive
                      information. Geometry changes require privacy areas to be
                      marked again.
                    </p>
                    <div className="photo-opt-toolbar">
                      {(['blur', 'pixelate', 'redact'] as const).map((t) => (
                        <Button
                          key={t}
                          disabled={!current.output}
                          title={
                            !current.output
                              ? 'Preview changes before marking an area on the edited image'
                              : undefined
                          }
                          variant={tool === t ? 'default' : 'outline'}
                          onClick={() => {
                            setTool(t);
                          }}
                        >
                          {t}
                        </Button>
                      ))}
                      <Button
                        variant="ghost"
                        onClick={() => change({ masks: [] })}
                      >
                        Clear areas
                      </Button>
                      <Button
                        variant="outline"
                        disabled={
                          !current.output || current.recipe.masks.length >= 50
                        }
                        onClick={() =>
                          change({
                            masks: [
                              ...current.recipe.masks,
                              {
                                x: 0.25,
                                y: 0.25,
                                width: 0.25,
                                height: 0.25,
                                mode: 'redact',
                              },
                            ],
                          })
                        }
                      >
                        Add redaction with coordinates
                      </Button>
                    </div>
                    {!current.output && (
                      <p>Preview changes before adding privacy areas.</p>
                    )}
                    {current.recipe.masks.map((mask, index) => (
                      <fieldset key={index}>
                        <legend>Area {index + 1}</legend>
                        <div className="photo-opt-fields">
                          {(['x', 'y', 'width', 'height'] as const).map(
                            (key) => (
                              <label key={key}>
                                {key} (%)
                                <input
                                  aria-label={`Area ${index + 1} ${key} (%)`}
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="1"
                                  value={Math.round(mask[key] * 1000) / 10}
                                  onChange={(e) =>
                                    change({
                                      masks: current.recipe.masks.map((m, i) =>
                                        i === index
                                          ? {
                                              ...m,
                                              [key]:
                                                Number(e.target.value) / 100,
                                            }
                                          : m,
                                      ),
                                    })
                                  }
                                />
                              </label>
                            ),
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          onClick={() =>
                            change({
                              masks: current.recipe.masks.filter(
                                (_, i) => i !== index,
                              ),
                            })
                          }
                        >
                          Remove area {index + 1}
                        </Button>
                      </fieldset>
                    ))}
                  </details>

                  <details>
                    <summary>Resize</summary>
                    <label>
                      Longest edge (px)
                      <input
                        type="number"
                        min="64"
                        max="4096"
                        value={current.recipe.width}
                        onChange={(e) =>
                          change({ width: Number(e.target.value) })
                        }
                      />
                    </label>
                    <p>Preserves proportions. Images are never enlarged.</p>
                  </details>
                  <h4>Compress</h4>
                  <label>
                    <span className="sr-only">Download format</span>
                    <select
                      aria-label="Download format"
                      value={current.recipe.format}
                      onChange={(e) =>
                        change({
                          format: e.target.value as PhotoRecipe['format'],
                        })
                      }
                    >
                      <option value="image/webp">WebP</option>
                      <option value="image/jpeg">MozJPEG</option>
                      <option value="image/png">OxiPNG · lossless</option>
                      <option value="image/avif">AVIF</option>
                    </select>
                  </label>
                  {current.recipe.format !== 'image/png' &&
                    !(
                      current.recipe.format === 'image/webp' &&
                      current.recipe.lossless
                    ) &&
                    range('Quality', 'quality', 0.1, 1, 0.01)}
                  <details>
                    <summary>Advanced settings</summary>
                    {current.recipe.format === 'image/webp' && (
                      <label className="photo-check">
                        <input
                          type="checkbox"
                          checked={!!current.recipe.lossless}
                          onChange={(e) =>
                            change({ lossless: e.target.checked })
                          }
                        />
                        Lossless
                      </label>
                    )}
                    {current.recipe.format === 'image/jpeg' && (
                      <label className="photo-check">
                        <input
                          type="checkbox"
                          checked={current.recipe.progressive !== false}
                          onChange={(e) =>
                            change({ progressive: e.target.checked })
                          }
                        />
                        Progressive JPEG
                      </label>
                    )}
                    {current.recipe.format !== 'image/jpeg' && (
                      <label>
                        Compression effort
                        <input
                          type="range"
                          min="0"
                          max="6"
                          step="1"
                          value={
                            current.recipe.effort ??
                            (current.recipe.format === 'image/webp' ? 4 : 2)
                          }
                          onChange={(e) =>
                            change({ effort: Number(e.target.value) })
                          }
                        />
                        <small>Higher effort takes longer.</small>
                      </label>
                    )}
                    <label>
                      Target size (KiB; 0 = no target)
                      <input
                        type="number"
                        min="0"
                        max="10240"
                        value={current.recipe.targetKiB}
                        onChange={(e) =>
                          change({ targetKiB: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label>
                      Minimum quality
                      <input
                        type="range"
                        min=".1"
                        max="1"
                        step=".01"
                        value={current.recipe.minQuality ?? 0.65}
                        onChange={(e) =>
                          change({ minQuality: Number(e.target.value) })
                        }
                      />
                      <output>
                        {Math.round((current.recipe.minQuality ?? 0.65) * 100)}
                      </output>
                    </label>
                    <p>
                      A size target may lower quality to this floor. Actual
                      output quality:{' '}
                      {Math.round(
                        (current.outputQuality ?? current.recipe.quality) * 100,
                      )}
                      .
                    </p>
                  </details>
                  <Button
                    variant="ghost"
                    onClick={() => void render([current], false)}
                  >
                    <ImageDown />
                    Preview changes
                  </Button>
                  <p className="photo-map-note">
                    Map uploads use WebP, up to 1600px and 250 KiB. Originals
                    stay on this device.
                  </p>
                </fieldset>
              </div>
            )}
          </section>
        )}
        {current && (
          <>
            <div className="photo-result photo-result-original">
              <button
                className="photo-result-toggle"
                aria-label="Show original image and local files"
                aria-expanded={panel === 'files'}
                onClick={() =>
                  setPanel((p) => (p === 'files' ? null : 'files'))
                }
              >
                {panel === 'files' ? <ChevronDown /> : <ChevronUp />}
              </button>
              <span className="photo-result-meta">
                {bytes(current.source.size)}
                <small className="photo-result-label">Original</small>
                <small className="photo-result-name">{current.filename}</small>
              </span>
              <span className="photo-original-saving" aria-hidden="true">
                0%
              </span>
              <button
                className="photo-original-download"
                aria-label="Download original"
                title="Download original"
                onClick={() => download(current.source, current.filename)}
              >
                <Download />
              </button>
            </div>
            <div className="photo-result photo-result-output">
              <button
                className="photo-result-toggle"
                aria-label="Show compression settings"
                aria-expanded={panel === 'edit'}
                onClick={() => setPanel((p) => (p === 'edit' ? null : 'edit'))}
              >
                {panel === 'edit' ? <ChevronDown /> : <ChevronUp />}
              </button>
              <span className="photo-result-meta" aria-live="polite">
                {current.output ? bytes(current.output.size) : 'Encoding…'}
                <small className="photo-result-format">
                  {
                    {
                      'image/webp': 'WebP',
                      'image/jpeg': 'MozJPEG',
                      'image/png': 'OxiPNG',
                      'image/avif': 'AVIF',
                    }[current.recipe.format]
                  }
                </small>
                <small className="photo-result-dimensions">
                  {current.output
                    ? current.width + ' × ' + current.height
                    : 'Edited'}
                </small>
              </span>
              <span className="photo-saving">
                {current.output
                  ? (saving >= 0 ? '↓ ' : '↑ ') +
                    Math.abs(saving).toFixed(1) +
                    '%'
                  : '…'}
              </span>
              <button
                aria-label="Download edited image"
                title="Download edited image"
                disabled={!current.output || busy}
                onClick={() =>
                  current.output && download(current.output, outputName)
                }
              >
                <Download />
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
