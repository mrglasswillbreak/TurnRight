import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePhotoStore } from './use-photo-queue';
import type { CampusPhoto } from './types';
export function PhotoImage({
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
      draggable={false}
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

export const StableCard = memo(
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

export function Pages({
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
