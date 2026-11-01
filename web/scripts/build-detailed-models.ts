import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import sharp from 'sharp';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import type { BuildingVisual, ModelMesh } from '../src/visual-types';
import type { DetailedBuildingModel, ModelLod } from '../src/model-lod-types';
import type { ModelDocument, ModelDetailTier } from '../src/model-document';
import { modelDocumentErrors } from '../src/model-document';
import { DETAIL_MODEL_LIMITS } from '../src/model-lod-types';
import { validDetailedModel } from '../src/model-lod';
import { createBuildingModel } from '../src/building-model';
import { modelLodError } from './model-lod-error';
import type { CampusPhoto } from '../src/types';

/** Keep face identities when a source mesh is split for bounded transfer and parsing. */
export function modelMeshChunk(
  source: ModelMesh,
  first: number,
  count: number,
): ModelMesh {
  const vertices = new Map<number, number>();
  const attributes = new Map<string, number>();
  const mesh: ModelMesh = {
    ...source,
    positions: [],
    indices: [],
    ...(source.normals ? { normals: [] } : {}),
    ...(source.uvs ? { uvs: [] } : {}),
    surfaces: [],
  };
  for (const old of source.indices.slice(first * 3, (first + count) * 3)) {
    let next = vertices.get(old);
    if (next === undefined) {
      const key = [
        ...source.positions.slice(old * 3, old * 3 + 3),
        ...(source.normals?.slice(old * 3, old * 3 + 3) || []),
        ...(source.uvs?.slice(old * 2, old * 2 + 2) || []),
      ].join(',');
      next = attributes.get(key);
      if (next === undefined) {
        next = attributes.size;
        attributes.set(key, next);
        mesh.positions.push(...source.positions.slice(old * 3, old * 3 + 3));
        mesh.normals?.push(...source.normals!.slice(old * 3, old * 3 + 3));
        mesh.uvs?.push(...source.uvs!.slice(old * 2, old * 2 + 2));
      }
      vertices.set(old, next);
    }
    mesh.indices.push(next);
  }
  mesh.surfaces = source.surfaces?.flatMap((s) => {
    const start = Math.max(first, s.start),
      end = Math.min(first + count, s.start + s.count);
    return end > start
      ? [{ ...s, start: start - first, count: end - start }]
      : [];
  });
  return mesh;
}

