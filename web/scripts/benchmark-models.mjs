import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

// Production-only fixture: never authenticates or changes the published map.
const directory = 'work/photo-model';
const base = JSON.parse(await fs.readFile(`${directory}/campus.json`, 'utf8'));
const inventory = JSON.parse(
  await fs.readFile('../data/photo-models/inventory.json', 'utf8'),
);
const catalogue = JSON.parse(
  await fs.readFile(`${directory}/visuals/catalogue.json`, 'utf8'),
);
const sheets = process.argv.includes('--sheets');
const runs = [];
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
await fs.mkdir(`${directory}/assets`, { recursive: true });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const checkedAssets = new Map();
for (const asset of base.visuals.sectors) {
  const filename = `${directory}/assets/${path.basename(asset.url)}`;
  let bytes = await fs.readFile(filename).catch(() => null);
  if (!bytes || hash(bytes) !== asset.sha256) {
    const response = await fetch(
      new URL(asset.url, 'https://turnright.vercel.app'),
    );
    if (!response.ok) throw Error(`Unavailable baseline asset ${asset.url}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== asset.bytes || hash(bytes) !== asset.sha256)
      throw Error('Baseline integrity');
    await fs.writeFile(filename, bytes);
  }
  checkedAssets.set(asset.url, bytes);
}
for (const asset of catalogue.sectors)
  checkedAssets.set(
    asset.url,
    await fs.readFile(`${directory}/visuals/${path.basename(asset.url)}`),
  );
async function pageFor(width = 1440, rate = 1) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.setDefaultTimeout(60000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/fixture-campus.json', (r) => r.fulfill({ json: base }));
  await page.route('**/fixture-visuals.json', (r) =>
    r.fulfill({ json: catalogue }),
  );
  await page.route('**/packages/**', async (r) => {
    const url = new URL(r.request().url()).pathname;
    const photo = base.photos.find((p) => p.url === url);
    const bytes =
      checkedAssets.get(url) ||
      (photo &&
        (await fs.readFile(
          `${directory}/${photo.id.replaceAll(/[^a-z0-9-]/gi, '_')}.webp`,
        )));
    return bytes
      ? r.fulfill({
          body: bytes,
          contentType: photo ? 'image/webp' : 'application/json',
        })
      : r.fulfill({ status: 404 });
  });
  for (const prefix of ['world', 'fonts', 'glyphs'])
    await page.route(`**/${prefix}/**`, async (r) => {
      const local = path.resolve(
        'public',
        '.' + decodeURIComponent(new URL(r.request().url()).pathname),
      );
      if (!local.startsWith(path.resolve('public') + path.sep))
        return r.abort();
      const bytes = await fs.readFile(local).catch(() => null);
      return bytes
        ? r.fulfill({
            body: bytes,
            contentType: local.endsWith('.webp')
              ? 'image/webp'
              : local.endsWith('.geojson')
                ? 'application/json'
                : 'application/octet-stream',
          })
        : r.fulfill({ status: 404 });
    });
  return { page, errors };
}
async function settleModel(page, action) {
  const previous = await page.evaluate(() => window.modelMetrics.length);
  await action();
  await page.waitForFunction((n) => window.modelMetrics.length > n, previous);
  await page
    .getByText('Estimated dimensions · selected wall outlined')
    .first()
    .waitFor();
}
const escape = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
try {
  if (sheets) {
    const output = '../docs/assets/photo-models';
    await fs.mkdir(output, { recursive: true });
    const { page, errors } = await pageFor();
    await page.goto('http://127.0.0.1:5195/tests/models/index.html');
    await page
      .getByText('Estimated dimensions · selected wall outlined')
      .waitFor();
    for (const [index, record] of inventory.buildings.entries()) {
      if (index || base.photos[0].buildingId !== record.buildingId)
        await settleModel(page, () =>
          page
            .getByLabel('Building', { exact: true })
            .selectOption(record.buildingId),
        );
      await page
        .getByRole('button', { name: 'Zoom in', exact: true })
        .click({ clickCount: 2 });
      const before = await page.locator('canvas').screenshot();
      await settleModel(page, () =>
        page.getByRole('button', { name: 'Before', exact: true }).click(),
      );
      const after = await page.locator('canvas').screenshot();
      const reference =
        inventory.photos.find(
          (p) =>
            record.photoIds.includes(p.id) &&
            p.classification === 'exterior-evidence',
        ) || inventory.photos.find((p) => record.photoIds.includes(p.id));
      const photo = await fs.readFile(
        `${directory}/${reference.id.replaceAll(/[^a-z0-9-]/gi, '_')}.webp`,
      );
      const image = await sharp(photo)
        .resize(570, 590, { fit: 'inside', withoutEnlargement: true })
        .toBuffer();
      const metadata = await sharp(image).metadata();
      const label = (text, w = 1200) =>
        Buffer.from(
          `<svg width="${w}" height="60"><rect width="100%" height="100%" fill="#f5f4ef"/><text x="18" y="38" font-size="22" fill="#253644" font-family="Arial">${escape(text)}</text></svg>`,
        );
      const filename = `${String(index + 1).padStart(2, '0')}-${record.name
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, '-')
        .replace(/-$/, '')}.jpg`;
      await sharp({
        create: {
          width: 1200,
          height: 750,
          channels: 3,
          background: '#f5f4ef',
        },
      })
        .composite([
          { input: label(record.name), left: 0, top: 0 },
          {
            input: image,
            left: 20 + Math.floor((570 - metadata.width) / 2),
            top: 105 + Math.floor((590 - metadata.height) / 2),
          },
          { input: label('Reference photograph', 580), left: 10, top: 50 },
          { input: label('Before', 590), left: 605, top: 50 },
          {
            input: await sharp(before)
              .resize(570, 270, { fit: 'contain', background: '#dfe6e9' })
              .toBuffer(),
            left: 615,
            top: 110,
          },
          {
            input: label('After · dimensions / hidden sides estimated', 590),
            left: 605,
            top: 385,
          },
          {
            input: await sharp(after)
              .resize(570, 270, { fit: 'contain', background: '#dfe6e9' })
              .toBuffer(),
            left: 615,
            top: 445,
          },
        ])
        .jpeg({ quality: 86 })
        .toFile(`${output}/${filename}`);
      record.sheet = filename;
      record.sheetPhotoId = reference.id;
      await settleModel(page, () =>
        page.getByRole('button', { name: 'After', exact: true }).click(),
      );
      console.log(`Comparison ${index + 1}/19: ${record.name}`);
    }
    await fs.writeFile(
      `${directory}/comparison-index.json`,
      JSON.stringify(
        inventory.buildings.map(({ buildingId, sheet, sheetPhotoId }) => ({
          buildingId,
          sheet,
          sheetPhotoId,
        })),
        null,
        2,
      ),
    );
    if (errors.length) throw Error(errors.join('\n'));
    await page.close();
  } else if (process.argv.includes('--poles')) {
    const { page, errors } = await pageFor();
    await page.goto(
      'http://127.0.0.1:5195/tests/models/index.html?map=1&after=1',
    );
    await page.waitForFunction(() =>
      window.benchmarkMap?.getLayer('world-polar-caps'),
    );
    for (const [label, center] of [
      ['north-pole', [0, 85]],
      ['south-pole', [0, -85]],
      ['antimeridian', [180, 0]],
    ]) {
      await page.evaluate(
        (center) => window.benchmarkMap.jumpTo({ center, zoom: 1, pitch: 0 }),
        center,
      );
      await page.waitForFunction(() => window.benchmarkMap.areTilesLoaded());
      await page.screenshot({ path: `${directory}/globe-${label}.png` });
    }
    if (errors.length) throw Error(errors.join('\n'));
    await page.close();
  } else {
    for (const after of [false, true])
      for (let run = 1; run <= 5; run++) {
        const { page, errors } = await pageFor();
        await page.goto(
          `http://127.0.0.1:5195/tests/models/index.html?map=1${after ? '&after=1' : ''}`,
        );
        await page.waitForFunction(() =>
          window.benchmarkMap?.getLayer('world-imagery'),
        );
        await page.waitForFunction(() => {
          const canvas = window.benchmarkMap.getCanvas();
          return canvas.clientWidth >= 1000 && canvas.clientHeight >= 800;
        });
        await page.waitForFunction(() =>
          window.benchmarkMap.isSourceLoaded('world'),
        );

        if (!after)
          await page.evaluate(async () => {
            const map = window.benchmarkMap;
            for (const id of [
              'world-imagery',
              'world-lakes',
              'world-cities',
              'world-polar-caps',
            ])
              if (map.getLayer(id))
                map.setLayoutProperty(id, 'visibility', 'none');
            map
              .getSource('world')
              .setData(
                await (await fetch('/world/countries-v5.1.2.geojson')).json(),
              );
            map.setSky({ 'atmosphere-blend': 0 });
          });
        await page.getByRole('button', { name: 'Globe', exact: true }).click();
        await page.waitForFunction(() => window.benchmarkMap.areTilesLoaded());
        async function move(kind) {
          return page.evaluate(async (kind) => {
            const map = window.benchmarkMap,
              frames = [];
            let last, token;
            const tick = (now) => {
              if (last !== undefined) frames.push(now - last);
              last = now;
              token = requestAnimationFrame(tick);
            };
            token = requestAnimationFrame(tick);
            await new Promise((resolve) => {
              map.once('moveend', resolve);
              map.easeTo(
                kind === 'globe'
                  ? { center: [90, 20], duration: 1500 }
                  : { center: [3.1985, 6.47], bearing: 70, duration: 1500 },
              );
            });
            cancelAnimationFrame(token);
            return frames;
          }, kind);
        }
        const globeFrames = await move('globe');
        if (after && run === 1) {
          await page.screenshot({
            path: '../docs/assets/photo-models/globe-desktop.jpg',
            type: 'jpeg',
            quality: 87,
          });
          for (const [label, center] of [
            ['north-pole', [0, 85]],
            ['south-pole', [0, -85]],
            ['antimeridian', [180, 0]],
          ]) {
            await page.evaluate(
              (center) =>
                window.benchmarkMap.jumpTo({ center, zoom: 1, pitch: 0 }),
              center,
            );
            await page.waitForFunction(() =>
              window.benchmarkMap.areTilesLoaded(),
            );
            await page.screenshot({ path: `${directory}/globe-${label}.png` });
          }
        }
        await page.getByRole('button', { name: 'Campus', exact: true }).click();
        await page.waitForFunction(() => window.benchmarkMap.areTilesLoaded());
        await page.waitForTimeout(3000);
        const campusFrames = await move('campus');
        const requests = await page.evaluate(
          () => performance.getEntriesByType('resource').length,
        );
        runs.push({
          kind: 'map',
          after,
          run,
          globeFrames,
          campusFrames,
          requests,
          errors,
        });
        await page.close();
        console.log(`Map ${after ? 'after' : 'baseline'} trial ${run}/5`);
      }
    for (const rate of [1, 4])
      for (let run = 1; run <= 5; run++) {
        const { page, errors } = await pageFor(rate === 1 ? 1440 : 390, rate);
        await page.goto('http://127.0.0.1:5195/tests/models/index.html');
        await page.getByRole('button', { name: 'Open workspace' }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByLabel('Mapped wall').selectOption({ index: 1 });
        await dialog
          .getByRole('button', { name: 'Add window', exact: true })
          .click();
        if (rate === 4)
          await dialog
            .getByRole('button', { name: 'Model', exact: true })
            .click();
        await dialog
          .getByText('Estimated dimensions · selected wall outlined')
          .waitFor();
        await page.evaluate(() => {
          window.inputs = [];
          window.tasks = [];
          document.addEventListener(
            'input',
            () => {
              const start = performance.now();
              requestAnimationFrame(() =>
                setTimeout(
                  () => window.inputs.push(performance.now() - start),
                  0,
                ),
              );
            },
            true,
          );
          new PerformanceObserver((l) =>
            window.tasks.push(...l.getEntries().map((e) => e.duration)),
          ).observe({ type: 'longtask' });
        });
        await dialog
          .getByLabel('Evidence and estimated dimensions')
          .pressSequentially('Measured input responsiveness.', { delay: 50 });
        await page.waitForFunction(() => window.inputs.length >= 30);
        const stats = await page.evaluate(() => ({
          inputs: window.inputs,
          tasks: window.tasks,
          metrics: window.modelMetrics,
        }));
        await dialog
          .getByRole('button', { name: 'Close without applying' })
          .click();
        const retainedCanvases = await page.locator('canvas').count();
        runs.push({
          kind: 'editor',
          rate,
          run,
          ...stats,
          retainedCanvases,
          errors,
        });
        await page.close();
        console.log(`Editor ${rate}x trial ${run}/5`);
      }
    await fs.writeFile(
      '../docs/photo-model-performance.json',
      JSON.stringify(
        {
          baseline: base.version,
          environment:
            'Windows Chromium headless / SwiftShader; production fixture, no physical device',
          runs,
        },
        null,
        2,
      ),
    );
    if (runs.some((r) => r.errors.length))
      throw Error('Browser errors recorded in performance report');
  }
} finally {
  await browser.close();
}
