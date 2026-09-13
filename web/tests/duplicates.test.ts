import { describe, expect, it } from 'vitest';
import { duplicateDecision, exactDuplicateEdits, findDuplicateCandidates } from '../src/duplicates';
import { applyEdits, assembleSources, type SourceRecord } from '../src/editor-model';
import { buildingPlace, resolvePlaceIds, visualEdges } from '../src/map-display';
import { findRoutes } from '../src/routing';
import { EditorWorkspace } from '../src/editor-workspace';
import { campusFixture } from './fixture';
import type { Feature, Polygon } from 'geojson';

function duplicatePlaces() {
  const data = campusFixture();
  data.places.push({ ...data.places[0], id: 'library-copy', sourceId: 'another-source' });
  return data;
}
function building(id: string): Feature<Polygon> {
  return { type: 'Feature', properties: { id, kind: 'building', name: 'Hall', height: 0 }, geometry: { type: 'Polygon', coordinates: [[[3.2001, 6.461], [3.2003, 6.461], [3.2003, 6.4612], [3.2001, 6.4612], [3.2001, 6.461]]] } };
}
describe('duplicate review', () => {
  it('consolidates exact equivalent places and resolves saved IDs and routes', () => {
    const data = duplicatePlaces(), candidates = findDuplicateCandidates(data);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].exact).toBe(true);
    const edits = exactDuplicateEdits(data, [], candidates), result = applyEdits(data, edits);
    expect(result.errors).toEqual([]);
    expect(result.data.places).toHaveLength(1);
    expect(resolvePlaceIds(result.data, ['library-copy', 'library'])).toEqual(['library']);
    expect(findRoutes(result.data, 'a', { placeId: 'library-copy' })[0].nodeIds.at(-1)).toBe('c');
    expect(result.data.places[0].sourceRefs).toContain('library-copy');
    expect(findDuplicateCandidates(result.data, edits)).toEqual([]);
  });
  it('keeps distinct same-name places for review and persists rejection across refresh', () => {
    const data = duplicatePlaces();
    data.places[1].coordinates = [3.203, 6.462];
    const candidates = findDuplicateCandidates(data);
    expect(candidates[0].exact).toBe(false);
    expect(exactDuplicateEdits(data, [], candidates)).toEqual([]);
    const edits = duplicateDecision(data, [], candidates[0]);
    const kept = applyEdits(structuredClone(data), edits);
    expect(kept.data.places).toHaveLength(2);
    expect(findDuplicateCandidates(kept.data, edits)).toEqual([]);
  });
  it('preserves directed access, closures and entrances through a merge and undo', async () => {
    const data = duplicatePlaces();
    data.places[1].aliases = ['Old library'];
    data.map.features.push(building('library-copy'));
    data.graph.edges.find(e => e.id === 'ba')!.accessible = false;
    data.closures = [{ id: 'closure', edgeIds: ['ad'], reason: 'Closed' }];
    data.entrances = [{ id: 'door', name: 'Door', placeId: 'library-copy', buildingId: 'library-copy', coordinates: [3.201, 6.46], graphNode: 'c', walkingAccess: 'campus', source: 'review' }];
    const candidate = findDuplicateCandidates(data)[0];
    expect(candidate.exact).toBe(false);
    const workspace = new EditorWorkspace([], async batch => batch.edits.map(e => ({ ...e.edit, updated_at: 'saved' })), async () => {});
    workspace.commit(duplicateDecision(data, [], candidate, 'library'));
    await workspace.flush();
    const merged = applyEdits(data, workspace.edits);
    expect(merged.errors).toEqual([]);
    expect(merged.data.entrances?.[0].placeId).toBe('library');
    expect(buildingPlace(merged.data, merged.data.map.features[0])?.id).toBe('library');
    expect(merged.data.graph.edges.map(e => [e.id, e.accessible])).toEqual(data.graph.edges.map(e => [e.id, e.accessible]));
    expect(merged.data.closures).toEqual(data.closures);
    expect(visualEdges(merged.data.graph.edges)).toHaveLength(data.graph.edges.length / 2);
    expect(merged.data.places[0].aliases).toContain('Old library');
    workspace.undo();
    await workspace.flush();
    const undone = applyEdits(data, workspace.edits);
    expect(undone.errors).toEqual([]);
    expect(undone.data.places).toHaveLength(2);
    expect(undone.data.placeIdAliases).toEqual({});
    expect(undone.data.entrances?.[0].placeId).toBe('library-copy');
    workspace.redo();
    expect(applyEdits(data, workspace.edits).data.places).toHaveLength(1);
  });
  it('normalizes reversed footprints and remaps associations without removing a same-ID path', () => {
    const data = campusFixture(), a = building('hall-a'), b = building('hall-b');
    b.geometry.coordinates[0].reverse();
    data.map.features = [a, b, { type: 'Feature', properties: { kind: 'path', id: 'hall-b' }, geometry: { type: 'LineString', coordinates: [[3.2, 6.46], [3.201, 6.46]] } }];
    const candidates = findDuplicateCandidates(data);
    expect(candidates[0].exact).toBe(true);
    data.places[0].buildingId = 'hall-b';
    const result = applyEdits(data, duplicateDecision(data, [], candidates[0], 'hall-a'));
    expect(result.errors).toEqual([]);
    expect(result.data.places[0].buildingId).toBe('hall-a');
    expect(result.data.map.features.filter(f => f.properties?.kind === 'building')).toHaveLength(1);
    expect(result.data.map.features.filter(f => f.properties?.kind === 'path')).toHaveLength(1);
    expect(result.data.buildingIdAliases).toEqual({ 'hall-b': 'hall-a' });
  });
  it('rejects missing and cyclic survivors', () => {
    const data = duplicatePlaces(), candidate = findDuplicateCandidates(data)[0];
    const edits = duplicateDecision(data, [], candidate, 'library');
    edits[1].properties.mergedInto = 'missing';
    expect(applyEdits(data, edits).errors.join(' ')).toContain('missing or cyclic');
    edits[1].properties.mergedInto = 'library';
    edits[0] = { ...edits[0], deleted: true, properties: { ...edits[0].properties, mergedInto: 'library-copy' } };
    expect(applyEdits(data, edits).errors.join(' ')).toContain('missing or cyclic');
  });
  it('retains merges when refreshed source records bring back removed records', () => {
    const data = duplicatePlaces(), edits = exactDuplicateEdits(data, [], findDuplicateCandidates(data));
    const { map, places, graph, ...meta } = data;
    const record = (id: string, entity: SourceRecord['entity'], payload: unknown): SourceRecord => ({ id, entity, payload, source: 'test', hash: 'refresh' });
    const source = [record('meta', 'meta', meta), ...places.map(p => record(p.id, 'place', p)), ...map.features.map((f, i) => record(String(i), 'feature', f)), ...graph.nodes.map(n => record(n.id, 'node', n)), ...graph.edges.map(e => record(e.id, 'edge', e))];
    const result = applyEdits(assembleSources(source, data), edits);
    expect(result.errors).toEqual([]);
    expect(result.data.places).toHaveLength(1);
    expect(findDuplicateCandidates(result.data, edits)).toEqual([]);
  });
});
