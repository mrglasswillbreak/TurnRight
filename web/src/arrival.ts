import { resolvePlaceId } from './map-display.js';
import type {
  ArrivalGuide,
  CampusData,
  CampusPhoto,
  Entrance,
  Place,
} from './types.js';

export const PHOTO_WARNING_BYTES = 20 * 1024 * 1024;
export const PHOTO_MAX_BYTES = 250 * 1024;
export const photoLicenses = [
  'CC BY 4.0',
  'CC BY-SA 4.0',
  'CC0 1.0',
  'Public domain',
] as const;
export const canonicalBuildingId = (
  data: Pick<CampusData, 'buildingIdAliases'>,
  id: string,
) => resolvePlaceId({ placeIdAliases: data.buildingIdAliases }, id);

export function placeBuildingId(data: CampusData, place: Place) {
  const id =
    place.buildingId ||
    data.map.features.find(
      (f) =>
        f.properties?.kind === 'building' &&
        (f.properties.placeId === place.id || f.properties.id === place.id),
    )?.properties?.id;
  return id ? canonicalBuildingId(data, String(id)) : undefined;
}
export function placeEntrances(data: CampusData, placeId: string) {
  return (data.entrances || []).filter(
    (e) => resolvePlaceId(data, e.placeId) === resolvePlaceId(data, placeId),
  );
}
export function entranceConnected(data: CampusData, entrance: Entrance) {
  return (
    !!entrance.graphNode &&
    ['yes', 'campus'].includes(entrance.walkingAccess) &&
    data.graph.nodes.some((n) => n.id === entrance.graphNode)
  );
}
export function buildingPhotos(
  data: CampusData,
  buildingId?: string,
  entranceId?: string,
) {
  if (!buildingId) return [];
  return (data.photos || []).filter(
    (p) =>
      canonicalBuildingId(data, p.buildingId) ===
        canonicalBuildingId(data, buildingId) &&
      (entranceId ? p.entranceId === entranceId : !p.entranceId),
  );
}
const text = (v: unknown, max = 2000) =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const date = (v: unknown) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(v) &&
  Number.isFinite(Date.parse(v));
