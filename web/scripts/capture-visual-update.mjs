import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

// Capture the real production app with the verified public snapshot, never owner data.
const directory = 'work/photo-model';
const campus = await fs.readFile(`${directory}/campus.json`);
const data = JSON.parse(campus);
const manifest = JSON.parse(
  await fs.readFile(`${directory}/manifest.json`, 'utf8'),
);
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
try {
  for (const [width, height, theme] of [
    [1440, 900, 'light'],
    [390, 844, 'dark'],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      colorScheme: theme,
      serviceWorkers: 'block',
    });
    await page.route('**/packages/latest.json', (r) =>
      r.fulfill({ json: manifest }),
    );
    await page.route(`**${manifest.dataUrl}`, (r) =>
      r.fulfill({ body: campus, contentType: 'application/json' }),
    );
    for (const photo of data.photos)
      await page.route(`**${photo.url}`, async (r) =>
        r.fulfill({
          body: await fs.readFile(
            `${directory}/${photo.id.replaceAll(/[^a-z0-9-]/gi, '_')}.webp`,
          ),
          contentType: 'image/webp',
        }),
      );
    for (const sector of data.visuals.sectors)
      await page.route(`**${sector.url}`, async (r) =>
        r.fulfill({
          body: await fs.readFile(
            `${directory}/assets/${path.basename(sector.url)}`,
          ),
          contentType: 'application/json',
        }),
      );
    await page.goto('http://127.0.0.1:5196/');
    await page.waitForFunction(() => {
      const element = document.querySelector('.map-canvas');
      const key = Object.keys(element || {}).find((k) =>
        k.startsWith('__reactFiber'),
      );
      let fiber = key && element[key];
      while (fiber) {
        let hook = fiber.memoizedState;
        while (hook) {
          const value = hook.memoizedState?.current;
          if (value?.getCanvas && value?.project) {
            window.captureMap = value;
            return value.loaded();
          }
          hook = hook.next;
        }
        fiber = fiber.return;
      }
      return false;
    });
    await page.evaluate(
      (width) =>
        window.captureMap.jumpTo({
          center: [14, 12],
          zoom: width < 500 ? -0.7 : 1.65,
          pitch: 0,
          bearing: 0,
        }),
      width,
    );
    await page.waitForFunction(() => window.captureMap.areTilesLoaded());
    await page
      .getByRole('button', { name: 'Back to campus', exact: true })
      .waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: `../docs/assets/screenshots/public-globe-${width < 500 ? 'mobile' : 'desktop'}-${theme}-2026-09-24.jpg`,
      type: 'jpeg',
      quality: 90,
    });
    await page.close();
  }
} finally {
  await browser.close();
}
