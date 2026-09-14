import type { Feature } from 'geojson';
import type {
  BuildingModel,
  BuildingVisual,
  VisualCatalogue,
  VisualSector,
} from './visual-types.js';
import { finitePosition } from './validation.js';
import type { Position } from './types.js';

/** Content identity for stale-model rejection, independent of feature or package ordering. */
export function buildingRevision(feature: Feature): string {
  const p = feature.properties || {};
  const appearance = p.appearance || {};
  const input = JSON.stringify([
    feature.geometry,
    p.height,
    p.floors,
    p.heightMode,
    p.heightEstimated,
    appearance.wallColour,
    appearance.roofColour,
    appearance.roofForm,
    appearance.modelId,
  ]);
  let a = 2166136261,
    b = 2246822519;
  for (let i = 0; i < input.length; i++) {
    a = Math.imul(a ^ input.charCodeAt(i), 16777619);
    b = Math.imul(b ^ input.charCodeAt(i), 3266489917);
  }
  return `${(a >>> 0).toString(16)}${(b >>> 0).toString(16)}-${input.length}`;
}
export function compatibleVisual(feature: Feature, visual?: BuildingVisual) {
  return !!visual && visual.geometryRevision === buildingRevision(feature);
}
export function visualLookup(catalogue?: VisualCatalogue) {
  return new Map(catalogue?.buildings.map((b) => [b.id, b]));
}
export function visibleSectors(
  sectors: VisualSector[],
  bounds: [Position, Position],
) {
  return sectors.filter(
    (s) =>
      s.bounds[0][0] <= bounds[1][0] &&
      s.bounds[1][0] >= bounds[0][0] &&
      s.bounds[0][1] <= bounds[1][1] &&
      s.bounds[1][1] >= bounds[0][1],
  );
}
export const detailAtZoom = (zoom: number, reduced = false) =>
  zoom < 15.4
    ? 'extrusion'
    : zoom < 16.5 || reduced
      ? 'simplified'
      : 'detailed';

export function validBuildingModel(model: BuildingModel): boolean {
  return (
    !!model &&
    typeof model.id === 'string' &&
    typeof model.geometryRevision === 'string' &&
    finitePosition(model.origin) &&
    Array.isArray(model.meshes) &&
    model.meshes.length > 0 &&
    model.meshes.length <= 100 &&
    model.meshes.every(
      (part) =>
        /^#[a-f0-9]{6}$/i.test(part.colour) &&
        Array.isArray(part.positions) &&
        Array.isArray(part.indices) &&
        part.positions.length > 0 &&
        part.positions.length % 3 === 0 &&
        part.positions.length <= 300000 &&
        part.indices.length > 0 &&
        part.indices.length % 3 === 0 &&
        part.indices.length <= 600000 &&
        part.positions.every((n) => Number.isFinite(n) && Math.abs(n) < 2000) &&
        part.indices.every(
          (n) => Number.isInteger(n) && n >= 0 && n < part.positions.length / 3,
        ),
    )
  );
}
