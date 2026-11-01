import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { archive, repository } from './inventory.mjs';
import type {} from './browser-campaign';
import { coverageSnapshot } from '../coverage-scope.mjs';

async function deadline<T>(operation: Promise<T>, milliseconds: number) {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Campaign initialization timed out.')),
          milliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

const current = JSON.parse(
  await fs.readFile(path.join(archive, 'integration', 'CURRENT.json'), 'utf8'),
);
const publicDir = path.resolve(current.directory, 'public');
const sourceSnapshot = await coverageSnapshot();
const server = await createServer({
  root: path.join(repository, 'web'),
  configFile: false,
  cacheDir: path.join(archive, '.vite-campaign'),
  logLevel: 'error',
  optimizeDeps: {
    entries: [path.join(repository, 'scripts/solidcraft/browser-campaign.ts')],
  },
  server: {
    host: '127.0.0.1',
    port: 0,
    hmr: false,
    watch: { ignored: ['**/work/**', '**/test-results/**'] },
  },
  plugins: [
    {
      name: 'private-campaign-verification',
      resolveId(id) {
        if (id === '/__campaign.ts')
          return path.join(
            repository,
            'scripts/solidcraft/browser-campaign.ts',
          );
      },
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url === '/__campaign') {
            response.setHeader('Content-Type', 'text/html');
            response.end(
              '<!doctype html><title>Private LASU model verification</title><style>body{margin:0}#map{height:100vh;width:100vw}</style><div id="map"></div>',
            );
            return;
          }
          const url = new URL(request.url || '/', 'http://localhost');
          if (!/^\/(packages|audio|glyphs)\//.test(url.pathname)) {
            next();
            return;
          }
          const file = path.resolve(
            publicDir,
            '.' + decodeURIComponent(url.pathname),
          );
          if (!file.startsWith(publicDir + path.sep)) {
            response.statusCode = 400;
            response.end();
            return;
          }
          const mime = file.endsWith('.json')
            ? 'application/json'
            : file.endsWith('.png')
              ? 'image/png'
              : file.endsWith('.webp')
                ? 'image/webp'
                : 'application/octet-stream';
          response.setHeader('Content-Type', mime);
          void fs.readFile(file).then(
            (bytes) => response.end(bytes),
            () => {
              response.statusCode = 404;
              response.end();
            },
          );
        });
      },
    },
  ],
});
await server.listen();
const hardware = process.argv.includes('--hardware');
const benchmarkOnly = process.argv.includes('--benchmark-only');
const profile = process.argv.includes('--profile');
const afterVisits = process.argv.includes('--after-visits');
const diagnosticSuffix = afterVisits ? '-after-visits' : '';
const suffix = hardware ? '-hardware' : '';
const browser = await chromium.launch({
  headless: true,
  args: [
    ...(hardware
      ? ['--use-angle=d3d11']
      : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
    '--enable-webgl',
    '--ignore-gpu-blocklist',
  ],
});
const results = [];
try {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport }),
      page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
      console.log('Browser error: ' + error.message);
    });
    page.on('console', (message) => {
      if (
        message.type() === 'error' ||
        /^(Offline|Campaign)/.test(message.text())
      )
        console.log(message.text().slice(0, 1000));
    });
    await page.addInitScript('globalThis.__name = value => value;');
    await page.goto(server.resolvedUrls!.local[0] + '__campaign');
    console.log(`Starting ${viewport.width} px verification`);
    const stalled = setTimeout(() => {
      void page
        .screenshot({
          path: path.join(current.directory, 'loading-diagnostic.png'),
        })
        .catch(() => console.log('Loading diagnostic unavailable.'));
    }, 20000);
    const ids = await deadline(
      page.evaluate(async () => {
        const modulePath = '/__campaign.ts';
        const { campaign } = await import(modulePath);
        window.campaign = await campaign();
        return window.campaign.ids;
      }),
      180000,
    );
    clearTimeout(stalled);
    const graphics = await page.evaluate(() => window.campaign.graphics());
    const profiler = profile ? await context.newCDPSession(page) : null;
    await profiler?.send('Performance.enable');
    const beforeVisits = await profiler?.send('Performance.getMetrics');
    const visits = [];
    for (const id of benchmarkOnly && !afterVisits ? [] : ids)
      visits.push(await page.evaluate((id) => window.campaign.visit(id), id));
    await page.evaluate(() => window.campaign.overview());
    const beforeSweep = await profiler?.send('Performance.getMetrics');
    await profiler?.send('Profiler.enable');
    await profiler?.send('Profiler.start');
    const performance = await page.evaluate(() => window.campaign.measure());
    const label = (viewport.width > 500 ? 'desktop' : 'phone') + suffix;
    if (profiler) {
      await fs.writeFile(
        path.join(current.directory, `${label}${diagnosticSuffix}.cpuprofile`),
        JSON.stringify((await profiler.send('Profiler.stop')).profile),
      );
    }
    if (benchmarkOnly) {
      await page.evaluate(() => window.campaign.overview());
      const warmed = await page.evaluate(() => window.campaign.measure());
      const afterSweep = await profiler?.send('Performance.getMetrics');
      if (errors.length) throw new Error(errors.join('\n'));
      results.push({
        fixture: path.basename(current.directory),
        sourceSnapshot,
        capturedAt: new Date().toISOString(),
        viewport,
        graphics,
        scenario: afterVisits
          ? 'after visiting every detailed building'
          : 'fresh overview',
        memory: { beforeVisits, beforeSweep, afterSweep },
        performance,
        warmed,
      });
      await fs.writeFile(
        path.join(
          current.directory,
          `performance-only${suffix}${diagnosticSuffix}.json`,
        ),
        JSON.stringify(results, null, 2),
      );
      console.log(
        `${label}: first sweep ${performance.averageFps.toFixed(1)} FPS; repeated sweep ${warmed.averageFps.toFixed(1)} FPS`,
      );
      await page.evaluate(() => window.campaign.dispose());
      await profiler?.detach();
      await context.close();
      continue;
    }
    await profiler?.detach();
    await page.screenshot({
      path: path.join(current.directory, `${label}-map.png`),
    });
    await page.evaluate(() => window.campaign.theme(true));
    await page.screenshot({
      path: path.join(current.directory, `${label}-dark-map.png`),
    });
    const released = [];
    const cycleIds = ids.filter((id: string) => /:(120|3|28)$/.test(id));
    for (let repeat = 0; repeat < 3; repeat++) {
      for (const id of cycleIds)
        await page.evaluate((id) => window.campaign.visit(id), id);
      released.push(await page.evaluate(() => window.campaign.away()));
    }
    await page.evaluate((id) => window.campaign.visit(id), ids[0]);
    const recovered = await page.evaluate(() =>
      window.campaign.recoverGraphics(),
    );
    const download = await page.evaluate(() => window.campaign.download());
    await page.evaluate(() => window.campaign.dispose());
    await context.setOffline(true);
    const offline = await page.evaluate(async () => {
      const modulePath = '/__campaign.ts',
        { campaign } = await import(modulePath);
      window.campaign = await campaign(true);
      const visits = [];
      for (const id of window.campaign.ids)
        visits.push(await window.campaign.visit(id));
      return visits;
    });
    await page.screenshot({
      path: path.join(current.directory, `${label}-offline-map.png`),
    });
    await page.evaluate(() => window.campaign.dispose());
    if (errors.length) throw new Error(errors.join('\n'));
    if (
      released.some(
        (s) => s.detailBuildings !== 0 || s.reservedDetailBytes !== 0,
      )
    )
      throw new Error('Detailed resources survived navigation away.');
    const record = {
      fixture: path.basename(current.directory),
      sourceSnapshot,
      capturedAt: new Date().toISOString(),
      browserVersion: browser.version(),
      resourceCycleIds: cycleIds,
      viewport,
      renderer: hardware
        ? 'Chromium on this Windows host; GPU identity recorded below. Phone viewport remains an emulation, not a physical phone.'
        : 'Chromium SwiftShader simulation; no physical device measured',
      graphics,
      performance,
      visits,
      released,
      recovered,
      download,
      offline,
    };
    results.push(record);
    await fs.writeFile(
      path.join(current.directory, `browser-verification${suffix}.json`),
      JSON.stringify(results, null, 2),
    );
    console.log(
      `${label}: ${performance.averageFps.toFixed(1)} FPS; all ${ids.length} detailed buildings rendered offline`,
    );
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
