import type { CampusData, CampusPackage, PackageAsset } from './types.js';
import type {
  DetailedBuildingModel,
  DetailedModelLevel,
  DetailedModelAsset,
} from './model-lod-types.js';
import { DETAIL_MODEL_LIMITS } from './model-lod-types.js';

const assetValid = (a: DetailedModelAsset, texture = false) =>
  !!a &&
  (texture
    ? /^\/packages\/model-texture-[a-f0-9]{64}\.(png|jpg|webp)$/
    : /^\/packages\/detail-[a-f0-9]{64}\.json(?:\.gz)?$/
  ).test(a.url) &&
  Number.isSafeInteger(a.bytes) &&
  a.bytes > 0 &&
  a.bytes <= (texture ? 4 * 1024 * 1024 : DETAIL_MODEL_LIMITS.assetBytes) &&
  /^[a-f0-9]{64}$/.test(a.sha256) &&
  a.url.includes(a.sha256) &&
  (texture ||
    (a.encoding === undefined
      ? !a.url.endsWith('.gz') && a.decodedBytes === undefined
      : a.encoding === 'gzip' &&
        a.url.endsWith('.gz') &&
        Number.isSafeInteger(a.decodedBytes) &&
        a.decodedBytes! > 0 &&
        a.decodedBytes! <= DETAIL_MODEL_LIMITS.assetBytes));

export function validDetailedModel(value: DetailedBuildingModel): boolean {
  if (
    !value ||
    value.version !== 1 ||
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.geometryRevision !== 'string' ||
    !value.geometryRevision ||
    (value.detailRevision !== undefined &&
      typeof value.detailRevision !== 'string') ||
    !Array.isArray(value.origin) ||
    value.origin.length !== 2 ||
    !value.origin.every(Number.isFinite) ||
    Math.abs(value.origin[0]) > 180 ||
    Math.abs(value.origin[1]) > 85 ||
    !Array.isArray(value.bounds) ||
    value.bounds.length !== 2 ||
    value.bounds.some(
      (p) => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite),
    ) ||
    value.bounds[0].some((n, i) => n > value.bounds[1][i]) ||
    value.bounds.some((p) => Math.abs(p[0]) > 180 || Math.abs(p[1]) > 85) ||
    !Array.isArray(value.levels) ||
    value.levels.length !== 3 ||
    !Array.isArray(value.textures) ||
    value.textures.length > 32
  )
    return false;
  return (
    value.levels.every(
      (level, i) =>
        !!level &&
        level.level === i &&
        Number.isFinite(level.geometricError) &&
        level.geometricError >= 0 &&
        (!i
          ? level.geometricError === 0
          : level.geometricError >= value.levels[i - 1].geometricError) &&
        Number.isSafeInteger(level.triangles) &&
        level.triangles > 0 &&
        level.triangles <= 200000 &&
        Number.isSafeInteger(level.geometryBytes) &&
        level.geometryBytes > 0 &&
        Array.isArray(level.assets) &&
        level.assets.length > 0 &&
        level.assets.length <= 100 &&
        level.assets.every((a) => assetValid(a)) &&
        new Set(level.assets.map((a) => a.url)).size === level.assets.length &&
        level.geometryBytes ===
          level.assets.reduce((n, a) => n + (a.decodedBytes || a.bytes), 0),
    ) &&
    value.textures.every(
      (a) =>
        assetValid(a, true) &&
        ['image/png', 'image/jpeg', 'image/webp'].includes(a.contentType) &&
        Number.isSafeInteger(a.width) &&
        a.width > 0 &&
        a.width <= 4096 &&
        Number.isSafeInteger(a.height) &&
        a.height > 0 &&
        a.height <= 4096 &&
        (a.instances === undefined ||
          (Number.isSafeInteger(a.instances) &&
            a.instances > 0 &&
            a.instances <= 512)) &&
        (a.credits === undefined ||
          (Array.isArray(a.credits) &&
            a.credits.length <= 32 &&
            a.credits.every(
              (c) =>
                c &&
                [
                  c.photoId,
                  c.author,
                  c.license,
                  c.attribution,
                  c.modifications,
                ].every(
                  (s) => typeof s === 'string' && !!s && s.length <= 4000,
                ) &&
                typeof c.licenseUrl === 'string' &&
                c.licenseUrl.startsWith('https://') &&
                (c.sourceUrl === undefined ||
                  (typeof c.sourceUrl === 'string' &&
                    c.sourceUrl.startsWith('https://'))),
            ))),
    ) &&
    new Set(value.textures.map((a) => a.url)).size === value.textures.length
  );
}

