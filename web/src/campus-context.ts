import type { CampusData, CampusPackage, Position } from './types.js';

export const DEFAULT_CAMPUS = 'lasu';
export interface CampusIdentity {
  id: string;
  slug: string;
  name: string;
  bounds: [Position, Position];
  manifestUrl?: string;
}
export interface CampusCatalogue {
  schemaVersion: 1;
  campuses: CampusIdentity[];
}
export const lasuCampus: CampusIdentity = {
  id: DEFAULT_CAMPUS,
  slug: DEFAULT_CAMPUS,
  name: 'LASU · Ojo',
  bounds: [
    [3.19, 6.455],
    [3.215, 6.489],
  ],
  manifestUrl: '/packages/latest.json',
};
export function requestedCampus(
  search = typeof location === 'undefined' ? '' : location.search,
) {
  const slug = new URLSearchParams(search).get('campus') || DEFAULT_CAMPUS;
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug))
    throw new Error('Invalid campus link.');
  return slug;
}
export function campusKey(key: string, campus = requestedCampus()) {
  return campus === DEFAULT_CAMPUS ? key : `campus:${campus}:${key}`;
}
export function campusUrl(path: string, campus = requestedCampus()) {
  const url = new URL(path, 'https://turnright.local');
  if (campus !== DEFAULT_CAMPUS) url.searchParams.set('campus', campus);
  else if (url.searchParams.has('campus')) url.searchParams.delete('campus');
  return url.pathname + url.search + url.hash;
}
export function validCatalogue(value: unknown): value is CampusCatalogue {
  const c = value as CampusCatalogue;
  if (
    c?.schemaVersion !== 1 ||
    !Array.isArray(c.campuses) ||
    !c.campuses.length
  )
    return false;
  const ids = new Set<string>(),
    slugs = new Set<string>();
  return c.campuses.every((p) => {
    if (
      !p ||
      typeof p.id !== 'string' ||
      ids.has(p.id) ||
      slugs.has(p.slug) ||
      !/^[a-z0-9][a-z0-9-]{0,79}$/.test(p.slug) ||
      typeof p.name !== 'string' ||
      !p.name.trim() ||
      !Array.isArray(p.bounds) ||
      p.bounds.length !== 2 ||
      !p.bounds.every(
        (v) =>
          Array.isArray(v) &&
          v.length === 2 &&
          Number.isFinite(v[0]) &&
          Number.isFinite(v[1]) &&
          Math.abs(v[0]) <= 180 &&
          Math.abs(v[1]) <= 90,
      ) ||
      !/^\/packages\/(?:[a-z0-9-]+\/)?(?:latest|manifest)\.json$/.test(
        p.manifestUrl || '',
      )
    )
      return false;
    ids.add(p.id);
    slugs.add(p.slug);
    return true;
  });
}
export function emptyCampus(
  campus: CampusIdentity,
  boundary?: CampusData['boundary'],
): CampusData {
  const [[w, s], [e, n]] = campus.bounds;
  return {
    schemaVersion: 1,
    version: `draft-${campus.id}`,
    createdAt: new Date().toISOString(),
    boundary: boundary || {
      type: 'Feature',
      properties: { id: 'campus-boundary', name: campus.name },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [w, s],
            [e, s],
            [e, n],
            [w, n],
            [w, s],
          ],
        ],
      },
    },
    bounds: campus.bounds,
    map: { type: 'FeatureCollection', features: [] },
    places: [],
    graph: { nodes: [], edges: [] },
    closures: [],
    coverage: {
      fieldVerified: false,
      placeCount: 0,
      routableCount: 0,
      approachCount: 0,
      disconnected: [],
      components: 0,
      notes: ['Import and review campus data before publication.'],
    },
    sources: [],
  };
}
export function packageCampus(manifest: CampusPackage) {
  return manifest.campus?.slug || DEFAULT_CAMPUS;
}
