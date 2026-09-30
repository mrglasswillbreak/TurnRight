import { describe, it, expect } from 'vitest';
import { emptyCampus, lasuCampus } from '../src/campus-context';
import {
  campusLayers,
  layerEdit,
  layerMembership,
  layerPresentation,
  newLayer,
} from '../src/campus-layers';
import { applyEdits, validateEdit } from '../src/editor-model';
import { featureEdit } from '../src/editor-features';
import { runGeometry } from '../src/layer-geometry-engine';
import {
  geometryWindow,
  replaceWindow,
  vertexCount,
} from '../src/geometry-window';
import { surfaceStale } from '../src/surface-generation';
import { propertyEdits } from '../src/road-properties';
import { publicCampus } from '../../scripts/public-campus.mjs';
import { readFileSync } from 'node:fs';
import { EditorWorkspace } from '../src/editor-workspace';
const polygon = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [3.2, 6.47],
      [3.202, 6.47],
      [3.202, 6.472],
      [3.2, 6.472],
      [3.2, 6.47],
    ],
  ],
};
function campus() {
  const data = emptyCampus(lasuCampus);
  data.boundary = { type: 'Feature', geometry: polygon, properties: {} };
  data.map.features = [
    {
      type: 'Feature',
      geometry: polygon,
      properties: {
        id: 'land:1',
        kind: 'land',
        source: 'survey',
        importLayer: 'Landscape',
        name: 'Courtyard',
        landClass: 'green',
      },
    },
  ];
  return data;
}
describe('campus layer persistence and compatibility', () => {
  it('accounts for all 179 UNILAG identities and edits polygon 96 without simplifying its 56 holes', () => {
    const changes = JSON.parse(
      readFileSync(
        new URL('../../data/unilag-enrichment/changes.json', import.meta.url),
        'utf8',
      ),
    );
    const roads = changes.featureAdds.filter(
      (f: { properties: Record<string, unknown> }) =>
        f.properties.source === 'import:bd74d5cc-2b8d-4d42-977a-00165dc70b7e',
    );
    expect(roads).toHaveLength(179);
    expect(
      new Set(
        roads.map(
          (f: { properties: Record<string, unknown> }) => f.properties.sourceId,
        ),
      ).size,
    ).toBe(179);
    const road = roads.find(
      (f: { properties: Record<string, unknown> }) =>
        f.properties.sourceId === '96',
    );
    expect(vertexCount(road.geometry)).toBe(6094);
    expect(road.geometry.coordinates).toHaveLength(57);
    const edit = {
      id: road.properties.id,
      kind: 'land' as const,
      geometry: road.geometry,
      properties: {
        ...road.properties,
        name: 'Reviewed road 96',
        width: 6,
        widthEvidence: 'owner',
      },
    };
    expect(validateEdit(edit)).toEqual([]);
    const window = geometryWindow(edit.geometry, 0, 45, 0),
      moved = structuredClone(window.geometry.coordinates);
    moved[1][0] += 0.000000001;
    const changed = replaceWindow(edit.geometry, window, moved);
    expect(vertexCount(changed)).toBe(6094);
    expect(changed.type === 'Polygon' && changed.coordinates[1]).toEqual(
      edit.geometry.coordinates[1],
    );
    const data = campus();
    data.map.features = roads;
    expect(
      campusLayers(data).items.filter((l) => l.role === 'road-surface'),
    ).toHaveLength(1);
  });
  it('undoes and redoes a saved layer definition as one recoverable command', async () => {
    const workspace = new EditorWorkspace(
      [],
      async (batch) =>
        batch.edits.map(({ edit }) => ({
          ...edit,
          updated_at: new Date().toISOString(),
        })),
      async () => {},
    );
    workspace.commit([
      layerEdit(newLayer('Reference', 'overlay', 'map-layer:undo')),
    ]);
    expect(await workspace.flush()).toBe(true);
    workspace.undo();
    expect(validateEdit(workspace.edits[0])).toEqual([]);
    expect(await workspace.flush()).toBe(true);
    workspace.redo();
    expect(workspace.edits[0].deleted).not.toBe(true);
    expect(await workspace.flush()).toBe(true);
  });
  it('retains identity through owner corrections, metadata moves and public packages', () => {
    const base = campus(),
      layer = campusLayers(base).items.find((l) => l.role === 'landcover')!,
      target = newLayer('Reference', 'overlay', 'map-layer:reference');
    target.members = ['land:land:1'];
    const edit = featureEdit(base, 'land', 'land:1', [])!;
    const next = applyEdits(base, [
      { ...edit, properties: { ...edit.properties, name: 'Corrected' } },
      layerEdit(target),
    ]);
    expect(next.errors).toEqual([]);
    expect(next.data.graph).toEqual(base.graph);
    expect(layerMembership(next.data).get('land:land:1')).toBe(target.id);
    expect(campusLayers(next.data).items.some((l) => l.id === layer.id)).toBe(
      true,
    );
    const published = publicCampus(next.data);
    expect(() => campusLayers(published)).not.toThrow();
    expect(() => layerMembership(published)).not.toThrow();
  });
  it('isolates editor visibility from inclusion and preserves core graph data', () => {
    const data = campus(),
      layer = campusLayers(data).items.find((l) => l.role === 'landcover')!;
    data.layers = { version: 1, items: [{ ...layer, editorVisible: false }] };
    expect(
      layerPresentation(data, true).map.features[0].properties?.visible,
    ).toBe(false);
    expect(layerPresentation(data).map.features[0].properties?.visible).toBe(
      true,
    );
    const hidden = applyEdits(data, [
      layerEdit({ ...layer, included: false }),
    ]).data;
    expect(publicCampus(hidden).map.features).toHaveLength(0);
    expect(hidden.map.features).toHaveLength(1);
    expect(hidden.graph).toEqual(data.graph);
  });
  it('resolves feature overrides before classification and layer defaults', () => {
    const data = campus(),
      layer = campusLayers(data).items.find((l) => l.role === 'landcover')!;
    layer.style = { color: '#111111' };
    layer.rules = [
      { field: 'landClass', value: 'green', style: { color: '#222222' } },
    ];
    data.layers = { version: 1, items: [layer] };
    expect(
      layerPresentation(data).map.features[0].properties?.renderStyle.color,
    ).toBe('#222222');
    data.map.features[0].properties!.layerStyle = { color: '#333333' };
    expect(
      layerPresentation(data).map.features[0].properties?.renderStyle.color,
    ).toBe('#333333');
  });
  it('allows 20,000 land vertices while retaining the building limit', () => {
    const coordinates = Array.from({ length: 6093 }, (_, i) => [
      3.2 + 0.001 * Math.cos((i * 2 * Math.PI) / 6093),
      6.47 + 0.001 * Math.sin((i * 2 * Math.PI) / 6093),
    ]);
    coordinates.push(coordinates[0]);
    const geometry = { type: 'Polygon' as const, coordinates: [coordinates] },
      edit = {
        id: 'polygon:96',
        kind: 'land' as const,
        geometry,
        properties: { name: 'Road', landClass: 'road' },
      };
    expect(validateEdit(edit)).toEqual([]);
    expect(validateEdit({ ...edit, kind: 'building' }).join(' ')).toContain(
      '2,000',
    );
    const window = geometryWindow(geometry, 0, 0, 3000),
      changed = structuredClone(window.geometry.coordinates);
    changed[5][0] += 0.0000001;
    const next = replaceWindow(geometry, window, changed);
    expect(vertexCount(next)).toBe(6094);
    expect(next.type === 'Polygon' && next.coordinates[0][100]).toEqual(
      coordinates[100],
    );
  });
});
describe('reviewed geometry worker operations', () => {
  it('bounds the final handle window and preserves untouched line and point coordinates', () => {
    for (const type of ['LineString', 'MultiPoint'] as const) {
      const geometry = {
        type,
        coordinates: Array.from({ length: 3000 }, (_, i) => [
          3.2 + i / 1000000,
          6.47,
        ]),
      };
      const window = geometryWindow(geometry, 0, 0, 2999);
      expect(window.geometry.coordinates).toHaveLength(2);
      const points = structuredClone(window.geometry.coordinates);
      points[0][1] += 0.000001;
      const next = replaceWindow(geometry, window, points);
      expect(vertexCount(next)).toBe(3000);
      expect('coordinates' in next && next.coordinates[2997]).toEqual(
        geometry.coordinates[2997],
      );
    }
    expect(geometryWindow(polygon, 0, 0, 4).length).toBe(2);
  });
  it('removes one multipart component without changing the others', () => {
    const data = campus();
    const distant = polygon.coordinates.map((ring) =>
      ring.map(([x, y]) => [x + 0.01, y]),
    );
    data.map.features[0].geometry = {
      type: 'MultiPolygon',
      coordinates: [polygon.coordinates, distant],
    };
    const result = runGeometry(data, [], {
      operation: 'remove-part',
      keys: ['land:land:1'],
      part: 0,
    });
    expect(result.edits[0].geometry).toEqual({
      type: 'MultiPolygon',
      coordinates: [distant],
    });
    expect(result.edits[0].properties.geometryLineage).toEqual({
      operation: 'remove-part',
      parents: ['land:land:1'],
    });
  });
  it('merges split children into the chosen primary and retains superseded tombstones', () => {
    const data = campus();
    const split = runGeometry(data, [], {
      operation: 'split',
      keys: ['land:land:1'],
      cutter: {
        type: 'LineString',
        coordinates: [
          [3.199, 6.471],
          [3.203, 6.471],
        ],
      },
    });
    const current = applyEdits(data, split.edits).data;
    const keys = split.edits
      .filter((e) => !e.deleted)
      .map((e) => `${e.kind}:${e.id}`)
      .reverse();
    const merged = runGeometry(current, split.edits, {
      operation: 'merge',
      keys,
    });
    expect(`${merged.edits[0].kind}:${merged.edits[0].id}`).toBe(keys[0]);
    expect(merged.edits[1].deleted).toBe(true);
    expect(merged.edits[1].properties.geometryLineage.survivor).toBe(
      merged.edits[0].id,
    );
    expect(merged.afterArea).toBeCloseTo(split.beforeArea, 2);
  });
  it('links bulk width edits atomically, holds manual surfaces and requires explicit regeneration', () => {
    const data = campus();
    data.map.features = [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [3.2001, 6.471],
            [3.2019, 6.471],
          ],
        },
        properties: { id: 'way:1', kind: 'path', highway: 'residential' },
      },
    ];
    const generation = runGeometry(data, [], {
      operation: 'regenerate',
      keys: ['path:way:1'],
    });
    const current = applyEdits(data, generation.edits).data;
    const surface = generation.edits.find((e) => e.kind === 'land')!;
    const edits = propertyEdits(
      current,
      generation.edits,
      [surface],
      'width',
      8,
    );
    expect(edits.map((e) => e.kind)).toEqual(['land', 'path']);
    expect(edits.every((e) => e.properties.width === 8)).toBe(true);
    expect(edits[0].geometry).toEqual(surface.geometry);
    const manual = {
      ...surface,
      properties: {
        ...surface.properties,
        derivedSurface: { ...surface.properties.derivedSurface, manual: true },
      },
    };
    const corrected = applyEdits(data, [
      ...generation.edits.filter((e) => e.kind !== 'land'),
      manual,
      edits[1],
    ]).data;
    const retained = runGeometry(corrected, [manual], {
      operation: 'regenerate',
      keys: ['path:way:1'],
    });
    expect(retained.edits).toHaveLength(0);
    expect(retained.report.join(' ')).toContain('retained manual shape');
    const replaced = runGeometry(corrected, [manual], {
      operation: 'regenerate',
      keys: ['path:way:1'],
      replaceManual: true,
    });
    expect(
      replaced.edits.find((e) => e.kind === 'land')?.properties.width,
    ).toBe(8);
    expect(replaced.edits.find((e) => e.kind === 'land')?.id).toBe(surface.id);
    const removed = { ...manual, deleted: true };
    const absent = applyEdits(data, [removed]).data;
    expect(
      runGeometry(absent, [removed], {
        operation: 'regenerate',
        keys: ['path:way:1'],
      }).report.join(' '),
    ).toContain('retained owner removal');
  });
  it('splits with stable child identities and preserves routing geometry', () => {
    const data = campus(),
      result = runGeometry(data, [], {
        operation: 'split',
        keys: ['land:land:1'],
        cutter: {
          type: 'LineString',
          coordinates: [
            [3.199, 6.471],
            [3.203, 6.471],
          ],
        },
      });
    expect(result.edits.filter((e) => !e.deleted)).toHaveLength(2);
    expect(result.edits[0].deleted).toBe(true);
    expect(result.afterArea).toBeCloseTo(result.beforeArea, 2);
    const repeat = runGeometry(data, [], {
      operation: 'split',
      keys: ['land:land:1'],
      cutter: {
        type: 'LineString',
        coordinates: [
          [3.199, 6.471],
          [3.203, 6.471],
        ],
      },
    });
    expect(repeat.edits.map((e) => e.id)).toEqual(
      result.edits.map((e) => e.id),
    );
    expect(applyEdits(data, result.edits).data.graph).toEqual(data.graph);
  });
  it('generates linked labelled widths and reports stale source changes', () => {
    const data = campus();
    data.map.features = [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [3.2001, 6.471],
            [3.2019, 6.471],
          ],
        },
        properties: { id: 'way:1', kind: 'path', highway: 'residential' },
      },
    ];
    const result = runGeometry(data, [], {
        operation: 'regenerate',
        keys: ['path:way:1'],
      }),
      surface = result.edits.find((e) => e.kind === 'land')!;
    expect(surface.properties.width).toBe(6);
    expect(surface.properties.widthEvidence).toBe('illustrative');
    expect(surface.properties.surface).toBeUndefined();
    expect(surfaceStale(surface.properties, data.map.features)).toBe(false);
    data.map.features[0].properties!.width = 8;
    expect(surfaceStale(surface.properties, data.map.features)).toBe(true);
  });
  it('adds/removes a hole without losing the exterior ring', () => {
    const data = campus();
    const result = runGeometry(data, [], {
      operation: 'hole',
      keys: ['land:land:1'],
      cutter: {
        type: 'Polygon',
        coordinates: [
          [
            [3.2005, 6.4705],
            [3.201, 6.4705],
            [3.201, 6.471],
            [3.2005, 6.471],
            [3.2005, 6.4705],
          ],
        ],
      },
    });
    expect(
      result.edits[0].geometry.type === 'Polygon' &&
        result.edits[0].geometry.coordinates.length,
    ).toBe(2);
    const next = applyEdits(data, result.edits).data,
      removed = runGeometry(next, result.edits, {
        operation: 'remove-hole',
        keys: ['land:land:1'],
        part: 0,
        ring: 1,
      });
    expect(removed.afterArea).toBeCloseTo(result.beforeArea, 2);
  });
});
