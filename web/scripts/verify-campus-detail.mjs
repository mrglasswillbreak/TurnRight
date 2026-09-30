/** Real-package visual/asset/offline acceptance; never authenticates or writes drafts. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium, webkit, expect } from '@playwright/test';
import { createServer } from 'node:http';
const origin = process.env.VERIFY_ORIGIN || 'https://turnright.vercel.app';
const output = path.resolve(
  process.env.VERIFY_OUTPUT || 'work/campus-detail-verification',
);
await fs.mkdir(output, { recursive: true });
const bypass = process.env.VERIFY_BYPASS;
const headers = bypass ? { 'x-vercel-protection-bypass': bypass } : {};
const get = async (url) => {
  const target = new URL(url, origin);
  assert.equal(target.origin, new URL(origin).origin);
  const response = await fetch(target, {
    headers,
    redirect: 'error',
    signal: AbortSignal.timeout(45000),
  });
  assert(response.ok, `${url}: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
};
async function offlineOrigin() {
  // WebKit 1.63's offline-emulation bug rejects navigation before SW handling
  // (microsoft/playwright#42775). Stop this local origin instead; all bytes are
  // fetched unchanged from the deployed app, and no response is synthesized.
  const server = createServer(async (request, response) => {
    try {
      const target = new URL(request.url, origin);
      assert.equal(target.origin, new URL(origin).origin);
      const upstream = await fetch(target, {
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(45000),
      });
      const bytes = Buffer.from(await upstream.arrayBuffer());
      response.writeHead(upstream.status, {
        'content-type':
          upstream.headers.get('content-type') || 'application/octet-stream',
        'cache-control': upstream.headers.get('cache-control') || 'no-store',
      });
      response.end(bytes);
    } catch {
      response.writeHead(502);
      response.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    stop: () =>
      new Promise((resolve, reject) => {
        if (!server.listening) return resolve();
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
async function authorize(context) {
  if (!bypass) return;
  // Use the context's cookie jar so credentials stay confined to this origin,
  // including service-worker fetches. Never save the browser storage state.
  const response = await context.request.get(origin, {
    headers: { ...headers, 'x-vercel-set-bypass-cookie': 'true' },
    maxRedirects: 0,
  });
  assert(
    [200, 302, 307].includes(response.status()),
    'Preview authorization failed',
  );
}
const catalogue = JSON.parse(await get('/packages/campuses.json'));
const campuses = [];
for (const slug of ['lasu', 'unilag']) {
  const entry = catalogue.campuses.find(
    (c) => c.slug === slug || c.id === slug,
  );
  assert(entry, slug);
  const manifest = JSON.parse(await get(entry.manifestUrl));
  for (let i = 0; i < manifest.assets.length; i += 6)
    await Promise.all(
      manifest.assets.slice(i, i + 6).map(async (a) => {
        const bytes = await get(a.url);
        assert.equal(bytes.length, a.bytes, a.url);
        assert.equal(
          createHash('sha256').update(bytes).digest('hex'),
          a.sha256,
          a.url,
        );
      }),
    );
  const data = JSON.parse(await get(manifest.dataUrl));
  campuses.push({ slug, entry, manifest, data });
  console.log(
    `${slug}: verified ${manifest.assets.length} assets for ${manifest.version}`,
  );
}
const report = {
  origin,
  checkedAt: new Date().toISOString(),
  campuses: campuses.map(({ slug, manifest, data }) => ({
    slug,
    version: manifest.version,
    assets: manifest.assets.length,
    features: data.map.features.length,
    buildings: data.map.features.filter((f) => f.properties.kind === 'building')
      .length,
    places: data.places.length,
    photos: data.photos?.length || 0,
  })),
  views: [],
  offline: [],
};
async function attach(page) {
  await page.waitForFunction(
    () => {
      const el = document.querySelector('.map-canvas'),
        key = Object.keys(el || {}).find((k) => k.startsWith('__reactFiber'));
      let fiber = el && key ? el[key] : undefined;
      while (fiber) {
        let hook = fiber.memoizedState;
        while (hook) {
          const value = hook.memoizedState?.current;
          if (value?.getCanvas && value?.project) {
            window.campusVerifyMap = value;
            return value.loaded();
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
}
for (const [engine, launcher] of [
  ['chromium', chromium],
  ['webkit', webkit],
]) {
  if (process.env.VERIFY_SCOPE === 'offline-webkit' && engine !== 'webkit')
    continue;
  const browser = await launcher.launch({
    headless: true,
    ...(engine === 'chromium'
      ? {
          args: [
            '--use-angle=swiftshader',
            '--enable-webgl',
            '--ignore-gpu-blocklist',
          ],
        }
      : {}),
  });
  let activePage, activeCase, outageOrigin;
  try {
    for (const campus of process.env.VERIFY_SCOPE === 'offline-webkit'
      ? []
      : campuses)
      for (const mobile of process.env.VERIFY_SCOPE === 'production'
        ? [false]
        : [false, true])
        for (const theme of process.env.VERIFY_SCOPE === 'production'
          ? ['light']
          : ['light', 'dark']) {
          const context = await browser.newContext({
            viewport: mobile
              ? { width: 390, height: 844 }
              : { width: 1440, height: 1000 },
            colorScheme: theme,
            hasTouch: mobile,
            ...(engine === 'webkit' ? { isMobile: mobile } : {}),
          });
          await authorize(context);
          const page = await context.newPage(),
            errors = [];
          activePage = page;
          activeCase = { engine, campus: campus.slug, mobile, theme };
          page.on('pageerror', (e) => errors.push(e.message));
          await page.addInitScript(
            ({ theme }) => {
              localStorage.setItem('turnright:appearance', theme);
              localStorage.setItem('turnright:map-view', '3d');
              localStorage.setItem(
                'turnright:world-animation',
                JSON.stringify({ rotation: false, clouds: false }),
              );
            },
            { theme },
          );
          const senate = campus.data.places.find((p) => /senate/i.test(p.name));
          assert(senate);
          await page.goto(
            `${origin}/?campus=${campus.slug}&place=${encodeURIComponent(senate.id)}`,
            { waitUntil: 'domcontentloaded' },
          );
          await expect(
            page.getByRole('heading', { name: senate.name, exact: true }),
          ).toBeVisible({ timeout: 90000 });
          await attach(page);
          await page.waitForFunction(
            async () => {
              const source = window.campusVerifyMap.getSource('road-display');
              if (!source) return false;
              const data = await source.getData();
              return data.features.every((f) => f.properties?.kind === 'path');
            },
            null,
            { timeout: 90000 },
          );
          for (const mode of ['3d', '2d']) {
            if (mode === '2d') {
              await page
                .getByRole('button', { name: 'Switch to 2D', exact: true })
                .click();
              await expect
                .poll(() =>
                  page.evaluate(() => window.campusVerifyMap.getPitch()),
                )
                .toBe(0);
            }
            await page.waitForFunction(
              () => window.campusVerifyMap.loaded(),
              null,
              { timeout: 30000 },
            );
            const state = await page.evaluate(async () => {
              const map = window.campusVerifyMap,
                data = await map.getSource('campus').getData(),
                roads = await map.getSource('road-display').getData();
              return {
                pitch: map.getPitch(),
                features: data.features.length,
                roadSurfaces: data.features.filter(
                  (f) =>
                    f.properties?.source ===
                    'import:bd74d5cc-2b8d-4d42-977a-00165dc70b7e',
                ).length,
                displayPaths: roads.features.filter(
                  (f) => f.properties?.kind === 'path',
                ).length,
                canvas: {
                  width: map.getCanvas().width,
                  height: map.getCanvas().height,
                },
                overflow: document.documentElement.scrollWidth > innerWidth + 1,
              };
            });
            assert(
              !state.overflow,
              `${engine} ${campus.slug} horizontal overflow`,
            );
            assert(
              state.features >= campus.data.map.features.length,
              'Missing campus geometry',
            );
            if (campus.slug === 'unilag') assert.equal(state.roadSurfaces, 179);
            assert.equal(errors.length, 0, errors.join('\n'));
            const name = `${campus.slug}-${mobile ? 'mobile' : 'desktop'}-${theme}-${mode}-2026-09-30.png`;
            await page.screenshot({
              path: path.join(output, engine + '-' + name),
            });
            report.views.push({
              engine,
              campus: campus.slug,
              mobile,
              theme,
              mode,
              ...state,
            });
            console.log(`${engine} ${name}: passed`);
          }
          await context.close();
        }
    // Download the real immutable package, then reopen a photograph/3D destination offline.
    for (const campus of campuses) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
      });
      await authorize(context);
      const page = await context.newPage();
      activePage = page;
      activeCase = { engine, campus: campus.slug, offline: true };
      console.log(`${engine} ${campus.slug}: starting offline download`);
      outageOrigin = engine === 'webkit' ? await offlineOrigin() : undefined;
      const offlineBase = outageOrigin?.origin || origin;
      const senate = campus.data.places.find((p) => /senate/i.test(p.name));
      await page.goto(`${offlineBase}/?campus=${campus.slug}`);
      await attach(page);
      await page.waitForFunction(
        () => !!navigator.serviceWorker.controller,
        null,
        { timeout: 90000 },
      );
      const expand = page.getByRole('button', {
        name: 'Expand card',
        exact: true,
      });
      if (await expand.isVisible()) await expand.click();
      await page.getByRole('button', { name: 'Offline', exact: true }).click();
      await page
        .getByRole('button', { name: 'Download campus map', exact: true })
        .click();
      await expect(
        page.getByText('Enhanced 3D ready offline · all model files verified'),
      ).toBeVisible({ timeout: 120000 });
      if (outageOrigin) {
        await outageOrigin.stop();
        await assert.rejects(
          fetch(offlineBase, { signal: AbortSignal.timeout(5000) }),
          'Origin must be unavailable',
        );
      } else await context.setOffline(true);
      await page.goto(
        `${offlineBase}/?campus=${campus.slug}&place=${encodeURIComponent(senate.id)}`,
      );
      await expect(
        page.getByRole('heading', { name: senate.name, exact: true }),
      ).toBeVisible({ timeout: 90000 });
      await attach(page);
      await expect
        .poll(() =>
          page
            .locator(
              '.place-photo img, .photo-gallery img, .photo-strip img, .building-photo img',
            )
            .evaluateAll(
              (images) =>
                images.filter((i) => i.complete && i.naturalWidth > 0).length,
            ),
        )
        .toBeGreaterThan(0);
      report.offline.push({
        engine,
        campus: campus.slug,
        version: campus.manifest.version,
        passed: true,
        disruption: outageOrigin ? 'origin-stopped' : 'browser-offline',
      });
      console.log(
        `${engine} ${campus.slug}: offline destination, photo and model package passed`,
      );
      await context.close();
    }
  } catch (error) {
    report.failure = { ...activeCase, message: error.message };
    console.error(JSON.stringify(report.failure));
    await activePage
      ?.screenshot({ path: path.join(output, 'failure.png'), timeout: 10000 })
      .catch(() => {});
    throw error;
  } finally {
    await outageOrigin?.stop();
    await browser.close();
    await fs.writeFile(
      path.join(output, 'report.json'),
      JSON.stringify(report, null, 2),
    );
  }
}
