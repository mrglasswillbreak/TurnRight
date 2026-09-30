import { useEffect, useRef, useState } from 'react';
import { ChevronsLeftRight, Minus, Plus, Scan } from 'lucide-react';
import type { PhotoRecipe } from './photo-edit';
/* Spatial pan/crop surface: arrow keys pan, Escape cancels; labelled numeric crop
   and zoom fields provide equivalent controls. ARIA application intentionally takes focus. */
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */

export type PhotoTool = 'navigate' | 'crop' | 'blur' | 'pixelate' | 'redact';
/** One transform for both images keeps the wipe and pointer coordinates aligned. */
export default function PhotoCompare({
  source,
  output,
  tool,
  onRegion,
  onCancel,
}: {
  source: string;
  output: string;
  tool: PhotoTool;
  onRegion: (rect: PhotoRecipe['crop']) => void;
  onCancel: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });
  const [natural, setNatural] = useState({ w: 1, h: 1 });
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [split, setSplit] = useState(50);
  const [box, setBox] = useState<PhotoRecipe['crop']>();
  const points = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ x: number; y: number } | null>(null);
  const fit = Math.min(size.w / natural.w, size.h / natural.h);
  const w = natural.w * fit * view.scale,
    h = natural.h * fit * view.scale;
  const left = (size.w - w) / 2 + view.x,
    top = (size.h - h) / 2 + view.y;
  const latest = useRef({ size, view });
  latest.current = { size, view };
  useEffect(() => {
    const el = host.current!;
    const observer = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
      points.current.clear();
      start.current = null;
      setBox(undefined);
    });
    observer.observe(el);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect(),
        { size, view } = latest.current;
      const scale = Math.max(
        0.25,
        Math.min(12, view.scale * Math.exp(-e.deltaY * 0.002)),
      );
      const ratio = scale / view.scale;
      setView({
        scale,
        x: (e.clientX - r.left - size.w / 2) * (1 - ratio) + view.x * ratio,
        y: (e.clientY - r.top - size.h / 2) * (1 - ratio) + view.y * ratio,
      });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      observer.disconnect();
      el.removeEventListener('wheel', wheel);
    };
  }, []);
  useEffect(() => {
    setView({ x: 0, y: 0, scale: 1 });
  }, [source]);
  const point = (e: React.PointerEvent) => {
    const r = host.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const normalized = (p: { x: number; y: number }) => ({
    x: Math.max(0, Math.min(1, (p.x - left) / w)),
    y: Math.max(0, Math.min(1, (p.y - top) / h)),
  });
  const rect = (p: { x: number; y: number }, a: { x: number; y: number }) => ({
    x: Math.min(p.x, a.x),
    y: Math.min(p.y, a.y),
    width: Math.abs(p.x - a.x),
    height: Math.abs(p.y - a.y),
  });
  const cancel = () => {
    points.current.clear();
    start.current = null;
    setBox(undefined);
  };
  const imageStyle = { width: w, height: h, left, top };
  return (
    <section className="photo-compare" aria-label="Image comparison">
      <div
        className="photo-compare-canvas"
        role="application"
        ref={host}
        tabIndex={0}
        aria-label="Image canvas. Drag to pan, pinch or scroll to zoom."
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            cancel();
            onCancel();
          }
          if (
            ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)
          ) {
            e.preventDefault();
            setView((v) => ({
              ...v,
              x:
                v.x +
                (e.key === 'ArrowLeft' ? 30 : e.key === 'ArrowRight' ? -30 : 0),
              y:
                v.y +
                (e.key === 'ArrowUp' ? 30 : e.key === 'ArrowDown' ? -30 : 0),
            }));
          }
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = point(e);
          points.current.set(e.pointerId, p);
          if (points.current.size > 1) {
            start.current = null;
            setBox(undefined);
          } else if (tool !== 'navigate') start.current = normalized(p);
        }}
        onPointerMove={(e) => {
          const previous = points.current.get(e.pointerId);
          if (!previous) return;
          const p = point(e),
            other = [...points.current.entries()].find(
              ([id]) => id !== e.pointerId,
            )?.[1];
          points.current.set(e.pointerId, p);
          if (other) {
            const before = Math.hypot(
              previous.x - other.x,
              previous.y - other.y,
            );
            const after = Math.hypot(p.x - other.x, p.y - other.y);
            if (before > 4)
              setView((v) => {
                const scale = Math.max(
                    0.25,
                    Math.min(12, (v.scale * after) / before),
                  ),
                  ratio = scale / v.scale;
                return {
                  scale,
                  x:
                    ((previous.x + other.x) / 2 - size.w / 2) * (1 - ratio) +
                    v.x * ratio +
                    (p.x - previous.x) / 2,
                  y:
                    ((previous.y + other.y) / 2 - size.h / 2) * (1 - ratio) +
                    v.y * ratio +
                    (p.y - previous.y) / 2,
                };
              });
          } else if (tool === 'navigate')
            setView((v) => ({
              ...v,
              x: v.x + p.x - previous.x,
              y: v.y + p.y - previous.y,
            }));
          else if (start.current) setBox(rect(normalized(p), start.current));
        }}
        onPointerUp={(e) => {
          if (start.current) {
            const next = rect(normalized(point(e)), start.current);
            if (next.width > 0.005 && next.height > 0.005) onRegion(next);
          }
          points.current.delete(e.pointerId);
          start.current = null;
          setBox(undefined);
        }}
        onPointerCancel={cancel}
      >
        <img
          src={(tool === 'crop' ? source : output || source) || undefined}
          alt="Edited photograph preview"
          draggable={false}
          style={imageStyle}
          onLoad={(e) =>
            setNatural({
              w: e.currentTarget.naturalWidth,
              h: e.currentTarget.naturalHeight,
            })
          }
        />
        {tool === 'navigate' && output && (
          <div
            className="photo-compare-before"
            style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
          >
            <img
              src={source}
              alt="Original comparison"
              draggable={false}
              style={imageStyle}
            />
          </div>
        )}
        {box && (
          <div
            className="photo-opt-box"
            style={{
              left: left + box.x * w,
              top: top + box.y * h,
              width: box.width * w,
              height: box.height * h,
            }}
          />
        )}
      </div>
      {tool === 'navigate' && output && (
        <div
          className="photo-wipe"
          style={{ '--photo-split': `${split}%` } as React.CSSProperties}
        >
          <input
            type="range"
            className="photo-wipe-handle"
            aria-label="Before and after comparison"
            min={0}
            max={100}
            step={2}
            value={split}
            aria-valuenow={Math.round(split)}
            onChange={(e) => setSplit(Number(e.target.value))}
          />
          <ChevronsLeftRight className="photo-wipe-arrows" aria-hidden="true" />
        </div>
      )}
      <div className="photo-view-tools">
        <button
          aria-label="Zoom out"
          onClick={() =>
            setView((v) => ({ ...v, scale: Math.max(0.25, v.scale / 1.25) }))
          }
        >
          <Minus />
        </button>
        <label>
          <span className="sr-only">Image zoom</span>
          <input
            aria-label="Image zoom"
            type="number"
            min={25}
            max={1200}
            step={25}
            value={Math.round(view.scale * 100)}
            onChange={(e) =>
              setView((v) => ({
                ...v,
                scale: Math.max(
                  0.25,
                  Math.min(12, Number(e.target.value) / 100),
                ),
              }))
            }
          />
          %
        </label>
        <button
          aria-label="Zoom in"
          onClick={() =>
            setView((v) => ({ ...v, scale: Math.min(12, v.scale * 1.25) }))
          }
        >
          <Plus />
        </button>
        <button
          aria-label="Fit image"
          onClick={() => setView({ x: 0, y: 0, scale: 1 })}
        >
          <Scan />
        </button>
      </div>
    </section>
  );
}
