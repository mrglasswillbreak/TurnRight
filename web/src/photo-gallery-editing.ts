import { type PrivatePhoto } from './use-photo-queue';
import { api } from './supabase';
import type { CampusPhoto } from './types';
import type { PhotoManagerState } from './usePhotoManager';
export async function editGalleryPhoto(
  {
    queue,
    setSelected,
    setTab,
    openPhotoEditor,
    setBusy,
    setError,
    previewUrls,
    store,
    mounted,
    target,
  }: Pick<
    PhotoManagerState,
    | 'queue'
    | 'setSelected'
    | 'setTab'
    | 'openPhotoEditor'
    | 'setBusy'
    | 'setError'
    | 'previewUrls'
    | 'store'
    | 'mounted'
    | 'target'
  >,
  photo: CampusPhoto,
): Promise<void> {
  const existing = queue.jobs.find((j) => j.original?.id === photo.id);
  if (existing) {
    setSelected(existing.key);
    setTab('review');
    openPhotoEditor(existing);
    return;
  }
  setBusy(photo.id);
  setError('');
  try {
    let mediaId: string | undefined,
      metadata: Partial<CampusPhoto> = { ...photo },
      previewUrl = previewUrls[photo.id] || photo.url;
    if (photo.id.startsWith('owner:')) {
      mediaId = (
        await api<{ id: string }>(
          'media-revise',
          { id: photo.id.slice(6) },
          { signal: store.signal },
        )
      ).id;
      const r = await api<PrivatePhoto>(
        'media-process',
        { id: mediaId },
        { signal: store.signal },
      );
      metadata = { ...photo, ...r.metadata };
      previewUrl = r.previewUrl!;
    }
    if (!mounted.current) return;
    const key = crypto.randomUUID();
    queue.update((items) => [
      ...items,
      {
        key,
        target,
        filename: photo.caption,
        metadata,
        mediaId,
        revision: 0,
        previewUrl,
        state: 'needs details',
        original: photo,
        reviewed: false,
        rightsReviewed: true,
        authorshipConfirmed: photo.sourceKind === 'author-upload',
      },
    ]);
    setSelected(key);
    setTab('review');
    openPhotoEditor(store.snapshot(target).find((j) => j.key === key)!);
  } catch (e) {
    setError((e as Error).message);
  } finally {
    setBusy(false);
  }
}
