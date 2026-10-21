import { useEffect } from 'react';
import { defaultPhotoRecipe } from './photo-edit';
import { localPhotos, saveLocalPhoto, type LocalPhoto } from './photo-local';
import { thumbnailSize } from './photo-thumbnail';
import type { PhotoOptimizerState } from './usePhotoOptimizer';
export function usePhotoInitialization({
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
}: Pick<
  PhotoOptimizerState,
  | 'alive'
  | 'owner'
  | 'target'
  | 'request'
  | 'setItems'
  | 'setSelected'
  | 'setNotice'
  | 'setBusy'
  | 'unsaved'
  | 'pending'
  | 'renderBatch'
  | 'setError'
  | 'abortWork'
>): void {
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
      abortWork();
    };
  }, [
    owner,
    target,
    request,
    alive,
    setItems,
    setSelected,
    setNotice,
    setBusy,
    unsaved,
    pending,
    renderBatch,
    setError,
    abortWork,
  ]);
}
