import type { CampusData } from './types';
import type { BuildingModel } from './visual-types';
import { validBuildingModel } from './building-visuals';
import { decodeModelAsset } from './model-detail-asset';

/** Integrity hashes are checked by the installer; also validate decoded detail dependencies. */
export async function verifyOfflineModels(
  data: CampusData,
  cache: Pick<Cache, 'match'>,
  signal?: AbortSignal,
) {
  const images = new Map<
    string,
    { width: number; height: number; contentType: string }
  >();
  for (const model of data.visuals?.detailedModels || []) {
    for (const level of model.levels) {
      let triangles = 0;
      const instances = new Map<string, Set<string>>();
      for (const asset of level.assets) {
        signal?.throwIfAborted();
        const response = await cache.match(asset.url);
        if (!response)
          throw new Error('A detailed model is missing from the download.');
        const part = JSON.parse(
          new TextDecoder().decode(
            await decodeModelAsset(await response.arrayBuffer(), asset),
          ),
        ) as BuildingModel;
        if (
          !validBuildingModel(part) ||
          part.id !== model.id ||
          part.geometryRevision !== model.geometryRevision ||
          part.detailRevision !== model.detailRevision ||
          part.origin.some((n, i) => n !== model.origin[i])
        )
          throw new Error('A detailed model does not match its catalogue.');
        triangles += part.meshes.reduce(
          (n, mesh) => n + mesh.indices.length / 3,
          0,
        );
        for (const mesh of part.meshes)
          for (const [slot, url] of Object.entries(mesh.material?.maps || {})) {
            const texture = model.textures.find((t) => t.url === url);
            if (!texture)
              throw new Error(
                'A detailed model texture is absent from its catalogue.',
              );
            if (!instances.has(url)) instances.set(url, new Set());
            const entries = instances.get(url)!;
            entries.add(
              JSON.stringify([
                mesh.material?.textureSettings?.[slot as 'baseMap'],
                slot === 'baseMap' || slot === 'emissiveMap',
              ]),
            );
            if (entries.size > (texture.instances || 1))
              throw new Error('Detailed texture memory is understated.');
          }
      }
      if (triangles !== level.triangles)
        throw new Error('Detailed geometry complexity is understated.');
    }
    for (const texture of model.textures) {
      signal?.throwIfAborted();
      let image = images.get(texture.url);
      if (!image) {
        const response = await cache.match(texture.url);
        if (!response)
          throw new Error('A detailed texture is missing from the download.');
        const bitmap = await createImageBitmap(await response.blob());
        try {
          image = {
            width: bitmap.width,
            height: bitmap.height,
            contentType: texture.contentType,
          };
        } finally {
          bitmap.close();
        }
        images.set(texture.url, image);
      }
      if (
        image.width !== texture.width ||
        image.height !== texture.height ||
        image.contentType !== texture.contentType
      )
        throw new Error(
          'A detailed texture does not match its catalogue dimensions or format.',
        );
    }
  }
  signal?.throwIfAborted();
}
