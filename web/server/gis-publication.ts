import { createHash } from 'node:crypto';
import type { SourceRecord } from '../src/editor-model.js';
import type { MapEdit, CampusData } from '../src/types.js';
import type { Dataset, FieldValue } from '../src/gis-types.js';
import { schemaErrors, valueErrors } from '../src/gis-contracts.js';
import { gisStyle } from '../src/gis-style.js';
import { HttpError } from './backend.js';
export interface GisSnapshot {
  features: (SourceRecord & {
    private_attributes?: Record<string, FieldValue>;
  })[];
  edits: MapEdit[];
  datasets?: Dataset[];
  attributes?: {
    dataset_id: string;
    feature_key: string;
    values: Record<string, FieldValue>;
  }[];
}
export function publicationInputs(snapshot: GisSnapshot) {
  const datasets = new Map((snapshot.datasets || []).map((d) => [d.id, d]));
  const attributes = new Map(
    (snapshot.attributes || []).map((a) => [
      a.dataset_id + '\0' + a.feature_key,
      a.values,
    ]),
  );
  const records = new Map<
    string,
    { dataset: Dataset; values: Record<string, FieldValue> }
  >();
  const edits = new Map(snapshot.edits.map((e) => [e.kind + ':' + e.id, e]));
  const hidden = new Set<string>();
  for (const d of datasets.values()) {
    const errors = schemaErrors(d.schema);
    if (errors.length) throw new HttpError(400, errors.join(' '));
    if (d.included) {
      const publicFields = new Set(
        d.schema.fields.filter((f) => f.public).map((f) => f.name),
      );
      if (
        [d.style.field, d.style.labelField, d.style.sizeField].some(
          (f) => f && !publicFields.has(f),
        )
      )
        throw new HttpError(
          400,
          `${d.name}: select style and label fields for publication explicitly.`,
        );
      if (d.provenance.jobId && (!d.provenance.inputs || !d.provenance.engine))
        throw new HttpError(
          400,
          `${d.name}: processing lineage is incomplete.`,
        );
    }
  }
  const register = (
    source: SourceRecord | undefined,
    properties: Record<string, unknown>,
    key: string,
    privateValues: Record<string, FieldValue> = {},
  ) => {
    const edit = edits.get(key);
    const props = {
      ...properties,
      ...(edit?.properties.revertToSource ? {} : edit?.properties),
    };
    const id =
      (typeof props.mapLayerId === 'string' && props.mapLayerId) ||
      'dataset:' +
        createHash('md5')
          .update(
            `[${JSON.stringify(source?.source || 'authored')}, ${JSON.stringify(props.importLayer || props.kind || 'features')}]`,
          )
          .digest('hex');
    const dataset = datasets.get(id);
    if (props.gisManaged && !dataset?.included) hidden.add(key);
    if (!dataset) return;
    const values: Record<string, FieldValue> = {
      name: typeof props.name === 'string' ? props.name : null,
      ...privateValues,
      ...attributes.get(id + '\0' + key),
    };
    for (const field of dataset.schema.fields) {
      const errors = valueErrors(field, values[field.name]);
      if (errors.length)
        throw new HttpError(
          400,
          `${dataset.name} / ${key}: ${errors.join(' ')}`,
        );
    }
    records.set(key, { dataset, values });
  };
  for (const s of snapshot.features) {
    const props =
      s.entity === 'feature'
        ? s.payload.properties
        : s.entity === 'place'
          ? { ...s.payload, kind: 'place' }
          : null;
    if (props)
      register(s, props, props.kind + ':' + props.id, s.private_attributes);
  }
  for (const e of snapshot.edits)
    if (!records.has(e.kind + ':' + e.id))
      register(
        undefined,
        { ...e.properties, kind: e.kind, id: e.id },
        e.kind + ':' + e.id,
      );
  const hiddenIds = new Set(
    [...hidden].map((key) => key.slice(key.indexOf(':') + 1)),
  );
  const visibleEdges = snapshot.features.filter(
    (s) =>
      s.entity === 'edge' &&
      (!s.payload.gisManaged || !hiddenIds.has(s.payload.sourceId)),
  );
  const edgeIds = new Set(visibleEdges.map((s) => s.id));
  const usedNodes = new Set(
    visibleEdges.flatMap((s) => [s.payload.from, s.payload.to]),
  );
  const features = snapshot.features.filter((s) =>
    s.entity === 'edge'
      ? edgeIds.has(s.id)
      : s.entity === 'node' && s.payload.gisManaged
        ? usedNodes.has(s.payload.id)
        : !hidden.has(
            s.entity === 'feature'
              ? s.payload.properties?.kind + ':' + s.payload.properties?.id
              : s.entity === 'place'
                ? 'place:' + s.payload.id
                : '',
          ),
  );
  return {
    features,
    edits: snapshot.edits.filter((e) => !hidden.has(e.kind + ':' + e.id)),
    decorate(data: CampusData) {
      const decorate = <T extends object>(properties: T, kind?: string): T => {
        const props = properties as Record<string, unknown>;
        const r = records.get((kind || props.kind) + ':' + props.id);
        if (!r || !r.dataset.included) return properties;
        const allowed = Object.fromEntries(
          r.dataset.schema.fields
            .filter((f) => f.public)
            .map((f) => [f.name, r.values[f.name] ?? null]),
        );
        return {
          ...properties,
          gisAttributes: allowed,
          layerStyle: {
            ...(props.layerStyle && typeof props.layerStyle === 'object'
              ? props.layerStyle
              : {}),
            ...gisStyle(r.dataset.style, allowed),
          },
          ...(r.dataset.style.labelField
            ? { label: String(allowed[r.dataset.style.labelField] ?? '') }
            : {}),
        };
      };
      const output = {
        ...data,
        ...(snapshot.datasets
          ? {
              gisPresentation: [...datasets.values()]
                .filter((d) => d.included)
                .map(({ id, name, revision, style }) => ({
                  id,
                  name,
                  revision,
                  style,
                })),
            }
          : {}),
        map: {
          ...data.map,
          features: data.map.features.map((f) => ({
            ...f,
            properties: decorate(f.properties || {}),
          })),
        },
        places: data.places.map((p) => decorate(p, 'place')),
      };
      if (
        output.map.features.length > 20000 ||
        Buffer.byteLength(JSON.stringify(output)) > 25_000_000
      )
        throw new HttpError(
          413,
          'The public navigation package is limited to 20,000 map features and 25 MB. Keep large analysis layers private or publish a filtered result.',
        );
      return output;
    },
  };
}
