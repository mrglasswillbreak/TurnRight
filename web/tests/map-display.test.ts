import { describe, it, expect } from 'vitest';
import { buildingDisplay, displayGeometry, resolvePlaceId, resolvePlaceIds, visualEdges } from '../src/map-display';
import { closureFeatures } from '../src/map-sources';
import { campusFixture } from './fixture';

describe('shared map presentation', () => {
  it('uses recorded, floor-derived, and illustrative heights without mutating source data', () => {
    expect(buildingDisplay({ height: 12 })).toMatchObject({ metres: 12, kind: 'recorded' });
    expect(buildingDisplay({ height: 9, heightEstimated: true })).toMatchObject({ metres: 9, kind: 'floor-derived' });
    expect(buildingDisplay({ height: 0, floors: 4 })).toMatchObject({ metres: 12, kind: 'floor-derived' });
    expect(buildingDisplay({ height: -1 })).toMatchObject({ metres: 6, kind: 'illustrative' });
    const map = campusFixture().map;
    map.features.push({ type: 'Feature', properties: { kind: 'building', height: 0 }, geometry: { type: 'Polygon', coordinates: [] } });
    expect(displayGeometry(map).features[0].properties!.displayHeight).toBe(6);
    expect(map.features[0].properties).toEqual({ kind: 'building', height: 0 });
  });
  it('resolves historical place links and preserves bookmarks absent from an older package', () => {
    const data = campusFixture();
    data.placeIdAliases = { old: 'intermediate', intermediate: 'library' };
    expect(resolvePlaceId(data, 'old')).toBe('library');
    expect(resolvePlaceIds(data, ['old', 'library', 'newer-place'])).toEqual(['library', 'newer-place']);
    expect(resolvePlaceId({ placeIdAliases: { a: 'b', b: 'a' } }, 'a')).toBe('a');
  });
  it('renders a bidirectional segment once while retaining routing and closure semantics', () => {
    const data = campusFixture();
    expect(visualEdges(data.graph.edges)).toHaveLength(4);
    expect(data.graph.edges).toHaveLength(8);
    data.graph.edges[0].geometryBlocked = 'building:x';
    data.closures = [{ id: 'closed', reason: 'Works', edgeIds: [data.graph.edges[1].id] }];
    const features = closureFeatures(data.graph, data.closures).features;
    expect(features).toHaveLength(1);
    expect(features[0].properties!.conflict).toBe(false);
  });
});
