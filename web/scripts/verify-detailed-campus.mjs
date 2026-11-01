import assert from 'node:assert/strict';
import path from 'node:path';
import { validatePublishedManifest } from './published-assets.mjs';

/**
 * Reject a partial catalogue before the browser can mistake base massing for detail.
 * @param {string} [expectedModelIds] Optional JSON array supplied by the release verifier.
 */
export function inspectDetailedCampus(
  data,
  manifest,
  expectedModelIds = undefined,
) {
  const grouped = validatePublishedManifest(manifest);
  const models = data.visuals?.detailedModels || [];
  assert.equal(new Set(models.map((model) => model.id)).size, models.length);
  if (expectedModelIds !== undefined && expectedModelIds !== '') {
    const message =
      'Expected model IDs must be a nonempty JSON array of unique nonblank strings';
    assert.equal(typeof expectedModelIds, 'string', message);
    let expected;
    try {
      expected = JSON.parse(expectedModelIds);
    } catch {
      assert.fail(message);
    }
    assert(
      Array.isArray(expected) &&
        expected.length > 0 &&
        expected.every(
          (id) => typeof id === 'string' && id.length > 0 && id === id.trim(),
        ) &&
        new Set(expected).size === expected.length,
      message,
    );
    assert.deepEqual(
      models.map((model) => model.id).sort(),
      [...expected].sort(),
      'Published detailed model IDs do not match the requested release',
    );
  }
  assert.equal(
    grouped.size > 0,
    models.length > 0,
    'Detail group/catalogue mismatch',
  );
  const assets = new Map(manifest.assets.map((asset) => [asset.url, asset]));
  const referenced = new Set();
  for (const model of models) {
    const visual = data.visuals.buildings.find(
      (entry) => entry.id === model.id,
    );
    assert(visual, `Missing base visual: ${model.id}`);
    assert.equal(model.geometryRevision, visual.geometryRevision, model.id);
    assert.equal(model.detailRevision, visual.detailRevision, model.id);
    assert.deepEqual(
      model.levels.map((level) => level.level).sort(),
      [0, 1, 2],
      model.id,
    );
    for (const level of model.levels) {
      assert(
        level.triangles > 0 && level.assets.length > 0,
        `Empty detail: ${model.id}`,
      );
    }
    for (const asset of [
      ...model.levels.flatMap((level) => level.assets),
      ...model.textures,
    ]) {
      assert(grouped.has(asset.url), `Ungrouped detail asset: ${asset.url}`);
      const packaged = assets.get(asset.url);
      assert.equal(asset.sha256, packaged?.sha256, asset.url);
      assert.equal(asset.bytes, packaged?.bytes, asset.url);
      referenced.add(asset.url);
    }
  }
  assert.deepEqual(
    [...referenced].sort(),
    [...grouped].sort(),
    'Unreferenced detail assets',
  );
  return models;
}

/** Observe the production renderer, with the network already unavailable. */
export async function visitDetailedCampus(page, models, output, engine, slug) {
  if (!models.length) return [];
  const enable = page.getByRole('button', {
    name: 'Switch to 3D',
    exact: true,
  });
  if (await enable.isVisible()) await enable.click();
  await page.waitForFunction(
    () => {
      const element = document.querySelector('.map-canvas');
      const key = Object.keys(element || {}).find((name) =>
        name.startsWith('__reactFiber'),
      );
      let fiber = element && key ? element[key] : undefined;
      while (fiber) {
        let hook = fiber.memoizedState;
        while (hook) {
          const value = hook.memoizedState?.current;
          if (value?.statistics && value?.pick && value?.update) {
            window.campusVerifyModels = value;
            return true;
          }
          hook = hook.next;
        }
        fiber = fiber.return;
      }
      return false;
    },
    null,
    { timeout: 90000 },
  );
  const visits = [];
  for (const model of models) {
    await page.evaluate((origin) => {
      window.campusVerifyMap.jumpTo({
        center: origin,
        zoom: 18,
        pitch: 55,
        bearing: 25,
      });
    }, model.origin);
    await page.waitForFunction(
      (id) => {
        const stats = window.campusVerifyModels.statistics();
        return stats.detailIds.includes(id) && stats.drawCalls > 0;
      },
      model.id,
      { timeout: 90000 },
    );
    const state = await page.evaluate(
      async (model) => {
        const map = window.campusVerifyMap;
        await new Promise((resolve, reject) => {
          const rendered = () => {
            clearTimeout(timer);
            resolve();
          };
          const timer = setTimeout(() => {
            map.off('render', rendered);
            reject(new Error(`Offline detailed render timed out: ${model.id}`));
          }, 30000);
          map.once('render', rendered);
          map.triggerRepaint();
        });
        const renderer = window.campusVerifyModels;
        const centre = map.project(model.origin);
        let picked;
        for (const dx of [-40, 0, 40])
          for (const dy of [-60, -20, 20, 60]) {
            const hit = renderer.pick([centre.x + dx, centre.y + dy]);
            if (hit?.buildingId === model.id) picked = hit.buildingId;
          }
        const data = await map.getSource('campus').getData();
        const feature = data.features.find(
          (entry) => entry.properties?.id === model.id,
        );
        const polygons =
          feature?.geometry.type === 'Polygon'
            ? [feature.geometry.coordinates]
            : feature?.geometry.type === 'MultiPolygon'
              ? feature.geometry.coordinates
              : [];
        for (const polygon of polygons)
          for (const ring of polygon)
            for (let i = 0; i < ring.length - 1 && !picked; i++) {
              const a = ring[i],
                b = ring[i + 1];
              const point = map.project([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
              const hit = renderer.pick([point.x, point.y - 12]);
              if (hit?.buildingId === model.id) picked = hit.buildingId;
            }
        return { ...renderer.statistics(), picked };
      },
      { id: model.id, origin: model.origin },
    );
    assert(
      state.detailIds.includes(model.id),
      `Detailed geometry was released before inspection: ${model.id}`,
    );
    assert(
      Number.isFinite(state.drawCalls) && state.drawCalls > 0,
      `Detailed frame was not drawn: ${model.id}`,
    );
    assert.equal(
      state.picked,
      model.id,
      `Offline detailed building failed renderer hit testing: ${model.id}`,
    );
    assert(
      state.reservedDetailBytes <= 256 * 1024 * 1024,
      'Detail residency exceeded budget',
    );
    const name = `${engine}-${slug}-offline-detail-${model.id.replace(/[^a-z0-9-]/gi, '_')}.png`;
    await page.screenshot({ path: path.join(output, name) });
    visits.push({ id: model.id, ...state, screenshot: name });
    console.log(`${engine} ${slug}: offline detailed model ${model.id} passed`);
  }
  return visits;
}
