// Public-only smoke check after attribution layout changes; no owner access.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium, webkit, expect } from '@playwright/test';
import { assertCampusCapture } from './assert-campus-capture.mjs';

const origin = process.env.VERIFY_ORIGIN || 'https://turnright.vercel.app';
const output = process.env.VERIFY_OUTPUT || 'work/map-credits-verification';
await fs.mkdir(output, { recursive: true });
const report = { origin, checkedAt: new Date().toISOString(), views: [] };
for (const [engine, type] of Object.entries({ chromium, webkit })) {
  const browser = await type.launch(engine === 'chromium' ? { args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] } : {});
  try {
    for (const mobile of [false, true]) for (const dark of [false, true]) {
      // Fresh contexts avoid the separately documented Windows WebKit resize issue.
      const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
      try {
        const page = await context.newPage(), errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.addInitScript((dark) => {
          localStorage.setItem('turnright:appearance', dark ? 'dark' : 'light');
          localStorage.setItem('turnright:world-animation', JSON.stringify({ rotation: false, clouds: false }));
        }, dark);
        const campus = mobile ? 'unilag' : 'lasu';
        await page.goto(`${origin}/?campus=${campus}`);
        await page.waitForFunction(() => {
          const el = document.querySelector('.map-canvas');
          let fiber = el?.[Object.keys(el).find((k) => k.startsWith('__reactFiber'))];
          while (fiber) {
            let hook = fiber.memoizedState;
            while (hook) {
              const map = hook.memoizedState?.current;
              if (map?.getCanvas && map?.project) return map.loaded() && map.queryRenderedFeatures().length > 0;
              hook = hook.next;
            }
            fiber = fiber.return;
          }
          return false;
        }, null, { timeout: 90000 });
        const credits = page.locator('.maplibregl-ctrl-attrib'), toggle = credits.locator('summary'), content = credits.locator('.maplibregl-ctrl-attrib-inner');
        await expect(content).toBeHidden();
        const name = `${engine}-${campus}-${mobile ? 'mobile' : 'desktop'}-${dark ? 'dark' : 'light'}`;
        await assertCampusCapture(await page.screenshot({ path: path.join(output, `${name}.png`) }), name);
        await toggle.focus(); await page.keyboard.press('Enter');
        await expect(content).toBeVisible();
        const box = await credits.boundingBox(), panel = await page.locator('.explore-panel').boundingBox(), button = await toggle.boundingBox();
        assert(box.y + box.height < panel.y, 'Credits clear the collapsed panel');
        assert(box.x >= 0 && box.x + box.width <= page.viewportSize().width, 'Credits fit viewport');
        assert(button.width >= 44 && button.height >= 44, 'Touch target');
        await expect(content).toHaveCSS('font-size', '12px');
        await page.screenshot({ path: path.join(output, `${name}-credits.png`) });
        await page.keyboard.press('Enter'); await expect(content).toBeHidden();
        await page.getByRole('button', { name: 'Expand card', exact: true }).click();
        await toggle.click(); await expect(content).toBeVisible();
        assert(await content.evaluate((el) => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + 20, r.bottom - 15)); }), 'Expanded panel cannot cover credits');
        await toggle.click(); await expect(content).toBeHidden();
        assert.deepEqual(errors, []);
        report.views.push({ engine, campus, mobile, dark, passed: true, filename: `${name}.png` });
        console.log(`${name}: map pixels, credits, keyboard, touch target and panel checks passed`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); }
}
