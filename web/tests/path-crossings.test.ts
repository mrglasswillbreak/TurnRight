import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { featureEdit } from '../src/editor-features';
import { validateWorkspace } from '../src/editor-validation';
import { findRoutes } from '../src/routing';
import {
  publishedRecords,
  validateReleaseSnapshot,
} from '../server/release-validation';
import { campusFixture } from './fixture';
import type { CampusData, MapEdit, Position } from '../src/types';

function path(
  id: string,
  coordinates: Position[],
  properties: Record<string, unknown> = {},
): MapEdit {
  return {
    id,
    kind: 'path',
    geometry: { type: 'LineString', coordinates },
    properties: {
      name: id,
      vertexIds: coordinates.map((_, i) => `${id}:${i}`),
      ...properties,
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
function empty() {
  const data = campusFixture();
  data.graph = { nodes: [], edges: [] };
  data.places = [];
  return data;
}
function assemble(edits: MapEdit[], base = empty()) {
  const result = validateWorkspace(base, edits);
  expect(result.errors).toEqual([]);
  expect(result.usable).toBe(true);
  expect(
    result.data.graph.edges.every((e) => e.distance > 0 && e.from !== e.to),
  ).toBe(true);
  return result.data;
}
const route = (data: CampusData) =>
  findRoutes(data, 'horizontal:0', 'vertical:1');

describe('automatic path crossings', () => {
  it('connects an X crossing in both directions with a single shared junction', () => {
    const data = assemble([horizontal(), vertical()]);
    expect(data.coverage.components).toBe(1);
    expect(data.graph.nodes).toHaveLength(5);
    expect(data.graph.edges).toHaveLength(8);
    expect(assemble([], data).graph).toEqual(data.graph);
    expect(route(data)[0].coordinates).toEqual([
      [3.2, 6.46],
      [3.2005, 6.46],
      [3.2005, 6.4605],
    ]);
    expect(findRoutes(data, 'vertical:1', 'horizontal:0')).toHaveLength(1);
  });
  it('connects T junctions and coincident endpoints while retaining destination links', () => {
    const v = path('vertical', [
      [3.2005, 6.46],
      [3.2005, 6.4605],
    ]);
    const data = assemble([horizontal(), v]);
    expect(route(data)[0].coordinates).toHaveLength(3);
    const base = assemble([horizontal()]);
    base.places = [
      {
        ...campusFixture().places[0],
        graphNode: 'horizontal:1',
        coordinates: [3.201, 6.46],
      },
    ];
    const branch = path('a-branch', [
      [3.201, 6.46],
      [3.201, 6.461],
    ]);
    const joined = assemble([branch], base);
    expect(joined.places[0].graphNode).toBeDefined();
    expect(
      findRoutes(joined, 'a-branch:1', {
        placeId: 'library',
      })[0].coordinates.at(-1),
    ).toEqual([3.201, 6.46]);
  });
  it('connects three paths and overlapping sections without duplicate junctions', () => {
    const diagonal = path('diagonal', [
      [3.2, 6.4595],
      [3.201, 6.4605],
    ]);
    const overlap = path('overlap', [
      [3.20025, 6.46],
      [3.20075, 6.46],
    ]);
    const edits = [horizontal(), vertical(), diagonal, overlap];
    const data = assemble(edits);
    expect(data.coverage.components).toBe(1);
    expect(
      data.graph.nodes.filter(
        (n) =>
          Math.abs(n.coordinates[0] - 3.2005) < 1e-10 &&
          Math.abs(n.coordinates[1] - 6.46) < 1e-10,
      ),
    ).toHaveLength(1);
    expect(assemble([...edits].reverse())).toEqual(data);
  });
  it('does not bridge a near miss', () => {
    const v = path('vertical', [
      [3.2005, 6.46001],
      [3.2005, 6.4605],
    ]);
    const data = assemble([horizontal(), v]);
    expect(data.coverage.components).toBe(2);
    expect(() => route(data)).toThrow(/No connected/);
  });
  it.each([
    { crossingLevel: 'bridge' },
    { crossingLevel: 'tunnel' },
    { layer: 1 },
    { bridge: 'yes' },
    { tunnel: 'yes' },
  ])('keeps grade-separated paths separate: %j', (properties) => {
    const v = vertical();
    Object.assign(v.properties, properties);
    const data = assemble([horizontal(), v]);
    expect(data.coverage.components).toBe(2);
  });
  it('preserves imported bridge tags when editing a path name', () => {
    const base = assemble([horizontal(), vertical()]);
    const feature = base.map.features.find(
      (f) => f.properties?.id === 'vertical',
    )!;
    feature.properties!.sourceTags = { bridge: 'yes', layer: '1' };
    const edit = featureEdit(base, 'path', 'vertical', [])!;
    edit.properties.name = 'Bridge';
    expect(assemble([edit], base).coverage.components).toBe(2);
  });
  it('preserves walking direction and restricted access', () => {
    const h = horizontal();
    h.properties.footDirection = 'forward';
    const v = vertical();
    v.properties.access = 'private';
    let data = assemble([h, v]);
    expect(() => route(data)).toThrow(/No connected/);
    expect(
      data.graph.edges
        .filter((e) => e.sourceId === 'vertical')
        .every((e) => !e.accessible),
    ).toBe(true);
    v.properties.access = 'yes';
    data = assemble([h, v]);
    expect(route(data).length).toBeGreaterThan(0);
    expect(() => findRoutes(data, 'vertical:1', 'horizontal:0')).toThrow(
      /No connected/,
    );
  });
  it('retains closures on all split descendants', () => {
    const base = assemble([horizontal()]);
    base.closures = [
      {
        id: 'closure',
        reason: 'Closed',
        edgeIds: base.graph.edges.map((e) => e.id),
      },
    ];
    const data = assemble([vertical()], base);
    expect(data.closures[0].edgeIds).toHaveLength(4);
    expect(() => route(data)).toThrow(/No connected/);
  });
  it('never splits a blocked barrier crossing into unblocked edges', () => {
    const base = empty();
    base.map.features.push({
      type: 'Feature',
      properties: { id: 'wall', kind: 'barrier' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [3.2005, 6.4598],
          [3.2005, 6.4602],
        ],
      },
    });
    const data = assemble([horizontal(), vertical()], base);
    expect(
      data.graph.edges
        .filter((e) => e.sourceId === 'horizontal')
        .every((e) => !!e.geometryBlocked),
    ).toBe(true);
    expect(() => route(data)).toThrow(/No connected/);
  });
  it('does not reconstruct missing gate spans from the displayed line', () => {
    const base = assemble([
      path('horizontal', [
        [3.2, 6.46],
        [3.2004, 6.46],
        [3.2006, 6.46],
        [3.201, 6.46],
      ]),
    ]);
    base.graph.edges = base.graph.edges.filter(
      (e) =>
        ![e.from, e.to].every((id) =>
          ['horizontal:1', 'horizontal:2'].includes(id),
        ),
    );
    const data = assemble([vertical()], base);
    expect(data.coverage.components).toBe(3);
  });
  it('allows per-path opt-out and manual connections while opted out', () => {
    const h = horizontal(),
      v = vertical();
    v.properties.autoConnectCrossings = false;
    expect(assemble([h, v]).coverage.components).toBe(2);
    const branch = path(
      'vertical',
      [
        [3.2005, 6.46],
        [3.2005, 6.4605],
      ],
      {
        autoConnectCrossings: false,
        connections: [
          {
            vertexId: 'vertical:0',
            target: {
              type: 'segment',
              sourceId: 'horizontal',
              from: 'horizontal:0',
              to: 'horizontal:1',
              coordinates: [3.2005, 6.46],
            },
          },
        ],
      },
    );
    expect(route(assemble([h, branch])).length).toBeGreaterThan(0);
  });
  it('can disable an automatic junction after a release and re-enable it', () => {
    const base = assemble([horizontal(), vertical()]);
    const edit = featureEdit(base, 'path', 'vertical', [])!;
    edit.properties.autoConnectCrossings = false;
    const disconnected = assemble([edit], base);
    expect(disconnected.coverage.components).toBe(2);
    expect(() => route(disconnected)).toThrow(/No connected/);
    edit.properties.autoConnectCrossings = true;
    expect(route(assemble([edit], disconnected)).length).toBeGreaterThan(0);
  });
  it('keeps a destination on its original path after disabling a merged endpoint', () => {
    const base = assemble([horizontal()]);
    base.places = [
      {
        ...campusFixture().places[0],
        coordinates: [3.201, 6.46],
        graphNode: 'horizontal:1',
      },
    ];
    const branch = path('a-branch', [
      [3.201, 6.46],
      [3.201, 6.461],
    ]);
    const joined = assemble([branch], base);
    const edit = featureEdit(joined, 'path', 'a-branch', [])!;
    edit.properties.autoConnectCrossings = false;
    const data = assemble([edit], joined);
    expect(data.places[0].graphNode).toBe('horizontal:1');
    expect(
      findRoutes(data, 'horizontal:0', { placeId: 'library' }),
    ).toHaveLength(1);
    expect(() =>
      findRoutes(data, 'a-branch:1', { placeId: 'library' }),
    ).toThrow(/No connected/);
  });
  it('retains explicit connections after releasing and disabling automatic crossings', () => {
    const h = horizontal();
    const v = path(
      'vertical',
      [
        [3.2005, 6.46],
        [3.2005, 6.4605],
      ],
      {
        connections: [
          {
            vertexId: 'vertical:0',
            target: {
              type: 'segment',
              sourceId: 'horizontal',
              from: 'horizontal:0',
              to: 'horizontal:1',
              coordinates: [3.2005, 6.46],
            },
          },
        ],
      },
    );
    const base = assemble([h, v]);
    const edit = featureEdit(base, 'path', 'vertical', [])!;
    edit.properties.autoConnectCrossings = false;
    expect(route(assemble([edit], base)).length).toBeGreaterThan(0);
  });
  it('removes a tiny automatic segment collapsed by an explicit endpoint join', () => {
    const h = path(
      'horizontal',
      [
        [3.2, 6.46],
        [3.200501, 6.46],
      ],
      {
        connectEnd: 'vertical:0',
      },
    );
    const v = path('vertical', [
      [3.2005, 6.46],
      [3.2005, 6.4605],
    ]);
    const data = assemble([h, v]);
    expect(route(data)).toHaveLength(1);
    expect(data.graph.edges).toHaveLength(4);
  });
  it('can replay a snapped edit against its published baseline', () => {
    const h = path(
      'horizontal',
      [
        [3.2, 6.46],
        [3.2005, 6.46],
        [3.201, 6.46],
      ],
      {
        connections: [
          {
            vertexId: 'horizontal:1',
            target: {
              type: 'node',
              nodeId: 'vertical:0',
              coordinates: [3.2005008, 6.46],
            },
          },
        ],
      },
    );
    const v = path('vertical', [
      [3.2005008, 6.46],
      [3.2005008, 6.4605],
    ]);
    const published = assemble([h, v]);
    const replayed = assemble([h, v], published);
    expect(route(replayed)).toEqual(route(published));
    expect(replayed.graph.edges).toHaveLength(published.graph.edges.length);
  });
  it('uses the same connections in editor previews and release validation', () => {
    const base = empty(),
      edits = [horizontal(), vertical()];
    expect(
      validateReleaseSnapshot(
        { features: publishedRecords(base), edits },
        base,
      ),
    ).toEqual(assemble(edits, base));
  });
  it('retains a manual node target when an automatic merge prefers the new path', () => {
    const base = assemble([
      path('z-main', [
        [3.2, 6.46],
        [3.201, 6.46],
      ]),
    ]);
    const branch = path(
      'a-branch',
      [
        [3.201, 6.46],
        [3.201, 6.461],
      ],
      {
        connections: [
          {
            vertexId: 'a-branch:0',
            target: {
              type: 'node',
              nodeId: 'z-main:1',
              coordinates: [3.201, 6.46],
            },
          },
        ],
      },
    );
    const published = assemble([branch], base);
    expect(published.graph.nodes.some((n) => n.id === 'z-main:1')).toBe(true);
    const replayed = assemble([branch], published);
    expect(findRoutes(replayed, 'z-main:0', 'a-branch:1')).toHaveLength(1);
    branch.properties.autoConnectCrossings = false;
    expect(
      findRoutes(assemble([branch], replayed), 'z-main:0', 'a-branch:1'),
    ).toHaveLength(1);
  });
  it('normalizes the full campus without losing destinations or restrictions', () => {
    const seed: CampusData = JSON.parse(
      readFileSync(
        new URL('../../data/seed/campus.json', import.meta.url),
        'utf8',
      ),
    );
    const before = structuredClone(seed);
    const data = assemble([], seed);
    expect(seed).toEqual(before);
    expect(
      data.places.filter((p) => p.graphNode).length,
    ).toBeGreaterThanOrEqual(seed.places.filter((p) => p.graphNode).length);
    expect(data.coverage.components).toBeLessThanOrEqual(
      seed.coverage.components,
    );
    expect(
      assemble([], data)
        .graph.edges.map((e) => e.id)
        .sort(),
    ).toEqual(data.graph.edges.map((e) => e.id).sort());
  });
});
