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
import { useModelMobile } from './model-mobile';
import { elementBounds, placementErrors } from './model-authoring';
import { Metrics, WallView } from './wall-canvas-types';

import { updateWallGesture } from './wall-canvas-gesture';

export type WallCanvasProps = {
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
};
export function useWallCanvas({
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
}: WallCanvasProps) {
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
  const update = (event: ReactPointerEvent) =>
    updateWallGesture(
      {
        pointers,
        pinch,
        setView,
        gesture,
        inverseX,
        projectX,
        setMarquee,
        m,
        grid,
        pixel,
        candidate,
        frame,
        setPreview,
      },
      event,
    );

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
  return {
    region,
    selected,
    actions,
    actionPosition,
    curve,
    section,
    cancel,
    setSection,
    mobile,
    pan,
    setPan,
    zoom,
    fit,
    setView,
    m,
    reverse,
    svg,
    view,
    interactive,
    pointers,
    pinch,
    begin,
    update,
    finish,
    onDelete,
    onDuplicate,
    locked,
    grid,
    onCommit,
    elements,
    pixel,
    xTicks,
    yTicks,
    shown,
    hidden,
    projectX,
    invalid,
    marquee,
    overlap,
    onSelect,
    setOverlap,
    detailName,
    candidate,
    setPreview,
    gesture,
    inverseX,
    setMarquee,
    frame,
  };
}
export type WallCanvasState = ReturnType<typeof useWallCanvas>;