export function detailedAssets(
  models: DetailedBuildingModel[],
): PackageAsset[] {
  const all = new Map<string, PackageAsset>();
  const textureMetadata = new Map<string, string>();
  for (const model of models) {
    if (!validDetailedModel(model))
      throw new Error('Invalid detailed building model.');
    for (const texture of model.textures) {
      const metadata = JSON.stringify([
        texture.width,
        texture.height,
        texture.contentType,
      ]);
      const prior = textureMetadata.get(texture.url);
      if (prior !== undefined && prior !== metadata)
        throw new Error('Conflicting detailed texture metadata.');
      textureMetadata.set(texture.url, metadata);
    }
    for (const asset of [
      ...model.levels.flatMap((l) => l.assets),
      ...model.textures,
    ]) {
      const previous = all.get(asset.url);
      if (
        previous &&
        (previous.sha256 !== asset.sha256 || previous.bytes !== asset.bytes)
      )
        throw new Error('Conflicting detailed asset identity.');
      all.set(asset.url, asset);
    }
  }
  return [...all.values()];
}

export function detailedManifestMatches(
  data: CampusData,
  manifest: CampusPackage,
): boolean {
  try {
    const models = data.visuals?.detailedModels || [],
      group = manifest.detailedModels;
    if (!models.length) return !group;
    if (!group || new Set(models.map((m) => m.id)).size !== models.length)
      return false;
    if (
      !models.every((m) =>
        data.visuals?.buildings.some(
          (v) =>
            v.id === m.id &&
            v.geometryRevision === m.geometryRevision &&
            v.detailRevision === m.detailRevision,
        ),
      )
    )
      return false;
    const assets = detailedAssets(models);
    if (
      !models.every((m) =>
        m.textures.every(
          (t) =>
            t.credits?.every((c) =>
              data.photos?.some(
                (p) =>
                  p.id === c.photoId &&
                  p.buildingId === m.id &&
                  p.author === c.author &&
                  p.license === c.license &&
                  p.licenseUrl === c.licenseUrl,
              ),
            ) ?? true,
        ),
      )
    )
      return false;
    return (
      group.assetUrls.length === assets.length &&
      new Set(group.assetUrls).size === assets.length &&
      group.bytes === assets.reduce((n, a) => n + a.bytes, 0) &&
      assets.every(
        (a) =>
          group.assetUrls.includes(a.url) &&
          manifest.assets.some(
            (b) =>
              b.url === a.url && b.bytes === a.bytes && b.sha256 === a.sha256,
          ),
      )
    );
  } catch {
    return false;
  }
}

/** Choose the coarsest geometry whose projected error is at most one CSS pixel. */
export function chooseModelLod(
  model: DetailedBuildingModel,
  pixelsPerMetre: number,
  reduced = false,
): DetailedModelLevel {
  const target = reduced ? 3 : 1;
  return (
    [...model.levels]
      .reverse()
      .find((l) => l.geometricError * pixelsPerMetre <= target) ||
    model.levels[0]
  );
}
export function detailedResidentBytes(
  model: DetailedBuildingModel,
  level: DetailedModelLevel,
) {
  // JSON source + GPU positions/normals/UVs/indices; textures include all mip levels.
  return (
    level.geometryBytes +
    level.triangles * (3 * 32 + 12) * 2 +
    model.textures.reduce(
      (n, t) =>
        n +
        (t.instances || 1) * Math.ceil(t.width * t.height * 4 * (1 + 4 / 3)),
      0,
    )
  );
}
