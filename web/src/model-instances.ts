import type { FacadeElement, ModelAuthoring } from './visual-types';
import { patternSlots, reconcilePatternEdit } from './model-authoring';

/** Opaque record IDs retain the original instance identity after a row splits. */
function rowOrigin(id: string) {
  const match = /^(.*)~row:(\d+)$/.exec(id);
  return match ? { id: match[1], start: Number(match[2]) } : { id, start: 0 };
}
export function detailInstanceId(id: string, index: number) {
  const origin = rowOrigin(id);
  return `${origin.id}~instance:${origin.start + index}`;
}
export function expandDetailInstances(
  records: FacadeElement[],
  wholeRows: string[] = [],
) {
  return records.flatMap((e) =>
    e.count === 1 || wholeRows.includes(e.id)
      ? [e]
      : Array.from({ length: e.count }, (_, i) => ({
          ...e,
          id: detailInstanceId(e.id, i),
          x: e.x + (i - (e.count - 1) / 2) * e.spacing,
          count: 1,
          spacing: 0,
        })),
  );
}
export function detailInstanceSelection(records: FacadeElement[], id?: string) {
  for (const e of records) {
    if (e.id === id) return { elementId: e.id, instanceIndex: undefined };
    for (let i = 0; i < e.count; i++)
      if (detailInstanceId(e.id, i) === id)
        return { elementId: e.id, instanceIndex: i };
  }
  return { elementId: id, instanceIndex: undefined };
}
const equal = (a: FacadeElement, b: FacadeElement) =>
  (Object.keys(a) as (keyof FacadeElement)[]).every((key) =>
    typeof a[key] === 'number' && typeof b[key] === 'number'
      ? Math.abs(Number(a[key]) - Number(b[key])) < 1e-9
      : a[key] === b[key],
  ) && Object.keys(b).every((key) => key in a);

/** Reconcile a view command once, retaining untouched rows and pattern slots. */
export function commitDetailInstances(
  records: FacadeElement[],
  next: FacadeElement[],
  metadata: ModelAuthoring,
  wallId: string,
  wholeRows: string[] = [],
  batch = false,
) {
  const view = expandDetailInstances(records, wholeRows);
  const nextById = new Map(next.map((e) => [e.id, e]));
  const known = new Set(view.map((e) => e.id));
  const replacements = new Map<string, string[]>();
  const changed = new Set<string>();
  const forced = new Set([
    ...Object.keys(metadata.names),
    ...metadata.groups
      .filter((g) => g.wallId === wallId)
      .flatMap((g) => g.members),
    ...metadata.patterns
      .filter((p) => p.wallId === wallId)
      .flatMap((p) => p.members),
  ]);
  const elements = records.flatMap((record) => {
    if (record.count === 1 || wholeRows.includes(record.id)) {
      const value = nextById.get(record.id);
      if (!value || !equal(record, value)) changed.add(record.id);
      replacements.set(record.id, value ? [value.id] : []);
      return value ? [value] : [];
    }
    const old = expandDetailInstances([record]);
    if (
      old.every(
        (e) =>
          nextById.has(e.id) &&
          equal(e, nextById.get(e.id)!) &&
          !forced.has(e.id),
      )
    ) {
      replacements.set(record.id, [record.id]);
      return [record];
    }
    changed.add(record.id);
    const pieces: FacadeElement[] = [];
    for (let i = 0; i < old.length;) {
      const value = nextById.get(old[i].id);
      if (!value) {
        i++;
        continue;
      }
      if (!equal(old[i], value) || forced.has(value.id)) {
        pieces.push(value);
        i++;
        continue;
      }
      const start = i;
      while (
        i < old.length &&
        nextById.has(old[i].id) &&
        equal(old[i], nextById.get(old[i].id)!) &&
        !forced.has(old[i].id)
      )
        i++;
      const count = i - start;
      const origin = rowOrigin(record.id);
      pieces.push(
        count === 1
          ? old[start]
          : {
              ...record,
              id: `${origin.id}~row:${origin.start + start}`,
              count,
              x: (old[start].x + old[i - 1].x) / 2,
            },
      );
    }
    replacements.set(
      record.id,
      pieces.map((e) => e.id),
    );
    return pieces;
  });
  elements.push(...next.filter((e) => !known.has(e.id)));
  const ids = new Set(elements.map((e) => e.id));
  const authoring = structuredClone(metadata);
  for (const [id, values] of replacements)
    if (authoring.names[id])
      for (const value of values)
        authoring.names[value] ??= authoring.names[id];
  authoring.groups = authoring.groups
    .map((g) =>
      g.wallId !== wallId
        ? g
        : {
            ...g,
            members: [
              ...new Set(
                g.members.flatMap(
                  (id) => replacements.get(id) || (ids.has(id) ? [id] : []),
                ),
              ),
            ],
          },
    )
    .filter((g) => g.members.length);
  if (!batch)
    authoring.patterns = authoring.patterns.map((p) => {
      if (p.wallId !== wallId) return p;
      const slots = patternSlots(p),
        excluded = new Set(p.excluded || []);
      const keep = p.members.flatMap((id, i) => {
        if (changed.has(id) || !ids.has(id)) {
          excluded.add(slots[i]);
          return [];
        }
        return [{ id, slot: slots[i] }];
      });
      return {
        ...p,
        members: keep.map((e) => e.id),
        slots: keep.map((e) => e.slot),
        excluded: [...excluded],
      };
    });
  return batch
    ? reconcilePatternEdit(authoring, wallId, records, elements)
    : { elements, authoring };
}
