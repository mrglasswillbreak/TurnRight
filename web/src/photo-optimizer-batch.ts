import { photoModifications } from './photo-edit';
import { editPhotoTask } from './photo-edit-client';
import { updateLocalPhoto, type LocalPhoto } from './photo-local';
import { processes } from './process-monitor';
import type { PhotoOptimizerState } from './usePhotoOptimizer';
export async function renderPhotoBatch(
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
  }: Pick<
    PhotoOptimizerState,
    | 'previewController'
    | 'controller'
    | 'setBusy'
    | 'setError'
    | 'setPreviewPaused'
    | 'pending'
    | 'pause'
    | 'owner'
    | 'setItems'
    | 'setNotice'
    | 'onReady'
    | 'request'
    | 'onClose'
    | 'setPanel'
    | 'alive'
    | 'setPaused'
  >,
  batch: LocalPhoto[],
  queue: boolean,
  automatic = false,
): Promise<void> {
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
                !recipe.targetKiB || p.output!.size <= recipe.targetKiB * 1024,
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
}
