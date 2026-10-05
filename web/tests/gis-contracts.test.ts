import { expect, it } from 'vitest';
import { parseDatasetCsv } from '../src/gis-csv';
import { checkedDataset, checkedQuery } from '../server/gis-datasets';
import {
  capabilitiesFor,
  processingErrors,
  valueErrors,
} from '../src/gis-contracts';
import { publicationInputs } from '../server/gis-publication';
import { campusFixture } from './fixture';
import type { Dataset } from '../src/gis-types';
const dataset: Dataset = {
  id: 'gis:trees',
  campus_id: 'lasu',
  name: 'Trees',
  schema: {
    version: 1,
    fields: [
      { name: 'asset', type: 'text', public: true },
      { name: 'private_notes', type: 'text', public: false },
    ],
  },
  source_crs: 'EPSG:4326',
  analysis_crs: 'EPSG:32631',
  provenance: {},
  style: { mode: 'single', color: '#116633' },
  included: true,
  revision: 1,
  saved_filters: [],
};
it('parses quoted CSV, nulls, booleans and leading-zero identifiers', () => {
  const parsed = parseDatasetCsv(
    'asset,value,active,note\r\n001,3.5,true,"Two\nlines"\r\n002,,false,"Quote ""here"""',
  );
  expect(parsed.rows[0]).toEqual({
    asset: '001',
    value: 3.5,
    active: true,
    note: 'Two\nlines',
  });
  expect(parsed.rows[1].value).toBeNull();
  expect(parsed.rows[1].note).toBe('Quote "here"');
});
it('composes roles while keeping review separate from authoring', () => {
  expect(capabilitiesFor(['reviewer', 'publisher'])).toEqual([
    'read',
    'review',
    'publish',
  ]);
  expect(capabilitiesFor(['editor'])).not.toContain('review');
});
it('rejects invalid queries, arbitrary types and unsafe schema fields', () => {
  expect(() => checkedQuery({ datasetId: 'trees', limit: 501 })).toThrow(
    /Page size/,
  );
  expect(() =>
    checkedDataset({
      ...dataset,
      schema: { version: 1, fields: [{ name: '__proto__', type: 'text' }] },
    }),
  ).toThrow(/field/);
  expect(valueErrors({ name: 'height', type: 'number' }, '12')).toHaveLength(1);
  expect(
    valueErrors({ name: 'code', type: 'text', required: true }, null),
  ).toHaveLength(1);
  expect(processingErrors({ operationId: 'invalid' } as never)).toHaveLength(1);
});
it('publishes explicitly selected attributes and never promotes analysis to routing', () => {
  const f = {
    id: 'feature:tree',
    entity: 'feature' as const,
    source: 'gis:trees',
    hash: 'h',
    private_attributes: { asset: '001', private_notes: 'Secret' },
    payload: {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [3.2, 6.46] },
      properties: {
        id: 'tree',
        kind: 'overlay',
        mapLayerId: 'gis:trees',
        gisManaged: true,
      },
    },
  };
  const input = {
    features: [f],
    edits: [],
    datasets: [dataset],
    attributes: [
      {
        dataset_id: dataset.id,
        feature_key: 'overlay:tree',
        values: { asset: '002' },
      },
    ],
  };
  const data = campusFixture();
  data.map.features = [f.payload as never];
  const result = publicationInputs(input).decorate(data);
  expect(result.map.features[0].properties?.gisAttributes).toEqual({
    asset: '002',
  });
  expect(JSON.stringify(result)).not.toContain('Secret');
  expect(result.gisPresentation).toEqual([
    {
      id: dataset.id,
      name: dataset.name,
      revision: dataset.revision,
      style: dataset.style,
    },
  ]);
  expect(JSON.stringify(result.gisPresentation)).not.toContain('private_notes');
  expect(result.graph).toEqual(data.graph);
  expect(
    publicationInputs({ ...input, datasets: [{ ...dataset, included: false }] })
      .features,
  ).toEqual([]);
  expect(() =>
    publicationInputs({
      ...input,
      datasets: [
        {
          ...dataset,
          style: { ...dataset.style, labelField: 'private_notes' },
        },
      ],
    }),
  ).toThrow(/explicitly/);
});
