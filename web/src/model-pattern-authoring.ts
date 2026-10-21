import type { FacadeElement, ModelAuthoring } from './visual-types.js';
import { copyElements } from './model-element-layout.js';
export function patternElements(
  seed: FacadeElement[],
  rows: number,
  columns: number,
  stepX: number,
  stepY: number,
  length: number,
) {
  if (
    ![rows, columns].every((n) => Number.isInteger(n) && n > 0 && n <= 40) ||
    seed.length * rows * columns > 100 ||
    ![stepX, stepY].every((n) => Number.isFinite(n) && n >= 0)
  )
    throw new Error(
      'Pattern needs positive counts (up to 40) and at most 100 detail records.',
    );
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: columns }, (_, c) =>
      copyElements(seed, length, length, c * stepX, r * stepY),
    ),
  ).flat(2);
}

export function detachInstance(
  elements: FacadeElement[],
  id: string,
  instance: number,
) {
  const source = elements.find((e) => e.id === id);
  if (
    !source ||
    !Number.isInteger(instance) ||
    instance < 0 ||
    instance >= source.count
  )
    throw new Error('Select an existing repeated instance.');
  const detached = {
    ...source,
    id: crypto.randomUUID(),
    x: source.x + (instance - (source.count - 1) / 2) * source.spacing,
    count: 1,
    spacing: 0,
  };
  const pieces: FacadeElement[] = [detached];
  if (instance)
    pieces.push({
      ...source,
      count: instance,
      x: source.x - ((source.count - instance) * source.spacing) / 2,
    });
  if (instance < source.count - 1)
    pieces.push({
      ...source,
      id: instance ? crypto.randomUUID() : source.id,
      count: source.count - instance - 1,
      x: source.x + ((instance + 1) * source.spacing) / 2,
    });
  const next = elements.flatMap((e) => (e.id === id ? pieces : [e]));
  if (next.length > 100)
    throw new Error('Detaching would exceed 100 detail records.');
  return { elements: next, detachedId: detached.id };
}

export function patternSlots(p: ModelAuthoring['patterns'][number]) {
  return (
    p.slots ||
    p.members.map(
      (_, i) =>
        `${Math.floor(i / (p.columns * p.seed.length))}:${Math.floor(i / p.seed.length) % p.columns}:${i % p.seed.length}`,
    )
  );
}

export function regeneratePattern(
  p: ModelAuthoring['patterns'][number],
  length: number,
) {
  const values = patternElements(
    p.seed,
    p.rows,
    p.columns,
    p.stepX,
    p.stepY,
    length,
  );
  const slots = values.map(
    (_, i) =>
      `${Math.floor(i / (p.columns * p.seed.length))}:${Math.floor(i / p.seed.length) % p.columns}:${i % p.seed.length}`,
  );
  const excluded = new Set(p.excluded || []);
  return {
    elements: values.filter((_, i) => !excluded.has(slots[i])),
    slots: slots.filter((s) => !excluded.has(s)),
  };
}

/** Keep the seed and all linked instances in sync; detached slots never regenerate. */
export function reconcilePatternEdit(
  authoring: ModelAuthoring,
  wallId: string,
  before: FacadeElement[],
  after: FacadeElement[],
) {
  let elements = after;
  const keys = [
    'x',
    'bottom',
    'width',
    'height',
    'depth',
    'count',
    'spacing',
  ] as const;
  const patterns = authoring.patterns.map((p) => {
    if (p.wallId !== wallId) return p;
    const slots = patternSlots(p),
      excluded = new Set(p.excluded || []);
    const seed = structuredClone(p.seed);
    p.members.forEach((id, i) => {
      if (!after.some((e) => e.id === id)) excluded.add(slots[i]);
    });
    for (let index = 0; index < seed.length; index++) {
      const members = p.members.filter(
        (_, i) => Number(slots[i].split(':')[2]) === index,
      );
      const changes = members.flatMap((id) => {
        const a = before.find((e) => e.id === id),
          b = after.find((e) => e.id === id);
        return a && b && JSON.stringify(a) !== JSON.stringify(b)
          ? [{ a, b }]
          : [];
      });
      if (!changes.length) continue;
      const first = changes[0];
      const delta = Object.fromEntries(
        keys.map((k) => [k, first.b[k] - first.a[k]]),
      ) as Record<(typeof keys)[number], number>;
      if (
        changes.some(
          ({ a, b }) =>
            keys.some((k) => Math.abs(b[k] - a[k] - delta[k]) > 1e-7) ||
            b.colour !== first.b.colour ||
            b.kind !== first.b.kind,
        )
      )
        throw new Error(
          'This would distort a linked pattern. Move the pattern together or detach the affected details first.',
        );
      for (const k of keys) seed[index][k] += delta[k];
      seed[index].colour = first.b.colour;
      seed[index].kind = first.b.kind;
      seed[index].flat = first.b.flat;
      elements = elements.map((e) => {
        if (!members.includes(e.id) || changes.some((c) => c.b.id === e.id))
          return e;
        const next = {
          ...e,
          colour: first.b.colour,
          kind: first.b.kind,
          flat: first.b.flat,
        };
        for (const k of keys) next[k] += delta[k];
        return next;
      });
    }
    const keep = p.members
      .map((id, i) => ({ id, slot: slots[i] }))
      .filter((v) => elements.some((e) => e.id === v.id));
    return {
      ...p,
      seed,
      members: keep.map((v) => v.id),
      slots: keep.map((v) => v.slot),
      excluded: [...excluded],
    };
  });
  return { elements, authoring: { ...authoring, patterns } };
}
