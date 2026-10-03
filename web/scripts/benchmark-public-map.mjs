// Sequential laboratory measurements; no credentials, private APIs or production writes.
// node scripts/benchmark-public-map.mjs BUILD_DIR PACKAGE_DIR OUTPUT_JSON [TRIALS]
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
const [buildArg, packagesArg, output, trialsArg = '3'] = process.argv.slice(2);
if (!buildArg || !packagesArg || !output) throw Error('Provide build directory, package directory and output JSON');
const build = path.resolve(buildArg), packages = path.resolve(packagesArg);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const root = url.pathname.startsWith('/packages/') ? packages : build;
    const relative = root === packages ? url.pathname.slice('/packages/'.length) : url.pathname.slice(1) || 'index.html';
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) throw Error('Outside fixture');
    const bytes = await fs.readFile(file);
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(bytes);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const directory = JSON.parse(await fs.readFile(path.join(packages, 'campuses.json'), 'utf8'));
const report = { checkedAt: new Date().toISOString(), runtime: process.version, build, packages, softwareWebGL: true, network: 'localhost, no artificial network throttle, fresh context per trial', samples: [] };
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
try {
  for (const profile of [{ name: 'desktop', width: 1440, height: 1000, cpu: 1 }, { name: 'phone-4x-cpu', width: 390, height: 844, cpu: 4 }]) {
    for (const slug of ['lasu', 'unilag']) {
      const entry = directory.campuses.find((c) => c.slug === slug);
      const manifest = JSON.parse(await fs.readFile(path.join(packages, entry.manifestUrl.replace('/packages/', '')), 'utf8'));
      const core = await fs.readFile(path.join(packages, manifest.dataUrl.replace('/packages/', '')));
      for (let trial = 1; trial <= Number(trialsArg); trial++) {
        const context = await browser.newContext({ viewport: profile, serviceWorkers: 'block', reducedMotion: 'reduce' });
        const page = await context.newPage(), errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
        await cdp.send('Performance.enable');
        await page.addInitScript(() => {
          localStorage.setItem('turnright:world-animation', JSON.stringify({ rotation: false, clouds: false }));
          window.auditLongTasks = [];
          new PerformanceObserver((list) => window.auditLongTasks.push(...list.getEntries().map((e) => ({ start: e.startTime, duration: e.duration })))).observe({ type: 'longtask', buffered: true });
        });
        await page.goto(`${origin}/?campus=${slug}`);
        await page.waitForFunction(() => {
          const el = document.querySelector('.map-canvas');
          let fiber = el?.[Object.keys(el).find((k) => k.startsWith('__reactFiber'))];
          while (fiber) {
            let hook = fiber.memoizedState;
            while (hook) {
              const map = hook.memoizedState?.current;
              if (map?.getCanvas && map?.project) {
                window.auditMap = map;
                if (map.loaded() && map.getSource('published-campuses') && map.queryRenderedFeatures().length) {
                  window.auditReady = performance.now(); return true;
                }
              }
              hook = hook.next;
            }
            fiber = fiber.return;
          }
          return false;
        }, null, { timeout: 120000 });
        const sample = await page.evaluate(async () => ({
          readyMs: window.auditReady,
          longTasks: window.auditLongTasks.filter((t) => t.start < window.auditReady),
          roadFeatures: (await window.auditMap.getSource('road-display').getData()).features.length,
          campusFeatures: (await window.auditMap.getSource('campus').getData()).features.length,
          renderedFeatures: window.auditMap.queryRenderedFeatures().length,
          resources: performance.getEntriesByType('resource').reduce((n, r) => n + r.transferSize, 0),
        }));
        const metrics = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
        report.samples.push({ profile: profile.name, slug, trial, version: manifest.version, coreHash: createHash('sha256').update(core).digest('hex'), ...sample, jsHeapBytes: metrics.JSHeapUsedSize, errors });
        await fs.writeFile(output, JSON.stringify(report, null, 2));
        console.log(`${profile.name} ${slug} ${trial}: ${Math.round(sample.readyMs)} ms, ${sample.longTasks.length} long tasks`);
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
}
