import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { campusPhotoIndex } from './campus-photo-index';
import { canonicalBuildingId } from './arrival';
import { licenseLinks, samePhotoRights } from './photo-details';
import {
  usePhotoQueue,
  usePhotoStore,
  type PrivatePhoto,
} from './use-photo-queue';
import type { CampusData, CampusPhoto, MapEdit } from './types';
import type { PhotoChange } from './photo-workspace';
import type { PhotoOptimizerRequest } from './PhotoOptimizer';
import { usePhotoOrder } from './use-photo-order';
import type { PhotoJob } from './photo-queue-store';
import { useLiveCallback } from './useLiveCallback';
import { attachReadyPhotos } from './photo-attachments';
import { editGalleryPhoto } from './photo-gallery-editing';
import { usePhotoReviewForm } from './usePhotoReviewForm';
import {
  loadPrivatePhotoLibrary,
  recoverPrivatePhoto,
} from './photo-private-library.js';
import { markPhotoReady } from './photo-review-ready.js';
export type PhotoManagerProps = {
  edit: MapEdit;
  data: CampusData;
  owner: string;
  onApply: (change: PhotoChange) => void;
  onUndo: () => void;
  saveStatus: string;
  publishedPhotos?: CampusPhoto[];
};

export function usePhotoManager({
  edit,
  data,
  owner,
  onApply,
  onUndo,
  saveStatus,
  publishedPhotos = [],
}: PhotoManagerProps) {
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

  const [optimizing, setOptimizing] = useState<PhotoOptimizerRequest | null>(
    null,
  );

  const [selected, setSelected] = useState<string>(),
    [busy, setBusy] = useState<string | false>(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');

  const [reviewVisited, setReviewVisited] = useState(false);

  useEffect(() => {
    if (!open) setReviewVisited(false);
    else if (tab === 'review') setReviewVisited(true);
  }, [open, tab]);

  const [removed, setRemoved] = useState(false),
    [reordered, setReordered] = useState(false),
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

  const abortLibraryRequest = useEffectEvent(() =>
    libraryRequest.current?.abort(),
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortLibraryRequest();
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
    if (files.length) setOptimizing({ files, metadata: defaults() });
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
      setReordered(false);
      setMessage(
        'Saved to map draft. Preview and publish the release to make this public.',
      );
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };
  const editPhoto = (photo: CampusPhoto) =>
    editGalleryPhoto(
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
      },
      photo,
    );

  const openPhotoEditor = (item: PhotoJob) => {
    setSelected(item.key);
    setOptimizing({
      localId: item.localImageId,
      photo: item.localImageId
        ? undefined
        : item.metadata.sha256 && item.previewUrl
          ? ({ ...item.metadata, url: item.previewUrl } as CampusPhoto)
          : undefined,
      metadata: item.metadata,
      replacesJob: item.key,
      original: item.original,
    });
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
    return markPhotoReady({
      job,
      gallery,
      queue,
      setError,
      setFieldErrors,
      panel,
      store,
      target,
      optimizing,
      setSelected,
    });
  });
  const attach = (only?: string) =>
    attachReadyPhotos(
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
      },
      only,
    );

  const loadLibrary = async (offset = 0) => {
    return loadPrivatePhotoLibrary(
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
      },
      offset,
    );
  };

  const recover = async (item: PrivatePhoto) => {
    return recoverPrivatePhoto(
      { editPhoto, queue, target, defaults, data, setSelected, setTab },
      item,
    );
  };

  const move = (index: number, to: number) => {
    const next = [...gallery];
    const [p] = next.splice(index, 1);
    next.splice(to, 0, p);
    galleryFocus.current = p.id;
    if (apply(next)) {
      setGalleryPage(Math.floor(to / 20));
      setReordered(true);
      setMessage(
        'Photo order saved to the map draft. The first photo is the cover.',
      );
    } else galleryFocus.current = null;
  };

  const ordering = usePhotoOrder(
    gallery,
    panel,
    open && tab === 'gallery' && editable && !busy,
    move,
    setGalleryPage,
  );

  const chosenBuilding = job?.metadata.buildingId;

  const buildingError = fieldErrors.buildingId;

  const reviewForm = usePhotoReviewForm({
    index,
    buildingError,
    chosenBuilding,
    change,
    job,
    fieldErrors,
    patch,
    editable,
    setOptimizing,
    queueOrder,
    setSelected,
    attaching,
    shared,
    update,
    markReady,
  });

  return {
    optimizing,
    owner,
    target,
    job,
    error,
    reviewForm,
    busy,
    editable,
    attach,
    store,
    setOptimizing,
    setTab,
    setMessage,
    openPhotoEditor,
    gallery,
    open,
    setOpen,
    buildingId,
    panel,
    targetName,
    saveStatus,
    tab,
    queue,
    loadLibrary,
    message,
    removed,
    reordered,
    onUndo,
    setRemoved,
    setReordered,
    previewUrls,
    addFiles,
    ordering,
    galleryPage,
    setPreviewUrls,
    published,
    editPhoto,
    apply,
    setGalleryPage,
    query,
    setQuery,
    library,
    name,
    recover,
    loadingLibrary,
    libraryOffset,
    nextOffset,
    reviewVisited,
    queuePage,
    selected,
    shared,
    attaching,
    setSelected,
    setFieldErrors,
    patch,
    setShared,
    setQueuePage,
    edit,
    setBusy,
    setAttaching,
    setError,
    mounted,
    index,
    buildingError,
    chosenBuilding,
    change,
    fieldErrors,
    queueOrder,
    update,
    markReady,
    libraryRequest,
    setLoadingLibrary,
    setLibrary,
    setNextOffset,
    setLibraryOffset,
    defaults,
    data,
  };
}

export type PhotoManagerState = ReturnType<typeof usePhotoManager>;
