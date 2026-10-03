import type { CampusData, CampusPackage, Position } from './types.js';
import type { Polygon, MultiPolygon } from 'geojson';
import { validCampusOutline } from './campus-outline.mjs';

export const DEFAULT_CAMPUS = 'lasu';
export interface CampusIdentity {
  id: string;
  slug: string;
  name: string;
  bounds: [Position, Position];
  manifestUrl?: string;
  outline?: Polygon | MultiPolygon;
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
  if (campus !== DEFAULT_CAMPUS || url.pathname === '/')
    url.searchParams.set('campus', campus);
  else if (url.searchParams.has('campus')) url.searchParams.delete('campus');
  return url.pathname + url.search + url.hash;
}
export function validCatalogue(value: unknown): value is CampusCatalogue {
  const c = value as CampusCatalogue;
  if (
    c?.schemaVersion !== 1 ||
    !Array.isArray(c.campuses) ||
    !c.campuses.length || c.campuses.length > 1000
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
      (p.outline !== undefined && !validCampusOutline(p.outline)) ||
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
/** Editing may include campus approaches within 500 metres of its extent. */
export const MAPPING_BUFFER_METRES = 500;
export type MappingArea = Pick<CampusIdentity, 'bounds'>;
export function insideCampusMappingArea(point: unknown, area?: MappingArea) {
  if (
    !Array.isArray(point) || point.length !== 2 ||
    !point.every((n) => typeof n === 'number' && Number.isFinite(n)) ||
    Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90
  ) return false;
  // Pure geometry tools may validate before a workspace is loaded. Save and
  // release callers always supply the independently resolved campus extent.
  if (!area) return true;
  const bounds = area.bounds;
  if (!Array.isArray(bounds) || bounds.length !== 2 ||
      !bounds.every((p) => Array.isArray(p) && p.length === 2 &&
        p.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
        Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90)) return false;
  const [[west, south], [east, north]] = bounds;
  if (south > north) return false;
  const latitudeBuffer = MAPPING_BUFFER_METRES / 111320;
  if (point[1] < south - latitudeBuffer || point[1] > north + latitudeBuffer)
    return false;
  const longitudeBuffer = Math.min(180, latitudeBuffer /
    Math.max(0.00001, Math.cos(Math.max(Math.abs(south), Math.abs(north)) * Math.PI / 180)));
  const width = ((east - west) % 360 + 360) % 360;
  const offset = ((point[0] - west) % 360 + 360) % 360;
  return east - west === 360 || width + 2 * longitudeBuffer >= 360 ||
    offset <= width + longitudeBuffer || offset >= 360 - longitudeBuffer;
}

/** Restore only a plain public entry; shared destinations and owner links stay explicit. */
export function restorePublicCampus() {
  try {
    const url = new URL(location.href);
    const slug = localStorage.getItem('turnright:last-campus');
    if (url.pathname === '/' && !url.search && !url.hash &&
        slug && /^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) {
      url.searchParams.set('campus', slug);
      history.replaceState(history.state, '', url);
    }
  } catch { /* Storage or history can be unavailable; use the ordinary link. */ }
}

/** Remember successful public loads only, including verified offline packages. */
export function rememberPublicCampus(slug: string) {
  try { localStorage.setItem('turnright:last-campus', slug); }
  catch { /* The map remains usable when browser storage is blocked. */ }
}
