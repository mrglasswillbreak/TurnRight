import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { tsImport } from 'tsx/esm/api';
import { gunzipSync } from 'node:zlib';

let validators;

/** Details are an additive manifest group; all of its assets are required offline. */
export async function packageDetailedModels(catalogue, directory, writeAsset) {
  if (!catalogue.detailedModels?.length) return undefined;
  validators ??= Promise.all([
    tsImport('../web/src/model-lod.ts', import.meta.url),
    tsImport('../web/src/building-visuals.ts', import.meta.url),
  ]);
  const [{ validDetailedModel, detailedAssets }, { validBuildingModel }] =
    await validators;
  const models = catalogue.detailedModels,
    assets = new Map(),
    ids = new Set();
  // A shared immutable image must have identical metadata in every building.
  // Sampler instance counts remain specific to each building's render levels.
  detailedAssets(models);
  for (const model of models) {
    if (
      !validDetailedModel(model) ||
      model.version !== 1 ||
      typeof model.id !== 'string' ||
      ids.has(model.id) ||
      !catalogue.buildings.some(
        (b) =>
          b.id === model.id &&
          b.geometryRevision === model.geometryRevision &&
          b.detailRevision === model.detailRevision,
      ) ||
      !Array.isArray(model.levels) ||
      model.levels.length !== 3 ||
      !Array.isArray(model.textures)
    )
      throw new Error('Invalid detailed model catalogue.');
    ids.add(model.id);
    const triangleCounts = new Map();
    for (const [index, level] of model.levels.entries()) {
      if (
        level.level !== index ||
        !Number.isFinite(level.geometricError) ||
        level.geometricError < 0 ||
        !Number.isSafeInteger(level.triangles) ||
        level.triangles < 1 ||
        level.triangles > 200000 ||
        !level.assets?.length ||
        level.assets.length > 100 ||
        new Set(level.assets.map((a) => a.url)).size !== level.assets.length ||
        level.geometryBytes !==
          level.assets.reduce((n, a) => n + (a.decodedBytes || a.bytes), 0)
      )
        throw new Error('Invalid detail level.');
    }
    for (const asset of [
      ...model.levels.flatMap((l) => l.assets),
      ...model.textures,
    ]) {
      const texture = asset.url?.startsWith('/packages/model-texture-');
      if (
        !(
          texture
            ? /^\/packages\/model-texture-[a-f0-9]{64}\.(png|jpg|webp)$/
            : /^\/packages\/detail-[a-f0-9]{64}\.json(?:\.gz)?$/
        ).test(asset.url) ||
        !/^[a-f0-9]{64}$/.test(asset.sha256) ||
        !asset.url.includes(asset.sha256) ||
        !Number.isSafeInteger(asset.bytes) ||
        asset.bytes < 1 ||
        asset.bytes > (texture ? 4 : 16) * 1024 * 1024
      )
        throw new Error('Invalid detailed asset.');
      const prior = assets.get(asset.url);
      if (prior) {
        if (prior.sha256 !== asset.sha256 || prior.bytes !== asset.bytes)
          throw new Error('Conflicting detailed asset.');
        if (texture) continue;
      }
      const bytes = await fs.readFile(
        path.join(directory, path.basename(asset.url)),
      );
      if (
        bytes.length !== asset.bytes ||
        createHash('sha256').update(bytes).digest('hex') !== asset.sha256
      )
        throw new Error('Detailed asset failed integrity verification.');
      if (!texture) {
        const decoded =
          asset.encoding === 'gzip'
            ? gunzipSync(bytes, { maxOutputLength: 16 * 1024 * 1024 })
            : bytes;
        if (decoded.length !== (asset.decodedBytes || asset.bytes))
          throw new Error('Detailed asset decoded size mismatch.');
        const payload = JSON.parse(decoded);
        if (
          !validBuildingModel(payload) ||
          payload.id !== model.id ||
          payload.geometryRevision !== model.geometryRevision ||
          payload.detailRevision !== model.detailRevision ||
          payload.origin.some((n, i) => n !== model.origin[i]) ||
          payload.meshes.some((m) =>
            Object.values(m.material?.maps || {}).some(
              (url) => !model.textures.some((t) => t.url === url),
            ),
          )
        )
          throw new Error('Detailed asset building mismatch.');
        triangleCounts.set(
          asset.url,
          payload.meshes.reduce((n, m) => n + m.indices.length / 3, 0),
        );
      } else {
        const image = await sharp(bytes).metadata();
        const contentType = `image/${image.format === 'jpg' ? 'jpeg' : image.format}`;
        if (
          image.width !== asset.width ||
          image.height !== asset.height ||
          contentType !== asset.contentType
        )
          throw new Error('Detailed texture dimensions or format mismatch.');
      }
      if (prior) continue;
      assets.set(asset.url, asset);
      await writeAsset(
        asset.url,
        bytes,
        texture
          ? asset.contentType
          : asset.encoding === 'gzip'
            ? 'application/gzip'
            : 'application/json',
      );
    }
    for (const level of model.levels)
      if (
        level.triangles !==
        level.assets.reduce((n, a) => n + triangleCounts.get(a.url), 0)
      )
        throw new Error('Detailed asset complexity mismatch.');
  }
  return {
    bytes: [...assets.values()].reduce((n, a) => n + a.bytes, 0),
    assetUrls: [...assets.keys()],
  };
}
