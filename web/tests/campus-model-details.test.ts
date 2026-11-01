import { afterEach, expect, it, vi } from 'vitest';
import { Group, Scene } from 'three';
import type { Map as CampusMap } from 'maplibre-gl';
import { createHash } from 'node:crypto';
import { createCampusModelDetails } from '../src/campus-model-details';
import { compileModelDocument } from '../src/model-document-compiler';
import { detailFixture } from './model-detail-fixture';

const owned: ReturnType<typeof createCampusModelDetails>[] = [];
afterEach(() => {
  for (const controller of owned.splice(0)) controller.dispose();
  vi.unstubAllGlobals();
});
function setup(count = 6) {
  const { descriptor, document } = detailFixture(),
    scene = new Scene();
  const bytes = new Map<string, string>();
  const models = Array.from({ length: count }, (_, i) => {
    const model = {
      ...descriptor,
      id: `building-${i}`,
      levels: [] as typeof descriptor.levels,
    };
    const payload = JSON.stringify({
      id: model.id,
      geometryRevision: model.geometryRevision,
      origin: model.origin,
      meshes: compileModelDocument(document, document.origin),
    });
    const sha256 = createHash('sha256').update(payload).digest('hex'),
      url = `/packages/detail-${sha256}.json`;
    bytes.set(url, payload);
    model.levels = descriptor.levels.map((l) => ({
      ...l,
      triangles: 36,
      geometryBytes: Buffer.byteLength(payload),
      assets: [{ url, sha256, bytes: Buffer.byteLength(payload) }],
    }));
    return model;
  });
  const map = {
    getBounds: () => ({
      getWest: () => 3.19,
      getEast: () => 3.21,
      getSouth: () => 6.45,
      getNorth: () => 6.47,
    }),
    getCenter: () => ({ lng: 3.2, lat: 6.46 }),
    project: ([x, y]: number[]) => ({ x: x * 2e6, y: y * 2e6 }),
  } as unknown as CampusMap;
  vi.stubGlobal('caches', {
    open: async () => ({ match: async () => undefined }),
  });
  const release = vi.fn((group: Group) => scene.remove(group)),
    building = vi.fn(() => new Group());
  const controller = createCampusModelDetails({
    map,
    scene,
    building,
    release,
    changed: vi.fn(),
  });
  owned.push(controller);
  return { controller, scene, release, building, models, bytes };
}
it('prioritizes selection, shares four request slots and cancels obsolete queued work', async () => {
  const { controller, models } = setup(8),
    requested: string[] = [];
  let running = 0,
    maximum = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (url: string, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          requested.push(url);
          running++;
          maximum = Math.max(maximum, running);
          options.signal!.addEventListener('abort', () => {
            running--;
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    ),
  );
  controller.update(models, models[7].id, false);
  await vi.waitFor(() => expect(requested).toHaveLength(4));
  expect(requested[0]).toBe(models[7].levels[0].assets[0].url);
  controller.update([], '', false);
  await vi.waitFor(() => expect(running).toBe(0));
  expect(maximum).toBe(4);
  expect(requested).toHaveLength(4);
  expect(controller.memoryBytes()).toBe(0);
  expect(controller.groups.size).toBe(0);
});
it('releases loaded buildings during navigation and rejects corrupt or stale assets', async () => {
  const { controller, models, bytes, scene, release, building } = setup(2);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => new Response(bytes.get(url))),
  );
  controller.update(models, '', false);
  await vi.waitFor(() => expect(controller.groups.size).toBe(2));
  expect(scene.children).toHaveLength(2);
  expect(building).toHaveBeenCalledTimes(2);
  controller.update([], '', false);
  expect(scene.children).toHaveLength(0);
  expect(release).toHaveBeenCalledTimes(2);
  expect(controller.memoryBytes()).toBe(0);
  const corrupt = { ...models[0], geometryRevision: 'stale' };
  controller.update([corrupt], '', false);
  await vi.waitFor(() => expect(controller.memoryBytes()).toBe(0));
  expect(controller.groups.size).toBe(0);
  vi.mocked(fetch).mockResolvedValue(new Response('corrupted bytes'));
  controller.update([models[1]], '', false);
  await vi.waitFor(() => expect(controller.memoryBytes()).toBe(0));
  expect(controller.groups.size).toBe(0);
});
it('does not reserve assets beyond the resident budget', () => {
  const { controller, models } = setup();
  vi.stubGlobal('fetch', vi.fn());
  controller.update(models, models[0].id, false, 256 * 1024 * 1024);
  expect(controller.memoryBytes()).toBe(0);
  expect(fetch).not.toHaveBeenCalled();
});
it('invalidates an active asset when its geographic anchor changes', async () => {
  const { controller, models, bytes, release } = setup(1);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => new Response(bytes.get(url))),
  );
  controller.update(models, '', false);
  await vi.waitFor(() => expect(controller.groups.size).toBe(1));
  const changed = {
    ...models[0],
    origin: [models[0].origin[0] + 0.000001, models[0].origin[1]] as [
      number,
      number,
    ],
  };
  controller.update([changed], '', false);
  expect(controller.groups.size).toBe(0);
  expect(release).toHaveBeenCalled();
  await vi.waitFor(() => expect(controller.memoryBytes()).toBe(0));
  expect(controller.groups.size).toBe(0);
});
