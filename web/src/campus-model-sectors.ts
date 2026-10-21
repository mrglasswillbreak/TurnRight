import { Group, Scene } from 'three';
import { type Map as CampusMap } from 'maplibre-gl';
import type { BuildingModel, SectorModels, VisualSector } from './visual-types';
import { hashBytes, ASSET_CACHE } from './offline';
export async function loadCampusModelSector(
  {
    inflight,
    loaded,
    failures,
    scene,
    building,
    release,
    refresh,
    map,
    isDisposed,
  }: {
    inflight: Map<string, AbortController>;
    loaded: Map<string, Group>;
    failures: Map<string, number>;
    scene: Scene;
    building: (model: BuildingModel) => Group;
    release: (group: Group) => void;
    refresh: () => void;
    map: CampusMap;
    isDisposed: () => boolean;
  },
  sector: VisualSector,
): Promise<void> {
  const controller = new AbortController();
  inflight.set(sector.id, controller);
  let group: Group | undefined;
  try {
    if (
      !/^\/packages\/visual-[a-f0-9]+\/[a-z0-9-]+\.json$/.test(sector.url) ||
      sector.bytes > 12 * 1024 * 1024
    )
      throw new Error('Invalid visual sector.');
    const cache = await caches.open(ASSET_CACHE).catch(() => null);
    const response =
      (await cache?.match(sector.url)) ||
      (await fetch(sector.url, {
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(15000),
        ]),
      }));
    if (!response.ok) throw new Error('Model unavailable');
    const bytes = await response.arrayBuffer();
    if (
      bytes.byteLength !== sector.bytes ||
      (await hashBytes(bytes)) !== sector.sha256
    )
      throw new Error('Model integrity check failed');
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as SectorModels;
    if (
      payload.schemaVersion !== 1 ||
      payload.id !== sector.id ||
      !Array.isArray(payload.models) ||
      payload.models.length > 400
    )
      throw new Error('Invalid sector');
    if (isDisposed() || controller.signal.aborted) return;
    group = new Group();
    for (const model of payload.models) {
      if (!sector.buildingIds.includes(model.id))
        throw new Error('Unexpected building identity');
      group.add(building(model));
    }
    loaded.set(sector.id, group);
    scene.add(group);
    failures.delete(sector.id);
  } catch {
    if (group) release(group);
    if (!controller.signal.aborted) failures.set(sector.id, Date.now());
  } finally {
    inflight.delete(sector.id);
    if (!isDisposed()) {
      refresh();
      map.triggerRepaint();
    }
  }
}
