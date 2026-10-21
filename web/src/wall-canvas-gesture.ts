import type { PointerEvent as ReactPointerEvent } from 'react';
import { elementBounds, moveElements } from './model-authoring';
import type { WallCanvasState } from './useWallCanvas';
export function updateWallGesture(
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
  }: Pick<
    WallCanvasState,
    | 'pointers'
    | 'pinch'
    | 'setView'
    | 'gesture'
    | 'inverseX'
    | 'projectX'
    | 'setMarquee'
    | 'm'
    | 'grid'
    | 'pixel'
    | 'candidate'
    | 'frame'
    | 'setPreview'
  >,
  event: ReactPointerEvent,
): void {
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
}
