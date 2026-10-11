import { describe, expect, it } from 'vitest';
import {
  describeSourceChange,
  sourceFieldLabel,
  type SourceSummary,
} from '../src/source-updates';
import { sourceFilters } from '../server/source-updates';

const row: SourceSummary = {
  id: '1',
  revision: 1,
  sourceId: 'feature:1',
  sourceName: 'UNILAG ArcGIS',
  kind: 'modify',
  createdAt: '2026-10-11T00:00:00Z',
  meta: {
    source: 'arcgis',
    name: 'Library',
    layer: 'Buildings',
    featureType: 'building',
    fields: ['name', 'openingHours'],
    geometryChanged: true,
  },
};
describe('source updates inbox', () => {
  it('explains geometry and descriptive changes without raw coordinates', () => {
    expect(describeSourceChange(row)).toBe(
      'Shape or location changed · Name, Opening Hours',
    );
    expect(sourceFieldLabel('properties.importLayer')).toBe('Import Layer');
    expect(describeSourceChange({ ...row, kind: 'remove' })).toContain(
      'Missing from',
    );
  });
  it('keeps filter values literal and rejects unknown shapes', () => {
    expect(
      sourceFilters({
        query: "Library (east), O'Brien",
        source: 'import:source',
      }).query,
    ).toContain("O'Brien");
    for (const value of [
      null,
      [],
      { kind: 'delete' },
      { geometry: true },
      { query: 'x'.repeat(201) },
      { campus: 'other' },
    ])
      expect(() => sourceFilters(value)).toThrow();
  });
});
