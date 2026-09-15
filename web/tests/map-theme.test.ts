import { describe, expect, it } from 'vitest';
import { landClass, pathDisplay } from '../src/map-classification';
import { displayGeometry } from '../src/map-display';
import { meshMaterialRole, nightMaterial } from '../src/map-palette';
import { campusFixture } from './fixture';

describe('map presentation without campus edits', () => {
  it('uses known surface roles and preserves compatibility with old or mixed meshes', () => {
    expect(meshMaterialRole([{ role: 'roof' }, { role: 'roof' }])).toBe('roof');
    expect(meshMaterialRole([{ role: 'wall' }, { role: 'roof' }])).toBe(
      'legacy',
    );
    expect(meshMaterialRole()).toBe('legacy');
    expect(meshMaterialRole([])).toBe('legacy');
    expect(
      meshMaterialRole(undefined, { positions: [0, 0, 6, 1, 0, 7, 1, 1, 6] }),
    ).toBe('roof');
    expect(
      meshMaterialRole(undefined, { positions: [0, 0, 0, 1, 0, 7, 1, 1, 6] }),
    ).toBe('wall');
    expect(
      meshMaterialRole(undefined, {
        detail: true,
        positions: [0, 0, 6, 1, 0, 7, 1, 1, 6],
      }),
    ).toBe('legacy');
  });
  it('recognizes water and wetlands despite source spelling and whitespace', () => {
    for (const name of ['Waterbody', 'Water Body', ' water ', ' WATER  BODY '])
      expect(landClass({ name })).toBe('water');
    expect(landClass({ name: 'Wetland  Area' })).toBe('wetland');
    expect(landClass({ name: 'Green Area' })).toBe('green');
    expect(landClass({ name: 'Bare Surface' })).toBe('bare');
    expect(landClass({ name: 'Built up Area' })).toBe('developed');
  });
  it('distinguishes recorded streets, parking aisles and pedestrian paths independently of access', () => {
    expect(
      pathDisplay({
        highway: 'service',
        sourceTags: { service: 'parking_aisle', access: 'private' },
      }).pathClass,
    ).toBe('parking');
    expect(
      pathDisplay({ highway: 'footway', walkingAccess: 'no' }).pathClass,
    ).toBe('footway');
    expect(pathDisplay({ highway: 'residential' }).pathClass).toBe('street');
    expect(
      pathDisplay({ sourceTags: { highway: 'service', surface: 'unpaved' } }),
    ).toMatchObject({ pathClass: 'service', unpaved: true });
    expect(pathDisplay({}).pathClass).toBe('footway');
  });
  it('labels only meaningful recorded road names', () => {
    for (const name of [
      '',
      '   ',
      'Campus path',
      ' CAMPUS  PATH ',
      'Unnamed road',
    ])
      expect(pathDisplay({ name }).streetLabel).toBe('');
    expect(pathDisplay({ name: 'LAW road' }).streetLabel).toBe('LAW road');
    expect(
      pathDisplay({ name: '', sourceTags: { name: 'Stale name' } }).streetLabel,
    ).toBe('');
  });
  it('keeps roof planes brighter than walls and windows while retaining subtle colour differences', () => {
    const sum = (c: string) =>
      [1, 3, 5].reduce((n, i) => n + parseInt(c.slice(i, i + 2), 16), 0);
    expect(sum(nightMaterial('#cccccc', 'roof'))).toBeGreaterThan(
      sum(nightMaterial('#cccccc', 'wall')),
    );
    expect(sum(nightMaterial('#cccccc', 'wall'))).toBeGreaterThan(
      sum(nightMaterial('#cccccc', 'window')),
    );
    expect(nightMaterial('#cc4444', 'wall')).not.toBe(
      nightMaterial('#44cc44', 'wall'),
    );
    expect(nightMaterial('#444444')).toMatch(/^#[\da-f]{6}$/);
  });
  it('adds display properties without altering facade colours, geometry or routing', () => {
    const data = campusFixture();
    data.map.features.push({
      type: 'Feature',
      properties: {
        kind: 'building',
        appearance: { wallColour: '#cc4444', roofColour: '#ddbb77' },
      },
      geometry: { type: 'Polygon', coordinates: [] },
    });
    const before = structuredClone(data);
    const display = displayGeometry(data.map);
    expect(data).toEqual(before);
    expect(display.features.at(-1)?.properties).toMatchObject({
      displayWall: '#cc4444',
      displayWallDark: nightMaterial('#cc4444', 'wall'),
    });
    expect(display.features.at(-1)?.geometry).toEqual(
      data.map.features.at(-1)?.geometry,
    );
  });
});
