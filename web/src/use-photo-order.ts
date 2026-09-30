import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import type { CampusPhoto } from './types';

/** Reorder previews never mutate the draft. A drop is one existing photo command. */
export function usePhotoOrder(
  photos: CampusPhoto[],
  host: RefObject<HTMLElement | null>,
  enabled: boolean,
  move: (from: number, to: number) => void,
  page: (page: number) => void,
) {
  const instructionsId = useId();
  const [preview, setPreview] = useState<{ id: string; to: number } | null>(
    null,
  );
  const [announcement, announce] = useState('');
  const latest = useRef({ photos, enabled, move, page });
  latest.current = { photos, enabled, move, page };
  const gesture = useRef<{
    id: string;
    to: number;
    from: number;
    pointer?: number;
    x: number;
    y: number;
    moved: boolean;
    handle: HTMLButtonElement;
  } | null>(null);
  const frame = useRef(0);
  const finish = (commit: boolean) => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    cancelAnimationFrame(frame.current);
    if (g.pointer !== undefined && g.handle.hasPointerCapture(g.pointer))
      g.handle.releasePointerCapture(g.pointer);
    setPreview(null);
    if (commit && latest.current.enabled && g.from !== g.to) {
      latest.current.move(g.from, g.to);
      announce(
        `Photo moved to position ${g.to + 1}. ${g.to === 0 ? 'It is now the cover.' : ''}`,
      );
    } else {
      announce(commit ? 'Photo order unchanged.' : 'Reordering cancelled.');
      latest.current.page(Math.floor(g.from / 20));
      requestAnimationFrame(() => g.handle.focus());
    }
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;
  const order = photos.map((p) => p.id).join('|');
  useEffect(() => {
    finishRef.current(false);
  }, [order, enabled]);
  useEffect(() => {
    const cancel = () => finishRef.current(false);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && gesture.current) {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      }
    };
    window.addEventListener('resize', cancel);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('resize', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', key, true);
      cancelAnimationFrame(frame.current);
    };
  }, []);
  const target = (to: number) => {
    const g = gesture.current;
    if (!g) return;
    g.to = Math.max(0, Math.min(latest.current.photos.length - 1, to));
    setPreview({ id: g.id, to: g.to });
    announce(
      `Position ${g.to + 1} of ${latest.current.photos.length}${g.to === 0 ? ', cover photo' : ''}. Drop to apply.`,
    );
  };
  const hit = (x: number, y: number) => {
    const card = document
      .elementsFromPoint(x, y)
      .map((el) => el.closest<HTMLElement>('[data-photo-id]'))
      .find((el) => el && host.current?.contains(el));
    if (card) {
      const i = latest.current.photos.findIndex(
        (p) => p.id === card.dataset.photoId,
      );
      if (i >= 0 && i !== gesture.current?.to) target(i);
    }
  };
  const scroll = () => {
    const g = gesture.current;
    const body = host.current?.querySelector<HTMLElement>(
      '.photo-workspace-body',
    );
    if (!g || g.pointer === undefined || !g.moved || !body) return;
    const b = body.getBoundingClientRect();
    const step = g.y < b.top + 50 ? -10 : g.y > b.bottom - 50 ? 10 : 0;
    if (step) {
      body.scrollTop += step;
      hit(g.x, g.y);
    }
    frame.current = requestAnimationFrame(scroll);
  };
  return {
    preview,
    announcement,
    instructionsId,
    handle: (photo: CampusPhoto, index: number) => ({
      'aria-label': `Reorder ${photo.caption}`,
      'aria-describedby': instructionsId,
      'aria-pressed': preview?.id === photo.id,
      disabled: !enabled || photos.length < 2,
      onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
        if (e.button !== 0 || !enabled) return;
        finish(false);
        e.preventDefault();
        e.currentTarget.focus();
        e.currentTarget.setPointerCapture(e.pointerId);
        gesture.current = {
          id: photo.id,
          from: index,
          to: index,
          pointer: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          moved: false,
          handle: e.currentTarget,
        };
      },
      onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => {
        const g = gesture.current;
        if (!g || g.pointer !== e.pointerId) return;
        if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 5)
          return;
        if (!g.moved) {
          g.moved = true;
          frame.current = requestAnimationFrame(scroll);
        }
        g.x = e.clientX;
        g.y = e.clientY;
        hit(g.x, g.y);
      },
      onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
        if (gesture.current?.pointer === e.pointerId) finish(true);
      },
      onPointerCancel: () => finish(false),
      onLostPointerCapture: () => {
        if (gesture.current?.pointer !== undefined) finish(false);
      },
      onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (!enabled) return;
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          if (gesture.current) finish(true);
          else {
            gesture.current = {
              id: photo.id,
              from: index,
              to: index,
              x: 0,
              y: 0,
              moved: true,
              handle: e.currentTarget,
            };
            target(index);
          }
        } else if (
          gesture.current &&
          [
            'ArrowLeft',
            'ArrowRight',
            'ArrowUp',
            'ArrowDown',
            'Home',
            'End',
          ].includes(e.key)
        ) {
          e.preventDefault();
          const to =
            e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? photos.length - 1
                : gesture.current.to +
                  (['ArrowLeft', 'ArrowUp'].includes(e.key) ? -1 : 1);
          target(to);
        }
      },
    }),
  };
}
