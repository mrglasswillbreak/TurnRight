import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
} from 'react';
import {
  clampSheetHeight,
  resizeSheetKey,
  sheetLimits,
  sheetViewport,
} from './sheet-size';

function viewport() {
  return sheetViewport(window.innerHeight, window.visualViewport);
}

export function useSheetSize(
  key: string,
  minimum = 96,
  startCompact = true,
  topClearance = 32,
  openFullHeight = false,
  focusContent = false,
) {
  const [view, setView] = useState(viewport);
  const remembered = useRef(0.56);
  // A search session uses the visible viewport without replacing the saved size.
  const [focusedHeight, setFocusedHeight] = useState<number | null>(null);
  useEffect(() => {
    if (!focusContent) setFocusedHeight(null);
  }, [focusContent]);
  const [requested, setRequested] = useState(() => {
    try {
      const value = Number(localStorage.getItem(`turnright:sheet:${key}`));
      if (value > 0 && value <= 1) remembered.current = value;
    } catch {
      /* Resizing also works without storage. */
    }
    return startCompact
      ? minimum
      : openFullHeight
        ? sheetLimits(view.height, minimum, topClearance, true).max
        : view.height * remembered.current;
  });
  const drag = useRef<{ id: number; y: number; height: number } | null>(null);
  const { min, max } = sheetLimits(
    view.height,
    minimum,
    topClearance,
    openFullHeight,
    focusContent,
  );
  const height = clampSheetHeight(
    focusContent ? (focusedHeight ?? max) : requested,
    min,
    max,
  );
  const expanded = height > min + 8;
  const current = useRef(height);
  current.current = height;
  useEffect(() => {
    const resize = () => setView(viewport());
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('scroll', resize);
    return () => {
      window.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('scroll', resize);
    };
  }, []);
  const save = (value: number) => {
    const next = clampSheetHeight(value, min, max);
    if (focusContent) {
      setFocusedHeight(next);
      return;
    }
    setRequested(next);
    if (!startCompact || next > min + 8) {
      remembered.current = Math.min(
        openFullHeight ? 1 : 0.88,
        next / view.height,
      );
      try {
        localStorage.setItem(
          `turnright:sheet:${key}`,
          String(remembered.current),
        );
      } catch {
        /* Keep the chosen size for this session. */
      }
    }
  };
  const resizeProps: HTMLAttributes<HTMLDivElement> = {
    role: 'slider',
    tabIndex: 0,
    'aria-orientation': 'vertical',
    'aria-valuemin': Math.round(min),
    'aria-valuemax': Math.round(max),
    'aria-valuenow': Math.round(height),
    'aria-valuetext': `${Math.round((height / view.height) * 100)}% of the screen`,
    onKeyDown: (event) => {
      const next = resizeSheetKey(event.key, height, min, max);
      if (next === null) return;
      event.preventDefault();
      event.stopPropagation();
      save(next);
    },
    onPointerDown: (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { id: event.pointerId, y: event.clientY, height };
    },
    onPointerMove: (event) => {
      const start = drag.current;
      if (!start || start.id !== event.pointerId) return;
      current.current = clampSheetHeight(
        start.height + start.y - event.clientY,
        min,
        max,
      );
      if (focusContent) setFocusedHeight(current.current);
      else setRequested(current.current);
    },
    onPointerUp: (event) => {
      if (drag.current?.id !== event.pointerId) return;
      save(current.current);
      drag.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    },
    onPointerCancel: () => {
      if (drag.current) {
        if (focusContent) setFocusedHeight(drag.current.height);
        else setRequested(drag.current.height);
      }
      drag.current = null;
    },
    onLostPointerCapture: () => {
      drag.current = null;
    },
  };
  return {
    height,
    min,
    max,
    expanded,
    resizeProps,
    setExpanded: (open: boolean) =>
      setRequested(
        open
          ? startCompact && expanded
            ? focusContent
              ? requested
              : height
            : clampSheetHeight(
                openFullHeight
                  ? max
                  : Math.max(min + 9, view.height * remembered.current),
                min,
                max,
              )
          : min,
      ),
    style: {
      '--sheet-height': `${height}px`,
      '--sheet-bottom-offset': `${view.bottom}px`,
    } as CSSProperties,
  };
}

export function SheetHandle({
  sheet,
  label,
}: {
  sheet: ReturnType<typeof useSheetSize>;
  label: string;
}) {
  return (
    <div
      className="sheet-resize-handle"
      {...sheet.resizeProps}
      aria-label={label}
      title="Drag to resize. Use arrow keys, Home or End."
    >
      <span aria-hidden="true" />
    </div>
  );
}
