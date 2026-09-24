import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import { preservePublished } from './published-assets.mjs';

// Isolated production fixtures only: no owner authentication or production writes.
const work = 'work/model-benchmark',
  publicDir = path.resolve(work, 'public');
await fs.mkdir(work, { recursive: true });
const manifest = await preservePublished(
  publicDir,
  'https://turnright.vercel.app',
  true,
);
const bytes = await fs.readFile(path.join(publicDir, manifest.dataUrl));
const campus = JSON.parse(bytes);
const asset = manifest.assets.find((a) => a.url === manifest.dataUrl);
if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256)
  throw Error('Campus checksum mismatch');
const buildingId = campus.photos[0].buildingId;
const baseBuilding = campus.map.features.find(
  (f) => f.properties?.id === buildingId,
);
const existing = Object.values(
  baseBuilding.properties.appearance?.facades || {},
)[0];
const wallId = existing?.wallId || `${buildingId}:wall:0:0:0`;
const dense = structuredClone(campus),
  b = dense.map.features.find((f) => f.properties?.id === buildingId);
const coordinates =
  b.geometry.type === 'Polygon'
    ? b.geometry.coordinates[0]
    : b.geometry.coordinates[0][0];
b.properties.appearance = {
  ...b.properties.appearance,
  facades: {
    ...b.properties.appearance?.facades,
    [wallId]: {
      ...(existing || {}),
      wallId,
      partId: existing?.partId || `${buildingId}:wing:0`,
      wallCoordinates: existing?.wallCoordinates || coordinates.slice(0, 2),
      photoIds: [campus.photos[0].id],
      confidence: 'inferred',
      notes: 'Dense performance fixture; illustrative dimensions.',
      elements: Array.from({ length: 100 }, (_, i) => ({
        id: `fixture-${i}`,
        kind: 'window',
        x: 0.05 + (i % 10) * 0.1,
        bottom: 0.2 + Math.floor(i / 10) * 0.35,
        width: 0.35,
        height: 0.25,
        depth: 0.04,
        count: 1,
        spacing: 0,
        colour: '#557585',
      })),
    },
  },
};
const mime = {
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};
async function serve(root) {
  root = path.resolve(root);
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://local');
      if (url.pathname === '/fixture-campus.json') {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(url.searchParams.has('dense') ? dense : campus));
        return;
      }
      const dir = url.pathname.startsWith('/packages/') ? publicDir : root;
      const file = path.resolve(dir, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(dir + path.sep)) throw Error('path');
      res.setHeader(
        'content-type',
        mime[path.extname(file)] || 'application/octet-stream',
      );
      res.end(await fs.readFile(file));
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}
const baseline = await serve('work/model-baseline/web/work/performance-dist'),
  final = await serve('work/performance-dist');
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const runs = process.argv.includes('--final')
  ? JSON.parse(
      await fs.readFile('../docs/model-editor-performance.json', 'utf8'),
    ).runs.filter((r) => r.version === 'baseline')
  : [];
