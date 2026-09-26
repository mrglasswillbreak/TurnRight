import {
  validSurfaceText,
  textRecipe,
  roofTextErrors,
} from './surface-text.js';
import type { Feature } from 'geojson';
import type { FacadeDescription, FacadeTextureRecipe } from './visual-types.js';
import type { CampusData, CampusPhoto } from './types.js';
import type { ValidationIssue } from './validation.js';
import { buildingTopology, polygonsOf } from './building-surfaces.js';
import { curvedWall } from './building-curves.js';
import { modelDocumentRevision } from './model-document-revision.js';

export function detailRevision(feature: Feature): string | undefined {
  const appearance = feature.properties?.appearance || {};
  const value = appearance.facades;
  const settings = [
    appearance.windowFrameDepth,
    appearance.windowWidthRatio,
    appearance.windowHeightRatio,
  ];
  // Preserve published fingerprints when the new optional text field is absent.
  // Otherwise even an unchanged legacy model is rejected as an outdated draft.
  if (appearance.roofTexts !== undefined)
    settings.unshift(appearance.roofTexts);
  if (
    (!value || !Object.keys(value).length) &&
    settings.every((v) => v === undefined)
  )
    return;
  const input = JSON.stringify([
    value &&
      Object.fromEntries(
        Object.entries(value).map(([id, f]) => {
          const v = f as FacadeDescription;
          return [
            id,
            {
              partId: v.partId,
              wallId: v.wallId,
              wallCoordinates: v.wallCoordinates,
              needsReview: v.needsReview,
              elements: v.elements,
              texture: v.texture,
            },
          ];
        }),
      ),
    settings,
  ]);
  let a = 2166136261,
    b = 2246822519;
  for (let i = 0; i < input.length; i++) {
    a = Math.imul(a ^ input.charCodeAt(i), 16777619);
    b = Math.imul(b ^ input.charCodeAt(i), 3266489917);
  }
  return `${(a >>> 0).toString(16)}${(b >>> 0).toString(16)}-${input.length}`;
}
export function textureKey(recipe: FacadeTextureRecipe) {
  return JSON.stringify([recipe.photoId, recipe.corners]);
}
export function facadeWalls(feature: Feature) {
  const polygons = polygonsOf(feature.geometry);
  return buildingTopology(feature).parts.flatMap((part, p) =>
    part.rings.flatMap((ring, r) =>
      ring.wallIds.flatMap((wallId, w) => {
        const curve = curvedWall(feature, wallId);
        if (curve && curve.wallIds[0] !== wallId) return [];
        return [
          {
            partId: part.id,
            wallId,
            label: `Wing ${p + 1} · ${r ? 'courtyard ' : ''}${curve ? 'curved ' : ''}wall ${w + 1}`,
            coordinates: (curve
              ? curve.vertexIds.map(
                  (id) => polygons[p][r][ring.vertexIds.indexOf(id)],
                )
              : [polygons[p][r][w], polygons[p][r][w + 1]]) as [
              number,
              number,
            ][],
          },
        ];
      }),
    ),
  );
}
export function facadeMatches(facade: FacadeDescription, feature: Feature) {
  const wall = facadeWalls(feature).find(
    (w) => w.wallId === facade.wallId && w.partId === facade.partId,
  );
  return (
    !!wall &&
    JSON.stringify(wall.coordinates) === JSON.stringify(facade.wallCoordinates)
  );
}
/** Review is a release gate, not a draft-save error. Keep its targets available to the UI. */
export function facadeReviewIssues(feature: Feature): ValidationIssue[] {
  const facades = feature.properties?.appearance?.facades;
  if (!facades || typeof facades !== 'object' || Array.isArray(facades))
    return [];
  const walls = facadeWalls(feature);
  return Object.entries(facades).flatMap(([id, raw]) => {
    const f = raw as FacadeDescription;
    if (!f || f.wallId !== id) return [];
    const wall = walls.find((w) => w.wallId === id && w.partId === f.partId);
    const matches =
      !!wall &&
      JSON.stringify(wall.coordinates) === JSON.stringify(f.wallCoordinates);
    if (f.reviewedAt && !f.needsReview && matches) return [];
    const name =
      feature.properties?.name || feature.properties?.id || 'Unnamed building';
    return [
      {
        code: 'facade-review',
        phase: 'edits',
        severity: 'error',
        featureId: String(feature.properties?.id),
        featureKind: 'building',
        field: id,
        referenceIds: [f.partId, id],
        coordinates: wall?.coordinates[0],
        repair: 'review-model',
        message: `${name} · ${wall?.label || 'Removed or reassigned wall'}: ${!matches ? 'Confirm the wall match and review its detail placement' : f.needsReview ? 'Review detail placement after the building changed' : 'Review this wall’s details and evidence'} before building a release preview.`,
      } satisfies ValidationIssue,
    ];
  });
}
export function campusFacadeReviewIssues(data: CampusData): ValidationIssue[] {
  return data.map.features
    .filter((f) => f.properties?.kind === 'building')
    .flatMap((feature) => {
      const issues = facadeReviewIssues(feature),
        document = feature.properties?.modelDocument;
      if (
        document &&
        feature.properties?.reviewedModelRevision !==
          modelDocumentRevision(document)
      )
        issues.push({
          code: 'authored-model-review',
          phase: 'edits',
          severity: 'error',
          featureId: String(feature.properties?.id),
          featureKind: 'building',
          field: 'modelDocument',
          repair: 'review-model',
          message: `${feature.properties?.name || 'Building'}: Review authored geometry and materials in Mesh tools before building a release preview.`,
        });
      return issues;
    });
}
export function validTextureRecipe(value: FacadeTextureRecipe) {
  if (
    !value ||
    typeof value.photoId !== 'string' ||
    !value.photoId ||
    value.photoId.length > 240 ||
    !Array.isArray(value.corners) ||
    value.corners.length !== 4 ||
    value.corners.some(
      (p) =>
        !Array.isArray(p) ||
        p.length !== 2 ||
        p.some((n) => !Number.isFinite(n) || n < 0 || n > 1),
    )
  )
    return false;
  const signs = value.corners.map((a, i, r) => {
    const b = r[(i + 1) % 4],
      c = r[(i + 2) % 4];
    return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
  });
  return signs.every((n) => n > 0.00001);
}
export function facadeErrors(
  feature: Feature,
  photos?: CampusPhoto[],
  publication = false,
): string[] {
  const facades = feature.properties?.appearance?.facades;
  const textErrors = roofTextErrors(feature);
  if (facades === undefined) return textErrors;
  if (
    !facades ||
    typeof facades !== 'object' ||
    Array.isArray(facades) ||
    Object.keys(facades).length > 100
  )
    return ['Façades must contain at most 100 named wall assignments.'];
  const errors: string[] = [
    ...textErrors,
    ...(publication ? facadeReviewIssues(feature).map((i) => i.message) : []),
  ];
  for (const [id, raw] of Object.entries(facades)) {
    const f = raw as FacadeDescription;
    if (
      !f ||
      id !== f.wallId ||
      !Array.isArray(f.photoIds) ||
      (f.confidence === 'observed' && !f.photoIds.length) ||
      f.photoIds.length > 20 ||
      f.photoIds.some((p) => typeof p !== 'string') ||
      !['documented', 'observed', 'inferred'].includes(f.confidence) ||
      typeof f.notes !== 'string' ||
      f.notes.length > 2000 ||
      !Array.isArray(f.elements) ||
      f.elements.length > 100
    ) {
      errors.push(
        'Each façade needs its wall, confidence, and bounded detail list. Observed details need photographic evidence.',
      );
      continue;
    }
    if (f.confidence === 'documented' && !f.notes.trim())
      errors.push('Documented dimensions need measurement provenance.');
    if (
      photos &&
      f.photoIds.some(
        (id) =>
          !photos.some(
            (p) => p.id === id && p.buildingId === feature.properties?.id,
          ),
      )
    )
      errors.push('Façade photographs must belong to this building.');
    if (
      f.texture &&
      (!validTextureRecipe(f.texture) ||
        !f.photoIds.includes(f.texture.photoId))
    )
      errors.push(
        'Texture needs a supported photograph and a clockwise, convex crop.',
      );
    if (new Set(f.elements.map((e) => e?.id)).size !== f.elements.length)
      errors.push('Façade detail identities must be unique.');
    for (const e of f.elements)
      if (
        !e ||
        typeof e.id !== 'string' ||
        !e.id ||
        (e.flat !== undefined && typeof e.flat !== 'boolean') ||
        ![
          'window',
          'door',
          'column',
          'balcony',
          'canopy',
          'parapet',
          'trim',
          'text',
        ].includes(e.kind) ||
        (e.kind === 'text' && !validSurfaceText(textRecipe(e))) ||
        !/^#[a-f0-9]{6}$/i.test(e.colour) ||
        !Number.isFinite(e.x) ||
        e.x < 0 ||
        e.x > 1 ||
        !Number.isFinite(e.bottom) ||
        e.bottom < 0 ||
        e.bottom > 150 ||
        !Number.isFinite(e.width) ||
        e.width <= 0 ||
        e.width > 150 ||
        !Number.isFinite(e.height) ||
        e.height <= 0 ||
        e.height > 150 ||
        !Number.isFinite(e.depth) ||
        e.depth < 0 ||
        e.depth > 10 ||
        !Number.isInteger(e.count) ||
        e.count < 1 ||
        e.count > 40 ||
        !Number.isFinite(e.spacing) ||
        e.spacing < 0 ||
        e.spacing > 1
      )
        errors.push(
          'Façade dimensions, placement, colour, or repetition are invalid.',
        );
  }
  return [...new Set(errors)];
}