const https = (v: unknown) => {
  try {
    const u = new URL(String(v));
    return u.protocol === 'https:' && !u.username && !u.password;
  } catch {
    return false;
  }
};
export function guideErrors(value: unknown): string[] {
  if (value === undefined) return [];
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return ['Invalid arrival guide.'];
  const g = value as ArrivalGuide,
    errors: string[] = [];
  for (const field of ['description', 'restrictions', 'surface'] as const)
    if (g[field] !== undefined && g[field] !== '' && !text(g[field]))
      errors.push(`Invalid arrival ${field}.`);
  if (
    g.steps !== undefined &&
    (!Number.isInteger(g.steps) || g.steps < 0 || g.steps > 1000)
  )
    errors.push('Steps must be a recorded non-negative count.');
  if (g.ramp !== undefined && !['yes', 'no', 'unknown'].includes(g.ramp))
    errors.push('Invalid recorded ramp observation.');
  if (
    g.doorwayWidthCm !== undefined &&
    (!Number.isFinite(g.doorwayWidthCm) ||
      g.doorwayWidthCm <= 0 ||
      g.doorwayWidthCm > 2000)
  )
    errors.push('Record a measured doorway width in centimetres.');
  const fields = [
    'description',
    'restrictions',
    'steps',
    'ramp',
    'surface',
    'doorwayWidthCm',
  ] as const;
  for (const field of fields) {
    if (g[field] === undefined || g[field] === '' || g[field] === 'unknown')
      continue;
    if (
      !date(g.observedAt) ||
      !g.evidence?.[field]?.length ||
      g.evidence[field].some(
        (e) => !text(e.sourceId) || !text(e.recordId) || !date(e.checkedAt),
      )
    )
      errors.push(
        `Record an observation date and evidence for arrival ${field}.`,
      );
  }
  if (
    g.photoIds !== undefined &&
    (!Array.isArray(g.photoIds) || !g.photoIds.every((id) => text(id, 200)))
  )
    errors.push('Invalid guide photograph references.');
  if (g.needsReview !== undefined && typeof g.needsReview !== 'boolean')
    errors.push('Invalid guide review flag.');
  return errors;
}
export function validPhoto(value: unknown): value is CampusPhoto {
  if (!value || typeof value !== 'object') return false;
  const p = value as CampusPhoto;
  return (
    text(p.id, 200) &&
    text(p.buildingId, 200) &&
    (!p.entranceId || text(p.entranceId, 200)) &&
    [p.caption, p.alt, p.author, p.attribution, p.modifications].every((s) =>
      text(s),
    ) &&
    https(p.sourceUrl) &&
    https(p.licenseUrl) &&
    photoLicenses.includes(p.license) &&
    date(p.checkedAt) &&
    (!p.capturedAt || date(p.capturedAt)) &&
    (p.historical === undefined || typeof p.historical === 'boolean') &&
    /^[a-f0-9]{64}$/.test(p.sha256) &&
    p.url === `/packages/photos/${p.sha256}.webp` &&
    Number.isInteger(p.bytes) &&
    p.bytes > 0 &&
    p.bytes <= PHOTO_MAX_BYTES &&
    Number.isInteger(p.width) &&
    Number.isInteger(p.height) &&
    p.width > 0 &&
    p.height > 0 &&
    Math.max(p.width, p.height) <= 1600
  );
}
/** Whitelist public fields; originals, upload paths and reviewer identities never enter downloads. */
export function publicPhoto(p: CampusPhoto): CampusPhoto {
  const keys = [
    'id',
    'buildingId',
    'entranceId',
    'caption',
    'alt',
    'author',
    'sourceUrl',
    'license',
    'licenseUrl',
    'attribution',
    'modifications',
    'capturedAt',
    'checkedAt',
    'historical',
    'width',
    'height',
    'url',
    'sha256',
    'bytes',
  ] as const;
  return Object.fromEntries(
    keys.filter((k) => p[k] !== undefined).map((k) => [k, p[k]]),
  ) as unknown as CampusPhoto;
}
export function arrivalIssues(data: CampusData): string[] {
  const issues: string[] = [],
    ids = new Set<string>();
  if (data.photos !== undefined && !Array.isArray(data.photos))
    return ['Invalid photo catalogue.'];
  const buildings = new Set(
    data.map.features
      .filter((f) => f.properties?.kind === 'building')
      .map((f) => canonicalBuildingId(data, String(f.properties?.id))),
  );
  for (const p of data.photos || []) {
    if (!validPhoto(p)) {
      issues.push('Invalid photograph or missing redistribution evidence.');
      continue;
    }
    if (ids.has(p.id)) issues.push(`Duplicate photo identity: ${p.id}.`);
    ids.add(p.id);
    if (!buildings.has(canonicalBuildingId(data, p.buildingId)))
      issues.push(`${p.id}: building is missing.`);
    if (p.entranceId) {
      const e = data.entrances?.find((e) => e.id === p.entranceId);
      const b =
        e?.buildingId ||
        (e && data.places.find((place) => place.id === e.placeId)?.buildingId);
      if (
        !e ||
        !b ||
        canonicalBuildingId(data, b) !== canonicalBuildingId(data, p.buildingId)
      )
        issues.push(
          `${p.id}: entrance does not belong to the pictured building.`,
        );
    }
  }
  for (const e of [...data.places, ...(data.entrances || [])]) {
    issues.push(...guideErrors(e.arrival).map((s) => `${e.id}: ${s}`));
    for (const id of e.arrival?.photoIds || []) {
      const p = data.photos?.find((photo) => photo.id === id);
      const buildingId =
        'placeId' in e
          ? e.buildingId ||
            data.places.find((place) => place.id === e.placeId)?.buildingId
          : placeBuildingId(data, e);
      if (
        !p ||
        !buildingId ||
        canonicalBuildingId(data, buildingId) !==
          canonicalBuildingId(data, p.buildingId) ||
        (p.entranceId && p.entranceId !== e.id)
      )
        issues.push(`${e.id}: photograph ${id} does not match this guide.`);
    }
  }
  return issues;
}
