import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
const root = path.resolve('work/campus-upgrade-20261017'),
  output = path.join(root, 'views');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const failures = [],
  report = [];
try {
  for (const campus of ['lasu', 'unilag'])
    for (const [variant, port] of [
      ['before', 5188],
      ['after', 5187],
    ]) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      page.on('pageerror', (error) =>
        failures.push({ campus, variant, error: error.message }),
      );
      await page.goto(`http://127.0.0.1:${port}/?campus=${campus}`);
      await page.waitForFunction(
        () => {
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
                window.reviewMap = value;
                return value.loaded();
              }
              hook = hook.next;
            }
            fiber = fiber.return;
          }
          return false;
        },
        null,
        { timeout: 60000 },
      );
      const data = JSON.parse(
        await fs.readFile(
          path.join(root, 'campuses', campus, 'baseline.json'),
          'utf8',
        ),
      );
      const places = data.places.filter((p) =>
        /international library|main library/i.test(p.name),
      );
      const centre =
        places[0]?.coordinates ||
        data.bounds[0].map((n, i) => (n + data.bounds[1][i]) / 2);
      for (const [name, pitch, dark, zoom] of [
        ['dense-3d-light', 55, false, 17.6],
        ['dense-3d-dark', 55, true, 17.6],
        ['overview-2d', 0, false, 16.3],
      ]) {
        if (pitch === 0)
          await page
            .getByRole('button', { name: 'Switch to 2D', exact: true })
            .click();
        await page.evaluate(
          ({ centre, pitch, dark, zoom }) => {
            document.documentElement.classList.toggle('dark', dark);
            localStorage.setItem(
              'turnright:appearance',
              dark ? 'dark' : 'light',
            );
            window.dispatchEvent(
              new StorageEvent('storage', {
                key: 'turnright:appearance',
                newValue: dark ? 'dark' : 'light',
              }),
            );
            window.reviewMap.jumpTo({
              center: centre,
              zoom,
              pitch,
              bearing: -20,
              padding: { top: 100, left: 380, right: 40, bottom: 100 },
            });
          },
          { centre, pitch, dark, zoom },
        );
        await page.waitForFunction(
          () => window.reviewMap.loaded() && !window.reviewMap.isMoving(),
          null,
          { timeout: 60000 },
        );
        await page.waitForTimeout(2200);
        if (
          pitch === 0 &&
          (await page
            .getByRole('button', { name: 'Switch to 3D', exact: true })
            .count()) !== 1
        )
          throw Error('2D mode was not activated');
        await page.screenshot({
          path: path.join(output, `${campus}-${variant}-${name}.png`),
        });
        report.push({ campus, variant, name, centre, pitch, zoom });
      }
      if (variant === 'after') {
        await page.locator('.visitor-layers summary').click();
        await page
          .getByRole('checkbox', { name: 'Greenery', exact: true })
          .uncheck();
        await page.reload();
        await page.locator('.visitor-layers summary').click();
        if (
          await page
            .getByRole('checkbox', { name: 'Greenery', exact: true })
            .isChecked()
        )
          throw Error('Visitor layer preference did not survive reload');
      }
      await context.close();
    }
} finally {
  await browser.close();
}
await fs.writeFile(
  path.join(root, 'visual-review.json'),
  JSON.stringify({ views: report, failures }, null, 2),
);
console.log(JSON.stringify({ views: report.length, failures }));
