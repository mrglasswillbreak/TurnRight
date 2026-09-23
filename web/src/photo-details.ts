import { photoLicenses } from './arrival.js';
import type { CampusPhoto } from './types.js';

export const licenseLinks: Record<CampusPhoto['license'], string> = {
  'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'CC0 1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
  'Public domain': '',
};
export const photoDetailKeys = [
  'buildingId',
  'entranceId',
  'caption',
  'alt',
  'author',
  'sourceKind',
  'sourceUrl',
  'license',
  'licenseUrl',
  'attribution',
  'capturedAt',
  'checkedAt',
  'historical',
] as const;
export function photoDetails(value: unknown): Partial<CampusPhoto> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  return Object.fromEntries(
    photoDetailKeys
      .filter((k) => input[k] !== undefined)
      .map((k) => [k, input[k]]),
  );
}
export function samePhotoRights(
  a: Partial<CampusPhoto>,
  b: Partial<CampusPhoto>,
) {
  return (
    [
      'author',
      'sourceUrl',
      'sourceKind',
      'license',
      'licenseUrl',
      'attribution',
    ] as const
  ).every(
    (k) =>
      (a[k] || (k === 'sourceKind' ? 'external' : '')) ===
      (b[k] || (k === 'sourceKind' ? 'external' : '')),
  );
}
export function photoDetailErrors(
  p: Partial<CampusPhoto>,
): Partial<Record<keyof CampusPhoto, string>> {
  const errors: Partial<Record<keyof CampusPhoto, string>> = {};
  for (const [key, label] of [
    ['buildingId', 'Choose the pictured building'],
    ['caption', 'Add a caption'],
    ['alt', 'Describe what the image shows'],
    ['author', 'Add the public photographer credit'],
    ['attribution', 'Add the required attribution'],
  ] as const)
    if (typeof p[key] !== 'string' || !p[key]?.trim() || p[key]!.length > 2000)
      errors[key] = label;
  if (!photoLicenses.includes(p.license!))
    errors.license = 'Choose a verified reuse license';
  const url = (v?: string) => {
    try {
      const u = new URL(v || '');
      return u.protocol === 'https:' && !u.username && !u.password;
    } catch {
      return false;
    }
  };
  if (!(p.sourceKind === 'author-upload' && !p.sourceUrl) && !url(p.sourceUrl))
    errors.sourceUrl = 'Use the original HTTPS source page';
  if (!url(p.licenseUrl))
    errors.licenseUrl = 'Add the HTTPS license or public-domain evidence page';
  for (const key of ['checkedAt', 'capturedAt'] as const)
    if (
      (key === 'checkedAt' || p[key]) &&
      (!/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(p[key] || '') ||
        !Number.isFinite(Date.parse(p[key]!)))
    )
      errors[key] = 'Enter a valid date';
  return errors;
}
