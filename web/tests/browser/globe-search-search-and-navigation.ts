import { expect, test } from './coverage-fixture';
import { writeFile } from 'node:fs/promises';
import { lasuCampus } from '../../src/campus-context';
import type { GlobeSearchFixture } from './globe-search.spec';
export function registerSearchAndNavigation(
  fixture: () => GlobeSearchFixture,
): void {
  test('globe search portrait stays inside the visible viewport through keyboard and rotation', async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await fixture().setup(page);
    await fixture().open(page);
    await fixture().settledWorld(page);
    const dialog = page.getByRole('dialog', { name: 'Choose a campus' });
    const input = page.getByRole('searchbox', {
      name: 'Search published campuses',
    });
    await expect(
      page.getByRole('heading', { name: 'Choose a campus', exact: true }),
    ).toBeFocused();
    const inside = async (width: number, height: number) => {
      const box = await dialog.boundingBox();
      expect(box).toBeTruthy();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height);
    };
    await inside(390, 844);
    await page.screenshot({
      path: info.outputPath('globe-portrait-chooser.png'),
    });
    await input.fill('LAS');
    // Mobile keyboards can resize only visualViewport, leaving 100dvh unchanged.
    await page.evaluate(() => {
      Object.defineProperty(visualViewport!, 'height', {
        configurable: true,
        value: 400,
      });
      visualViewport!.dispatchEvent(new Event('resize'));
    });
    await expect
      .poll(async () => {
        const box = await dialog.boundingBox();
        return box!.y + box!.height;
      })
      .toBeLessThanOrEqual(400);
    await inside(390, 400);
    await expect(input).toHaveValue('LAS');
    await page.evaluate(() => {
      Reflect.deleteProperty(visualViewport!, 'height');
      visualViewport!.dispatchEvent(new Event('resize'));
    });
    await page.setViewportSize({ width: 844, height: 390 });
    await inside(844, 390);
    await expect(input).toHaveValue('LAS');
    await page.setViewportSize({ width: 390, height: 844 });
    await inside(390, 844);
    await page.waitForFunction(() => !window.editorTestMap.isMoving());
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Choose a campus', exact: true }),
    ).toBeFocused();
  });
  test('globe search frames the current campus, restores focus, and preserves the mounted map', async ({
    page,
  }, info) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1280, height: 720 });
    await fixture().setup(page);
    await fixture().open(page);
    await expect
      .poll(async () => (await fixture().camera(page)).zoom)
      .toBeLessThan(4);
    await page.waitForFunction(() => !window.editorTestMap.isMoving());
    await fixture().settledWorld(page);
    const chooser = await page
      .getByRole('dialog', { name: 'Choose a campus' })
      .boundingBox();
    expect(chooser).toBeTruthy();
    expect(chooser!.x).toBeGreaterThanOrEqual(0);
    expect(chooser!.y).toBeGreaterThanOrEqual(0);
    expect(chooser!.x + chooser!.width).toBeLessThanOrEqual(1280);
    expect(chooser!.y + chooser!.height).toBeLessThanOrEqual(720);
    await fixture().pixels(page);
    await page.screenshot({
      path: info.outputPath('globe-campus-chooser.png'),
    });
    expect((await fixture().camera(page)).pitch).toBe(0);
    expect((await fixture().camera(page)).bearing).toBe(0);
    await page.evaluate(() =>
      window.editorTestMap
        .getCanvas()
        .setAttribute('data-identity', 'original'),
    );
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Choose a campus', exact: true }),
    ).toBeFocused();
    expect((await fixture().camera(page)).zoom).toBeLessThan(4);
    await expect
      .poll(() => page.evaluate(() => window.editorTestMap.getPadding().right))
      .toBe(24);
    await fixture().open(page);
    await page
      .getByRole('button', { name: lasuCampus.name, exact: true })
      .click();
    await expect
      .poll(async () => (await fixture().camera(page)).zoom)
      .toBeGreaterThan(12);
    await expect(page.locator('.maplibregl-canvas')).toHaveAttribute(
      'data-identity',
      'original',
    );
    await page.context().setOffline(true);
    await fixture().open(page);
    await expect
      .poll(async () => (await fixture().camera(page)).zoom)
      .toBeLessThan(4);
    await page.context().setOffline(false);
    await page
      .getByRole('button', { name: 'North campus', exact: true })
      .click();
    await expect(page).toHaveURL(/campus=north-campus/);
  });
  test('globe search cancels deferred framing when closed and remains usable on world failure', async ({
    page,
  }) => {
    const slow = await fixture().setup(page, 'slow');
    await fixture().open(page);
    const before = await fixture().camera(page);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    slow.release();
    await page.waitForFunction(() => !!window.editorTestMap.getSource('world'));
    expect(await fixture().camera(page)).toEqual(before);
    await page.unroute('**/world/countries-50m-v5.1.2.geojson');
    await page.route('**/world/countries-50m-v5.1.2.geojson', (r) =>
      r.fulfill({ status: 503, body: 'Offline' }),
    );
    await page.reload();
    await fixture().attach(page);
    await fixture().open(page);
    await page
      .getByRole('searchbox', { name: 'Search published campuses' })
      .fill('North');
    await expect(
      page.getByRole('button', { name: 'North campus', exact: true }),
    ).toBeVisible();
    expect((await fixture().camera(page)).zoom).toBeGreaterThan(12);
  });
  test('globe search protects active directions and follow until a campus switch is confirmed', async ({
    page,
    browserName,
  }) => {
    await page.addInitScript(() =>
      Object.defineProperty(navigator, 'geolocation', {
        value: {
          watchPosition(callback: (p: GeolocationPosition) => void) {
            window.surveyGps = callback;
            return 1;
          },
          clearWatch() {
            window.surveyGps = undefined;
          },
        },
      }),
    );
    await fixture().setup(page);
    await page.getByRole('textbox', { name: 'Search campus' }).fill('Library');
    const result = page.getByRole('button', {
      name: 'Library Library · Ojo campus',
      exact: true,
    });
    if (browserName === 'webkit') await result.tap();
    else await result.click();
    await page.getByRole('button', { name: 'Directions', exact: true }).click();
    await page.getByLabel('Starting place').selectOption('gate');
    await page
      .getByRole('button', { name: 'Start walking', exact: true })
      .click();
    await page.waitForFunction(() => !!window.surveyGps);
    await page.evaluate(() =>
      window.surveyGps!({
        coords: {
          longitude: 3.20002,
          latitude: 6.46,
          accuracy: 5,
          heading: 90,
          speed: 1,
        } as GeolocationCoordinates,
        timestamp: Date.now(),
      } as GeolocationPosition),
    );
    await expect(
      page.getByRole('button', { name: 'Stop navigation', exact: true }),
    ).toBeVisible();
    await page.waitForFunction(() => !window.editorTestMap.isMoving());
    const before = await fixture().camera(page);
    await fixture().open(page);
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await fixture().camera(page)).toEqual(before);
    await page
      .getByRole('button', { name: 'North campus', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Stop and switch campus', exact: true }),
    ).toBeVisible();
    expect(await fixture().camera(page)).toEqual(before);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Stop navigation', exact: true }),
    ).toBeVisible();
    const watches = await page.evaluate(() => !!window.surveyGps);
    expect(watches).toBe(true);
    await fixture().open(page);
    await page
      .getByRole('button', { name: 'North campus', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Stop and switch campus', exact: true })
      .click();
    await expect(page).toHaveURL(/campus=north-campus/);
  });
  test('globe search mobile landscape observes container changes without a window resize', async ({
    page,
  }, info) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await fixture().setup(page);
    await fixture().open(page);
    await expect
      .poll(async () => (await fixture().camera(page)).zoom)
      .toBeLessThan(4);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    for (const size of [
      { width: 844, height: 390 },
      { width: 667, height: 375 },
      { width: 1024, height: 768 },
    ]) {
      await page.setViewportSize(size);
      await expect
        .poll(() =>
          page.evaluate(() => window.editorTestMap.getCanvas().clientHeight),
        )
        .toBe(size.height);
      await fixture().open(page);
      await expect
        .poll(() =>
          page.evaluate(() => window.editorTestMap.getPadding().right),
        )
        .toBeGreaterThan(200);
      await page.waitForFunction(
        () => window.editorTestMap.loaded() && !window.editorTestMap.isMoving(),
      );
      const layout = await page.evaluate(() => {
        const m = window.editorTestMap,
          r = m.getContainer().getBoundingClientRect(),
          p = m.getPadding();
        const c = m.project(m.getCenter());
        return {
          y: c.y,
          expected: ((p.top ?? 0) + r.height - (p.bottom ?? 0)) / 2,
          pitch: m.getPitch(),
        };
      });
      expect(layout.y).toBeCloseTo(layout.expected, 0);
      expect(layout.pitch).toBe(0);
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeHidden();
      await expect
        .poll(() =>
          page.evaluate(() => window.editorTestMap.getPadding().right),
        )
        .toBe(24);
      await page.waitForFunction(
        () => window.editorTestMap.loaded() && !window.editorTestMap.isMoving(),
      );
      await fixture().settledWorld(page);
      const rendered = await fixture().pixels(page);
      const centrePixel = await page.evaluate(() => {
        const map = window.editorTestMap,
          c = map.getCanvas(),
          p = map.project(map.getCenter()),
          ratio = c.width / c.clientWidth;
        return (
          (Math.round(c.height - p.y * ratio) * c.width +
            Math.round(p.x * ratio)) *
          4
        );
      });
      expect([...rendered.subarray(centrePixel, centrePixel + 3)]).not.toEqual([
        8, 15, 32,
      ]);
      await writeFile(
        info.outputPath(`landscape-${size.width}-camera.json`),
        JSON.stringify(
          {
            camera: await fixture().camera(page),
            centrePixel,
            rgba: [...rendered.subarray(centrePixel, centrePixel + 4)],
            length: rendered.length,
            layout: await page.evaluate(() => {
              const map = window.editorTestMap,
                c = map.getCanvas(),
                gl = c.getContext('webgl2')!;
              return {
                canvas: {
                  width: c.width,
                  height: c.height,
                  rect: c.getBoundingClientRect().toJSON(),
                },
                viewport: {
                  width: visualViewport?.width,
                  height: visualViewport?.height,
                },
                gl: [gl.drawingBufferWidth, gl.drawingBufferHeight],
                pad: map.getPadding(),
                container: map.getContainer().getBoundingClientRect().toJSON(),
              };
            }),
          },
          null,
          2,
        ),
      );
      expect(rendered[centrePixel + 3]).toBe(255);
      await page.screenshot({
        path: info.outputPath(`globe-${size.width}x${size.height}.png`),
      });
    }
    // Reproduces dynamic CSS/browser chrome sizing: no synthetic window.resize.
    await page.evaluate(() => {
      document.querySelector<HTMLElement>('.app-shell')!.style.height = '350px';
    });
    await expect
      .poll(() =>
        page.evaluate(() => window.editorTestMap.getCanvas().clientHeight),
      )
      .toBe(350);
  });
}
