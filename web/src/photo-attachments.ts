import { validPhoto } from './arrival';
import { photoDetails } from './photo-details';
import { api } from './supabase';
import type { CampusPhoto } from './types';
import { associateLocalPhoto } from './photo-local';
import type { PhotoManagerState } from './usePhotoManager';
export async function attachReadyPhotos(
  {
    queue,
    setBusy,
    setAttaching,
    setError,
    store,
    owner,
    setPreviewUrls,
    mounted,
    apply,
    setSelected,
    setTab,
    setOptimizing,
  }: Pick<
    PhotoManagerState,
    | 'queue'
    | 'setBusy'
    | 'setAttaching'
    | 'setError'
    | 'store'
    | 'owner'
    | 'setPreviewUrls'
    | 'mounted'
    | 'apply'
    | 'setSelected'
    | 'setTab'
    | 'setOptimizing'
  >,
  only?: string,
): Promise<void> {
  const ready = queue.jobs.filter(
    (j) => j.state === 'ready' && (!only || j.key === only),
  );
  if (!ready.length) return;
  setBusy('attach');
  setAttaching(ready.map((j) => j.key));
  setError('');
  const approved: CampusPhoto[] = [];
  try {
    for (const item of ready) {
      if (!validPhoto(item.metadata))
        throw Error(
          'The processed photo is incomplete. Resume its private upload before attaching.',
        );
      const photo =
        item.approved ||
        (item.mediaId
          ? await api<CampusPhoto>(
              'media-approve',
              {
                id: item.mediaId,
                metadata: item.metadata,
                reviewed: item.reviewed && item.rightsReviewed,
                authorshipConfirmed: item.authorshipConfirmed,
              },
              { signal: store.signal },
            )
          : item.metadata);
      queue.patch(item.key, {
        approved: photo,
        metadata: photo,
        error: undefined,
        savedDetails: JSON.stringify(photoDetails(photo)),
      });
      approved.push(photo);
      if (item.localImageId)
        await associateLocalPhoto(owner, item.localImageId, photo.id);
      if (item.previewUrl)
        setPreviewUrls((p) => ({ ...p, [photo.id]: item.previewUrl! }));
    }
    if (!mounted.current) return;
    if (
      apply(
        approved,
        ready.flatMap((j) => (j.original ? [j.original.id] : [])),
        Object.fromEntries(
          ready.flatMap((j, i) =>
            j.original ? [[j.original.id, approved[i].id]] : [],
          ),
        ),
      )
    ) {
      queue.update((items) =>
        items.filter((j) => !ready.some((r) => r.key === j.key)),
      );
      setSelected(undefined);
      setTab('gallery');
      if (only) setOptimizing(null);
    }
  } catch (e) {
    setError((e as Error).message);
  } finally {
    setBusy(false);
    setAttaching([]);
  }
}