export async function buildDetailedModel(
  feature: Feature<Polygon | MultiPolygon>,
  visual: BuildingVisual,
  output: string,
  photos: CampusPhoto[] = [],
): Promise<DetailedBuildingModel | undefined> {
  const document = feature.properties?.modelDocument as
    | ModelDocument
    | undefined;
  if (!document?.objects.some((o) => o.detailTier !== undefined)) return;
  const errors = modelDocumentErrors(document);
  if (errors.length) throw new Error(errors.join(' '));
  const points =
    feature.geometry.type === 'Polygon'
      ? feature.geometry.coordinates.flat()
      : feature.geometry.coordinates.flat(2);
  const descriptor: DetailedBuildingModel = {
    version: 1,
    id: visual.id,
    geometryRevision: visual.geometryRevision,
    detailRevision: visual.detailRevision,
    origin: [0, 0],
    bounds: [
      [
        Math.min(...points.map((p) => p[0])),
        Math.min(...points.map((p) => p[1])),
      ],
      [
        Math.max(...points.map((p) => p[0])),
        Math.max(...points.map((p) => p[1])),
      ],
    ],
    levels: [],
    textures: [],
  };
  await fs.mkdir(output, { recursive: true });
  const hash = (bytes: Buffer) =>
    createHash('sha256').update(bytes).digest('hex');
  const textures = new Map<string, DetailedBuildingModel['textures'][number]>();
  const textureInstances = new Map<string, Set<string>>();
  const full = createBuildingModel(feature, visual);
  const k = (Math.PI / 180) * 6371008.8,
    longitude = k * Math.cos((full.origin[1] * Math.PI) / 180);
  descriptor.bounds = [
    [Infinity, Infinity],
    [-Infinity, -Infinity],
  ];
  for (const mesh of full.meshes)
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const point = [
        full.origin[0] + mesh.positions[i] / longitude,
        full.origin[1] + mesh.positions[i + 1] / k,
      ];
      for (let axis = 0; axis < 2; axis++) {
        descriptor.bounds[0][axis] = Math.min(
          descriptor.bounds[0][axis],
          point[axis],
        );
        descriptor.bounds[1][axis] = Math.max(
          descriptor.bounds[1][axis],
          point[axis],
        );
      }
    }
  for (const [index, detail] of (
    ['fine', 'facade', 'structure'] as ModelDetailTier[]
  ).entries()) {
    const model = createBuildingModel(feature, visual, { detail });
    descriptor.origin = model.origin;
    for (const mesh of model.meshes) {
      for (const [slot, url] of Object.entries(mesh.material?.maps || {})) {
        const match = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(url);
        if (!match)
          throw new Error(
            'Detailed textures must come from embedded model images.',
          );
        const bytes = Buffer.from(match[2], 'base64'),
          digest = hash(bytes);
        const metadata = await sharp(bytes).metadata();
        if (
          !bytes.length ||
          bytes.length > 4 * 1024 * 1024 ||
          !metadata.width ||
          !metadata.height ||
          metadata.width > 4096 ||
          metadata.height > 4096
        )
          throw new Error('Detailed texture exceeds its image limits.');
        const ext = match[1] === 'jpeg' ? 'jpg' : match[1],
          assetUrl = `/packages/model-texture-${digest}.${ext}`;
        const asset = {
          url: assetUrl,
          sha256: digest,
          bytes: bytes.length,
          width: metadata.width,
          height: metadata.height,
          contentType: `image/${match[1]}`,
        };
        if (!textureInstances.has(digest))
          textureInstances.set(digest, new Set());
        textureInstances
          .get(digest)!
          .add(
            JSON.stringify([
              mesh.material?.textureSettings?.[slot as 'baseMap'],
              slot === 'baseMap' || slot === 'emissiveMap',
            ]),
          );
        const credits = document.images
          .filter(
            (i) => i.evidence && hash(Buffer.from(i.data, 'base64')) === digest,
          )
          .map((image) => {
            const photo = photos.find(
              (p) =>
                p.id === image.evidence!.photoId && p.buildingId === visual.id,
            );
            if (
              !photo ||
              !photo.author ||
              !photo.attribution ||
              !photo.license ||
              !photo.licenseUrl.startsWith('https://')
            )
              throw new Error(
                'A photographic model texture needs its approved building photograph and credits.',
              );
            return {
              photoId: photo.id,
              author: photo.author,
              license: photo.license,
              licenseUrl: photo.licenseUrl,
              sourceUrl: photo.sourceUrl,
              attribution: photo.attribution,
              modifications: image.evidence!.modifications,
            };
          });
        if (!textures.has(digest)) {
          textures.set(digest, {
            ...asset,
            ...(credits.length ? { credits } : {}),
          });
          await fs.writeFile(path.join(output, path.basename(assetUrl)), bytes);
        }
        mesh.material!.maps![slot as 'baseMap'] = assetUrl;
      }
    }
    const assets = [];
    let triangles = 0;
    const chunks: ModelMesh[][] = [[]];
    let size = 0;
    for (const mesh of model.meshes) {
      const count = mesh.indices.length / 3;
      for (
        let first = 0;
        first < count;
        first += DETAIL_MODEL_LIMITS.chunkTriangles
      ) {
        const length = Math.min(
          DETAIL_MODEL_LIMITS.chunkTriangles,
          count - first,
        );
        if (
          size &&
          (size + length > DETAIL_MODEL_LIMITS.chunkTriangles ||
            chunks.at(-1)!.length >= 100)
        ) {
          chunks.push([]);
          size = 0;
        }
        chunks.at(-1)!.push(modelMeshChunk(mesh, first, length));
        size += length;
        triangles += length;
      }
    }
    const pending = chunks.filter((c) => c.length);
    while (pending.length) {
      const meshes = pending.shift()!;
      const decoded = Buffer.from(JSON.stringify({ ...model, meshes }));
      if (decoded.length > DETAIL_MODEL_LIMITS.assetBytes) {
        if (meshes.length > 1) {
          const middle = Math.ceil(meshes.length / 2);
          pending.unshift(meshes.slice(0, middle), meshes.slice(middle));
        } else {
          const count = meshes[0].indices.length / 3,
            middle = Math.ceil(count / 2);
          if (count < 2)
            throw new Error(
              'A single render triangle exceeds the asset limit.',
            );
          pending.unshift(
            [modelMeshChunk(meshes[0], 0, middle)],
            [modelMeshChunk(meshes[0], middle, count - middle)],
          );
        }
        continue;
      }
      const bytes = gzipSync(decoded, { level: 9 }),
        digest = hash(bytes);
      const asset = {
        url: `/packages/detail-${digest}.json.gz`,
        sha256: digest,
        bytes: bytes.length,
        encoding: 'gzip' as const,
        decodedBytes: decoded.length,
      };
      await fs.writeFile(path.join(output, path.basename(asset.url)), bytes);
      assets.push(asset);
    }
    descriptor.levels.push({
      level: index as ModelLod,
      geometricError: Math.max(
        descriptor.levels.at(-1)?.geometricError || 0,
        modelLodError(full.meshes, model.meshes),
      ),
      triangles,
      geometryBytes: assets.reduce((n, a) => n + a.decodedBytes, 0),
      assets,
    });
  }
  descriptor.textures = [...textures.values()];
  for (const texture of descriptor.textures)
    texture.instances = textureInstances.get(texture.sha256)!.size;
  if (!validDetailedModel(descriptor))
    throw new Error('The compiled detail descriptor exceeds supported bounds.');
  return descriptor;
}
