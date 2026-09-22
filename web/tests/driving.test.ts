import { describe, expect, it } from 'vitest';
import { campusFixture } from './fixture';
import {
  findDrivingJourneys,
  vehiclePermitted,
  remainingSeconds,
} from '../src/driving';
import {
  applyDrivingEdits,
  drivingIssues,
  vehicleNodeBlocked,
} from '../src/driving-data';
import { findRoutes } from '../src/routing';
import { advanceNavigation, initialNavigation } from '../src/navigation';
import { applyEdits } from '../src/editor-model';
import type { MapEdit } from '../src/types';

function drivingFixture() {
  const data = campusFixture();
  data.schemaVersion = 2;
  data.driving = {
    version: 1,
    restrictions: [],
    parking: [
      {
        id: 'parking',
        name: 'Library parking',
        kind: 'parking',
        access: 'yes',
        vehicleNodeId: 'b',
        walkingNodeId: 'b',
      },
    ],
  };
  for (const e of data.graph.edges) {
    e.vehicle = { access: 'yes', direction: 'both' };
    e.vehicleAllowed = true;
  }
  return data;
}
describe('offline driving journeys', () => {
  it('confirms an already-reached parking point without inventing a driving segment', () => {
    const route = findDrivingJourneys(drivingFixture(), 'b', 'c')[0].legs![0];
    expect(route.distance).toBe(0);
    let nav = initialNavigation;
    for (let i = 1; i <= 3; i++)
      nav = advanceNavigation(
        route,
        {
          coordinates: route.coordinates[0],
          speed: 0,
          heading: null,
          accuracy: 3,
          timestamp: i * 1000,
        },
        nav,
        i * 1000,
      );
    expect(nav.arrived).toBe(true);
  });
  it('uses travel heading to distinguish opposite nearby driving segments', () => {
    const route = findDrivingJourneys(drivingFixture(), 'a', 'c')[0].legs![0];
    route.coordinates = [
      [3.2, 6.46],
      [3.201, 6.46],
      [3.201, 6.4601],
      [3.2, 6.4601],
    ];
    route.distance = 232;
    const fix = {
      coordinates: [3.2005, 6.46005] as [number, number],
      speed: 5,
      heading: 90,
      accuracy: 5,
      timestamp: 1000,
    };
    expect(
      advanceNavigation(route, fix, initialNavigation, 1000).progress,
    ).toBeLessThan(100);
    expect(
      advanceNavigation(
        route,
        { ...fix, heading: 270 },
        initialNavigation,
        1000,
      ).progress,
    ).toBeGreaterThan(150);
  });
  it('has independently timed driving and walking legs and a parking transfer', () => {
    const data = drivingFixture();
    const r = findDrivingJourneys(data, 'a', { placeId: 'library' })[0];
    expect(r.legs!.map((l) => l.mode)).toEqual(['driving', 'walking']);
    expect(r.legs![0].nodeIds).toEqual(['a', 'b']);
    expect(r.legs![1].nodeIds).toEqual(['b', 'c']);
    expect(r.seconds).toBeCloseTo(
      r.legs![0].distance / (20 / 3.6) + r.legs![1].distance / 1.25,
    );
    expect(remainingSeconds(r.legs![0], r.legs![0].distance)).toBeCloseTo(0, 1);
  });
  it('does not turn walking permission into vehicle permission', () => {
    const data = drivingFixture();
    data.graph.edges.forEach((e) => {
      e.walkingAccess = 'campus';
      e.vehicle!.access = 'private';
    });
    expect(findRoutes(data, 'a', 'c').length).toBeGreaterThan(0);
    expect(() => findDrivingJourneys(data, 'a', 'c')).toThrow(
      /driving connection/,
    );
    expect(vehiclePermitted({ access: 'reviewed', direction: 'both' })).toBe(
      false,
    );
    expect(
      vehiclePermitted({ access: 'yes', direction: 'both', conditional: true }),
    ).toBe(false);
  });
  it('respects directed edges, closures and steps independently', () => {
    const data = drivingFixture();
    data.graph.edges
      .filter((e) => e.to === 'b')
      .forEach((e) => {
        e.vehicleAllowed = false;
      });
    expect(() => findDrivingJourneys(data, 'a', 'c')).toThrow(/complete/);
    data.graph.edges.forEach((e) => {
      e.vehicleAllowed = true;
    });
    data.closures = [
      {
        id: 'closed',
        reason: 'works',
        edgeIds: data.graph.edges.filter((e) => e.to === 'b').map((e) => e.id),
      },
    ];
    expect(() => findDrivingJourneys(data, 'a', 'c')).toThrow(/complete/);
    data.closures = [];
    data.graph.edges
      .filter((e) => e.to === 'b')
      .forEach((e) => {
        e.steps = true;
      });
    expect(() => findDrivingJourneys(data, 'a', 'c')).toThrow(/complete/);
  });
  it('enforces incoming-road turn restrictions without restricting walking', () => {
    const data = drivingFixture();
    data.driving!.parking[0].vehicleNodeId =
      data.driving!.parking[0].walkingNodeId = 'c';
    data.driving!.restrictions = [
      {
        id: 'turn',
        fromSourceId: 'ab',
        toSourceId: 'bc',
        viaNodeId: 'b',
        kind: 'no',
      },
    ];
    const ab = data.graph.edges.find((e) => e.id === 'ab')!,
      bc = data.graph.edges.find((e) => e.id === 'bc')!;
    data.driving!.restrictions[0].fromSourceId = ab.sourceId;
    data.driving!.restrictions[0].toSourceId = bc.sourceId;
    expect(findDrivingJourneys(data, 'a', 'c')[0].legs![0].nodeIds).toEqual([
      'a',
      'd',
      'c',
    ]);
    expect(findRoutes(data, 'a', 'c')[0].nodeIds).toEqual(['a', 'b', 'c']);
  });
  it('does not bridge parking gaps or silently replace selected parking', () => {
    const data = drivingFixture();
    expect(() => findDrivingJourneys(data, 'a', 'c', 'removed')).toThrow(
      /complete/,
    );
    data.driving!.parking[0].walkingNodeId = 'c';
    expect(drivingIssues(data)).toContain(
      'parking: parking must transfer at a mapped shared road/walking node.',
    );
    expect(() => findDrivingJourneys(data, 'a', 'c')).toThrow(/complete/);
  });
  it('keeps old packages walking-only and handles unsupported starting locations', () => {
    expect(() => findDrivingJourneys(campusFixture(), 'a', 'c')).toThrow(
      /updated campus map/,
    );
    expect(() => findDrivingJourneys(drivingFixture(), [0, 0], 'c')).toThrow(
      /driving connection/,
    );
  });
  it('reapplies one-way metadata and blocks vehicle barriers after topology edits', () => {
    const data = drivingFixture();
    const nodes = new Map(data.graph.nodes.map((n) => [n.id, n]));
    for (const e of data.graph.edges)
      e.sourceId = [e.from, e.to].sort().join('');
    data.map.features = [
      ...new Set(data.graph.edges.map((e) => e.sourceId)),
    ].map((id) => ({
      type: 'Feature',
      properties: {
        id,
        kind: 'path',
        name: id,
        vehicle: { access: 'yes', direction: 'forward' },
      },
      geometry: {
        type: 'LineString',
        coordinates: [...id].map((n) => nodes.get(n)!.coordinates),
      },
    }));
    applyDrivingEdits(data, []);
    expect(data.graph.edges.find((e) => e.id === 'ab')!.vehicleAllowed).toBe(
      true,
    );
    expect(data.graph.edges.find((e) => e.id === 'ba')!.vehicleAllowed).toBe(
      false,
    );
    nodes.get('b')!.sourceTags = { barrier: 'bollard' };
    applyDrivingEdits(data, []);
    expect(data.graph.edges.find((e) => e.id === 'ab')!.vehicleAllowed).toBe(
      false,
    );
    expect(vehicleNodeBlocked({ barrier: 'gate', foot: 'yes' })).toBe(true);
  });
  it('does not confirm parking arrival while still driving at speed', () => {
    const route = findDrivingJourneys(drivingFixture(), 'a', 'c')[0].legs![0];
    let state = initialNavigation;
    for (let i = 1; i <= 3; i++)
      state = advanceNavigation(
        route,
        {
          coordinates: route.coordinates.at(-1)!,
          speed: 8,
          heading: 0,
          timestamp: i * 1000,
          accuracy: 3,
        },
        state,
        i * 1000,
      );
    expect(state.arrived).toBe(false);
    for (let i = 4; i <= 6; i++)
      state = advanceNavigation(
        route,
        {
          coordinates: route.coordinates.at(-1)!,
          speed: 0,
          heading: 0,
          timestamp: i * 1000,
          accuracy: 3,
        },
        state,
        i * 1000,
      );
    expect(state.arrived).toBe(true);
  });
  it('preserves reviewed vehicle rules through editor reconstruction', () => {
    const data = campusFixture();
    const edit: MapEdit = {
      id: 'new-road',
      kind: 'path',
      geometry: {
        type: 'LineString',
        coordinates: [
          [3.2, 6.47],
          [3.201, 6.47],
        ],
      },
      properties: {
        name: 'Reviewed road',
        access: 'yes',
        vehicle: {
          access: 'reviewed',
          direction: 'reverse',
          review: {
            id: 'review',
            audience: 'visitors',
            confirmedAt: '2026-09-22',
            summary: 'Owner confirmed vehicle access',
          },
        },
      },
    };
    const result = applyEdits(data, [edit]);
    expect(result.errors).toEqual([]);
    expect(result.data.schemaVersion).toBe(2);
    const edges = result.data.graph.edges.filter((e) => e.sourceId === edit.id);
    expect(edges.some((e) => e.vehicleAllowed)).toBe(true);
    expect(edges.some((e) => !e.vehicleAllowed)).toBe(true);
    expect(edges.every((e) => e.vehicle?.review?.audience === 'visitors')).toBe(
      true,
    );
    const changed = structuredClone(edit);
    (changed.properties.vehicle as { direction: string }).direction = 'forward';
    const revised = applyEdits(result.data, [changed]);
    expect(revised.errors).toEqual([]);
    expect(
      revised.data.graph.edges
        .filter((e) => e.sourceId === edit.id)
        .every((e) => e.vehicle?.direction === 'forward'),
    ).toBe(true);
    expect(
      revised.data.graph.edges.find(
        (e) => e.id === edges.find((e) => e.vehicleAllowed)!.id,
      )!.vehicleAllowed,
    ).toBe(false);
  });
  it('optimizes driving time rather than walking distance', () => {
    const data = drivingFixture();
    data.driving!.parking[0].vehicleNodeId =
      data.driving!.parking[0].walkingNodeId = 'c';
    data.graph.edges.forEach((e) => {
      e.vehicle!.speedKph = ['ab', 'bc'].includes(e.id) ? 5 : 30;
    });
    expect(findDrivingJourneys(data, 'a', 'c')[0].legs![0].nodeIds).toEqual([
      'a',
      'd',
      'c',
    ]);
    expect(findRoutes(data, 'a', 'c')[0].nodeIds).toEqual(['a', 'b', 'c']);
  });
  it('filters mode-specific closures and validates weak/stale driving fixes', () => {
    const data = drivingFixture();
    data.closures = [
      {
        id: 'cars',
        edgeIds: ['ab'],
        reason: 'Vehicle restriction',
        modes: ['driving'],
      },
    ];
    expect(findRoutes(data, 'a', 'c')[0].nodeIds).toEqual(['a', 'b', 'c']);
    const route = findDrivingJourneys(data, 'a', 'c')[0].legs![0];
    expect(route.edgeIds).not.toContain('ab');
    const fix = {
      coordinates: route.coordinates[0],
      speed: 8,
      heading: 90,
      accuracy: 50,
      timestamp: 1000,
    };
    expect(advanceNavigation(route, fix, initialNavigation, 1000).quality).toBe(
      'weak',
    );
    expect(
      advanceNavigation(
        route,
        { ...fix, accuracy: 3 },
        initialNavigation,
        15000,
      ).quality,
    ).toBe('stale');
  });
  it('applies only-turn restrictions and allows separate parking selection', () => {
    const data = drivingFixture();
    data.driving!.restrictions = [
      {
        id: 'only',
        fromSourceId: 'ab',
        toSourceId: 'bc',
        viaNodeId: 'b',
        kind: 'only',
      },
    ];
    data.driving!.parking.push({
      ...data.driving!.parking[0],
      id: 'second',
      name: 'Second parking',
      vehicleNodeId: 'c',
      walkingNodeId: 'c',
    });
    const journey = findDrivingJourneys(data, 'a', 'c', 'second')[0];
    expect(journey.parkingId).toBe('second');
    expect(journey.legs![0].nodeIds).toEqual(['a', 'b', 'c']);
  });
});
