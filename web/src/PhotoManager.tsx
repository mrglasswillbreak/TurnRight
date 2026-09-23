import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { campusPhotoIndex } from './campus-photo-index';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { canonicalBuildingId, photoLicenses, validPhoto } from './arrival';
import { PhotoGallery } from './ArrivalGuide';
import {
  licenseLinks,
  photoDetailErrors,
  photoDetails,
  samePhotoRights,
} from './photo-details';
import {
  usePhotoQueue,
  usePhotoStore,
  type PrivatePhoto,
} from './use-photo-queue';
import { api } from './supabase';
import type { CampusData, CampusPhoto, MapEdit } from './types';
import type { PhotoChange } from './photo-workspace';
import './photo-manager.css';

// Stable event handlers read the current render without invalidating unrelated cards.
function useLiveCallback<T extends (...args: never[]) => unknown>(
  callback: T,
): T {
  const latest = useRef(callback);
  latest.current = callback;
  return useCallback(((...args) => latest.current(...args)) as T, []);
}

function PhotoImage({
  photo,
  onUrl,
  className,
  previewOnly = false,
}: {
  photo: Partial<CampusPhoto>;
  onUrl?: (url: string) => void;
  className?: string;
  previewOnly?: boolean;
}) {
  const store = usePhotoStore();
  const [url, setUrl] = useState(photo.url),
    [failed, setFailed] = useState(false);
  const tried = useRef(false),
    generation = useRef(0),
    onUrlRef = useRef(onUrl);
  const placeholder = useRef<HTMLElement | null>(null);
  const previewRequest = useRef<AbortController | null>(null);
  onUrlRef.current = onUrl;
  const renew = useCallback(async () => {
    const request = generation.current;
    if (!photo.id?.startsWith('owner:')) {
      setFailed(true);
      return;
    }
    try {
      const result = await store.previews.get(
        photo.id.slice(6),
        tried.current,
        previewRequest.current?.signal,
      );
      if (request !== generation.current) return;
      if (!result.previewUrl) throw Error('Preview unavailable');
      setUrl(result.previewUrl);
      onUrlRef.current?.(result.previewUrl);
      setFailed(false);
    } catch {
      if (request === generation.current) setFailed(true);
    }
  }, [photo.id, store]);
  useEffect(() => {
    const requestGeneration = generation;
    requestGeneration.current++;
    const controller = new AbortController();
    previewRequest.current = controller;
    setUrl(photo.url);
    setFailed(false);
    let observer: IntersectionObserver | undefined;
    if (!photo.url && photo.id?.startsWith('owner:')) {
      if (placeholder.current && typeof IntersectionObserver !== 'undefined') {
        observer = new IntersectionObserver((entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            observer?.disconnect();
            void renew();
          }
        });
        observer.observe(placeholder.current);
      } else void renew();
    }
    return () => {
      observer?.disconnect();
      controller.abort();
      requestGeneration.current++;
    };
  }, [photo.id, photo.url, renew]);
  useEffect(() => {
    tried.current = false;
  }, [photo.id]);
  const Placeholder = previewOnly ? 'span' : 'button';
  return failed || (!url && !photo.url) ? (
    <Placeholder
      ref={(node) => {
        placeholder.current = node;
      }}
      type="button"
      disabled={!photo.id?.startsWith('owner:')}
      onClick={previewOnly ? undefined : () => void renew()}
    >
      {previewOnly
        ? 'Photo'
        : failed
          ? 'Retry photograph'
          : 'Load private preview'}
    </Placeholder>
  ) : (
    <img
      className={className}
      src={url || photo.url}
      alt={photo.alt || photo.caption || 'Photograph preview'}
      loading="lazy"
      decoding="async"
      onError={() => {
        if (tried.current) setFailed(true);
        else {
          tried.current = true;
          void renew();
        }
      }}
    />
  );
}

