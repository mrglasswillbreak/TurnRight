import type { MapChange } from './types.js';
import type { SourceRecord } from './editor-model.js';
import { detailFields, detailErrors, publicEvidence } from './place-details.js';
import { canonical } from './editor-conflicts.js';

const placeFields = [
  'name',
  'aliases',
  'category',
  'department',
  'faculty',
  ...detailFields,
];
function descriptiveFields(record: SourceRecord): Record<string, unknown> {
  return (record.entity === 'feature'
    ? record.payload.properties || {}
    : record.payload) as unknown as Record<string, unknown>;
}
/** Metadata may be accepted separately. Connections/geometry remain one reviewed unit. */
export function selectableSourceFields(change: MapChange): string[] {
  const before = change.before as SourceRecord | null,
    after = change.after as SourceRecord | null;
  if (
    change.kind !== 'modify' ||
    !before ||
    !after ||
    before.entity !== after.entity
  )
    return [];
  const a = descriptiveFields(after),
    b = descriptiveFields(before);
  if (after.entity === 'place')
    return placeFields.filter((key) => canonical(a[key]) !== canonical(b[key]));
  if (after.entity === 'feature')
    return ['name', 'aliases']
      .filter((key) => canonical(a[key]) !== canonical(b[key]))
      .map((key) => 'properties.' + key);
  return [];
}
export function selectSourceFields(
  change: MapChange,
  selected: string[],
): SourceRecord {
  const allowed = selectableSourceFields(change);
  if (
    !selected.length ||
    selected.length > allowed.length ||
    new Set(selected).size !== selected.length ||
    selected.some((s) => !allowed.includes(s))
  )
    throw new Error('Choose changed descriptive fields from this proposal.');
  const before = change.before as SourceRecord,
    after = change.after as SourceRecord;
  const next = structuredClone(before);
  for (const path of selected) {
    const feature = path.startsWith('properties.');
    const key = feature ? path.slice(11) : path;
    const target = descriptiveFields(next);
    const source = descriptiveFields(after);
    if (source[key] === undefined) delete target[key];
    else target[key] = structuredClone(source[key]);
    const refs = publicEvidence(source.evidence)?.[key];
    const evidence = { ...publicEvidence(target.evidence) };
    if (refs) evidence[key] = refs;
    else delete evidence[key];
    target.evidence = evidence;
    if (!Object.keys(evidence).length) delete target.evidence;
  }
  if (next.entity === 'place' && detailErrors(descriptiveFields(next)).length)
    throw new Error(detailErrors(descriptiveFields(next)).join(' '));
  return next;
}
