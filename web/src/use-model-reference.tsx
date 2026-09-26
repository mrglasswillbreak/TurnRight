import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { referenceFits, referenceModelWidth } from './model-reference-layout';

const key = 'turnright:model-reference-layout';
function preference(): { enabled: boolean; fraction: number } {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return {
      enabled: value?.enabled === true,
      fraction: Number.isFinite(value?.fraction)
        ? Math.max(0.3, Math.min(0.8, value.fraction))
        : 0.6,
    };
  } catch {
    return { enabled: false, fraction: 0.6 };
  }
}

export function useModelReference() {
  const [saved, setSaved] = useState(preference);
  const host = useRef<HTMLDivElement>(null);
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const attach = useCallback((element: HTMLDivElement | null) => {
    host.current = element;
    setNode(element);
  }, []);
  const drag = useRef<number | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!node) return;
    let frame = 0;
    const observer = new ResizeObserver(([entry]) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        drag.current = null;
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      });
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [node]);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(saved));
    } catch {
      /* Layout works without storage. */
    }
  }, [saved]);
  const fits = referenceFits(size.width, size.height);
  const active = saved.enabled && fits;
  const width = referenceModelWidth(size.width, saved.fraction);
  const move = (next: number) =>
    setSaved((old) => ({
      ...old,
      fraction: referenceModelWidth(size.width, next / size.width) / size.width,
    }));
  return {
    host: attach,
    active,
    enabled: saved.enabled,
    fits,
    size,
    toggle: () => setSaved((old) => ({ ...old, enabled: !old.enabled })),
    style: { '--model-reference-width': `${width}px` } as CSSProperties,
    divider: (
      <div
        className="model-reference-divider"
        role="separator"
        tabIndex={active ? 0 : -1}
        aria-label="Resize model and photograph panes"
        aria-orientation="vertical"
        aria-valuemin={420}
        aria-valuemax={Math.max(420, Math.round(size.width - 292))}
        aria-valuenow={Math.round(width)}
        aria-valuetext={`Model ${Math.round(width)} pixels; photograph ${Math.max(0, Math.round(size.width - width - 12))} pixels`}
        onPointerDown={(event) => {
          drag.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.focus();
        }}
        onPointerMove={(event) => {
          if (drag.current === event.pointerId && host.current)
            move(event.clientX - host.current.getBoundingClientRect().left);
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
            return;
          event.preventDefault();
          move(
            event.key === 'Home'
              ? 420
              : event.key === 'End'
                ? size.width - 292
                : width + (event.key === 'ArrowLeft' ? -20 : 20),
          );
        }}
      />
    ),
  };
}