export function PhotoManager({
  edit,
  data,
  owner,
  onApply,
  onUndo,
  saveStatus,
  publishedPhotos = [],
}: {
  edit: MapEdit;
  data: CampusData;
  owner: string;
  onApply: (change: PhotoChange) => void;
  onUndo: () => void;
  saveStatus: string;
  publishedPhotos?: CampusPhoto[];
}) {
  const index = useMemo(() => campusPhotoIndex(data), [data]);
  const buildingId = canonicalBuildingId(
    data,
    edit.kind === 'building'
      ? edit.id
      : String(
          edit.properties.buildingId ||
            index.placeBuildings.get(edit.id) ||
            index.placeBuildings.get(String(edit.properties.placeId)) ||
            '',
        ),
  );
  const entranceId = edit.kind === 'entrance' ? edit.id : undefined;
  const target = entranceId
    ? `entrance:${entranceId}`
    : `building:${buildingId}`;
  const gallery = useMemo(
    () => index.photos.get(target) || [],
    [index, target],
  );
  const name = index.name;
  const buildingOptions = useMemo(
    () =>
      index.options.map((b) => (
        <option key={b.id} value={b.id}>
          {b.label}
        </option>
      )),
    [index],
  );
  const published = useMemo(
    () => new Set(publishedPhotos.map((p) => JSON.stringify(p))),
    [publishedPhotos],
  );
  const targetName = entranceId
    ? `${name(buildingId)} · ${String(edit.properties.name || 'Entrance')}`
    : name(buildingId);
  const [open, setOpen] = useState(false),
    [tab, setTab] = useState<'gallery' | 'review' | 'private' | 'preview'>(
      'gallery',
    );
  const [selected, setSelected] = useState<string>(),
    [busy, setBusy] = useState<string | false>(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const [removed, setRemoved] = useState(false),
    [query, setQuery] = useState(''),
    [library, setLibrary] = useState<PrivatePhoto[]>([]),
    [nextOffset, setNextOffset] = useState<number | null>(null);
  const [shared, setShared] = useState<string[]>([]),
    [fieldErrors, setFieldErrors] = useState<
      Partial<Record<keyof CampusPhoto, string>>
    >({});
  const [galleryPage, setGalleryPage] = useState(0),
    [queuePage, setQueuePage] = useState(0),
    [libraryOffset, setLibraryOffset] = useState(0),
    [loadingLibrary, setLoadingLibrary] = useState(false);
  const libraryRequest = useRef<AbortController | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const store = usePhotoStore();
  const queue = usePhotoQueue(owner, target);
  const { patch, update, editable } = queue;
  const queueKeys = queue.jobs.map((j) => j.key).join('|');
  const queueOrder = useMemo(
    () => (queueKeys ? queueKeys.split('|') : []),
    [queueKeys],
  );
  const [attaching, setAttaching] = useState<string[]>([]);
  const job = queue.jobs.find((j) => j.key === selected);
  const panel = useRef<HTMLDivElement>(null),
    mounted = useRef(true);
  const galleryFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!galleryFocus.current) return;
    const card = [
      ...(panel.current?.querySelectorAll<HTMLElement>('[data-photo-id]') ||
        []),
    ].find((el) => el.dataset.photoId === galleryFocus.current);
    if (card) {
      card.querySelector<HTMLButtonElement>('button')?.focus();
      galleryFocus.current = null;
    }
  }, [gallery, galleryPage]);
  useEffect(() => {
    if (removed)
      panel.current
        ?.querySelector<HTMLButtonElement>('[data-photo-undo]')
        ?.focus();
  }, [removed]);
  useEffect(() => {
    if (tab === 'review' && !job && queue.jobs.length)
      setSelected(queue.jobs[0].key);
  }, [tab, job, queue.jobs]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      libraryRequest.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (selected) {
      const i = queueOrder.indexOf(selected);
      if (i >= 0) setQueuePage(Math.floor(i / 20));
    }
  }, [selected, queueOrder]);
  useEffect(() => {
    setGalleryPage((p) =>
      Math.min(p, Math.max(0, Math.ceil(gallery.length / 20) - 1)),
    );
  }, [gallery.length]);
  useEffect(() => {
    setQueuePage((p) =>
      Math.min(p, Math.max(0, Math.ceil(queue.jobs.length / 20) - 1)),
    );
  }, [queue.jobs.length]);
  useEffect(() => {
    panel.current?.querySelector('.photo-workspace-body')?.scrollTo({ top: 0 });
  }, [tab, selected]);
  useEffect(() => {
    if (!open || !visualViewport) return;
    const resize = () => {
      panel.current?.style.setProperty(
        '--photo-viewport-height',
        visualViewport!.height + 'px',
      );
      panel.current?.style.setProperty(
        '--photo-viewport-top',
        visualViewport!.offsetTop + 'px',
      );
    };
    resize();
    visualViewport.addEventListener('resize', resize);
    visualViewport.addEventListener('scroll', resize);
    return () => {
      visualViewport?.removeEventListener('resize', resize);
      visualViewport?.removeEventListener('scroll', resize);
    };
  }, [open]);
  const defaults = () => ({
    buildingId,
    entranceId,
    checkedAt: new Date().toISOString().slice(0, 10),
    modifications:
      'Resized, oriented and converted to WebP; source metadata removed.',
  });
  const addFiles = (files: File[]) => {
    queue.enqueue(files, defaults());
    setTab('review');
    setMessage(
      'Photos stay private until reviewed and added to the map draft.',
    );
  };
  const apply = (
    photos: CampusPhoto[],
    removeIds: string[] = [],
    replaces?: Record<string, string>,
  ) => {
    try {
      onApply({ photos, removeIds, replaces });
      setError('');
      setRemoved(false);
      setMessage(
        'Saved to map draft. Preview and publish the release to make this public.',
      );
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };
  const editPhoto = async (photo: CampusPhoto) => {
    const existing = queue.jobs.find((j) => j.original?.id === photo.id);
    if (existing) {
      setSelected(existing.key);
      setTab('review');
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
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const change = useLiveCallback((key: keyof CampusPhoto, value: unknown) => {
    if (!job || job.approved) return;
    const metadata = { ...job.metadata, [key]: value };
    if (key === 'buildingId') metadata.entranceId = undefined;
    if (key === 'sourceKind' && value === 'author-upload')
      metadata.sourceUrl = undefined;
    if (key === 'license')
      metadata.licenseUrl = licenseLinks[value as CampusPhoto['license']] || '';
    if (
      (key === 'license' || key === 'author') &&
      (!job.metadata.attribution ||
        job.metadata.attribution ===
          `${job.metadata.author || ''} · ${job.metadata.license || ''}`)
    )
      metadata.attribution = `${metadata.author || ''} · ${metadata.license || ''}`;
    queue.patch(job.key, {
      metadata,
      reviewed: false,
      state: ['queued', 'uploading', 'processing'].includes(job.state)
        ? job.state
        : 'needs details',
      rightsReviewed: samePhotoRights(metadata, job.metadata)
        ? job.rightsReviewed
        : !!job.original && samePhotoRights(metadata, job.original),
      authorshipConfirmed:
        samePhotoRights(metadata, job.metadata) && job.authorshipConfirmed,
      error: undefined,
    });
    setFieldErrors({});
  });
  const markReady = useLiveCallback(() => {
    if (!job) return;
    if (
      [
        ...gallery,
        ...queue.jobs
          .filter((j) => j.key !== job.key && j.state === 'ready')
          .map((j) => j.metadata),
      ].some(
        (p) =>
          p.sha256 === job.metadata.sha256 &&
          p.buildingId === job.metadata.buildingId &&
          p.entranceId === job.metadata.entranceId &&
          p.id !== job.original?.id,
      )
    ) {
      setError(
        'This photograph is already in this gallery or the ready queue. Remove the duplicate from the queue.',
      );
      return;
    }
    const errors = photoDetailErrors(job.metadata);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      requestAnimationFrame(() => {
        const invalid = panel.current?.querySelector<HTMLElement>(
          '[aria-invalid="true"]',
        );
        const section = invalid?.closest('details');
        if (section) section.open = true;
        invalid?.focus();
      });
      return;
    }
    if (
      !job.reviewed ||
      !job.rightsReviewed ||
      (job.metadata.sourceKind === 'author-upload' && !job.authorshipConfirmed)
    ) {
      setError(
        'Confirm the photo identity, visual quality and applicable authorship or reuse rights.',
      );
      return;
    }
    queue.patch(job.key, { state: 'ready' });
    setError('');
    const next = store
      .snapshot(target)
      .find((j) => j.key !== job.key && j.state === 'needs details');
    if (next) setSelected(next.key);
  });
  const attach = async () => {
    const ready = queue.jobs.filter((j) => j.state === 'ready');
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
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setAttaching([]);
    }
  };
  const loadLibrary = async (offset = 0) => {
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
  };
  const recover = async (item: PrivatePhoto) => {
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
  };
  const move = (index: number, to: number) => {
    const next = [...gallery];
    const [p] = next.splice(index, 1);
    next.splice(to, 0, p);
    galleryFocus.current = p.id;
    if (apply(next)) setGalleryPage(Math.floor(to / 20));
    else galleryFocus.current = null;
  };
  const reviewForm = useMemo(() => {
    const field = (label: string, key: keyof CampusPhoto, type = 'text') => (
      <label className="field-label" key={key}>
        {label}
        <input
          aria-label={label}
          type={type}
          value={String(job?.metadata[key] || '')}
          aria-invalid={!!fieldErrors[key]}
          aria-describedby={fieldErrors[key] ? `photo-error-${key}` : undefined}
          onChange={(e) => change(key, e.target.value || undefined)}
        />
        {fieldErrors[key] && (
          <span id={`photo-error-${key}`} className="photo-error">
            {fieldErrors[key]}
          </span>
        )}
      </label>
    );
    return (
      job && (
        <section className="photo-review-form" aria-label="Photo details">
          <PhotoImage
            key={job.key}
            className="photo-review-image"
            photo={{
              ...job.metadata,
              id: job.mediaId ? `owner:${job.mediaId}` : job.metadata.id,
              url: job.previewUrl,
              alt: job.metadata.alt || 'Photo awaiting review',
            }}
            onUrl={(url) => patch(job.key, { previewUrl: url })}
          />
          <div className="photo-actions">
            <button
              disabled={queueOrder.indexOf(job.key) === 0}
              onClick={() =>
                setSelected(queueOrder[queueOrder.indexOf(job.key) - 1])
              }
            >
              Previous photo
            </button>
            <button
              disabled={queueOrder.indexOf(job.key) === queueOrder.length - 1}
              onClick={() =>
                setSelected(queueOrder[queueOrder.indexOf(job.key) + 1])
              }
            >
              Next photo
            </button>
          </div>
          {job.approved && (
            <p className="photo-notice">
              Approved privately. Add this photo to the map draft to finish. To
              revise these locked details, remove it from this queue and resume
              it from Private uploads.
            </p>
          )}
          <fieldset
            className="photo-body-controls"
            disabled={
              !!job.approved || !editable || attaching.includes(job.key)
            }
          >
            {field('Caption', 'caption')}
            {field('Image description (alternative text)', 'alt')}
            <label className="field-label">
              Pictured building
              <select
                aria-label="Pictured building"
                aria-invalid={!!fieldErrors.buildingId}
                value={job.metadata.buildingId || ''}
                onChange={(e) => change('buildingId', e.target.value)}
              >
                <option value="">Choose building</option>
                {buildingOptions}
              </select>
              {fieldErrors.buildingId && (
                <span className="photo-error">{fieldErrors.buildingId}</span>
              )}
            </label>
            <label className="field-label">
              Photograph of
              <select
                aria-label="Photograph of"
                value={job.metadata.entranceId || ''}
                onChange={(e) =>
                  change('entranceId', e.target.value || undefined)
                }
              >
                <option value="">General building view</option>
                {(index.entrances.get(job.metadata.buildingId || '') || []).map(
                  (e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ),
                )}
              </select>
            </label>
            <details open={!job.original}>
              <summary>
                Source & credits{' '}
                {job.original && samePhotoRights(job.metadata, job.original)
                  ? '· previously reviewed'
                  : ''}
              </summary>
              <label className="field-label">
                Photo source
                <select
                  aria-label="Photo source"
                  value={job.metadata.sourceKind || 'external'}
                  onChange={(e) => change('sourceKind', e.target.value)}
                >
                  <option value="external">Photo from another source</option>
                  <option
                    value="author-upload"
                    disabled={!!job.original && !job.mediaId}
                  >
                    I took this photo
                  </option>
                </select>
              </label>
              {field('Photographer / public credit', 'author')}
              {job.metadata.sourceKind === 'author-upload' ? (
                <label>
                  <input
                    type="checkbox"
                    checked={job.authorshipConfirmed}
                    onChange={(e) =>
                      patch(job.key, {
                        authorshipConfirmed: e.target.checked,
                        state: ['queued', 'uploading', 'processing'].includes(
                          job.state,
                        )
                          ? job.state
                          : 'needs details',
                      })
                    }
                  />
                  I took this photograph and choose to share it under the
                  selected license.
                </label>
              ) : (
                field('Original source page', 'sourceUrl', 'url')
              )}
              <label className="field-label">
                Reuse license
                <select
                  aria-label="Reuse license"
                  value={job.metadata.license || ''}
                  aria-invalid={!!fieldErrors.license}
                  onChange={(e) => change('license', e.target.value)}
                >
                  <option value="">Choose a verified license</option>
                  {photoLicenses.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
                {fieldErrors.license && (
                  <span className="photo-error">{fieldErrors.license}</span>
                )}
              </label>
              {field(
                'License / public-domain evidence page',
                'licenseUrl',
                'url',
              )}
              {field('Required attribution', 'attribution')}
              <label>
                <input
                  type="checkbox"
                  checked={job.rightsReviewed}
                  onChange={(e) =>
                    patch(job.key, {
                      rightsReviewed: e.target.checked,
                      state: ['queued', 'uploading', 'processing'].includes(
                        job.state,
                      )
                        ? job.state
                        : 'needs details',
                    })
                  }
                />
                I checked the author, source and permission for offline
                redistribution.
              </label>
              <button
                disabled={!shared.length}
                onClick={() =>
                  update((items) =>
                    items.map((item) =>
                      shared.includes(item.key) &&
                      !attaching.includes(item.key) &&
                      !item.approved &&
                      item.key !== job.key
                        ? {
                            ...item,
                            metadata: {
                              ...item.metadata,
                              author: job.metadata.author,
                              license: job.metadata.license,
                              licenseUrl: job.metadata.licenseUrl,
                              attribution: job.metadata.attribution,
                            },
                            reviewed: false,
                            rightsReviewed: false,
                            authorshipConfirmed: false,
                            state: [
                              'queued',
                              'uploading',
                              'processing',
                            ].includes(item.state)
                              ? item.state
                              : 'needs details',
                          }
                        : item,
                    ),
                  )
                }
              >
                Apply these author/license details to {shared.length} selected
                uploads
              </button>
            </details>
            <details>
              <summary>Dates & historical view</summary>
              {field('Capture date (if known)', 'capturedAt', 'date')}
              {field('Source checked', 'checkedAt', 'date')}
              <label>
                <input
                  type="checkbox"
                  checked={!!job.metadata.historical}
                  onChange={(e) => change('historical', e.target.checked)}
                />
                Historical view
              </label>
            </details>
            <label>
              <input
                type="checkbox"
                checked={job.reviewed}
                onChange={(e) =>
                  patch(job.key, {
                    reviewed: e.target.checked,
                    state: ['queued', 'uploading', 'processing'].includes(
                      job.state,
                    )
                      ? job.state
                      : 'needs details',
                  })
                }
              />
              I checked visual quality and the building / entrance identity.
            </label>
            <button
              className="photo-primary"
              disabled={
                !editable || attaching.includes(job.key) || !job.metadata.sha256
              }
              onClick={markReady}
            >
              Mark ready
            </button>
          </fieldset>
        </section>
      )
    );
  }, [
    job,
    fieldErrors,
    shared,
    index,
    buildingOptions,
    queueOrder,
    attaching,
    editable,
    patch,
    update,
    change,
    markReady,
  ]);
  if (!['building', 'entrance', 'place'].includes(edit.kind)) return null;
  return (
    <section className="photo-launcher" aria-label="Building photos">
      <div className="photo-strip">
        {gallery.slice(0, 4).map((p) => (
          <PhotoImage key={p.id} photo={p} />
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger disabled={!buildingId} className="editor-secondary">
          Manage photos · {gallery.length}
        </DialogTrigger>
        {!buildingId && (
          <p className="small-note">
            Link this place or entrance to a building before adding photos.
          </p>
        )}
        <DialogContent
          className="photo-workspace"
          overlayClassName="photo-workspace-overlay"
          ref={panel}
        >
          <header>
            <DialogTitle>Photos · {targetName}</DialogTitle>
            <DialogDescription>
              {gallery.length} in this gallery ·{' '}
              {saveStatus === 'Saved' ? 'Map draft saved' : saveStatus}.
              Publication happens through Releases.
            </DialogDescription>
          </header>
          <nav aria-label="Photo workspace">
            <button
              aria-pressed={tab === 'gallery'}
              onClick={() => setTab('gallery')}
            >
              Gallery
            </button>
            <button
              aria-pressed={tab === 'review'}
              onClick={() => setTab('review')}
            >
              Review uploads ({queue.jobs.length})
            </button>
            <button
              aria-pressed={tab === 'private'}
              disabled={!queue.editable}
              onClick={() => void loadLibrary()}
            >
              Private uploads
            </button>
            <button
              aria-pressed={tab === 'preview'}
              onClick={() => setTab('preview')}
            >
              Preview public gallery
            </button>
          </nav>
          <div className="photo-workspace-body">
            <fieldset className="photo-body-controls">
              {!queue.editable && (
                <output>
                  {queue.jobs.length
                    ? 'Photo editing is active in another tab.'
                    : 'Preparing private photo workspace…'}
                </output>
              )}
              {message && (
                <output className="photo-notice">
                  {message}{' '}
                  {removed && (
                    <button
                      data-photo-undo
                      onClick={() => {
                        onUndo();
                        setRemoved(false);
                        setMessage('Removal undone.');
                      }}
                    >
                      Undo removal
                    </button>
                  )}
                </output>
              )}
              {(error || queue.storageError) && (
                <p role="alert" className="photo-error">
                  {error || queue.storageError}
                </p>
              )}
              {tab === 'preview' && (
                <>
                  <p className="small-note">
                    Draft preview — this does not publish changes.
                  </p>
                  {gallery.length ? (
                    <PhotoGallery
                      photos={gallery.map((p) => ({
                        ...p,
                        url: previewUrls[p.id] || p.url,
                      }))}
                    />
                  ) : (
                    <p>No photographs in this gallery yet.</p>
                  )}
                </>
              )}
              {tab === 'gallery' && (
                <>
                  <div
                    className="photo-drop"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      addFiles(Array.from(e.dataTransfer.files));
                    }}
                  >
                    <label className="photo-add">
                      Add photos
                      <input
                        aria-label="Add photos"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        disabled={!queue.editable || busy === 'attach'}
                        onChange={(e) => {
                          addFiles(Array.from(e.target.files || []));
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <p>
                      Choose files or drop them here. JPEG, PNG or WebP · up to
                      10 MiB each.
                    </p>
                  </div>
                  {!gallery.length && (
                    <p>
                      Add a building view or an entrance photograph to help
                      visitors recognise this place.
                    </p>
                  )}
                  <div className="photo-grid">
                    {gallery
                      .slice(galleryPage * 20, (galleryPage + 1) * 20)
                      .map((p, localIndex) => {
                        const i = galleryPage * 20 + localIndex;
                        return (
                          <StableCard
                            key={p.id}
                            value={p}
                            detail={`${i}:${busy}:${queue.editable}`}
                          >
                            <article
                              className="photo-card"
                              data-photo-id={p.id}
                            >
                              <PhotoImage
                                photo={{
                                  ...p,
                                  url: previewUrls[p.id] || p.url,
                                }}
                                onUrl={(url) =>
                                  setPreviewUrls((v) => ({ ...v, [p.id]: url }))
                                }
                              />
                              <h3>{p.caption}</h3>
                              <p>
                                {i === 0 && <strong>Cover · </strong>}
                                {published.has(JSON.stringify(p))
                                  ? 'Published'
                                  : 'In map draft'}
                                {p.historical ? ' · Historical' : ''}
                              </p>
                              <div className="photo-actions">
                                <button
                                  disabled={!queue.editable || busy === p.id}
                                  onClick={() => void editPhoto(p)}
                                >
                                  Edit details
                                </button>
                                <button
                                  disabled={i === 0}
                                  onClick={() => move(i, 0)}
                                >
                                  Make cover
                                </button>
                                <button
                                  aria-label={`Move ${p.caption} earlier`}
                                  disabled={i === 0}
                                  onClick={() => move(i, i - 1)}
                                >
                                  Move earlier
                                </button>
                                <button
                                  aria-label={`Move ${p.caption} later`}
                                  disabled={i === gallery.length - 1}
                                  onClick={() => move(i, i + 1)}
                                >
                                  Move later
                                </button>
                                <button
                                  onClick={() => {
                                    if (apply([], [p.id])) setRemoved(true);
                                  }}
                                >
                                  Remove
                                </button>
                              </div>
                            </article>
                          </StableCard>
                        );
                      })}
                  </div>
                  <Pages
                    page={galleryPage}
                    count={gallery.length}
                    onPage={setGalleryPage}
                    label="Gallery"
                  />
                </>
              )}
              {tab === 'private' && (
                <>
                  <form
                    className="photo-actions"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void loadLibrary();
                    }}
                  >
                    <label>
                      Search private uploads
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        type="search"
                      />
                    </label>
                    <button disabled={!queue.editable || busy === 'attach'}>
                      Search
                    </button>
                  </form>
                  <p>
                    Private uploads are not published automatically. Choose one
                    to resume its review.
                  </p>
                  <div className="photo-grid">
                    {library.map((item) => (
                      <article className="photo-card" key={item.id}>
                        {item.metadata?.sha256 ? (
                          <PhotoImage
                            photo={{
                              ...item.metadata,
                              id: `owner:${item.id}`,
                              url: item.previewUrl,
                              alt:
                                item.metadata?.alt ||
                                item.filename ||
                                'Private photo',
                            }}
                          />
                        ) : (
                          <p>Preview available after processing</p>
                        )}
                        <h3>
                          {item.draft?.caption ||
                            item.metadata?.caption ||
                            item.filename ||
                            'Private photo'}
                        </h3>
                        <p>
                          {name(
                            item.draft?.buildingId || item.metadata?.buildingId,
                          )}{' '}
                          ·{' '}
                          {item.status === 'approved'
                            ? 'Previously approved'
                            : item.status === 'processed'
                              ? 'Needs review'
                              : 'Upload unfinished'}
                        </p>
                        <button
                          disabled={!queue.editable || busy === 'attach'}
                          onClick={() => void recover(item)}
                        >
                          Resume review
                        </button>
                      </article>
                    ))}
                  </div>
                  {loadingLibrary && <output>Loading private uploads…</output>}
                  {!loadingLibrary && !library.length && (
                    <p>No private photos found.</p>
                  )}
                  {libraryOffset > 0 && (
                    <button
                      onClick={() =>
                        void loadLibrary(Math.max(0, libraryOffset - 20))
                      }
                    >
                      Previous page
                    </button>
                  )}
                  {nextOffset !== null && (
                    <button
                      disabled={!queue.editable || busy === 'attach'}
                      onClick={() => void loadLibrary(nextOffset)}
                    >
                      Next page
                    </button>
                  )}
                </>
              )}
              {tab === 'review' && (
                <>
                  {!queue.jobs.length && (
                    <p>
                      No unfinished photos. Choose Gallery → Add photos to get
                      started.
                    </p>
                  )}
                  <div className="photo-review-layout">
                    <aside aria-label="Upload queue">
                      {queue.jobs
                        .slice(queuePage * 20, (queuePage + 1) * 20)
                        .map((item) => (
                          <StableCard
                            key={item.key}
                            value={item}
                            detail={`${selected === item.key}:${shared.includes(item.key)}:${attaching.includes(item.key)}:${queue.editable}`}
                          >
                            <div className="photo-queue-card">
                              <button
                                aria-pressed={selected === item.key}
                                onClick={() => {
                                  setSelected(item.key);
                                  setFieldErrors({});
                                }}
                              >
                                <PhotoImage
                                  previewOnly
                                  photo={{
                                    ...item.metadata,
                                    id: item.mediaId
                                      ? `owner:${item.mediaId}`
                                      : undefined,
                                    url: item.previewUrl,
                                    alt: '',
                                  }}
                                  onUrl={(url) =>
                                    patch(item.key, { previewUrl: url })
                                  }
                                />
                                <span>
                                  {item.filename}
                                  <small>
                                    {item.state}
                                    {item.mediaId &&
                                    item.savedDetails ===
                                      JSON.stringify(
                                        photoDetails(item.metadata),
                                      )
                                      ? ' · Saved privately'
                                      : ''}
                                  </small>
                                </span>
                              </button>
                              {item.error && <p role="alert">{item.error}</p>}
                              <div className="photo-actions">
                                {item.error && item.state !== 'failed' && (
                                  <button
                                    onClick={() =>
                                      queue.patch(item.key, {
                                        error: undefined,
                                      })
                                    }
                                  >
                                    Retry private save / preview
                                  </button>
                                )}
                                {item.state === 'failed' && (
                                  <>
                                    <button
                                      onClick={() => queue.retry(item.key)}
                                    >
                                      Retry processing
                                    </button>
                                    <label>
                                      Reselect file
                                      <input
                                        aria-label={`Reselect ${item.filename}`}
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        onChange={(e) =>
                                          queue.retry(
                                            item.key,
                                            e.target.files?.[0],
                                          )
                                        }
                                      />
                                    </label>
                                  </>
                                )}
                                <button
                                  disabled={
                                    !queue.editable ||
                                    busy === 'attach' ||
                                    ['processing', 'uploading'].includes(
                                      item.state,
                                    )
                                  }
                                  onClick={() => queue.remove(item.key)}
                                >
                                  Remove from queue
                                </button>
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={shared.includes(item.key)}
                                    onChange={(e) =>
                                      setShared((s) =>
                                        e.target.checked
                                          ? [...s, item.key]
                                          : s.filter((k) => k !== item.key),
                                      )
                                    }
                                  />
                                  Use shared credits
                                </label>
                              </div>
                            </div>
                          </StableCard>
                        ))}
                      <Pages
                        page={queuePage}
                        count={queue.jobs.length}
                        onPage={setQueuePage}
                        label="Uploads"
                      />
                    </aside>
                    {reviewForm}
                  </div>
                </>
              )}
            </fieldset>
          </div>
          <footer>
            <output>
              {busy
                ? 'Working…'
                : `${queue.jobs.filter((j) => j.state === 'ready').length} photos ready`}
            </output>
            <button
              className="photo-primary"
              disabled={
                !queue.editable ||
                busy === 'attach' ||
                !queue.jobs.some((j) => j.state === 'ready')
              }
              onClick={() => void attach()}
            >
              Add reviewed photos to draft
            </button>
          </footer>
        </DialogContent>
      </Dialog>
    </section>
  );
}

const StableCard = memo(
  function StableCard({
    children,
  }: {
    value: unknown;
    detail: string;
    children: ReactNode;
  }) {
    return <>{children}</>;
  },
  (a, b) => a.value === b.value && a.detail === b.detail,
);
function Pages({
  page,
  count,
  onPage,
  label,
}: {
  page: number;
  count: number;
  onPage: (page: number) => void;
  label: string;
}) {
  if (count <= 20) return null;
  return (
    <nav aria-label={label + ' pages'} className="photo-pages">
      <button disabled={!page} onClick={() => onPage(page - 1)}>
        Previous page
      </button>
      <span>
        Page {page + 1} of {Math.ceil(count / 20)}
      </span>
      <button
        disabled={(page + 1) * 20 >= count}
        onClick={() => onPage(page + 1)}
      >
        Next page
      </button>
    </nav>
  );
}
