import { RotateCcw as ActionRotateCcw, X as ActionX } from 'lucide-react';
import { ModelButton } from './ModelButton';
/* The spatial SVG is an application surface; the hierarchy and metre fields provide equivalent non-spatial controls. */
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useContext,
  useCallback,
  type ReactNode,
} from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useModelSurface, ModelSurfaceContext } from './model-surface';
import { curvedSurface } from './model-curved-surface';
import type { FacadeElement } from './visual-types';
import { detailInstanceId } from './model-instances';
import { ModelNudge, useModelMobile } from './model-mobile';
import {
  elementBounds,
  moveElements,
  placementErrors,
  type wallMetrics,
} from './model-authoring';

type Metrics = ReturnType<typeof wallMetrics>;
export type WallView = { x: number; y: number; width: number; height: number };
export function ModelWallCanvas({
  metrics: sourceMetrics,
  elements: sourceElements,
  selected,
  hidden,
  locked,
  grid,
  onSelect: selectSource,
  onCommit: commitSource,
  onDuplicate,
  onDelete,
  views,
  interactive = true,
  detailName = (e) => e.kind,
  actions,
}: {
  metrics: Metrics;
  elements: FacadeElement[];
  selected: string[];
  hidden: string[];
  locked: string[];
  grid: number;
  onSelect: (ids: string[], instance?: number) => void;
  onCommit: (elements: FacadeElement[]) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  views?: Map<string, WallView>;
  interactive?: boolean;
  detailName?: (e: FacadeElement) => string;
  actions?: ReactNode;
}) {
  const reverse = sourceMetrics.reverse;
  const m = useMemo(
    () =>
      reverse
        ? {
            ...sourceMetrics,
            coordinates: [...sourceMetrics.coordinates].reverse(),
          }
        : sourceMetrics,
    [sourceMetrics, reverse],
  );
  const elements = useMemo(
    () =>
      reverse
        ? sourceElements.map((e) => ({ ...e, x: 1 - e.x }))
        : sourceElements,
    [sourceElements, reverse],
  );
  const surfaceActive = useContext(ModelSurfaceContext).active;
  const [section, setSection] = useState(0);
  const curve = useMemo(
    () =>
      m.coordinates.length > 2 && surfaceActive
        ? curvedSurface(m.coordinates, m.length, section)
        : null,
    [m.coordinates, m.length, section, surfaceActive],
  );
  const projectX = useCallback((x: number) => curve?.project(x) ?? x, [curve]),
    inverseX = (x: number) => curve?.inverse(x) ?? x;
  const curveSelectionKey = selected.join(':'),
    curveSelection = useRef({ curve, selected, elements, length: m.length });
  curveSelection.current = { curve, selected, elements, length: m.length };
  useEffect(() => {
    const { curve, selected, elements, length } = curveSelection.current;
    if (curve && selected[0]) {
      const item = elements.find((e) => e.id === selected[0]);
      if (item) setSection(curve.sectionAt(item.x * length));
    }
  }, [curveSelectionKey, surfaceActive]);
  const toSource = (values: FacadeElement[]) =>
    reverse ? values.map((e) => ({ ...e, x: 1 - e.x })) : values;
  const onCommit = (values: FacadeElement[]) => commitSource(toSource(values));
  const onSelect = (ids: string[], instance?: number) => {
    const element = sourceElements.find((e) => e.id === ids[0]);
    selectSource(
      ids,
      reverse && instance !== undefined && element
        ? element.count - 1 - instance
        : instance,
    );
  };
  const mobile = useModelMobile();
  const pointers = useRef(new Map<number, [number, number]>()),
    pinch = useRef<{
      distance: number;
      centre: [number, number];
      view: WallView;
      matrix: DOMMatrix;
    } | null>(null);
  const [overlap, setOverlap] = useState<{ id: string; instance: number }[]>(
    [],
  );
  const svg = useRef<SVGSVGElement>(null);
  const region = useRef<HTMLElement>(null);
  const [actionPosition, setActionPosition] = useState({ left: 8, top: 55 });
  const [preview, setPreview] = useState<FacadeElement[] | null>(null),
    [marquee, setMarquee] = useState<number[] | null>(null);
  const [view, setView] = useState(
      views?.get(m.wallId) || {
        x: -1,
        y: -m.eaves - 1,
        width: m.length + 2,
        height: m.eaves + 2,
      },
    ),
    [pan, setPan] = useState(false);
  const frame = useRef(0),
    candidate = useRef<FacadeElement[] | null>(null);
  const gesture = useRef<{
    kind: 'move' | 'resize' | 'marquee' | 'pan';
    start: [number, number];
    elements: FacadeElement[];
    ids: string[];
    view: typeof view;
    last: [number, number];
    matrix: DOMMatrix;
    tap?: { id: string; instance: number };
  } | null>(null);
  useEffect(() => {
    views?.set(m.wallId, view);
  }, [views, m.wallId, view]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  useEffect(() => {
    gesture.current = null;
    candidate.current = null;
    pinch.current = null;
    pointers.current.clear();
    cancelAnimationFrame(frame.current);
    setPreview(null);
    setMarquee(null);
  }, [mobile.tool, interactive, mobile.compact]);
  const shown = preview || elements,
    pixel = view.width / Math.max(320, svg.current?.clientWidth || 700);
  const selectionKey = selected.join(':');
  useLayoutEffect(() => {
    const position = () => {
      const canvas = svg.current,
        box = region.current?.getBoundingClientRect(),
        matrix = canvas?.getScreenCTM();
      const selectedBounds = shown
        .filter((e) => selected.includes(e.id))
        .map((e) => elementBounds(e, m.length));
      if (!canvas || !box || !matrix || !selectedBounds.length) return;
      const point = new DOMPoint(
        projectX(Math.max(...selectedBounds.map((b) => b.right))),
        -Math.max(...selectedBounds.map((b) => b.top)),
      ).matrixTransform(matrix);
      const bounds = canvas.getBoundingClientRect();
      const next = {
        left: Math.max(0, Math.min(box.width - 46, point.x - box.left + 8)),
        top: Math.max(
          bounds.top - box.top,
          Math.min(bounds.bottom - box.top - 46, point.y - box.top - 48),
        ),
      };
      setActionPosition((old) =>
        old.left === next.left && old.top === next.top ? old : next,
      );
    };
    position();
    const observer = new ResizeObserver(position);
    if (svg.current) observer.observe(svg.current);
    return () => observer.disconnect();
  }, [view, selectionKey, shown, m.length, selected, projectX]);
  const invalid = useMemo(
    () =>
      new Set(
        placementErrors(shown, m.length, m.eaves, false).map((e) => e.id),
      ),
    [shown, m.length, m.eaves],
  );
  const point = (event: ReactPointerEvent): [number, number] => {
    const matrix = svg.current!.getScreenCTM()!;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
    return [inverseX(p.x), -p.y];
  };
  const begin = (
    event: ReactPointerEvent,
    kind: 'move' | 'resize' | 'marquee' | 'pan',
    id?: string,
    instance?: number,
  ) => {
    if (event.button !== 0 || !interactive || pointers.current.size > 1) return;
    event.stopPropagation();
    svg.current?.focus();
    if (mobile.compact) {
      kind =
        mobile.tool === 'multi'
          ? 'marquee'
          : mobile.tool === 'move' && id && selected.includes(id)
            ? 'move'
            : mobile.tool === 'resize' && id && selected.includes(id)
              ? 'resize'
              : 'pan';
    }
    if (id && locked.includes(id) && kind !== 'pan') {
      onSelect([id], instance);
      return;
    }
    const ids = id
      ? event.shiftKey
        ? selected.includes(id)
          ? selected.filter((v) => v !== id)
          : [...selected, id]
        : selected.includes(id)
          ? selected
          : [id]
      : selected;
    if (id && !mobile.compact) onSelect(ids, instance);
    const start = point(event);
    gesture.current = {
      kind,
      start,
      last: start,
      elements,
      ids: ids.filter((id) => !locked.includes(id)),
      view,
      matrix: svg.current!.getScreenCTM()!.inverse(),
      tap: id ? { id, instance: instance || 0 } : undefined,
    };
    svg.current!.setPointerCapture(event.pointerId);
    candidate.current = null;
  };
  const update = (event: ReactPointerEvent) => {
    if (pointers.current.has(event.pointerId))
      pointers.current.set(event.pointerId, [event.clientX, event.clientY]);
    const pin = pinch.current;
    if (pin && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const factor = Math.max(
        0.08,
        Math.min(
          12,
          pin.distance / Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])),
        ),
      );
      const c = new DOMPoint(
        (a[0] + b[0]) / 2,
        (a[1] + b[1]) / 2,
      ).matrixTransform(pin.matrix);
      setView({
        x: pin.centre[0] - (c.x - pin.view.x) * factor,
        y: pin.centre[1] - (c.y - pin.view.y) * factor,
        width: pin.view.width * factor,
        height: pin.view.height * factor,
      });
      return;
    }
    if (pin) return;
    const g = gesture.current;
    if (!g) return;
    const position = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      g.matrix,
    );
    const p: [number, number] = [inverseX(position.x), -position.y];
    g.last = p;
    if (g.kind === 'pan') {
      setView({
        ...g.view,
        x: g.view.x + projectX(g.start[0]) - position.x,
        y: g.view.y + p[1] - g.start[1],
      });
      return;
    }
    if (g.kind === 'marquee') {
      setMarquee([
        Math.min(g.start[0], p[0]),
        Math.min(g.start[1], p[1]),
        Math.abs(p[0] - g.start[0]),
        Math.abs(p[1] - g.start[1]),
      ]);
      return;
    }
    let dx = p[0] - g.start[0],
      dy = p[1] - g.start[1];
    const targets = g.elements.filter((e) => g.ids.includes(e.id));
    if (!targets.length) return;
    if (!event.altKey) {
      const anchor = targets[0];
      dx =
        Math.round((anchor.x * m.length + dx) / grid) * grid -
        anchor.x * m.length;
      dy = Math.round((anchor.bottom + dy) / grid) * grid - anchor.bottom;
      if (g.kind === 'move') {
        const others = g.elements
          .filter((e) => !g.ids.includes(e.id))
          .map((e) => elementBounds(e, m.length));
        const xs = [
          0,
          m.length / 2,
          m.length,
          ...others.flatMap((b) => [b.left, b.right, (b.left + b.right) / 2]),
        ];
        const ys = [
          0,
          m.eaves,
          ...Array.from(
            { length: Math.max(1, Math.floor(m.floors)) },
            (_, i) => (i * m.eaves) / m.floors,
          ),
          ...others.flatMap((b) => [b.bottom, b.top]),
        ];
        const bounds = targets.map((e) => elementBounds(e, m.length));
        const anchorsX = [
          Math.min(...bounds.map((b) => b.left)),
          Math.max(...bounds.map((b) => b.right)),
          anchor.x * m.length,
        ];
        const anchorsY = [
          Math.min(...bounds.map((b) => b.bottom)),
          Math.max(...bounds.map((b) => b.top)),
        ];
        const snap = (delta: number, anchors: number[], values: number[]) => {
          let best = 6 * pixel,
            shift = 0;
          for (const a of anchors)
            for (const v of values)
              if (Math.abs(v - a - delta) < best) {
                best = Math.abs(v - a - delta);
                shift = v - a - delta;
              }
          return delta + shift;
        };
        dx = snap(dx, anchorsX, xs);
        dy = snap(dy, anchorsY, ys);
      }
    }
    candidate.current =
      g.kind === 'move'
        ? moveElements(g.elements, g.ids, dx, dy, m.length)
        : g.elements.map((e) =>
            e.id === g.ids[0]
              ? {
                  ...e,
                  x: e.x + dx / 2 / m.length,
                  width: e.width + dx,
                  height: e.height + dy,
                  flat: undefined,
                }
              : e,
          );
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => setPreview(candidate.current));
  };
  const cancel = () => {
    gesture.current = null;
    candidate.current = null;
    cancelAnimationFrame(frame.current);
    setPreview(null);
    setMarquee(null);
  };
  const finish = (event: ReactPointerEvent) => {
    pointers.current.delete(event.pointerId);
    if (pinch.current) {
      if (!pointers.current.size) pinch.current = null;
      return;
    }
    const g = gesture.current;
    if (!g) return;
    if (
      mobile.compact &&
      g.kind === 'pan' &&
      Math.hypot(g.last[0] - g.start[0], g.last[1] - g.start[1]) < pixel * 6
    ) {
      const hits = elements
        .filter((e) => !hidden.includes(e.id))
        .flatMap((e) =>
          Array.from({ length: e.count }, (_, i) => ({
            e,
            i,
            x: (e.x + (i - (e.count - 1) / 2) * e.spacing) * m.length,
          })),
        )
        .filter(
          ({ e, i, x }) =>
            !hidden.includes(
              detailInstanceId(e.id, reverse ? e.count - 1 - i : i),
            ) &&
            Math.abs(g.start[0] - x) <= Math.max(e.width / 2, pixel * 12) &&
            g.start[1] >= e.bottom - pixel * 8 &&
            g.start[1] <= e.bottom + e.height + pixel * 8,
        )
        .map(({ e, i }) => ({ id: e.id, instance: i }));
      if (hits.length > 1) setOverlap(hits);
      else onSelect(hits.length ? [hits[0].id] : [], hits[0]?.instance);
    }
    if (g.kind === 'marquee') {
      const [x, y] = g.start,
        [a, b] = g.last;
      const ids = elements
        .filter((e) => !hidden.includes(e.id))
        .filter((e) => {
          const q = elementBounds(e, m.length);
          return (
            q.right >= Math.min(x, a) &&
            q.left <= Math.max(x, a) &&
            q.top >= Math.min(y, b) &&
            q.bottom <= Math.max(y, b)
          );
        })
        .map((e) => e.id);
      onSelect(
        event.shiftKey || mobile.compact
          ? [...new Set([...selected, ...ids])]
          : ids,
      );
    } else if (candidate.current) onCommit(candidate.current);
    gesture.current = null;
    candidate.current = null;
    cancelAnimationFrame(frame.current);
    setPreview(null);
    setMarquee(null);
  };
  const zoom = (factor: number) =>
    setView((v) => ({
      ...v,
      x: v.x + (v.width * (1 - factor)) / 2,
      y: v.y + (v.height * (1 - factor)) / 2,
      width: v.width * factor,
      height: v.height * factor,
    }));
  const fit = () => {
    const bounds = elements
      .filter((e) => selected.includes(e.id))
      .map((e) => elementBounds(e, m.length));
    if (!bounds.length) {
      setView({
        x: -1,
        y: -m.eaves - 1,
        width: m.length + 2,
        height: m.eaves + 2,
      });
      return;
    }
    const left = Math.min(...bounds.map((b) => b.left)),
      right = Math.max(...bounds.map((b) => b.right)),
      bottom = Math.min(...bounds.map((b) => b.bottom)),
      top = Math.max(...bounds.map((b) => b.top));
    setView({
      x: left - 0.5,
      y: -top - 0.5,
      width: right - left + 1,
      height: top - bottom + 1,
    });
  };
  const rough = 65 * pixel,
    magnitude = 10 ** Math.floor(Math.log10(rough));
  const tick = Math.max(
    grid,
    ([1, 2, 5, 10].find((n) => n * magnitude >= rough) || 10) * magnitude,
  );
  const xTicks = Array.from(
    { length: Math.min(160, Math.ceil(view.width / tick) + 1) },
    (_, i) => (Math.floor(view.x / tick) + i) * tick,
  );
  const yTicks = Array.from(
    { length: Math.min(160, Math.ceil(view.height / tick) + 1) },
    (_, i) => (Math.floor(-view.y / tick) - i) * tick,
  );
  useModelSurface(
    svg,
    m.wallId,
    'wall',
    (x, y) =>
      curve
        ? curve.frame(x, y)
        : [
            m.coordinates[0][0] +
              ((m.coordinates[1][0] - m.coordinates[0][0]) * x) / m.length,
            m.coordinates[0][1] +
              ((m.coordinates[1][1] - m.coordinates[0][1]) * x) / m.length,
            -y,
          ],
    JSON.stringify([view, m.coordinates, m.eaves, section]),
    cancel,
    preview ? { wallId: m.wallId, elements: toSource(preview) } : null,
  );
  return (
    <section
      ref={region}
      className="model-wall-view"
      aria-label="Measured wall editor"
    >
      {!!selected.length && actions && (
        <div className="model-item-actions" style={actionPosition}>
          {actions}
        </div>
      )}
      <div className="model-toolbar">
        {curve && (
          <label>
            Curve section
            <select
              aria-label="Curve section"
              value={section}
              onChange={(e) => {
                cancel();
                setSection(Number(e.target.value));
              }}
            >
              {curve.distances.slice(0, -1).map((d, i) => (
                <option key={i} value={i}>
                  {d.toFixed(1)}–{curve.distances[i + 1].toFixed(1)} m
                </option>
              ))}
            </select>
          </label>
        )}
        {!mobile.compact && (
          <ModelButton
            variant="outline"
            aria-pressed={pan}
            onClick={() => setPan((v) => !v)}
          >
            Pan
          </ModelButton>
        )}
        <ModelButton variant="outline" onClick={() => zoom(0.8)}>
          Zoom in
        </ModelButton>
        <ModelButton variant="outline" onClick={() => zoom(1.25)}>
          Zoom out
        </ModelButton>
        <ModelButton variant="outline" onClick={fit}>
          Fit selection
        </ModelButton>
        <ModelButton
          variant="outline"
          icon={<ActionRotateCcw />}
          onClick={() =>
            setView({
              x: -1,
              y: -m.eaves - 1,
              width: m.length + 2,
              height: m.eaves + 2,
            })
          }
        >
          Reset view
        </ModelButton>
      </div>
      <p className="small-note">
        {m.length.toFixed(2)} m wide · {m.eaves.toFixed(2)} m to eaves ·{' '}
        {reverse ? 'B → A' : 'A → B'} ({m.direction}). Floor guides are
        estimates. Arrow keys move; Shift ×10; Alt disables snapping.
      </p>
      <svg
        ref={svg}
        className="model-wall-canvas"
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
        tabIndex={0}
        role="application"
        aria-label="Wall canvas: select and move architectural details"
        onPointerDownCapture={(e) => {
          if (!interactive) return;
          pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
          if (pointers.current.size === 2) {
            cancel();
            const [a, b] = [...pointers.current.values()],
              matrix = svg.current!.getScreenCTM()!.inverse();
            const c = new DOMPoint(
              (a[0] + b[0]) / 2,
              (a[1] + b[1]) / 2,
            ).matrixTransform(matrix);
            pinch.current = {
              distance: Math.hypot(a[0] - b[0], a[1] - b[1]),
              centre: [c.x, c.y],
              view,
              matrix,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
          }
        }}
        onPointerDown={(e) => begin(e, pan ? 'pan' : 'marquee')}
        onPointerMove={update}
        onPointerUp={finish}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          pinch.current = null;
          cancel();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cancel();
          }
          if (!interactive) return;
          if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            onDelete();
          }
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
            e.preventDefault();
            onDuplicate();
          }
          const arrows: Record<string, [number, number]> = {
            ArrowLeft: [-1, 0],
            ArrowRight: [1, 0],
            ArrowUp: [0, 1],
            ArrowDown: [0, -1],
          };
          if (arrows[e.key]) {
            e.preventDefault();
            const movable = selected.filter((id) => !locked.includes(id));
            if (!movable.length) return;
            const [x, y] = arrows[e.key],
              step = grid * (e.shiftKey ? 10 : 1);
            onCommit(
              moveElements(elements, movable, x * step, y * step, m.length),
            );
          }
        }}
      >
        <rect
          x={0}
          y={-m.eaves}
          width={m.length}
          height={m.eaves}
          data-surface-background
          fill={m.style.wallColour || '#ddd6c5'}
          stroke="currentColor"
          strokeWidth={pixel}
        />
        <g className="model-grid" strokeWidth={pixel * 0.5}>
          {xTicks.map((x) => (
            <line
              key={`x${x}`}
              x1={x}
              x2={x}
              y1={view.y}
              y2={view.y + view.height}
            />
          ))}
          {yTicks.map((y) => (
            <line
              key={`y${y}`}
              x1={view.x}
              x2={view.x + view.width}
              y1={-y}
              y2={-y}
            />
          ))}
        </g>
        {Array.from(
          { length: Math.max(0, Math.floor(m.floors) - 1) },
          (_, i) => (
            <line
              key={i}
              x1={0}
              x2={m.length}
              y1={(-(i + 1) * m.eaves) / m.floors}
              y2={(-(i + 1) * m.eaves) / m.floors}
              stroke="#536577"
              strokeDasharray={`${pixel * 4} ${pixel * 4}`}
              strokeWidth={pixel}
            />
          ),
        )}
        {shown
          .filter((e) => !hidden.includes(e.id))
          .flatMap((e) =>
            Array.from({ length: e.count }, (_, i) => {
              if (
                hidden.includes(
                  detailInstanceId(e.id, reverse ? e.count - 1 - i : i),
                )
              )
                return null;
              const x =
                (e.x + (i - (e.count - 1) / 2) * e.spacing) * m.length -
                e.width / 2;
              if (curve && !curve.visible(x + e.width / 2)) return null;
              const displayX = projectX(x),
                displayWidth = projectX(x + e.width) - displayX;
              if (
                x + e.width < view.x ||
                x > view.x + view.width ||
                -e.bottom < view.y ||
                -e.bottom - e.height > view.y + view.height
              )
                return null;
              return (
                <g key={`${e.id}:${i}`}>
                  <rect
                    data-element-id={e.id}
                    data-instance={i}
                    x={displayX}
                    y={-e.bottom - e.height}
                    width={Math.max(0.01, displayWidth)}
                    height={Math.max(0.01, e.height)}
                    fill={e.kind === 'text' ? 'transparent' : e.colour}
                    fillOpacity={locked.includes(e.id) ? 0.45 : 0.85}
                    stroke={
                      invalid.has(e.id)
                        ? '#db3535'
                        : selected.includes(e.id)
                          ? '#087cf0'
                          : '#535b62'
                    }
                    strokeWidth={pixel * (selected.includes(e.id) ? 3 : 1)}
                    onPointerDown={(event) =>
                      begin(event, pan ? 'pan' : 'move', e.id, i)
                    }
                  >
                    <title>
                      {e.kind} · {(x + e.width / 2).toFixed(2)} m from{' '}
                      {reverse ? 'B' : 'A'} · {e.bottom.toFixed(2)} m above base
                      {locked.includes(e.id) ? ' · locked' : ''}
                    </title>
                  </rect>
                  {e.kind === 'text' && (
                    <text
                      className="model-wall-text-label"
                      pointerEvents="none"
                      x={
                        displayX +
                        displayWidth *
                          (e.textAlign === 'left'
                            ? 0.02
                            : e.textAlign === 'right'
                              ? 0.98
                              : 0.5)
                      }
                      y={-e.bottom - e.height / 2}
                      textAnchor={
                        e.textAlign === 'left'
                          ? 'start'
                          : e.textAlign === 'right'
                            ? 'end'
                            : 'middle'
                      }
                      dominantBaseline="central"
                      fontSize={Math.min(
                        e.height * 0.75,
                        (e.width / Math.max(1, (e.text || '').length)) * 1.6,
                      )}
                      fontWeight={e.textWeight === 'regular' ? 400 : 700}
                      fill={e.colour}
                    >
                      {e.text}
                    </text>
                  )}
                </g>
              );
            }),
          )}
        {(!mobile.compact || mobile.tool === 'resize') &&
          selected.length === 1 &&
          shown
            .filter(
              (e) =>
                e.id === selected[0] &&
                e.count === 1 &&
                !locked.includes(e.id) &&
                !hidden.includes(e.id),
            )
            .map((e) => (
              <circle
                key={e.id}
                aria-label="Resize selected detail"
                cx={projectX(e.x * m.length + e.width / 2)}
                cy={-e.bottom - e.height}
                r={pixel * (mobile.compact ? 22 : 9)}
                fill="#087cf0"
                stroke="white"
                strokeWidth={pixel * 2}
                onPointerDown={(event) => begin(event, 'resize', e.id)}
              />
            ))}
        {marquee && (
          <rect
            x={marquee[0]}
            y={-marquee[1] - marquee[3]}
            width={marquee[2]}
            height={marquee[3]}
            fill="#087cf0"
            fillOpacity={0.12}
            stroke="#087cf0"
            strokeWidth={pixel}
          />
        )}
        <g fill="currentColor" fontSize={pixel * 11}>
          {xTicks
            .filter((x) => x >= 0 && x <= m.length)
            .map((x) => (
              <text key={x} x={x} y={pixel * 15}>
                {Number(x.toFixed(2))} m
              </text>
            ))}
        </g>
      </svg>
      {overlap.length > 0 && (
        <fieldset
          className="model-overlap-picker"
          aria-label="Overlapping details"
        >
          <strong>Choose a detail</strong>
          {overlap.map(({ id, instance }) => (
            <ModelButton
              variant="outline"
              key={`${id}:${instance}`}
              onClick={() => {
                onSelect([id], instance);
                setOverlap([]);
              }}
            >
              {detailName(elements.find((e) => e.id === id)!)} · {instance + 1}
            </ModelButton>
          ))}
          <ModelButton
            variant="outline"
            icon={<ActionX />}
            onClick={() => setOverlap([])}
          >
            Cancel selection
          </ModelButton>
        </fieldset>
      )}
      {mobile.compact &&
        selected.some((id) => !locked.includes(id)) &&
        mobile.tool === 'move' && (
          <ModelNudge
            onNudge={(x, y) => {
              candidate.current = moveElements(
                candidate.current || elements,
                selected.filter((id) => !locked.includes(id)),
                x * grid,
                y * grid,
                m.length,
              );
              setPreview(candidate.current);
            }}
            onFinish={() => {
              if (candidate.current) onCommit(candidate.current);
              candidate.current = null;
              setPreview(null);
            }}
            onCancel={() => {
              candidate.current = null;
              setPreview(null);
            }}
          />
        )}
      <output aria-live="polite">
        {invalid.size
          ? `${invalid.size} detail(s) need repositioning or resizing.`
          : `${selected.length} selected · ${shown.reduce((n, e) => n + e.count, 0)} details`}
      </output>
    </section>
  );
}
