import type { Feature } from 'geojson';
import { pathDisplay } from './map-classification';
import { layerIdentity } from './campus-layers';
export const SURFACE_GENERATOR = 'utm-buffer-v1';
export interface DerivedSurface {
  sourceRoadId: string;
  width: number;
  evidence: 'source' | 'owner' | 'illustrative';
  generator: string;
  sourceRevision: string;
  manual?: boolean;
}
export function surfaceWidth(p: Record<string, unknown>) {
  const explicit = Number(p.width);
  if (Number.isFinite(explicit) && explicit > 0 && explicit <= 200)
    return {
      width: explicit,
      evidence: (p.widthEvidence === 'owner'
        ? 'owner'
        : p.widthEvidence === 'illustrative'
          ? 'illustrative'
          : 'source') as DerivedSurface['evidence'],
    };
  return {
    width:
      (
        { street: 6, service: 4, parking: 3, footway: 1.8 } as Record<
          string,
          number
        >
      )[pathDisplay(p).pathClass] ?? 1.8,
    evidence: 'illustrative' as const,
  };
}
export function roadRevision(f: Feature) {
  return layerIdentity(
    JSON.stringify([
      f.geometry,
      surfaceWidth(f.properties || {}),
      f.properties?.highway,
      f.properties?.service,
    ]),
  ).replace('map-layer:', '');
}
export function surfaceStale(p: Record<string, unknown>, roads: Feature[]) {
  const link = p.derivedSurface as DerivedSurface | undefined;
  if (!link) return false;
  const source = roads.find(
    (f) => String(f.properties?.id) === link.sourceRoadId,
  );
  return (
    !source ||
    roadRevision(source) !== link.sourceRevision ||
    link.generator !== SURFACE_GENERATOR
  );
}
