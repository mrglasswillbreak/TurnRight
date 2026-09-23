import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const label = process.argv[2] || 'current';
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
  for (const rate of [1, 4])
    for (let run = 0; run < 5; run++) {
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
      const sorted = result.timings.toSorted((a, b) => a - b);
      runs.push({
        rate,
        run,
        p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
        maxTask: Math.max(0, ...result.tasks),
        ...result,
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
    { ...result, runs: runs.map(({ timings, tasks, ...r }) => r) },
    null,
    2,
  ),
);