function quantile(values, q = 0.95) {
  const a = [...values].sort((a, b) => a - b);
  return a[Math.max(0, Math.ceil(a.length * q) - 1)] || 0;
}
try {
  for (const version of process.argv.includes('--final') ||
  process.argv.includes('--capture')
    ? ['final']
    : ['baseline', 'final'])
    for (const fixture of process.argv.includes('--smoke') ||
    process.argv.includes('--capture')
      ? ['published']
      : ['published', 'dense'])
      for (const rate of process.argv.includes('--smoke') ||
      process.argv.includes('--capture')
        ? [1]
        : [1, 4])
        for (
          let run = 1;
          run <=
          (process.argv.includes('--smoke') ||
          process.argv.includes('--capture')
            ? 1
            : 5);
          run++
        ) {
          const page = await browser.newPage({
              viewport: { width: 1440, height: 1000 },
            }),
            errors = [];
          page.setDefaultTimeout(45000);
          page.on('pageerror', (e) => errors.push(e.message));
          const cdp = await page.context().newCDPSession(page);
          await cdp.send('Emulation.setCPUThrottlingRate', { rate });
          if (fixture === 'dense')
            await page.route('**/fixture-campus.json', (r) =>
              r.fulfill({ json: dense }),
            );
          await page.addInitScript(() => {
            window.probe = {
              inputs: [],
              clicks: [],
              tasks: [],
              workers: 0,
              jobs: 0,
              maxActive: 0,
              active: 0,
              payloadBytes: 0,
              draws: 0,
              drawMs: [],
              buffers: 0,
              textures: 0,
            };
            const Original = window.Worker;
            window.Worker = class extends Original {
              constructor(...args) {
                super(...args);
                this.tracked = String(args[0]).includes('building-preview');
                this.busy = false;
                if (this.tracked) {
                  window.probe.workers++;
                  this.addEventListener('message', () => {
                    if (this.busy) {
                      window.probe.active--;
                      this.busy = false;
                    }
                  });
                }
              }
              postMessage(...args) {
                if (this.tracked) {
                  window.probe.jobs++;
                  window.probe.payloadBytes += JSON.stringify(args[0]).length;
                  if (!this.busy) window.probe.active++;
                  this.busy = true;
                  window.probe.maxActive = Math.max(
                    window.probe.maxActive,
                    window.probe.active,
                  );
                }
                return super.postMessage(...args);
              }
              terminate() {
                if (this.tracked) {
                  this.tracked = false;
                  window.probe.workers--;
                  if (this.busy) window.probe.active--;
                  this.busy = false;
                }
                return super.terminate();
              }
            };
            for (const name of [
              'WebGLRenderingContext',
              'WebGL2RenderingContext',
            ]) {
              const proto = window[name]?.prototype;
              if (!proto) continue;
              for (const [create, remove, key] of [
                ['createBuffer', 'deleteBuffer', 'buffers'],
                ['createTexture', 'deleteTexture', 'textures'],
              ]) {
                const live = new WeakSet(),
                  a = proto[create],
                  b = proto[remove];
                proto[create] = function (...args) {
                  const value = a.apply(this, args);
                  if (value) {
                    live.add(value);
                    window.probe[key]++;
                  }
                  return value;
                };
                proto[remove] = function (value) {
                  if (value && live.has(value)) {
                    live.delete(value);
                    window.probe[key]--;
                  }
                  return b.call(this, value);
                };
              }
              const draw = proto.drawElements;
              proto.drawElements = function (...args) {
                const start = performance.now();
                const v = draw.apply(this, args);
                window.probe.draws++;
                window.probe.drawMs.push(performance.now() - start);
                return v;
              };
            }
            for (const type of ['input', 'click'])
              document.addEventListener(
                type,
                () => {
                  if (!window.probe.measure) return;
                  const start = performance.now();
                  requestAnimationFrame(() =>
                    setTimeout(
                      () =>
                        window.probe[
                          type === 'input' ? 'inputs' : 'clicks'
                        ].push(performance.now() - start),
                      0,
                    ),
                  );
                },
                true,
              );
            new PerformanceObserver((list) => {
              if (window.probe.measure)
                window.probe.tasks.push(
                  ...list.getEntries().map((e) => e.duration),
                );
            }).observe({ type: 'longtask' });
          });
          const start = Date.now();
          await page.goto(
            `${version === 'baseline' ? baseline.url : final.url}/tests/models/index.html`,
          );
          await page.getByRole('button', { name: 'Open workspace' }).click();
          const dialog = page.getByRole('dialog');
          await dialog.getByLabel('Mapped wall').selectOption(wallId);
          if (version === 'final') {
            if (
              await dialog
                .getByRole('button', {
                  name: 'Preview editable layout',
                  exact: true,
                })
                .isVisible()
            ) {
              await dialog
                .getByRole('button', {
                  name: 'Preview editable layout',
                  exact: true,
                })
                .click();
              await dialog
                .getByRole('button', {
                  name: 'Use editable layout',
                  exact: true,
                })
                .click();
            }
            if ((await dialog.locator('.model-detail-item').count()) === 0)
              await dialog
                .getByRole('button', { name: 'Add window', exact: true })
                .click();
            await dialog
              .getByText('Evidence & wall review', { exact: true })
              .click();
          }
          const field = dialog.getByLabel(
            version === 'final'
              ? 'Evidence and measurement provenance'
              : 'Evidence and estimated dimensions',
          );
          await field.waitFor();
          await page.waitForFunction(() => window.probe.active === 0);
          const initial = await page.evaluate(() => ({ ...window.probe }));
          await page.evaluate(() => {
            window.probe.measure = true;
          });
          await field.pressSequentially(' Measured input responsiveness.', {
            delay: 65,
          });
          await page.waitForFunction(() => window.probe.inputs.length >= 31);
          const typingJobs = await page.evaluate(
            (n) => window.probe.jobs - n,
            initial.jobs,
          );
          if (version === 'final') {
            await field.press('Enter');
            await dialog.locator('.model-detail-item').first().click();
            for (let i = 0; i < 4; i++) {
              await dialog
                .locator('.model-detail-item')
                .nth(
                  Math.min(
                    i,
                    (await dialog.locator('.model-detail-item').count()) - 1,
                  ),
                )
                .click();
              await dialog
                .getByRole('button', { name: /^Review(?: \(\d+\))?$/ })
                .click();
              await dialog
                .getByRole('button', { name: 'Details', exact: true })
                .click();
            }
          } else {
            for (let i = 0; i < 4; i++)
              await dialog.getByLabel('Mapped wall').selectOption(wallId);
          }
          await page.waitForFunction(() => window.probe.active === 0);
          const stats = await page.evaluate(() => {
            window.probe.measure = false;
            return {
              ...window.probe,
              requests: performance.getEntriesByType('resource').length,
            };
          });
          if (
            version === 'final' &&
            fixture === 'published' &&
            rate === 1 &&
            run === 1
          ) {
            await fs.mkdir('../docs/assets/screenshots', { recursive: true });
            await page.screenshot({
              path: '../docs/assets/screenshots/unified-model-desktop-2026-09-24.png',
            });
            await page.setViewportSize({ width: 390, height: 844 });
            await dialog
              .getByRole('button', { name: 'Wall', exact: true })
              .click();
            await page.screenshot({
              path: '../docs/assets/screenshots/unified-model-mobile-2026-09-24.png',
            });
          }
          await dialog
            .getByRole('button', {
              name:
                version === 'final'
                  ? 'Close workspace'
                  : 'Close without applying',
              exact: true,
            })
            .click();
          const retained = await page.evaluate(() => ({
            workers: window.probe.workers,
            buffers: window.probe.buffers,
            textures: window.probe.textures,
            canvases: document.querySelectorAll('canvas').length,
          }));
          const result = {
            version,
            fixture,
            rate,
            run,
            openAndExerciseMs: Date.now() - start,
            inputP95: quantile(stats.inputs),
            clickP95: quantile(stats.clicks),
            typingJobs,
            initial: {
              workers: initial.workers,
              buffers: initial.buffers,
              textures: initial.textures,
            },
            ...stats,
            retained,
            errors,
          };
          runs.push(result);
          console.log(
            `${version} ${fixture} ${rate}x ${run}/5: input p95 ${result.inputP95.toFixed(1)}ms; typing jobs ${typingJobs}`,
          );
          await page.close();
        }
} finally {
  await browser.close();
  baseline.server.close();
  final.server.close();
  const summary = [];
  for (const version of ['baseline', 'final'])
    for (const fixture of ['published', 'dense'])
      for (const rate of [1, 4]) {
        const selected = runs.filter(
          (r) =>
            r.version === version && r.fixture === fixture && r.rate === rate,
        );
        summary.push({
          version,
          fixture,
          rate,
          trials: selected.length,
          inputP95: quantile(selected.flatMap((r) => r.inputs)),
          clickP95: quantile(selected.flatMap((r) => r.clicks)),
          typingJobs: selected.map((r) => r.typingJobs),
          maxLongTask: Math.max(0, ...selected.flatMap((r) => r.tasks)),
          retained: selected.map((r) => r.retained),
        });
      }
  if (!process.argv.includes('--capture'))
    await fs.writeFile(
      '../docs/model-editor-performance.json',
      JSON.stringify(
        {
          date: new Date().toISOString(),
          baselineCommit: '9bb1ef7',
          campus: manifest.version,
          campusSha256: asset.sha256,
          buildings: campus.map.features.filter(
            (f) => f.properties?.kind === 'building',
          ).length,
          places: campus.places.length,
          environment:
            'Windows Chromium headless, SwiftShader software GPU; desktop 1440x1000, 1x/4x CPU, no physical devices. Input/click capture to post-animation-frame task; network excluded. New fixture includes real EditorWorkspace and IndexedDB recovery, baseline has the former staged form.',
          summary,
          runs,
        },
        null,
        2,
      ),
    );
}
if (runs.some((r) => r.errors.length))
  throw Error('Browser errors in benchmark report');
if (
  runs
    .filter((r) => r.version === 'final')
    .some((r) => r.typingJobs !== 0 || r.retained.workers !== 1)
)
  throw Error('Typing rebuilt a model or preview worker was retained');
