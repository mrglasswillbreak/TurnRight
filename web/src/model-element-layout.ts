import type { FacadeElement } from './visual-types.js';
import { metres } from './model-authoring.js';
export function elementBounds(e: FacadeElement, length: number) {
  const half = ((e.count - 1) * e.spacing * length) / 2;
  return {
    left: e.x * length - half - e.width / 2,
    right: e.x * length + half + e.width / 2,
    bottom: e.bottom,
    top: e.bottom + e.height,
  };
}

export function placementErrors(
  elements: FacadeElement[],
  length: number,
  eaves: number,
  checkRecordLimit = true,
) {
  const errors: { id: string; message: string }[] = [];
  if (checkRecordLimit && elements.length > 100)
    errors.push({
      id: '',
      message: 'At most 100 detail records are supported per wall.',
    });
  for (const e of elements) {
    const b = elementBounds(e, length);
    if (
      ![e.x, e.bottom, e.width, e.height, e.depth, e.count, e.spacing].every(
        Number.isFinite,
      ) ||
      e.width <= 0 ||
      e.height <= 0 ||
      e.depth < 0 ||
      e.depth > 10 ||
      !Number.isInteger(e.count) ||
      e.count < 1 ||
      e.count > 40 ||
      e.spacing < 0 ||
      e.spacing > 1 ||
      b.left < -0.03 ||
      b.right > length + 0.03 ||
      b.bottom < 0 ||
      b.top > eaves + (e.kind === 'parapet' ? 3 : 0.03)
    )
      errors.push({
        id: e.id,
        message: `${e.kind}: review position, size and repetitions against this wall.`,
      });
  }
  return errors;
}

export function moveElements(
  elements: FacadeElement[],
  ids: string[],
  dx: number,
  dy: number,
  length: number,
) {
  return elements.map((e) =>
    ids.includes(e.id)
      ? { ...e, x: e.x + dx / length, bottom: metres(e.bottom + dy) }
      : e,
  );
}

export function copyElements(
  elements: FacadeElement[],
  fromLength: number,
  toLength: number,
  dx = 0,
  dy = 0,
) {
  return elements.map((e) => ({
    ...e,
    id: crypto.randomUUID(),
    x: (e.x * fromLength + dx) / toLength,
    bottom: metres(e.bottom + dy),
    spacing: (e.spacing * fromLength) / toLength,
  }));
}

export function layoutElements(
  elements: FacadeElement[],
  ids: string[],
  length: number,
  action:
    | 'left'
    | 'right'
    | 'centre'
    | 'bottom'
    | 'top'
    | 'distribute'
    | 'mirror',
) {
  const selected = elements.filter((e) => ids.includes(e.id));
  if (selected.length < 2 && action !== 'mirror') return elements;
  const bounds = selected.map((e) => elementBounds(e, length));
  const left = Math.min(...bounds.map((b) => b.left)),
    right = Math.max(...bounds.map((b) => b.right)),
    bottom = Math.min(...bounds.map((b) => b.bottom)),
    top = Math.max(...bounds.map((b) => b.top));
  const ordered = [...selected].sort((a, b) => a.x - b.x),
    widths = ordered.map((e) => {
      const b = elementBounds(e, length);
      return b.right - b.left;
    });
  const gap =
    ordered.length > 1
      ? (right - left - widths.reduce((s, n) => s + n, 0)) /
        (ordered.length - 1)
      : 0;
  let cursor = left;
  const positions = new Map(
    ordered.map((e, i) => {
      const x = cursor + widths[i] / 2;
      cursor += widths[i] + gap;
      return [e.id, x];
    }),
  );
  return elements.map((e) => {
    if (!ids.includes(e.id)) return e;
    const b = elementBounds(e, length),
      width = b.right - b.left;
    return {
      ...e,
      x:
        action === 'left'
          ? (left + width / 2) / length
          : action === 'right'
            ? (right - width / 2) / length
            : action === 'centre'
              ? (left + right) / 2 / length
              : action === 'mirror'
                ? (left + right - e.x * length) / length
                : action === 'distribute'
                  ? positions.get(e.id)! / length
                  : e.x,
      bottom:
        action === 'bottom'
          ? bottom
          : action === 'top'
            ? top - e.height
            : e.bottom,
    };
  });
}
