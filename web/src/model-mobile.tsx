import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';

export type ModelTouchTool = 'select' | 'move' | 'resize' | 'multi';
export type ModelPanel =
  | 'none'
  | 'add'
  | 'walls'
  | 'edit'
  | 'more'
  | 'mode'
  | 'photo'
  | 'copy';
export const ModelMobileContext = createContext({
  compact: false,
  tool: 'select' as ModelTouchTool,
  setTool: (_tool: ModelTouchTool) => {},
  openPanel: (_panel: ModelPanel) => {},
  planHost: null as HTMLElement | null,
});
export const useModelMobile = () => useContext(ModelMobileContext);

/** Keep plan handles the same touch size while zooming or resizing the workspace. */
export function useModelSvgUnits(
  ref: RefObject<SVGSVGElement | null>,
  revision: string,
) {
  const { compact, planHost } = useModelMobile();
  const [units, setUnits] = useState<[number, number]>([1, 1]);
  useLayoutEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const measure = () => {
      if (!svg.clientWidth || !svg.clientHeight) return;
      const m = svg.getScreenCTM();
      if (!m) return;
      const x = 1 / Math.hypot(m.a, m.b),
        y = 1 / Math.hypot(m.c, m.d);
      if (Number.isFinite(x) && Number.isFinite(y))
        setUnits((old) => (old[0] === x && old[1] === y ? old : [x, y]));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [ref, revision, compact, planHost]);
  return units;
}

/** Only the drawing surface changes location; its owning editor and input state stay mounted. */
export function ModelPlanPortal({ children }: { children: ReactNode }) {
  const { planHost } = useModelMobile();
  return planHost ? createPortal(children, planHost) : children;
}
export function useCompactModel() {
  return useModelMedia(
    '(max-width: 900px), (pointer: coarse) and (max-width: 1400px)',
  );
}

export function useLandscapeModel() {
  return useModelMedia(
    '(orientation: landscape) and (max-height: 600px), (orientation: landscape) and (pointer: coarse)',
  );
}

