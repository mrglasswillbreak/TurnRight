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
  photoModifications,
  type PhotoRecipe,
} from './photo-edit';
import { editPhotoTask } from './photo-edit-client';
import {
  localPhotos,
  saveLocalPhoto,
  removeLocalPhoto,
  type LocalPhoto,
} from './photo-local';
import type { CampusPhoto } from './types';
import { processes } from './process-monitor';
import { registerPhotoRecovery } from './update-safety';
import { thumbnailSize } from './photo-thumbnail';
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
}: {
  owner: string;
  target: string;
  request: PhotoOptimizerRequest;
  onClose: () => void;
  onReady: (photos: LocalPhoto[], replacesJob?: string) => void;
  protectedIds?: string[];
}) {
  const [items, setItems] = useState<LocalPhoto[]>([]),
    [selected, setSelected] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [prepared, setPrepared] = useState(false),
    [tool, setTool] = useState<
      'navigate' | 'crop' | 'blur' | 'pixelate' | 'redact'
    >('navigate'),
    [compare, setCompare] = useState(50),
    [showOriginal, setShowOriginal] = useState(false),
    [zoom, setZoom] = useState(1),
    [past, setPast] = useState<PhotoRecipe[]>([]),
    [future, setFuture] = useState<PhotoRecipe[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
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
    drag = useRef<{ x: number; y: number } | null>(null);
  const [box, setBox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [lastPreview, setLastPreview] = useState<Blob>();
  const previewHost = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const [imageAspect, setImageAspect] = useState(4 / 3);
  useEffect(() => {
    const host = previewHost.current;
    if (!host) return;
    const measure = () =>
      setFrame({ width: host.clientWidth, height: host.clientHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    measure();
    return () => observer.disconnect();
  }, [selected]);
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
  useEffect(() => {
    setLastPreview(undefined);
    setShowOriginal(false);
  }, [selected]);
  useEffect(() => {
    const output = items.find((p) => p.id === selected)?.output;
    if (output) setLastPreview(output);
  }, [items, selected]);
  const current = items.find((p) => p.id === selected),
    sourceUrl = useBlob(current?.source),
    outputUrl = useBlob(current?.output || lastPreview);
  const geometryChanged =
    !!current &&
    (current.recipe.rotation !== 0 ||
      current.recipe.flipX ||
      current.recipe.flipY ||
      current.recipe.crop.x !== 0 ||
      current.recipe.crop.y !== 0 ||
      current.recipe.crop.width !== 1 ||
      current.recipe.crop.height !== 1);
  const save = (value: LocalPhoto) => {
    unsaved.current = true;
    setItems((old) => old.map((p) => (p.id === value.id ? value : p)));
    pending.current = pending.current
      .catch(() => {})
      .then(() => saveLocalPhoto(owner, value));
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
        let existing = (await localPhotos(owner)).filter(
          (p) => p.target === target,
        );
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
            setItems(existing);
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
        existing = [...existing, ...added];
        setItems(existing);
        setSelected(request.localId || added[0]?.id || existing[0]?.id || '');
        for (const p of added) {
          unsaved.current = true;
          const write = (pending.current = pending.current.then(() =>
            saveLocalPhoto(owner, p),
          ));
          await write;
          if (pending.current === write) unsaved.current = false;
        }
      } catch (e) {
        if (!abort.signal.aborted) setError((e as Error).message);
      }
    })();
    return () => {
      alive.current = false;
      abort.abort();
      controller.current?.abort();
    };
  }, [owner, target, request]);
  const change = (patch: Partial<PhotoRecipe>) => {
    if (!current) return;
    const geometryChanged =
      patch.crop ||
      patch.rotation !== undefined ||
      patch.flipX !== undefined ||
      patch.flipY !== undefined;
    if (geometryChanged) {
      setLastPreview(undefined);
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
    (undo ? setPast : setFuture)(list.slice(0, -1));
    (undo ? setFuture : setPast)((v) => [...v, current.recipe]);
    save({ ...current, recipe: r, output: undefined });
  };
  const render = async (batch: LocalPhoto[], queue: boolean) => {
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError('');
    const process = processes.begin(
      queue ? 'Prepare photos for upload' : 'Optimise photographs',
      `0 of ${batch.length}`,
      () => abort.abort(),
    );
    try {
      await pending.current;
      const ready: LocalPhoto[] = [];
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
        const recipe = queue
          ? {
              ...p.recipe,
              format: 'image/webp' as const,
              width: Math.min(1600, p.recipe.width),
              targetKiB: 250,
            }
          : p.recipe;
        const out = await editPhotoTask(
          p.source,
          recipe,
          abort.signal,
          p.filename,
        );
        abort.signal.throwIfAborted();
        const next = {
          ...p,
          recipe,
          output: out.blob,
          width: out.width,
          height: out.height,
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
        await saveLocalPhoto(owner, next);
        abort.signal.throwIfAborted();
        setItems((old) => old.map((v) => (v.id === next.id ? next : v)));
        ready.push(next);
        if (!out.targetMet) {
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
      }
      process.finish(queue ? 'Ready for private upload' : 'Saved locally');
      if (queue) {
        onReady(ready, request.replacesJob);
        onClose();
      }
    } catch (e) {
      process.fail(e);
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
      controller.current = null;
      pause.current = false;
      setPaused(false);
    }
  };
  const close = async () => {
    controller.current?.abort();
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
      <output>{current!.recipe[key].toFixed(2)}</output>
    </label>
  );
  const point = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };
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
        <header>
          <div>
            <DialogTitle>Edit & optimise photos</DialogTitle>
            <DialogDescription>
              Private editing on this device. Upload and publication stay
              separate.
            </DialogDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close image editor"
            onClick={() => void close()}
          >
            <X />
          </Button>
        </header>
        <div className="photo-opt-toolbar">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void prepare()}
          >
            <HardDrive />
            {prepared ? 'Ready offline' : 'Prepare for offline use'}
          </Button>
          <span>
            {items.length} images ·{' '}
            {bytes(
              items.reduce(
                (n, p) => n + p.source.size + (p.output?.size || 0),
                0,
              ),
            )}{' '}
            stored for this gallery
          </span>
          {busy && (
            <>
              <output>{activeStage || 'Processing images…'}</output>
              <Button
                variant="outline"
                onClick={() => {
                  pause.current = !pause.current;
                  setPaused(pause.current);
                }}
              >
                {paused ? 'Resume batch' : 'Pause after this image'}
              </Button>
            </>
          )}
          {busy && (
            <Button
              variant="destructive"
              onClick={() => controller.current?.abort()}
            >
              Cancel processing
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="photo-error">
            {error}
          </p>
        )}
        {notice && <output>{notice}</output>}
        <div className="photo-opt-layout">
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
                  setZoom(1);
                  setTool('navigate');
                }}
              >
                {p.filename}
                <small>
                  {bytes(p.source.size)}
                  {p.output
                    ? ` → ${bytes(p.output.size)}`
                    : ' · Original retained'}
                </small>
              </button>
            ))}
            {!items.length && (
              <p>No local photos. Add photos from the gallery.</p>
            )}
          </nav>
          {current && (
            <>
              <section
                className="photo-opt-preview"
                aria-label="Image comparison"
              >
                <div className="photo-opt-toolbar">
                  <Button
                    variant="outline"
                    disabled={busy || !past.length}
                    onClick={() => history(true)}
                  >
                    <Undo2 />
                    Undo
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || !future.length}
                    onClick={() => history(false)}
                  >
                    <Redo2 />
                    Redo
                  </Button>
                  <label>
                    Zoom
                    <input
                      aria-label="Image zoom"
                      type="range"
                      min="1"
                      max="3"
                      step=".25"
                      value={zoom}
                      onChange={(e) => setZoom(Number(e.target.value))}
                    />
                  </label>
                </div>
                <div className="photo-opt-scroll" ref={previewHost}>
                  <div
                    className="photo-opt-image"
                    style={{
                      width: frame.width
                        ? `${Math.min(frame.width, frame.height * imageAspect) * zoom}px`
                        : '100%',
                      touchAction: tool === 'navigate' ? 'pan-x pan-y' : 'none',
                    }}
                    onPointerDown={(e) => {
                      if (busy || tool === 'navigate') return;
                      drag.current = point(e);
                      e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                    onPointerMove={(e) => {
                      if (!drag.current) return;
                      const p = point(e),
                        a = drag.current;
                      setBox({
                        x: Math.min(p.x, a.x),
                        y: Math.min(p.y, a.y),
                        width: Math.abs(p.x - a.x),
                        height: Math.abs(p.y - a.y),
                      });
                    }}
                    onPointerUp={(e) => {
                      if (!drag.current) return;
                      const p = point(e),
                        a = drag.current,
                        rect = {
                          x: Math.min(p.x, a.x),
                          y: Math.min(p.y, a.y),
                          width: Math.abs(p.x - a.x),
                          height: Math.abs(p.y - a.y),
                        };
                      drag.current = null;
                      setBox(null);
                      if (rect.width < 0.005 || rect.height < 0.005) return;
                      if (tool === 'crop') change({ crop: rect, masks: [] });
                      else if (tool !== 'navigate')
                        change({
                          masks: [
                            ...current.recipe.masks,
                            { ...rect, mode: tool },
                          ],
                        });
                      setTool('navigate');
                    }}
                    onPointerCancel={() => {
                      drag.current = null;
                      setBox(null);
                    }}
                  >
                    <img
                      onLoad={(e) =>
                        setImageAspect(
                          e.currentTarget.naturalWidth /
                            e.currentTarget.naturalHeight,
                        )
                      }
                      src={
                        (tool === 'crop' ||
                        (showOriginal && geometryChanged && tool === 'navigate')
                          ? sourceUrl
                          : outputUrl || sourceUrl) || undefined
                      }
                      alt="Edited photograph preview"
                      draggable={false}
                    />
                    {outputUrl && !geometryChanged && tool === 'navigate' && (
                      <img
                        className="photo-opt-before"
                        src={sourceUrl}
                        alt="Original comparison"
                        style={{ clipPath: `inset(0 ${100 - compare}% 0 0)` }}
                      />
                    )}
                    {outputUrl && !geometryChanged && tool === 'navigate' && (
                      <span
                        className="photo-opt-divider"
                        style={{ left: `${compare}%` }}
                        aria-hidden="true"
                      />
                    )}
                    {box && (
                      <div
                        className="photo-opt-box"
                        style={{
                          left: `${box.x * 100}%`,
                          top: `${box.y * 100}%`,
                          width: `${box.width * 100}%`,
                          height: `${box.height * 100}%`,
                        }}
                      />
                    )}
                  </div>
                </div>
                {current.output && (
                  <>
                    {geometryChanged ? (
                      <fieldset
                        className="photo-opt-toolbar"
                        aria-label="Compare image versions"
                      >
                        <Button
                          variant={showOriginal ? 'default' : 'outline'}
                          aria-pressed={showOriginal}
                          onClick={() => setShowOriginal(true)}
                        >
                          Original
                        </Button>
                        <Button
                          variant={!showOriginal ? 'default' : 'outline'}
                          aria-pressed={!showOriginal}
                          onClick={() => setShowOriginal(false)}
                        >
                          Edited
                        </Button>
                      </fieldset>
                    ) : (
                      <label>
                        Original / edited comparison
                        <input
                          aria-label="Before and after comparison"
                          type="range"
                          min="0"
                          max="100"
                          value={compare}
                          onChange={(e) => setCompare(Number(e.target.value))}
                        />
                      </label>
                    )}
                    <p>
                      {bytes(current.source.size)} →{' '}
                      <strong>{bytes(current.output!.size)}</strong> ·{' '}
                      {(
                        100 -
                        (current.output!.size / current.source.size) * 100
                      ).toFixed(1)}
                      % smaller · {current.width} × {current.height}px
                    </p>
                  </>
                )}
                <p>
                  {tool === 'navigate'
                    ? 'Preview changes to inspect the output at full size.'
                    : `Drag a rectangle to ${tool}. Numeric crop controls are also available.`}
                </p>
              </section>
              <section
                className="photo-opt-controls"
                aria-label="Image settings"
              >
                <fieldset disabled={busy}>
                  <legend>Crop & orientation</legend>
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
                      setCompare(0);
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
                                key === 'width' || key === 'height' ? 0.01 : 0,
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
                          rotation:
                            current.recipe.rotation <= -90
                              ? 0
                              : current.recipe.rotation - 90,
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
                          rotation:
                            current.recipe.rotation >= 90
                              ? 0
                              : current.recipe.rotation + 90,
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
                            setShowOriginal(false);
                            setCompare(0);
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
                  <label>
                    Download format
                    <select
                      value={current.recipe.format}
                      onChange={(e) =>
                        change({
                          format: e.target.value as PhotoRecipe['format'],
                        })
                      }
                    >
                      <option value="image/webp">WebP</option>
                      <option value="image/jpeg">
                        JPEG · white background
                      </option>
                      <option value="image/png">
                        PNG · lossless compression
                      </option>
                    </select>
                  </label>
                  {current.recipe.format !== 'image/png' &&
                    range('Quality', 'quality', 0.1, 1, 0.01)}
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
                  <Button onClick={() => void render([current], false)}>
                    <ImageDown />
                    Preview changes
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!current.output}
                    onClick={() =>
                      download(
                        current.output!,
                        current.filename.replace(/\.[^.]+$/, '') +
                          '-edited.' +
                          current.recipe.format.split('/')[1],
                      )
                    }
                  >
                    <Download />
                    Download edited image
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => download(current.source, current.filename)}
                  >
                    Download original
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => change(defaultPhotoRecipe())}
                  >
                    Reset to original
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={protectedIds.includes(current.id)}
                    title={
                      protectedIds.includes(current.id)
                        ? 'Remove this image from the upload queue first'
                        : undefined
                    }
                    onClick={() => {
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
                </fieldset>
              </section>
            </>
          )}
        </div>
        <footer>
          <p>
            Map uploads use WebP, up to 1600px and 250 KiB. Originals remain on
            this device.
          </p>
          <div className="photo-opt-toolbar">
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
              disabled={busy || !current}
              onClick={() => void render([current!], true)}
            >
              <Upload />
              Use selected for map
            </Button>
            <Button
              variant="outline"
              disabled={busy || !items.length}
              onClick={() => void render(items, true)}
            >
              Use batch for map
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
