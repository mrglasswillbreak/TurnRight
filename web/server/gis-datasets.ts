import { db, HttpError } from './backend.js';
import {
  validUuid,
  schemaErrors,
  queryErrors,
  validField,
  valueErrors,
} from '../src/gis-contracts.js';
import { parseDatasetCsv } from '../src/gis-csv.js';
import type { Dataset, FeatureQuery, GisActionMap } from '../src/gis-types.js';

export function checkedQuery(input: unknown): FeatureQuery {
  const query = input as FeatureQuery,
    errors = queryErrors(query);
  if (errors.length) throw new HttpError(400, errors.join(' '));
  return query;
}
export function checkedDataset(value: unknown): Dataset {
  const d = value as Dataset;
  if (
    !d ||
    typeof d.id !== 'string' ||
    d.id.length > 250 ||
    typeof d.name !== 'string' ||
    !d.name.trim() ||
    d.name.length > 160 ||
    typeof d.included !== 'boolean' ||
    typeof d.source_crs !== 'string' ||
    d.source_crs.length > 200 ||
    !/^EPSG:32[67](0[1-9]|[1-5]\d|60)$/.test(d.analysis_crs)
  )
    throw new HttpError(
      400,
      'Choose a dataset name and a metric UTM analysis CRS.',
    );
  const errors = schemaErrors(d.schema);
  if (errors.length) throw new HttpError(400, errors.join(' '));
  const style = d.style,
    fields = new Set(d.schema?.fields?.map((f) => f.name));
  if (
    !style ||
    !['single', 'categorical', 'graduated'].includes(style.mode) ||
    !/^#[0-9a-f]{6}$/i.test(style.color) ||
    [style.field, style.labelField, style.sizeField].some(
      (f) => f && !fields.has(f),
    ) ||
    (style.classes &&
      (!Array.isArray(style.classes) ||
        style.classes.length > 25 ||
        style.classes.some(
          (c) =>
            !c ||
            !/^#[0-9a-f]{6}$/i.test(c.color) ||
            typeof c.label !== 'string' ||
            c.label.length > 100 ||
            (c.maximum !== undefined && !Number.isFinite(c.maximum)),
        )))
  )
    errors.push('Invalid thematic style.');
  if (style && !errors.length) {
    const field = d.schema.fields.find((f) => f.name === style.field);
    if (style.mode !== 'single' && (!field || !style.classes?.length))
      errors.push(
        'Choose a classification field and at least one legend class.',
      );
    if (
      style.mode === 'graduated' &&
      (field?.type !== 'number' ||
        style.classes?.some((c) => !Number.isFinite(c.maximum)))
    )
      errors.push(
        'Graduated styles require numeric fields and numeric class limits.',
      );
    if (
      style.mode === 'categorical' &&
      field &&
      style.classes?.some(
        (c) => valueErrors({ ...field, required: false }, c.value).length,
      )
    )
      errors.push('Category values must match the classification field type.');
    if (
      style.sizeField &&
      d.schema.fields.find((f) => f.name === style.sizeField)?.type !== 'number'
    )
      errors.push('Proportional symbols require a numeric field.');
  }
  if (
    !Array.isArray(d.saved_filters) ||
    d.saved_filters.length > 20 ||
    d.saved_filters.some(
      (f) =>
        !f ||
        typeof f.name !== 'string' ||
        f.name.length > 100 ||
        f.query?.datasetId !== d.id ||
        queryErrors(f.query).length,
    )
  )
    errors.push('Invalid saved filters.');
  if (errors.length) throw new HttpError(400, errors.join(' '));
  return d;
}
export async function datasetAction(
  actor: string,
  action: string,
  input: Record<string, unknown>,
) {
  if (action === 'gis-views') {
    const rows = await db<{ view: object; revision: number }[]>(
      'gis_views?select=view,revision&order=name&limit=100',
    );
    return rows.map((r) => ({ ...r.view, revision: r.revision }));
  }
  if (action === 'gis-view-save') {
    const v = input.view as import('../src/gis-types.js').SavedMapView;
    if (
      !validUuid(input.operationId) ||
      !v ||
      !validUuid(v.id) ||
      !Number.isSafeInteger(v.revision) ||
      v.revision < 0 ||
      typeof v.name !== 'string' ||
      !v.name.trim() ||
      v.name.length > 100 ||
      !Array.isArray(v.center) ||
      v.center.length !== 2 ||
      v.center.some((n) => !Number.isFinite(n)) ||
      Math.abs(v.center[0]) > 180 ||
      Math.abs(v.center[1]) > 85 ||
      !Number.isFinite(v.zoom) ||
      v.zoom < 0 ||
      v.zoom > 24 ||
      !Number.isFinite(v.pitch) ||
      v.pitch < 0 ||
      v.pitch > 85 ||
      !Number.isFinite(v.bearing) ||
      Math.abs(v.bearing) > 360 ||
      !Array.isArray(v.datasets) ||
      v.datasets.length > 5 ||
      v.datasets.some((d) => typeof d !== 'string' || d.length > 250)
    )
      throw new HttpError(400, 'Invalid saved map view.');
    return db('rpc/gis_save_view', 'POST', {
      actor,
      specification: v,
      operation_id: input.operationId,
    });
  }
  if (action === 'gis-datasets')
    return db('rpc/gis_dataset_catalogue', 'POST', { actor });
  if (action === 'gis-query')
    return db('rpc/gis_query', 'POST', { actor, request: checkedQuery(input) });
  if (action === 'gis-feature') {
    if (
      typeof input.datasetId !== 'string' ||
      typeof input.key !== 'string' ||
      input.key.length > 500 ||
      !Number.isSafeInteger(input.revision)
    )
      throw new HttpError(
        400,
        'Choose a feature at the current dataset revision.',
      );
    return db('rpc/gis_read_feature', 'POST', {
      actor,
      dataset: input.datasetId,
      feature: input.key,
      expected_revision: input.revision,
    });
  }
  if (action === 'gis-statistics') {
    checkedQuery(input);
    if (!validField(input.field) || !Number.isSafeInteger(input.revision))
      throw new HttpError(400, 'Choose a field and current revision.');
    return db('rpc/gis_statistics', 'POST', { actor, request: input });
  }
  if (action === 'gis-dataset-save') {
    const d = checkedDataset(input.dataset);
    if (
      !validUuid(input.operationId) ||
      !Number.isSafeInteger(input.expectedRevision)
    )
      throw new HttpError(400, 'Invalid operation identity or revision.');
    return db('rpc/gis_save_dataset', 'POST', {
      actor,
      dataset: d,
      expected_revision: input.expectedRevision,
      operation_id: input.operationId,
    });
  }
  if (action === 'gis-attributes-save') {
    const r =
      input as unknown as GisActionMap['gis-attributes-save']['request'];
    if (
      !validUuid(r.operationId) ||
      !Number.isSafeInteger(r.expectedRevision) ||
      typeof r.datasetId !== 'string' ||
      !Array.isArray(r.features) ||
      !r.features.length ||
      r.features.length > 500 ||
      r.features.some(
        (f) =>
          !f ||
          typeof f.key !== 'string' ||
          !f.values ||
          typeof f.values !== 'object' ||
          Array.isArray(f.values) ||
          Object.keys(f.values).some((k) => !validField(k)),
      )
    )
      throw new HttpError(400, 'Invalid attribute batch.');
    return db('rpc/gis_save_attributes', 'POST', {
      actor,
      dataset: r.datasetId,
      expected_revision: r.expectedRevision,
      operation_id: r.operationId,
      items: r.features,
    });
  }
  if (action === 'gis-csv-import') {
    if (
      !validUuid(input.operationId) ||
      typeof input.name !== 'string' ||
      !input.name.trim() ||
      input.name.length > 160 ||
      typeof input.csv !== 'string'
    )
      throw new HttpError(400, 'Choose a name and CSV file.');
    let parsed;
    try {
      parsed = parseDatasetCsv(input.csv);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    return db('rpc/gis_import_table', 'POST', {
      actor,
      operation_id: input.operationId,
      dataset_name: input.name,
      schema_definition: parsed.schema,
      rows: parsed.rows,
    });
  }
  throw new HttpError(400, 'Unknown dataset action.');
}
