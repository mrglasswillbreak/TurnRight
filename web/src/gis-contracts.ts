import type {
  DatasetSchema,
  FieldValue,
  FeatureQuery,
  WorkspaceRole,
  WorkspaceCapability,
  ProcessingRequest,
} from './gis-types.js';
export const roleCapabilities: Record<WorkspaceRole, WorkspaceCapability[]> = {
  administrator: ['read', 'edit', 'review', 'publish', 'manage'],
  editor: ['read', 'edit'],
  reviewer: ['read', 'review'],
  publisher: ['read', 'publish'],
};
export function capabilitiesFor(roles: WorkspaceRole[]): WorkspaceCapability[] {
  return [...new Set(roles.flatMap((r) => roleCapabilities[r] || []))];
}
export const validUuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const validField = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(v) &&
  !['__proto__', 'constructor', 'prototype'].includes(v);
export const validDate = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z)?$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value.slice(0, 10);
export function valueErrors(
  field: DatasetSchema['fields'][number],
  value: unknown,
): string[] {
  if (value == null || (value === '' && field.type === 'text'))
    return field.required ? [field.name + ' is required.'] : [];
  const valid =
    field.type === 'number'
      ? typeof value === 'number' && Number.isFinite(value)
      : field.type === 'boolean'
        ? typeof value === 'boolean'
        : field.type === 'date'
          ? validDate(value)
          : typeof value === 'string' && value.length <= 10000;
  if (!valid) return [field.name + ': expected ' + field.type + '.'];
  return field.domain?.length && !field.domain.includes(value as FieldValue)
    ? [field.name + ': value is outside its coded domain.']
    : [];
}
export function schemaErrors(schema: unknown): string[] {
  const s = schema as DatasetSchema;
  if (s?.version !== 1 || !Array.isArray(s.fields) || s.fields.length > 100)
    return ['Use schema version 1 with at most 100 fields.'];
  const names = new Set<string>(),
    errors: string[] = [];
  for (const f of s.fields) {
    if (
      !f ||
      !validField(f.name) ||
      names.has(f.name) ||
      !['text', 'number', 'boolean', 'date'].includes(f.type)
    ) {
      errors.push('Invalid or duplicate field.');
      continue;
    }
    names.add(f.name);
    if (
      f.alias !== undefined &&
      (typeof f.alias !== 'string' || f.alias.length > 160)
    )
      errors.push('Invalid field alias.');
    if (f.public !== undefined && typeof f.public !== 'boolean')
      errors.push('Invalid field visibility.');
    if (f.required !== undefined && typeof f.required !== 'boolean')
      errors.push('Invalid required setting.');
    if (
      f.unit !== undefined &&
      (typeof f.unit !== 'string' || f.unit.length > 80)
    )
      errors.push('Invalid field unit.');
    if (
      f.domain !== undefined &&
      (!Array.isArray(f.domain) ||
        f.domain.length > 200 ||
        f.domain.some(
          (v) =>
            valueErrors({ ...f, domain: undefined, required: false }, v).length,
        ))
    )
      errors.push('Invalid coded domain for ' + f.name);
  }
  return errors;
}
export function queryErrors(q: FeatureQuery): string[] {
  if (
    !q ||
    typeof q.datasetId !== 'string' ||
    !q.datasetId ||
    q.datasetId.length > 250
  )
    return ['Choose a dataset.'];
  if (
    q.limit !== undefined &&
    (!Number.isInteger(q.limit) || q.limit < 1 || q.limit > 500)
  )
    return ['Page size must be 1–500.'];
  if (q.cursor && (typeof q.cursor !== 'string' || q.cursor.length > 2000))
    return ['Invalid cursor.'];
  if (
    q.revision !== undefined &&
    (!Number.isSafeInteger(q.revision) || q.revision < 0)
  )
    return ['Invalid dataset revision.'];
  if (
    q.fields &&
    (!Array.isArray(q.fields) ||
      q.fields.length > 100 ||
      q.fields.some((f) => !validField(f)))
  )
    return ['Invalid fields.'];
  if (
    q.filters &&
    (!Array.isArray(q.filters) ||
      q.filters.length > 20 ||
      q.filters.some(
        (f) =>
          !f ||
          !validField(f.field) ||
          !['eq', 'ne', 'contains', 'gt', 'gte', 'lt', 'lte', 'null'].includes(
            f.operator,
          ) ||
          (f.operator === 'contains' && typeof f.value !== 'string') ||
          (typeof f.value === 'number' && !Number.isFinite(f.value)) ||
          (typeof f.value === 'string' && f.value.length > 10000) ||
          (f.value !== undefined &&
            f.value !== null &&
            !['string', 'number', 'boolean'].includes(typeof f.value)),
      ))
  )
    return ['Invalid filter.'];
  if (
    q.sort &&
    (!validField(q.sort.field) || !['asc', 'desc'].includes(q.sort.direction))
  )
    return ['Invalid sort.'];
  if (
    q.bbox &&
    (!Array.isArray(q.bbox) ||
      q.bbox.length !== 4 ||
      q.bbox.some((n) => !Number.isFinite(n)) ||
      q.bbox[0] < -180 ||
      q.bbox[2] > 180 ||
      q.bbox[1] < -90 ||
      q.bbox[3] > 90 ||
      q.bbox[0] >= q.bbox[2] ||
      q.bbox[1] >= q.bbox[3])
  )
    return ['Invalid WGS84 extent.'];
  if (
    q.keys &&
    (!Array.isArray(q.keys) ||
      q.keys.length > 500 ||
      q.keys.some((k) => typeof k !== 'string' || k.length > 500))
  )
    return ['Select at most 500 features.'];
  if (
    q.spatial &&
    (!['intersects', 'within'].includes(q.spatial.predicate) ||
      !q.spatial.geometry ||
      JSON.stringify(q.spatial.geometry).length > 100000)
  )
    return ['Invalid spatial filter.'];
  return [];
}
export const processingTools = [
  'buffer',
  'clip',
  'intersect',
  'difference',
  'dissolve',
  'select-location',
  'spatial-join',
  'nearest',
  'summarize-within',
  'measure',
  'attribute-join',
  'calculate',
  'export',
] as const;
export function processingErrors(r: ProcessingRequest): string[] {
  if (
    !r ||
    !validUuid(r.operationId) ||
    !processingTools.includes(r.tool) ||
    typeof r.name !== 'string' ||
    !r.name.trim() ||
    r.name.length > 160 ||
    !r.parameters ||
    Array.isArray(r.parameters) ||
    typeof r.parameters !== 'object' ||
    JSON.stringify(r.parameters).length > 20000
  )
    return ['Invalid processing request.'];
  return [
    ...queryErrors(r.input),
    ...(r.overlay ? queryErrors(r.overlay) : []),
    ...(r.input?.revision === undefined ||
    (r.overlay && r.overlay.revision === undefined)
      ? ['Select an exact input revision.']
      : []),
    ...([
      'clip',
      'intersect',
      'difference',
      'select-location',
      'spatial-join',
      'nearest',
      'summarize-within',
      'attribute-join',
    ].includes(r.tool) && !r.overlay
      ? ['Select an overlay dataset.']
      : []),
  ];
}
