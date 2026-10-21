import type { Feature } from 'geojson';
import type { BuildingVisual } from './visual-types.js';
import { facadeWalls } from './building-facades.js';
import {
  buildingTopology,
  polygonsOf,
  resolveBuildingVisual,
  standardRoofSupported,
  styleFor,
} from './building-surfaces.js';
export function wallLength(
  coordinates: number[][],
  latitude = (coordinates[0][1] + coordinates[1][1]) / 2,
) {
  const k = (Math.PI / 180) * 6371008.8;
  return coordinates
    .slice(1)
    .reduce(
      (total, point, i) =>
        total +
        Math.hypot(
          (point[0] - coordinates[i][0]) *
            k *
            Math.cos((latitude * Math.PI) / 180),
          (point[1] - coordinates[i][1]) * k,
        ),
      0,
    );
}

export function wallMetrics(
  feature: Feature,
  wallId: string,
  catalogue?: BuildingVisual,
) {
  const topology = buildingTopology(feature),
    polygons = polygonsOf(feature.geometry),
    walls = facadeWalls(feature);
  const wall = walls.find((w) => w.wallId === wallId);
  if (!wall) throw new Error('Select an existing wall.');
  const points = polygons.flat(2),
    latitude = points.reduce((s, p) => s + p[1], 0) / points.length;
  const index = topology.parts.findIndex((p) => p.id === wall.partId),
    polygon = polygons[index];
  const visual = resolveBuildingVisual(feature, catalogue),
    appearance = feature.properties?.appearance || {};
  const surfaceVisual = {
    ...visual,
    partDefaults:
      visual.partDefaults ||
      Object.fromEntries(
        topology.parts.map((p, i) => [
          p.id,
          visual.partHeights?.[i]?.kind === 'illustrative'
            ? { wallColour: '#d4d5c3', roofColour: '#a6b19f', windows: false }
            : {},
        ]),
      ),
  };
  const partStyle = styleFor(appearance, surfaceVisual, wall.partId),
    style = styleFor(appearance, surfaceVisual, wall.partId, wallId);
  const override = appearance.parts?.[wall.partId],
    part = visual.partHeights?.[index];
  const height =
    override?.heightMode === 'floors'
      ? Number(override.floors) * 3
      : override?.heightMode === 'unknown'
        ? 6
        : (override?.height ?? part?.height ?? visual.height);
  const custom = appearance.roofs?.[wall.partId];
  const width = (partStyle.roofOrientation === 'short' ? Math.max : Math.min)(
    ...polygon[0]
      .slice(0, -1)
      .map((p, i) => wallLength([p, polygon[0][i + 1]], latitude)),
  );
  const pitched =
    !custom && partStyle.roofForm !== 'flat' && standardRoofSupported(polygon);
  const rise = pitched
    ? partStyle.roofPitch === undefined
      ? Math.min(height * 0.18, 1.8)
      : (width / 2) * Math.tan((partStyle.roofPitch * Math.PI) / 180)
    : 0;
  const eaves = custom ? custom.eaves : height - rise;
  const floors =
    override?.floors ||
    part?.floors ||
    visual.floors ||
    Math.max(1, Math.round(height / 3));
  const ringIndex = topology.parts[index].rings.findIndex((ring) =>
    ring.wallIds.includes(wallId),
  );
  const ring = polygon[ringIndex];
  const signedArea = ring.slice(0, -1).reduce((sum, a, i) => {
    const b = ring[i + 1];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0);
  // Front elevation runs left-to-right as seen from outside, including courtyards.
  const reverse = signedArea > 0 !== (ringIndex === 0);
  const [a, b] = wall.coordinates;
  const angle =
    ((Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI + 360) % 360;
  return {
    ...wall,
    reverse,
    length: wallLength(wall.coordinates, latitude),
    height,
    eaves,
    floors,
    style,
    direction: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][
      Math.round(angle / 45) % 8
    ],
  };
}
