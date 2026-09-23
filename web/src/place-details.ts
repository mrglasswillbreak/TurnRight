import type {
  CampusData,
  FieldEvidence,
  Place,
  PlaceDetails,
} from './types.js';
import { pathDisplay } from './map-classification.js';

export const detailFields = [
  'subtype',
  'address',
  'phone',
  'website',
  'openingHours',
  'businessStatus',
] as const;
export const searchKey = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replace(/[_-]/g, ' ');
const placeSearch = new WeakMap<Place, string>();
const streetSearch = new WeakMap<
  CampusData['map'],
  { feature: CampusData['map']['features'][number]; text: string }[]
>();
export function placeMatches(place: Place, query: string) {
  let text = placeSearch.get(place);
  if (text === undefined) {
    text = searchKey(
      [
        place.name,
        ...place.aliases,
        place.department,
        place.faculty,
        place.subtype,
        place.address,
      ]
        .filter(Boolean)
        .join(' '),
    );
    placeSearch.set(place, text);
  }
  return searchKey(query)
    .trim()
    .split(/\s+/)
    .every((word) => text.includes(word));
}
export function streetResults(data: CampusData | null, query: string) {
  if (!query.trim() || !data) return [];
  let entries = streetSearch.get(data.map);
  if (!entries) {
    entries = data.map.features
      .filter(
        (f) =>
          f.properties?.kind === 'path' &&
          f.geometry.type === 'LineString' &&
          pathDisplay(f.properties).streetLabel,
      )
      .map((feature) => ({
        feature,
        text: searchKey(
          [
            feature.properties!.name,
            ...(Array.isArray(feature.properties!.aliases)
              ? feature.properties!.aliases
              : []),
          ].join(' '),
        ),
      }));
    streetSearch.set(data.map, entries);
  }
  const key = searchKey(query).trim();
  return entries
    .filter((entry) => entry.text.includes(key))
    .map((entry) => entry.feature);
}
export function safeWebsite(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
export function detailErrors(value: Record<string, unknown>): string[] {
  const errors: string[] = [];
  for (const key of detailFields)
    if (
      value[key] !== undefined &&
      (typeof value[key] !== 'string' || String(value[key]).length > 2000)
    )
      errors.push(`${key}: use text of at most 2,000 characters.`);
  if (value.website && !safeWebsite(value.website))
    errors.push('Website must be an HTTP or HTTPS URL without credentials.');
  if (
    value.businessStatus &&
    !['operating', 'temporarily-closed', 'closed', 'unknown'].includes(
      String(value.businessStatus),
    )
  )
    errors.push('Choose a supported recorded business status.');
  if (
    value.detailCheckedAt &&
    !Number.isFinite(Date.parse(String(value.detailCheckedAt)))
  )
    errors.push('Record a valid date for the checked details.');
  if (
    value.evidence !== undefined &&
    (!value.evidence ||
      typeof value.evidence !== 'object' ||
      Array.isArray(value.evidence))
  )
    errors.push('Invalid field evidence.');
  else if (value.evidence) {
    for (const refs of Object.values(value.evidence))
      if (
        !Array.isArray(refs) ||
        refs.length > 20 ||
        refs.some(
          (ref) =>
            !ref ||
            typeof ref.sourceId !== 'string' ||
            !ref.sourceId ||
            typeof ref.recordId !== 'string' ||
            !ref.recordId ||
            !Number.isFinite(Date.parse(ref.checkedAt)) ||
            (ref.url && !safeWebsite(ref.url)) ||
            (ref.accuracyMetres !== undefined &&
              (!Number.isFinite(ref.accuracyMetres) || ref.accuracyMetres < 0)),
        )
      )
        errors.push(
          'Evidence needs a source, record identity and valid check date.',
        );
  }
  return errors;
}
/** Only public provenance; raw survey metadata and reviewer identities stay private. */
export function publicEvidence(value: unknown): FieldEvidence | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined;
  const result: FieldEvidence = {};
  for (const [field, refs] of Object.entries(value)) {
    if (
      ['__proto__', 'constructor', 'prototype'].includes(field) ||
      !Array.isArray(refs)
    )
      continue;
    result[field] = refs
      .filter(
        (ref) =>
          ref &&
          typeof ref.sourceId === 'string' &&
          typeof ref.recordId === 'string' &&
          typeof ref.checkedAt === 'string',
      )
      .map((ref) => ({
        sourceId: ref.sourceId,
        recordId: ref.recordId,
        checkedAt: ref.checkedAt,
        ...Object.fromEntries(
          Object.entries(ref).filter(([key]) =>
            [
              'url',
              'license',
              'release',
              'upstreamRecordId',
              'observedAt',
              'accuracyMetres',
            ].includes(key),
          ),
        ),
      }));
  }
  return result;
}
export function editedPlaceDetails(
  props: Record<string, unknown>,
  previous?: Place,
): PlaceDetails {
  const result: Record<string, unknown> = {};
  const incoming = publicEvidence(props.evidence);
  const evidence = publicEvidence(props.evidence ?? previous?.evidence) || {};
  for (const key of detailFields) {
    if (props[key] === undefined) continue;
    result[key] = props[key] || undefined;
    if (props[key] !== previous?.[key]) {
      if (
        incoming?.[key] &&
        JSON.stringify(incoming[key]) !==
          JSON.stringify(previous?.evidence?.[key])
      )
        continue;
      delete evidence[key];
      if (props[key] && props.detailCheckedAt)
        evidence[key] = [
          {
            sourceId: 'campus-review',
            recordId: String(props.detailSource || 'owner-record'),
            checkedAt: String(props.detailCheckedAt),
            ...(safeWebsite(props.detailSource)
              ? { url: safeWebsite(props.detailSource) }
              : {}),
          },
        ];
    }
  }
  return { ...result, evidence } as PlaceDetails;
}
