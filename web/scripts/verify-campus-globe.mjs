/** Public-only release check. Does not authenticate, publish data or touch owner drafts. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { chromium, webkit, expect } from '@playwright/test';
import { validCampusOutline } from '../src/campus-outline.mjs';

const origin = process.env.VERIFY_ORIGIN || 'https://turnright.vercel.app';
const output = path.resolve(process.env.VERIFY_OUTPUT || 'work/campus-globe-verification');
await fs.mkdir(output, { recursive: true });
const digest = (value) => createHash('sha256').update(value).digest('hex');
const get = async (url) => {
  const target = new URL(url, origin);
  assert.equal(target.origin, new URL(origin).origin);
  const response = await fetch(target, { cache: 'no-store', signal: AbortSignal.timeout(45000) });
  assert(response.ok, `${url}: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
};
const directory = JSON.parse(await get('/packages/campuses.json'));
const campuses = [];
for (const slug of ['lasu', 'unilag']) {
  const entry = directory.campuses.find((c) => c.slug === slug);
  assert(entry && validCampusOutline(entry.outline), `${slug}: valid published outline`);
  const manifest = JSON.parse(await get(entry.manifestUrl));
  const bytes = await get(manifest.dataUrl);
  const asset = manifest.assets.find((a) => a.url === manifest.dataUrl);
  assert.equal(digest(bytes), asset.sha256);
  assert.equal(bytes.length, asset.bytes);
  const data = JSON.parse(bytes);
  assert.deepEqual(entry.outline, { type: data.boundary.geometry.type, coordinates: data.boundary.geometry.coordinates });
  for (let i = 0; i < manifest.assets.length; i += 6) await Promise.all(manifest.assets.slice(i, i + 6).map(async (a) => {
    const content = await get(a.url);
    assert.equal(content.length, a.bytes, a.url);
    assert.equal(digest(content), a.sha256, a.url);
  }));
  campuses.push({ entry, manifest, data });
}
const report = { origin, checkedAt: new Date().toISOString(),
  campuses: campuses.map(({ entry, manifest, data }) => ({ slug: entry.slug, version: manifest.version,
    manifestHash: digest(JSON.stringify(manifest)), coreHash: manifest.assets.find((a) => a.url === manifest.dataUrl).sha256,
    graphHash: digest(JSON.stringify(data.graph)), outlineHash: digest(JSON.stringify(entry.outline)), assets: manifest.assets.length })),
  views: [], offline: [] };
const baselinePath = process.env.VERIFY_BASELINE;
if (baselinePath) {
  const baseline = JSON.parse(await fs.readFile(baselinePath, 'utf8'));
  for (const c of report.campuses) {
    const before = baseline.campuses.find((b) => b.slug === c.slug);
    assert(before, `${c.slug}: baseline`);
    for (const key of ['version', 'manifestHash', 'coreHash', 'graphHash']) assert.equal(c[key], before[key], `${c.slug}: unchanged ${key}`);
  }
}

async function attach(page) {
  await page.waitForFunction(() => {
    const element = document.querySelector('.map-canvas');
    const key = Object.keys(element || {}).find((k) => k.startsWith('__reactFiber'));
    let fiber = element && key ? element[key] : null;
    while (fiber) {
      let hook = fiber.memoizedState;
      while (hook) {
        const map = hook.memoizedState?.current;
        if (map?.getCanvas && map?.project) { window.globeMap = map; return map.loaded() && !!map.getSource('published-campuses'); }
        hook = hook.next;
      }
      fiber = fiber.return;
    }
    return false;
  }, null, { timeout: 90000 });
}
async function choose(page, campus, base) {
  await page.getByRole('button', { name: 'Choose a campus', exact: true }).click();
  await page.getByRole('button', { name: campus.entry.name, exact: true }).click();
  await expect(page).toHaveURL(`${base}/?campus=${campus.entry.slug}`, { timeout: 60000 });
  await page.waitForFunction(() => window.globeMap.getZoom() > 12 && !window.globeMap.isMoving() && window.globeMap.loaded(), null, { timeout: 90000 });
  assert(await page.evaluate(() => window.originalGlobeMap === window.globeMap), 'Map instance retained');
  assert.equal(await page.evaluate(() => localStorage.getItem('turnright:last-campus')), campus.entry.slug);
}
async function download(page) {
  const expand = page.getByRole('button', { name: 'Expand card', exact: true });
  if (await expand.isVisible()) await expand.click();
  await page.getByRole('button', { name: 'Offline', exact: true }).click();
  await page.getByRole('button', { name: 'Download campus map', exact: true }).click();
  await expect(page.getByText('Enhanced 3D ready offline · all model files verified')).toBeVisible({ timeout: 180000 });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
}
async function proxyOrigin() {
  // WebKit offline emulation can reject navigation before SW interception.
  // A stopped proxy provides an actual origin outage with unchanged served bytes.
  const server = createServer(async (req, res) => {
    try {
      const target = new URL(req.url, origin);
      assert.equal(target.origin, new URL(origin).origin);
      const response = await fetch(target, { signal: AbortSignal.timeout(45000) });
      const bytes = Buffer.from(await response.arrayBuffer());
      res.writeHead(response.status, { 'content-type': response.headers.get('content-type') || 'application/octet-stream' });
      res.end(bytes);
    } catch { res.writeHead(502); res.end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { base: `http://127.0.0.1:${server.address().port}`, stop: () => new Promise((resolve) => {
    if (!server.listening) return resolve();
    server.close(resolve); server.closeAllConnections();
  }) };
}
for (const [engine, launcher] of [['chromium', chromium], ['webkit', webkit]]) {
  if (process.env.VERIFY_ENGINE && process.env.VERIFY_ENGINE !== engine) continue;
  const browser = await launcher.launch({ headless: true, ...(engine === 'chromium' ? {
    args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
  } : {}) });
  let activePage, proxy;
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage(); activePage = page;
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => localStorage.setItem('turnright:world-animation', JSON.stringify({ rotation: false, clouds: false })));
    await page.goto(`${origin}/?campus=lasu`);
    await attach(page);
    await page.evaluate(() => { window.originalGlobeMap = window.globeMap; });
    for (const mobile of [false, true]) {
      await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
      const theme = mobile ? 'dark' : 'light';
      await page.emulateMedia({ colorScheme: theme });
      if (mobile) await page.getByRole('button', { name: 'Switch to 2D', exact: true }).click();
      for (const campus of [...campuses].reverse()) {
        await choose(page, campus, origin);
        const state = await page.evaluate(async () => ({ pitch: window.globeMap.getPitch(), bearing: window.globeMap.getBearing(),
          zoom: window.globeMap.getZoom(), boundary: await window.globeMap.getSource('boundary').getData(),
          overflow: document.documentElement.scrollWidth > innerWidth + 1 }));
        assert(!state.overflow);
        assert.equal(state.bearing, 0);
        assert.equal(state.pitch, mobile ? 0 : 45);
        assert.deepEqual(state.boundary.features[0].geometry, campus.data.boundary.geometry);
        const filename = `${engine}-${campus.entry.slug}-${mobile ? 'mobile' : 'desktop'}-${theme}-${mobile ? '2d' : '3d'}.png`;
        await page.screenshot({ path: path.join(output, filename) });
        report.views.push({ engine, campus: campus.entry.slug, mobile, theme, pitch: state.pitch, filename });
        // Both real silhouettes visible together; click and retain the same canvas.
        await page.evaluate((phone) => window.globeMap.jumpTo({ center: [3.297, 6.493], zoom: phone ? 10.25 : 10.8, pitch: 0 }), mobile);
        await page.waitForFunction(() => window.globeMap.loaded());
        await page.screenshot({ path: path.join(output, `${engine}-silhouettes-${theme}.png`) });
        const other = campuses.find((c) => c.entry.slug !== campus.entry.slug);
        const geometry = other.entry.outline;
        const point = (geometry.type === 'Polygon' ? geometry.coordinates[0][0] : geometry.coordinates[0][0][0]).slice(0, 2);
        await page.evaluate((center) => window.globeMap.jumpTo({ center, zoom: 11.3, pitch: 0 }), point);
        await page.waitForFunction(() => window.globeMap.loaded());
        const pixel = await page.evaluate((coordinate) => {
          const p = window.globeMap.project(coordinate), r = window.globeMap.getCanvas().getBoundingClientRect();
          return { x: p.x + r.left, y: p.y + r.top };
        }, point);
        await page.mouse.click(pixel.x, pixel.y);
        await expect(page).toHaveURL(`${origin}/?campus=${other.entry.slug}`, { timeout: 60000 });
        await page.waitForFunction(() => window.globeMap.getZoom() > 12 && !window.globeMap.isMoving() && window.globeMap.loaded(), null, { timeout: 90000 });
        assert(await page.evaluate(() => window.originalGlobeMap === window.globeMap));
      }
    }
    assert.deepEqual(errors, []);
    await context.close();
    if (process.env.VERIFY_SKIP_OFFLINE === 'true') continue;
    proxy = engine === 'webkit' ? await proxyOrigin() : null;
    const base = proxy?.base || origin;
    const offline = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const p = await offline.newPage(); activePage = p;
    await p.goto(`${base}/?campus=lasu`); await attach(p);
    await p.evaluate(() => { window.originalGlobeMap = window.globeMap; });
    await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 180000 });
    await download(p);
    await choose(p, campuses[1], base); await download(p);
    if (proxy) { await proxy.stop(); await assert.rejects(fetch(base, { signal: AbortSignal.timeout(5000) })); }
    else await offline.setOffline(true);
    for (const campus of campuses) await choose(p, campus, base);
    await p.goto(`${base}/`); await expect(p).toHaveURL(`${base}/?campus=unilag`);
    await attach(p);
    await expect(p.getByRole('textbox', { name: 'Search campus' })).toBeVisible();
    report.offline.push({ engine, campuses: campuses.map((c) => c.entry.slug), reopen: 'unilag', disruption: proxy ? 'origin-stopped' : 'browser-offline', passed: true });
    await offline.close();
    console.log(`${engine}: real boundaries, in-place switching, views and offline reopening passed`);
  } catch (error) {
    report.failure = { engine, message: error.message };
    await activePage?.screenshot({ path: path.join(output, `${engine}-failure.png`), timeout: 10000 }).catch(() => {});
    throw error;
  } finally {
    await proxy?.stop(); await browser.close();
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  }
}
