import { useEffect } from 'react';
import { editPhotoTask } from './photo-edit-client';
import { updateLocalPhoto } from './photo-local';
import type { PhotoOptimizerState } from './usePhotoOptimizer';
export function usePhotoPreview({
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
}: Pick<
  PhotoOptimizerState,
  | 'current'
  | 'busy'
  | 'previewPaused'
  | 'tool'
  | 'previewController'
  | 'setPreviewBusy'
  | 'pending'
  | 'itemsRef'
  | 'owner'
  | 'setItems'
  | 'setNotice'
  | 'setError'
>): void {
  useEffect(() => {
    const latestItems = itemsRef;
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
                latestItems.current.find((v) => v.id === photo.id)?.recipe ===
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
  }, [
    current,
    owner,
    busy,
    previewPaused,
    tool,
    itemsRef,
    pending,
    previewController,
    setPreviewBusy,
    setItems,
    setNotice,
    setError,
  ]);
}