/** Project the unit square into a convex source quadrilateral (no invented image content). */
export function projectTexture(
  corners: [number, number][],
  u: number,
  v: number,
): [number, number] {
  const [a, b, c, d] = corners,
    dx = b[0] - c[0],
    dy = b[1] - c[1],
    ex = d[0] - c[0],
    ey = d[1] - c[1];
  const sx = a[0] - b[0] + c[0] - d[0],
    sy = a[1] - b[1] + c[1] - d[1],
    den = dx * ey - ex * dy;
  const g = Math.abs(den) > 1e-12 ? (sx * ey - ex * sy) / den : 0;
  const h = Math.abs(den) > 1e-12 ? (dx * sy - sx * dy) / den : 0;
  const w = g * u + h * v + 1;
  return [
    ((b[0] - a[0] + g * b[0]) * u + (d[0] - a[0] + h * d[0]) * v + a[0]) / w,
    ((b[1] - a[1] + g * b[1]) * u + (d[1] - a[1] + h * d[1]) * v + a[1]) / w,
  ];
}
export function rectifyTexture(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  corners: [number, number][],
  size = 512,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const [u, v] = projectTexture(
        corners,
        (x + 0.5) / size,
        (y + 0.5) / size,
      );
      const sx = Math.max(0, Math.min(width - 1, u * width - 0.5)),
        sy = Math.max(0, Math.min(height - 1, v * height - 0.5));
      const x0 = Math.floor(sx),
        y0 = Math.floor(sy),
        fx = sx - x0,
        fy = sy - y0;
      for (let k = 0; k < 4; k++) {
        const a =
          pixels[(y0 * width + x0) * 4 + k] * (1 - fx) +
          pixels[(y0 * width + Math.min(width - 1, x0 + 1)) * 4 + k] * fx;
        const b =
          pixels[(Math.min(height - 1, y0 + 1) * width + x0) * 4 + k] *
            (1 - fx) +
          pixels[
            (Math.min(height - 1, y0 + 1) * width +
              Math.min(width - 1, x0 + 1)) *
              4 +
              k
          ] *
            fx;
        out[(y * size + x) * 4 + k] = Math.round(a * (1 - fy) + b * fy);
      }
    }
  return out;
}
