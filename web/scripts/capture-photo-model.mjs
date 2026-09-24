import fs from 'node:fs/promises';
import { chromium } from '@playwright/test';
const base = JSON.parse(
  await fs.readFile('work/photo-model/campus.json', 'utf8'),
);
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.route('**/fixture-campus.json', (r) => r.fulfill({ json: base }));
for (const p of base.photos)
  await page.route(`**${p.url}`, async (r) =>
    r.fulfill({
      body: await fs.readFile(
        'work/photo-model/' + p.id.replaceAll(/[^a-z0-9-]/gi, '_') + '.webp',
      ),
      contentType: 'image/webp',
    }),
  );
await page.goto('http://127.0.0.1:5195/tests/models/index.html');
await page.getByRole('button', { name: 'Open workspace' }).click();
await page.getByRole('dialog').waitFor({ state: 'visible' });
await page.waitForTimeout(150);
const dialog = page.getByRole('dialog');
await dialog.getByLabel('Mapped wall').selectOption({ index: 1 });
await dialog
  .getByText('Estimated dimensions · selected wall outlined')
  .waitFor();
await dialog
  .getByRole('button', { name: 'Zoom in', exact: true })
  .click({ clickCount: 2 });
await dialog.evaluate((el) => {
  el.scrollTop = 0;
});
await page.screenshot({
  path: '../docs/assets/screenshots/photo-model-desktop-2026-09-24.jpg',
  type: 'jpeg',
  quality: 90,
});
await dialog.getByText('Photographic wall texture', { exact: true }).click();
await dialog
  .getByRole('button', { name: 'Start texture alignment from this photo' })
  .click();
await page.screenshot({ path: 'work/photo-model/workspace-texture.png' });
await dialog.getByRole('button', { name: 'Close without applying' }).click();
await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole('button', { name: 'Open workspace' }).click();
await page.getByRole('dialog').waitFor({ state: 'visible' });
await page.waitForTimeout(150);
await page.screenshot({
  path: '../docs/assets/screenshots/photo-model-mobile-2026-09-24.jpg',
  type: 'jpeg',
  quality: 90,
});
await fs.writeFile(
  'work/photo-model/probe.json',
  JSON.stringify(await page.evaluate(() => window.modelMetrics), null, 2),
);
await browser.close();
