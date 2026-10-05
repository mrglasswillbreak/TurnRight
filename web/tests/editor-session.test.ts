import { describe, expect, it } from 'vitest';
import {
  catalogueEntries,
  clampedDimensions,
  featureReference,
  initialEditorSession,
  selectionKey,
} from '../src/editor-session';
import { campusFixture } from './fixture';
import { campusLayers } from '../src/campus-layers';
import type { Dataset } from '../src/gis-types';
describe('shared editor presentation state', () => {
  it('keeps same-named datasets separate unless explicit identities match', () => {
    const layer = campusLayers(campusFixture()).items[0];
    const dataset: Dataset = {
      id: 'different-source',
      campus_id: 'lasu',
      name: layer.name,
      revision: 8,
      schema: { version: 1, fields: [] },
      source_crs: 'EPSG:4326',
      analysis_crs: 'EPSG:32631',
      style: { mode: 'single' },
      included: false,
      provenance: {},
      saved_filters: [],
    };
    expect(catalogueEntries([layer], [dataset])).toHaveLength(2);
    const combined = catalogueEntries([layer], [{ ...dataset, id: layer.id }]);
    expect(combined).toHaveLength(1);
    expect(combined[0].dataset?.revision).toBe(8);
  });
  it('preserves colon-delimited source identities and campus/revision context', () => {
    const reference = featureReference(
      'unilag',
      'path:osm:way:123',
      'paths',
      27,
    );
    expect(selectionKey(reference)).toBe('path:osm:way:123');
    expect(reference).toMatchObject({
      campusId: 'unilag',
      datasetId: 'paths',
      revision: 27,
      id: 'osm:way:123',
    });
  });
  it('bounds corrupt persisted panel sizes and keeps the table closed initially', () => {
    expect(
      clampedDimensions({ catalogue: 10000, inspector: NaN, table: -1 }),
    ).toEqual({ catalogue: 380, inspector: 380, table: 180 });
    expect(initialEditorSession().table.open).toBe(false);
  });
});
