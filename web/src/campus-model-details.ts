import { Group, type Scene } from 'three';
import type { Map as CampusMap } from 'maplibre-gl';
import type { BuildingModel } from './visual-types';
import type {
  DetailedBuildingModel,
  DetailedModelLevel,
} from './model-lod-types';
import { DETAIL_MODEL_LIMITS } from './model-lod-types';
import {
  chooseModelLod,
  detailedResidentBytes,
  validDetailedModel,
} from './model-lod';
import { validBuildingModel } from './building-visuals';
import { ASSET_CACHE, hashBytes } from './offline';
import { modelAssetRequest } from './model-asset-requests';
import { decodeModelAsset } from './model-detail-asset';

/** Per-building streaming shares the map scene, picking and material lifetime. */
export function createCampusModelDetails(options: {
  map: CampusMap;
  scene: Scene;
  building: (
    model: BuildingModel,
    textures?: DetailedBuildingModel['textures'],
  ) => Group;
  release: (group: Group) => void;
  changed: () => void;
}) {
  const groups = new Map<string, Group>();
  const active = new Map<
    string,
    { key: string; bytes: number; controller: AbortController }
  >();
  const failures = new Map<string, number>();
  let disposed = false;
  const keyFor = (model: DetailedBuildingModel, level: DetailedModelLevel) =>
    `${model.id}:${model.geometryRevision}:${model.detailRevision || ''}:${model.origin.join(',')}:${level.assets.map((a) => a.sha256).join(':')}`;
  const remove = (id: string) => {
    active.get(id)?.controller.abort();
    active.delete(id);
    const group = groups.get(id);
    if (group) options.release(group);
    groups.delete(id);
  };
  async function load(
    model: DetailedBuildingModel,
    level: DetailedModelLevel,
    key: string,
    controller: AbortController,
  ) {
    const root = new Group();
    root.userData.buildingId = model.id;
    root.userData.revision = `${model.geometryRevision}:${model.detailRevision || ''}`;
    try {
      const cache = await caches.open(ASSET_CACHE).catch(() => null);
      let triangles = 0;
      const textureInstances = new Map<string, Set<string>>();
      for (const asset of level.assets) {
        const part = await modelAssetRequest(async () => {
          controller.signal.throwIfAborted();
          const response =
            (await cache?.match(asset.url)) ||
            (await fetch(asset.url, {
              signal: AbortSignal.any([
                controller.signal,
                AbortSignal.timeout(20000),
              ]),
            }));
          if (!response.ok) throw new Error('Detailed model unavailable.');
          const bytes = await response.arrayBuffer();
          if (
            bytes.byteLength !== asset.bytes ||
            (await hashBytes(bytes)) !== asset.sha256
          )
            throw new Error('Detailed model integrity check failed.');
          const result = JSON.parse(
            new TextDecoder().decode(await decodeModelAsset(bytes, asset)),
          ) as BuildingModel;
          if (
            !validBuildingModel(result) ||
            result.id !== model.id ||
            result.geometryRevision !== model.geometryRevision ||
            result.detailRevision !== model.detailRevision ||
            result.origin.some((n, i) => n !== model.origin[i]) ||
            result.meshes.some((m) =>
              Object.values(m.material?.maps || {}).some(
                (url) => !model.textures.some((t) => t.url === url),
              ),
            )
          )
            throw new Error('Detailed model identity or texture mismatch.');
          triangles += result.meshes.reduce(
            (n, m) => n + m.indices.length / 3,
            0,
          );
          if (triangles > level.triangles)
            throw new Error('Detailed model complexity mismatch.');
          for (const mesh of result.meshes)
            for (const [slot, url] of Object.entries(
              mesh.material?.maps || {},
            )) {
              if (!textureInstances.has(url))
                textureInstances.set(url, new Set());
              const instances = textureInstances.get(url)!;
              instances.add(
                JSON.stringify([
                  mesh.material?.textureSettings?.[slot as 'baseMap'],
                  slot === 'baseMap' || slot === 'emissiveMap',
                ]),
              );
              if (
                instances.size >
                (model.textures.find((t) => t.url === url)!.instances || 1)
              )
                throw new Error('Texture complexity mismatch.');
            }
          return result;
        });
        controller.signal.throwIfAborted();
        root.add(options.building(part, model.textures));
      }
      if (triangles !== level.triangles)
        throw new Error('Detailed model complexity mismatch.');
      // Keep the compatible base visible until every referenced texture is verified.
      await new Promise<void>((resolve, reject) => {
        const abort = () => reject(new DOMException('Aborted', 'AbortError'));
        controller.signal.addEventListener('abort', abort, { once: true });
        if (controller.signal.aborted) abort();
        void Promise.all(
          root.children.map((child) => child.userData.ready ?? true),
        )
          .then(
            (results) =>
              results.every(Boolean)
                ? resolve()
                : reject(new Error('Detailed texture unavailable.')),
            reject,
          )
          .finally(() => controller.signal.removeEventListener('abort', abort));
      });
      if (
        disposed ||
        controller.signal.aborted ||
        active.get(model.id)?.key !== key
      )
        throw new Error('Superseded model.');
      groups.set(model.id, root);
      options.scene.add(root);
      failures.delete(key);
    } catch {
      options.release(root);
      if (active.get(model.id)?.controller === controller) {
        active.delete(model.id);
        if (!controller.signal.aborted) failures.set(key, Date.now());
      }
    } finally {
      if (!disposed) options.changed();
    }
  }
  return {
    groups,
    update(
      models: DetailedBuildingModel[],
      selected: string,
      reduced: boolean,
      baseBytes = 0,
    ) {
      if (disposed) return;
      const bounds = options.map.getBounds(),
        center = options.map.getCenter();
      const visible = models.filter(
        (m) =>
          validDetailedModel(m) &&
          m.bounds[0][0] <= bounds.getEast() &&
          m.bounds[1][0] >= bounds.getWest() &&
          m.bounds[0][1] <= bounds.getNorth() &&
          m.bounds[1][1] >= bounds.getSouth(),
      );
      visible.sort(
        (a, b) =>
          Number(b.id === selected) - Number(a.id === selected) ||
          Math.hypot(a.origin[0] - center.lng, a.origin[1] - center.lat) -
            Math.hypot(b.origin[0] - center.lng, b.origin[1] - center.lat),
      );
      const wanted = new Map<
        string,
        {
          model: DetailedBuildingModel;
          level: DetailedModelLevel;
          bytes: number;
          key: string;
        }
      >();
      let remaining = Math.max(
        0,
        DETAIL_MODEL_LIMITS.residentBytes - baseBytes,
      );
      for (const model of visible) {
        const at = options.map.project(model.origin),
          metre = options.map.project([
            model.origin[0] +
              1 / (111195 * Math.cos((model.origin[1] * Math.PI) / 180)),
            model.origin[1],
          ]),
          north = options.map.project([
            model.origin[0],
            model.origin[1] + 1 / 111195,
          ]);
        const desired = chooseModelLod(
          model,
          Math.max(
            Math.hypot(metre.x - at.x, metre.y - at.y),
            Math.hypot(north.x - at.x, north.y - at.y),
          ),
          reduced,
        );
        const level = model.levels.find(
          (l) =>
            l.level >= desired.level &&
            detailedResidentBytes(model, l) <= remaining,
        );
        if (!level) continue;
        const bytes = detailedResidentBytes(model, level),
          key = keyFor(model, level);
        remaining -= bytes;
        wanted.set(model.id, { model, level, bytes, key });
      }
      for (const [id, entry] of active)
        if (wanted.get(id)?.key !== entry.key) remove(id);
      // Retired asynchronous loads check their AbortSignal before constructing meshes.
      for (const [id, next] of wanted) {
        if (
          active.has(id) ||
          Date.now() - (failures.get(next.key) || 0) < 30000
        )
          continue;
        const controller = new AbortController();
        active.set(id, { key: next.key, bytes: next.bytes, controller });
        void load(next.model, next.level, next.key, controller);
      }
    },
    memoryBytes: () => [...active.values()].reduce((n, a) => n + a.bytes, 0),
    pendingCount: () => active.size - groups.size,
    dispose() {
      disposed = true;
      for (const id of active.keys()) remove(id);
    },
  };
}
