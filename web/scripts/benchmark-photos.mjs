import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const label = process.argv[2] || 'current';
const profiling = process.argv.includes('--profile');
const snapshot = 'work/performance-campus.json';
await mkdir('work', { recursive: true });
let bytes;
try {
  bytes = await readFile(snapshot);
} catch {
  const manifest = await (
    await fetch('https://turnright.vercel.app/packages/latest.json')
  ).json();
  bytes = Buffer.from(
    await (
      await fetch(new URL(manifest.dataUrl, 'https://turnright.vercel.app'))
    ).arrayBuffer(),
  );
  if (
    createHash('sha256').update(bytes).digest('hex') !==
    manifest.assets.find((a) => a.url === manifest.dataUrl).sha256
  )
    throw Error('Fixture integrity failed');
  await writeFile(snapshot, bytes);
}
const data = JSON.parse(bytes),
  building = data.map.features.find((f) => f.properties?.kind === 'building');
const photo = data.photos[0];
const browser = await chromium.launch({ headless: true });
const runs = [];
try {
  for (const rate of profiling ? [4] : [1, 4])
    for (let run = 0; run < (profiling ? 1 : 5); run++) {
      const page = await browser.newPage({
        viewport: { width: rate === 1 ? 1440 : 390, height: 900 },
      });
      page.setDefaultTimeout(180_000);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate });
      await page.route('**/fixture-campus.json', (route) =>
        route.fulfill({ body: bytes, contentType: 'application/json' }),
      );
      await page.route('**/packages/photos/**', (route) =>
        route.fulfill({ status: 404 }),
      );
      await page.addInitScript(
        ({ photo, building }) => {
          localStorage.setItem(
            `turnright:photo-drafts:performance-owner:building:${building}`,
            JSON.stringify(
              Array.from({ length: 20 }, (_, i) => ({
                key: `sample-${i}`,
                filename: `Photograph ${i + 1}`,
                metadata: { ...photo, buildingId: building },
                revision: 0,
                original: photo,
                state: 'needs details',
                reviewed: false,
                rightsReviewed: true,
                authorshipConfirmed: false,
              })),
            ),
          );
          window.timings = [];
          window.tasks = [];
          window.clicks = [];
          document.addEventListener(
            'click',
            (event) => {
              const button = event.target.closest?.('button');
              if (!button) return;
              const kind = /^(Next|Previous) photo$/.test(
                button.textContent.trim(),
              )
                ? 'selection'
                : button.closest('nav[aria-label="Photo workspace"]')
                  ? 'workspace'
                  : null;
              if (!kind) return;
              const start = performance.now();
              requestAnimationFrame(() =>
                setTimeout(
                  () =>
                    window.clicks.push({
                      kind,
                      duration: performance.now() - start,
                    }),
                  0,
                ),
              );
            },
            true,
          );
          new PerformanceObserver((list) =>
            window.tasks.push(...list.getEntries().map((e) => e.duration)),
          ).observe({ type: 'longtask', buffered: true });
          document.addEventListener(
            'input',
            () => {
              const start = performance.now();
              requestAnimationFrame(() =>
                setTimeout(
                  () => window.timings.push(performance.now() - start),
                  0,
                ),
              );
            },
            true,
          );
        },
        { photo, building: building.properties.id },
      );
      await page.goto('http://127.0.0.1:5195/tests/performance/index.html');
      await page.getByRole('button', { name: /Manage photos/ }).click();
      await page.getByRole('button', { name: /Review uploads/ }).click();
      const caption = page.getByLabel('Caption', { exact: true });
      await caption.waitFor();
      const workspaceReadyMs = await page.evaluate(() => performance.now());
      if (profiling) {
        await cdp.send('Profiler.enable');
        await cdp.send('Profiler.start');
      }
      await page.evaluate(() => {
        window.timings = [];
        window.tasks = [];
      });
      await caption.pressSequentially(' performance measurement', {
        delay: 50,
      });
      await page.waitForFunction(() => window.timings.length >= 24);
      const result = await page.evaluate(() => ({
        timings: window.timings,
        tasks: window.tasks,
      }));
      await page.evaluate(() => {
        window.clicks = [];
      });
      for (let action = 0; action < 10; action++) {
        await page
          .getByRole('button', {
            name: action % 2 ? 'Previous photo' : 'Next photo',
            exact: true,
          })
          .click();
        await page.waitForFunction(
          (count) => window.clicks.length >= count,
          action + 1,
        );
      }
      for (let action = 0; action < 10; action++) {
        await page
          .getByRole('button', {
            name: action % 2 ? /Review uploads/ : 'Gallery',
            exact: !(action % 2),
          })
          .click();
        await page.waitForFunction(
          (count) => window.clicks.length >= count,
          action + 11,
        );
      }
      const presentation = await page.evaluate(() => ({
        clicks: window.clicks,
        imageElements: document.images.length,
        queueCards: document.querySelectorAll('.photo-queue-card').length,
        requests: performance.getEntriesByType('resource').length,
      }));
      if (profiling) {
        const { profile } = await cdp.send('Profiler.stop');
        await writeFile('work/photo-profile.json', JSON.stringify(profile));
      }
      const sorted = result.timings.toSorted((a, b) => a - b);
      runs.push({
        rate,
        run,
        p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
        maxTask: Math.max(0, ...result.tasks),
        ...result,
        ...presentation,
        workspaceReadyMs,
      });
      await writeFile(
        `work/photo-performance-${label}.json`,
        JSON.stringify({ label, campus: data.version, runs }, null, 2),
      );
      console.log(JSON.stringify({ rate, run, p95: runs.at(-1).p95 }));
      await page.close();
    }
} finally {
  await browser.close();
}
const result = {
  label,
  campus: data.version,
  buildings: data.map.features.filter((f) => f.properties?.kind === 'building')
    .length,
  places: data.places.length,
  runs,
};
await writeFile(
  `work/photo-performance-${label}.json`,
  JSON.stringify(result, null, 2),
);
console.log(
  JSON.stringify(
    { ...result, runs: runs.map(({ timings, tasks, clicks, ...r }) => r) },
    null,
    2,
  ),
);
if (!profiling) {
  const p95 = (samples) =>
    samples.toSorted((a, b) => a - b)[Math.ceil(samples.length * 0.95) - 1];
  for (const rate of [1, 4]) {
    const group = runs.filter((run) => run.rate === rate);
    const metrics = {
      caption: p95(group.flatMap((run) => run.timings)),
      selection: p95(
        group.flatMap((run) =>
          run.clicks
            .filter((click) => click.kind === 'selection')
            .map((click) => click.duration),
        ),
      ),
      workspace: p95(
        group.flatMap((run) =>
          run.clicks
            .filter((click) => click.kind === 'workspace')
            .map((click) => click.duration),
        ),
      ),
    };
    console.log(
      JSON.stringify({
        rate,
        pooledP95: metrics,
        targetMs: rate === 1 ? 100 : 200,
      }),
    );
    if (
      Object.values(metrics).some(
        (value) => !Number.isFinite(value) || value >= (rate === 1 ? 100 : 200),
      )
    )
      process.exitCode = 1;
  }
}