export function useModelMedia(query: string) {
  const [compact, setCompact] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const media = matchMedia(query),
      update = () => setCompact(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return compact;
}

/** Navigation is view state only. A second pointer cancels the edit before taking over. */
export function useModelPlanNavigation(
  base: number[],
  cancel: () => void,
  canEdit: (target: Element) => boolean,
) {
  const mobile = useModelMobile();
  const [view, setView] = useState<number[] | null>(null);
  const latest = useRef({ cancel, canEdit });
  latest.current = { cancel, canEdit };
  const pointers = useRef(new Map<number, [number, number]>());
  const start = useRef<{
    view: number[];
    x: number;
    y: number;
    distance: number;
    scale: number;
    edit: boolean;
  } | null>(null);
  const moved = useRef(false);
  const reset = () => {
    latest.current.cancel();
    pointers.current.clear();
    start.current = null;
  };
  useEffect(() => {
    reset();
  }, [mobile.tool, mobile.compact]);
  const centre = () => {
    const p = [...pointers.current.values()];
    return [
      (p[0][0] + (p[1]?.[0] ?? p[0][0])) / 2,
      (p[0][1] + (p[1]?.[1] ?? p[0][1])) / 2,
      p[1] ? Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]) : 0,
    ];
  };
  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!mobile.compact) return;
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    const [x, y, distance] = centre(),
      current = view || base;
    const matrix = e.currentTarget.getScreenCTM();
    if (!matrix) return;
    if (pointers.current.size > 1) {
      latest.current.cancel();
      moved.current = true;
    } else moved.current = false;
    start.current = {
      view: current,
      x,
      y,
      distance,
      scale: Math.hypot(matrix.a, matrix.b),
      edit:
        pointers.current.size === 1 &&
        latest.current.canEdit(e.target as Element),
    };
    if (pointers.current.size > 1) e.stopPropagation();
  };
  return {
    viewBox: (view || base).join(' '),
    resetView: () => setView(null),
    zoom: (factor: number) =>
      setView((v) => {
        const b = v || base,
          width = Math.max(base[2] / 8, Math.min(base[2] * 4, b[2] * factor)),
          ratio = width / b[2];
        return [
          b[0] + (b[2] * (1 - ratio)) / 2,
          b[1] + (b[3] * (1 - ratio)) / 2,
          width,
          b[3] * ratio,
        ];
      }),
    handlers: {
      onPointerDownCapture: down,
      onPointerMoveCapture: (e: ReactPointerEvent<SVGSVGElement>) => {
        if (
          !mobile.compact ||
          !start.current ||
          !pointers.current.has(e.pointerId)
        )
          return;
        pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
        const s = start.current,
          [x, y, distance] = centre();
        if (
          Math.hypot(x - s.x, y - s.y) > 5 ||
          (distance && Math.abs(distance - s.distance) > 5)
        )
          moved.current = true;
        if (s.edit || !moved.current) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
        e.stopPropagation();
        const ratio = s.distance && distance ? s.distance / distance : 1;
        const width = Math.max(
            base[2] / 8,
            Math.min(base[2] * 4, s.view[2] * ratio),
          ),
          factor = width / s.view[2];
        setView([
          s.view[0] - (x - s.x) / s.scale + (s.view[2] * (1 - factor)) / 2,
          s.view[1] - (y - s.y) / s.scale + (s.view[3] * (1 - factor)) / 2,
          width,
          s.view[3] * factor,
        ]);
      },
      onPointerUpCapture: (e: ReactPointerEvent<SVGSVGElement>) => {
        if (!mobile.compact) return;
        pointers.current.delete(e.pointerId);
        if (start.current?.distance) {
          e.stopPropagation();
          latest.current.cancel();
        }
        if (!pointers.current.size) start.current = null;
      },
      onPointerCancelCapture: () => {
        if (mobile.compact) {
          moved.current = true;
          reset();
        }
      },
      onClickCapture: (e: React.MouseEvent<SVGSVGElement>) => {
        if (mobile.compact && moved.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
    },
  };
}

export function ModelPlanTools({
  navigation,
}: {
  navigation: ReturnType<typeof useModelPlanNavigation>;
}) {
  return (
    <fieldset className="model-plan-tools" aria-label="Plan navigation">
      <button onClick={() => navigation.zoom(0.8)} aria-label="Zoom plan in">
        +
      </button>
      <button onClick={() => navigation.zoom(1.25)} aria-label="Zoom plan out">
        −
      </button>
      <button onClick={navigation.resetView}>Fit plan</button>
    </fieldset>
  );
}

/** Press-and-hold changes a local candidate and submits exactly one command on release. */
export function ModelNudge({
  onNudge,
  onFinish,
  onCancel,
}: {
  onNudge: (x: number, y: number) => void;
  onFinish: () => void;
  onCancel: () => void;
}) {
  const repeat = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const current = useRef({ onNudge, onFinish, onCancel });
  current.current = { onNudge, onFinish, onCancel };
  const stop = () => {
    clearInterval(repeat.current);
    repeat.current = undefined;
  };
  useEffect(
    () => () => {
      stop();
      current.current.onCancel();
    },
    [],
  );
  return (
    <fieldset className="model-nudge" aria-label="Nudge selected details">
      {(
        [
          ['Left', -1, 0],
          ['Up', 0, 1],
          ['Down', 0, -1],
          ['Right', 1, 0],
        ] as const
      ).map(([label, x, y]) => (
        <button
          key={label}
          aria-label={`Nudge ${label.toLowerCase()}`}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            stop();
            current.current.onNudge(x, y);
            repeat.current = setInterval(
              () => current.current.onNudge(x, y),
              160,
            );
          }}
          onPointerUp={() => {
            stop();
            current.current.onFinish();
          }}
          onPointerCancel={() => {
            stop();
            current.current.onCancel();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              stop();
              current.current.onCancel();
            }
          }}
          onClick={(e) => {
            if (e.detail === 0) {
              current.current.onNudge(x, y);
              current.current.onFinish();
            }
          }}
        >
          {label}
        </button>
      ))}
    </fieldset>
  );
}
