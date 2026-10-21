import { validPhoto } from './arrival';
import { photoDetails } from './photo-details';
import { type PrivatePhoto } from './use-photo-queue';
import { api } from './supabase';
import { type PhotoManagerState } from './usePhotoManager.js';
export async function loadPrivatePhotoLibrary(
  {
    libraryRequest,
    setLoadingLibrary,
    setTab,
    setError,
    query,
    mounted,
    setLibrary,
    setNextOffset,
    setLibraryOffset,
  }: Pick<
    PhotoManagerState,
    | 'libraryRequest'
    | 'setLoadingLibrary'
    | 'setTab'
    | 'setError'
    | 'query'
    | 'mounted'
    | 'setLibrary'
    | 'setNextOffset'
    | 'setLibraryOffset'
  >,
  offset = 0,
): Promise<void> {
  libraryRequest.current?.abort();
  const request = new AbortController();
  libraryRequest.current = request;
  setLoadingLibrary(true);
  setTab('private');
  setError('');
  try {
    const r = await api<{ items: PrivatePhoto[]; nextOffset: number | null }>(
      'media-library',
      { offset, query, previews: false },
      { signal: request.signal },
    );
    if (!mounted.current || request.signal.aborted) return;
    setLibrary(r.items);
    setNextOffset(r.nextOffset);
    setLibraryOffset(offset);
  } catch (e) {
    if (!request.signal.aborted) setError((e as Error).message);
  } finally {
    if (!request.signal.aborted) setLoadingLibrary(false);
  }
}

export async function recoverPrivatePhoto(
  {
    editPhoto,
    queue,
    target,
    defaults,
    data,
    setSelected,
    setTab,
  }: Pick<
    PhotoManagerState,
    | 'editPhoto'
    | 'queue'
    | 'target'
    | 'defaults'
    | 'data'
    | 'setSelected'
    | 'setTab'
  >,
  item: PrivatePhoto,
): Promise<void> {
  if (item.status === 'approved' && validPhoto(item.metadata)) {
    await editPhoto(item.metadata);
    return;
  }
  const key = crypto.randomUUID();
  queue.update((items) => [
    ...items.filter((j) => j.mediaId !== item.id),
    {
      key,
      target,
      filename: item.filename || item.metadata?.caption || 'Private photo',
      mediaId: item.id,
      revision: item.revision,
      metadata: { ...defaults(), ...item.metadata, ...item.draft },
      original: data.photos?.find((p) => p.id === item.replacesPhotoId),
      previewUrl: item.previewUrl,
      state: item.metadata?.sha256 ? 'needs details' : 'queued',
      reviewed: false,
      rightsReviewed: false,
      authorshipConfirmed: !!item.authorshipConfirmed,
      savedDetails: JSON.stringify(photoDetails(item.draft || {})),
    },
  ]);
  setSelected(key);
  setTab('review');
}
