import { useCallback, useEffect, useRef, useState } from 'react';
import { api, supabase } from './supabase';
import { photoDetails } from './photo-details';
import type { CampusPhoto } from './types';

export interface PhotoJob {
  key: string;
  filename: string;
  metadata: Partial<CampusPhoto>;
  mediaId?: string;
  revision: number;
  previewUrl?: string;
  state:
    | 'queued'
    | 'uploading'
    | 'processing'
    | 'needs details'
    | 'ready'
    | 'failed';
  error?: string;
  original?: CampusPhoto;
  approved?: CampusPhoto;
  reviewed: boolean;
  rightsReviewed: boolean;
  authorshipConfirmed: boolean;
  savedDetails?: string;
}
export interface PrivatePhoto {
  id: string;
  filename?: string;
  status: string;
  metadata?: Partial<CampusPhoto>;
  draft?: Partial<CampusPhoto>;
  revision: number;
  previewUrl?: string;
  authorshipConfirmed?: boolean;
}
export function usePhotoQueue(owner: string, target: string) {
  const storageKey = `turnright:photo-drafts:${owner}:${target}`;
  const [jobs, setJobs] = useState<PhotoJob[]>(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem(storageKey) || '[]',
      ) as PhotoJob[];
      return stored.map((j) => ({
        ...j,
        previewUrl: j.mediaId ? undefined : j.original?.url,
        reviewed: false,
        state: j.approved
          ? 'ready'
          : j.metadata.sha256
            ? 'needs details'
            : 'failed',
        error: j.metadata.sha256
          ? undefined
          : 'Resume processing, or reselect the original file if the upload did not finish.',
      }));
    } catch {
      return [];
    }
  });
  const [storageError, setStorageError] = useState('');
  const current = useRef(jobs),
    alive = useRef(true),
    working = useRef(false),
    saving = useRef(false);
  const files = useRef(new Map<string, File>()),
    urls = useRef(new Set<string>());
  const update = useCallback(
    (fn: (items: PhotoJob[]) => PhotoJob[]) => {
      // A different inspector may already own this recovery key. Server uploads
      // still finish privately and can be recovered from the private library.
      if (!alive.current) return;
      const next = fn(current.current);
      current.current = next;
      if (alive.current) setJobs(next);
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify(next.map(({ previewUrl: _url, ...j }) => j)),
        );
        if (alive.current) setStorageError('');
      } catch {
        if (alive.current)
          setStorageError(
            'Local photo recovery could not be saved. Keep this workspace open until private saving succeeds.',
          );
      }
    },
    [storageKey],
  );
  const patch = useCallback(
    (key: string, value: Partial<PhotoJob>) =>
      update((items) =>
        items.map((j) => (j.key === key ? { ...j, ...value } : j)),
      ),
    [update],
  );
  useEffect(() => {
    alive.current = true;
    const allocated = urls.current;
    return () => {
      alive.current = false;
      for (const url of allocated) URL.revokeObjectURL(url);
    };
  }, []);
  const enqueue = (selected: File[], metadata: Partial<CampusPhoto>) => {
    const entries = selected.map((file) => {
      const key = crypto.randomUUID();
      files.current.set(key, file);
      const previewUrl = URL.createObjectURL(file);
      urls.current.add(previewUrl);
      const invalid =
        !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
        !file.size ||
        file.size > 10 * 1024 * 1024;
      return {
        key,
        filename: file.name,
        metadata: { ...metadata },
        revision: 0,
        previewUrl,
        state: invalid ? 'failed' : 'queued',
        error: invalid ? 'Choose a JPEG, PNG or WebP up to 10 MiB.' : undefined,
        reviewed: false,
        rightsReviewed: false,
        authorshipConfirmed: false,
      } as PhotoJob;
    });
    update((items) => [...items, ...entries]);
  };
  useEffect(() => {
    if (working.current) return;
    const job = jobs.find((j) => j.state === 'queued');
    if (!job) return;
    working.current = true;
    void (async () => {
      let id = job.mediaId;
      try {
        const file = files.current.get(job.key);
        if (!id || file) {
          if (!file || !supabase)
            throw Error(
              'Reselect the original file and connect to the internet to upload.',
            );
          patch(job.key, { state: 'uploading', error: undefined });
          const signed = await api<{
            id: string;
            bucket: string;
            path: string;
            token: string;
          }>(id ? 'media-upload-url' : 'media-begin', {
            id,
            filename: file.name,
            bytes: file.size,
            mime: file.type,
            metadata: photoDetails(job.metadata),
          });
          id = signed.id;
          patch(job.key, { mediaId: id });
          const uploaded = await supabase.storage
            .from(signed.bucket)
            .uploadToSignedUrl(signed.path, signed.token, file, {
              contentType: file.type,
            });
          if (uploaded.error) {
            // A previous upload may have succeeded before its response was lost.
            await api('media-process', { id });
          }
          files.current.delete(job.key);
        }
        patch(job.key, { state: 'processing' });
        const result = await api<PrivatePhoto>('media-process', { id });
        update((items) =>
          items.map((j) =>
            j.key === job.key
              ? {
                  ...j,
                  metadata: {
                    ...j.metadata,
                    ...result.metadata,
                    ...photoDetails(j.metadata),
                  },
                  previewUrl: result.previewUrl,
                  revision: result.revision,
                  state: 'needs details',
                  error: undefined,
                }
              : j,
          ),
        );
      } catch (e) {
        patch(job.key, { state: 'failed', error: (e as Error).message });
      } finally {
        working.current = false;
        if (alive.current) setJobs([...current.current]);
      }
    })();
  }, [jobs, patch, update]);
  useEffect(() => {
    if (saving.current) return;
    const job = jobs.find(
      (j) =>
        j.mediaId &&
        !j.approved &&
        j.metadata.sha256 &&
        j.state !== 'processing' &&
        j.state !== 'uploading' &&
        !j.error &&
        JSON.stringify(photoDetails(j.metadata)) !== j.savedDetails,
    );
    if (!job) return;
    const timer = setTimeout(() => {
      saving.current = true;
      const details = JSON.stringify(photoDetails(job.metadata));
      void api<{ revision: number }>('media-draft', {
        id: job.mediaId,
        revision: job.revision,
        metadata: photoDetails(job.metadata),
      })
        .then((result) =>
          patch(job.key, { revision: result.revision, savedDetails: details }),
        )
        .catch((e) =>
          patch(job.key, {
            error: `Private saving paused: ${(e as Error).message}`,
          }),
        )
        .finally(() => {
          saving.current = false;
          if (alive.current) setJobs([...current.current]);
        });
    }, 600);
    return () => clearTimeout(timer);
  }, [jobs, patch]);
  useEffect(() => {
    const job = jobs.find(
      (j) => j.mediaId && j.metadata.sha256 && !j.previewUrl && !j.error,
    );
    if (!job) return;
    let cancelled = false;
    void api<{ previewUrl: string }>('media-preview', { id: job.mediaId })
      .then((r) => {
        if (!cancelled) patch(job.key, { previewUrl: r.previewUrl });
      })
      .catch((e) => {
        if (!cancelled)
          patch(job.key, {
            error: `Preview renewal failed: ${(e as Error).message}`,
          });
      });
    return () => {
      cancelled = true;
    };
  }, [jobs, patch]);
  return {
    jobs,
    update,
    patch,
    enqueue,
    storageError,
    retry: (key: string, file?: File) => {
      if (file) files.current.set(key, file);
      patch(key, { state: 'queued', error: undefined });
    },
    remove: (key: string) => {
      files.current.delete(key);
      update((items) => items.filter((j) => j.key !== key));
    },
    saving,
  };
}
