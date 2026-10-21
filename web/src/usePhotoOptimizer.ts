import { useWorkspaceLayout, useFrameLayout } from './WorkspaceFrame';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { defaultPhotoRecipe, type PhotoRecipe } from './photo-edit';
import { editPhotoTask } from './photo-edit-client';
import { updateLocalPhoto, type LocalPhoto } from './photo-local';
import { processes } from './process-monitor';
import { registerPhotoRecovery } from './update-safety';
import { type PhotoTool } from './PhotoCompare';
import { preparePhotoCodecs } from './photo-codecs';
import type { ReactNode } from 'react';
import { PhotoOptimizerRequest } from './photo-optimizer-types';
import { useBlob } from './photo-optimizer-utils';
import { usePhotoInitialization } from './usePhotoInitialization';
import { usePhotoPreview } from './usePhotoPreview';
import { renderPhotoBatch } from './photo-optimizer-batch';
export type PhotoOptimizerProps = {
  owner: string;
  target: string;
  request: PhotoOptimizerRequest;
  onClose: () => void;
  onReady: (photos: LocalPhoto[], replacesJob?: string) => boolean | void;
  protectedIds?: string[];
  details?: ReactNode;
};
export function usePhotoOptimizer({
  owner,
  target,
  request,
  onClose,
  onReady,
  protectedIds = [],
  details,
}: PhotoOptimizerProps) {
  const parentLayout = useFrameLayout();

  const localLayout = useWorkspaceLayout(owner, target);

  const photoLayout = parentLayout || localLayout;

  const [widePhoto, setWidePhoto] = useState(
    () => matchMedia('(min-width: 1200px)').matches,
  );

  const [settingsTab, setSettingsTab] = useState<'edit' | 'compress'>('edit');

  useEffect(() => {
    const media = matchMedia('(min-width: 1200px)');
    const change = () => setWidePhoto(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);

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
  const abortWork = useCallback(() => {
    controller.current?.abort();
    previewController.current?.abort();
  }, []);
  usePhotoInitialization({
    alive,
    owner,
    target,
    request,
    setItems,
    setSelected,
    setNotice,
    setBusy,
    unsaved,
    pending,
    renderBatch,
    setError,
    abortWork,
  });

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
  const render = (batch: LocalPhoto[], queue: boolean, automatic = false) =>
    renderPhotoBatch(
      {
        previewController,
        controller,
        setBusy,
        setError,
        setPreviewPaused,
        pending,
        pause,
        owner,
        setItems,
        setNotice,
        onReady,
        request,
        onClose,
        setPanel,
        alive,
        setPaused,
      },
      batch,
      queue,
      automatic,
    );

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

  usePhotoPreview({
    current,
    busy,
    previewPaused,
    tool,
    previewController,
    setPreviewBusy,
    pending,
    itemsRef,
    owner,
    setItems,
    setNotice,
    setError,
  });

  const saving = current?.output
    ? 100 * (1 - current.output.size / current.source.size)
    : 0;

  const outputName = current
    ? current.filename.replace(/\.[^.]+$/, '') +
      '-edited.' +
      current.recipe.format.split('/')[1]
    : '';
  return {
    abortWork,
    close,
    widePhoto,
    photoLayout,
    current,
    sourceUrl,
    outputUrl,
    tool,
    setTool,
    change,
    panel,
    setPanel,
    details,
    busy,
    render,
    error,
    notice,
    previewBusy,
    activeStage,
    pause,
    setPaused,
    paused,
    controller,
    setNotice,
    items,
    selected,
    setSelected,
    setPast,
    setFuture,
    setPreviewPaused,
    prepare,
    prepared,
    save,
    protectedIds,
    previewController,
    pending,
    owner,
    setItems,
    setError,
    setSettingsTab,
    settingsTab,
    past,
    history,
    future,
    download,
    saving,
    outputName,
    alive,
    target,
    request,
    setBusy,
    unsaved,
    renderBatch,
    previewPaused,
    setPreviewBusy,
    itemsRef,
    onReady,
    onClose,
  };
}
export type PhotoOptimizerState = ReturnType<typeof usePhotoOptimizer>;
