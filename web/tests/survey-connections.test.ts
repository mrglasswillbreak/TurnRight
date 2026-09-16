import { describe, expect, it } from 'vitest';
import { applyEdits } from '../src/editor-model';
import { disconnectedSurveyPaths } from '../src/survey-model';
import { campusFixture } from './fixture';
import type { CampusData, MapEdit, Position } from '../src/types';
function path(id: string, coordinates: Position[]): MapEdit {
  return {
    id,
    kind: 'path',
    geometry: { type: 'LineString', coordinates },
    properties: {
      name: id,
      vertexIds: coordinates.map((_, i) => `${id}:${i}`),
    },
  };
}
const horizontal = () =>
  path('horizontal', [
    [3.2, 6.46],
    [3.201, 6.46],
  ]);
const vertical = () =>
  path('vertical', [
    [3.2005, 6.4595],
    [3.2005, 6.4605],
  ]);
function assemble(edits: MapEdit[], base?: CampusData) {
  if (!base) {
    base = campusFixture();
    base.graph = { nodes: [], edges: [] };
    base.places = [];
  }
  const result = applyEdits(base, edits);
  expect(result.errors).toEqual([]);
  return result.data;
}
describe('survey network connectivity', () => {
  it('accepts surveyed crossings but rejects disconnected and closed approaches', () => {
    const base = assemble([horizontal()]);
    const v = vertical();
    const data = assemble([v], base);
    expect(disconnectedSurveyPaths(base, data, [v])).toEqual([]);
    const isolated = path('isolated', [
      [3.202, 6.461],
      [3.203, 6.461],
    ]);
    expect(
      disconnectedSurveyPaths(base, assemble([isolated], base), [isolated]),
    ).toHaveLength(1);
    data.closures = [
      {
        id: 'closed',
        reason: 'closed',
        edgeIds: data.graph.edges.map((e) => e.id),
      },
    ];
    expect(disconnectedSurveyPaths(base, data, [v])).toHaveLength(1);
  });
});
