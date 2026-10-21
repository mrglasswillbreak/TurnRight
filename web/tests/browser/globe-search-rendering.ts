import { expect, test } from './coverage-fixture';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import type { GlobeSearchFixture } from './globe-search.spec';
export function registerRendering(fixture: () => GlobeSearchFixture): void {
  test('globe search stars change with orientation, occlude behind Earth, persist and recover WebGL', async ({
    page,
  }, info) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await fixture().setup(page);
    await fixture().open(page);
    await expect
      .poll(async () => (await fixture().camera(page)).zoom)
      .toBeLessThan(4);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Hide stars', exact: true }),
    ).toBeVisible();
    // Closing the chooser restores symmetric horizontal framing on the next RAF.
    // Capture only after that lens change: camera longitude alone is insufficient
    // for a pixel-identical comparison (the chooser had shifted the sky by 144px).
    await page.waitForFunction(() => {
      const map = window.editorTestMap;
      const padding = map.getPadding();
      return !map.isMoving() && padding.left === padding.right;
    });
    await fixture().settledWorld(page);
    const initial = await fixture().camera(page),
      a = await fixture().pixels(page);
    await page.screenshot({ path: info.outputPath('stars-africa.png') });
    await page.evaluate(() =>
      window.editorTestMap.jumpTo({
        center: [150, -20],
        bearing: 25,
        pitch: 10,
      }),
    );
    const b = await fixture().pixels(page);
    expect(a).not.toEqual(b);
    await page.screenshot({ path: info.outputPath('stars-pacific.png') });
    await page.evaluate(
      (c) =>
        window.editorTestMap.jumpTo({
          ...c,
          center: c.center as [number, number],
        }),
      initial,
    );
    const restored = await fixture().pixels(page);
    // Compare the sky, independently of asynchronously fading map labels/tiles.
    const sky = (pixels: Buffer) =>
      createHash('sha256')
        .update(pixels.subarray(0, 844 * 32 * 4))
        .digest('hex');
    expect(sky(restored)).toBe(sky(a));
    await page.getByRole('button', { name: 'Hide stars', exact: true }).click();
    // Settle symbol placement separately so the occlusion check measures stars.
    await page.waitForFunction(
      () => window.editorTestMap.loaded() && !window.editorTestMap.isMoving(),
    );
    const without = await fixture().pixels(page);
    await page.getByRole('button', { name: 'Show stars', exact: true }).click();
    const withStars = await fixture().pixels(page);
    let differences = 0,
      middle = 0;
    const centre = await page.evaluate(() => {
      const m = window.editorTestMap,
        p = m.project(m.getCenter());
      return [p.x, m.getCanvas().height - p.y];
    });
    for (let i = 0; i < withStars.length; i += 4)
      if (
        withStars[i] !== without[i] ||
        withStars[i + 1] !== without[i + 1] ||
        withStars[i + 2] !== without[i + 2]
      ) {
        differences++;
        const x = (i / 4) % 844,
          y = Math.floor(i / 4 / 844);
        if (Math.hypot(x - centre[0], y - centre[1]) < 45) middle++;
      }
    expect(differences).toBeGreaterThan(30);
    expect(middle).toBe(0);
    await page.getByRole('button', { name: 'Hide stars', exact: true }).click();
    await page.reload();
    await fixture().attach(page);
    await fixture().open(page);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Show stars', exact: true }),
    ).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Show stars', exact: true }).click();
    const supported = await page.evaluate(() => {
      const gl = window.editorTestMap.getCanvas().getContext('webgl2')!;
      const ext = gl.getExtension('WEBGL_lose_context');
      if (!ext) return false;
      ext.loseContext();
      setTimeout(() => ext.restoreContext(), 150);
      return true;
    });
    if (supported) {
      await page.waitForFunction(
        () =>
          !window.editorTestMap
            .getCanvas()
            .getContext('webgl2')!
            .isContextLost() &&
          !!window.editorTestMap.getLayer('world-stars') &&
          window.editorTestMap.loaded(),
      );
      const recovered = await fixture().pixels(page);
      expect(recovered.some((v, i) => i % 4 !== 3 && v > 32)).toBe(true);
      await expect(
        page.getByText('Map graphics paused.', { exact: false }),
      ).toBeHidden();
      await expect(
        page.getByText('Stars unavailable', { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Hide stars', exact: true }),
      ).toBeEnabled();
    }
  });
  test('globe search keeps navy stars in both themes and the sunlit horizon only in light mode', async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await fixture().setup(page);
    await fixture().open(page);
    await expect
      .poll(async () => (await fixture().camera(page)).zoom)
      .toBeLessThan(4);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.waitForFunction(
      () => window.editorTestMap.loaded() && !window.editorTestMap.isMoving(),
    );
    const light = await page.evaluate(() => window.editorTestMap.getSky());
    expect(light['atmosphere-blend']).toEqual([
      'interpolate',
      ['linear'],
      ['zoom'],
      0,
      0.55,
      5,
      0.55,
      8,
      0,
    ]);
    const a = await fixture().pixels(page);
    await page.screenshot({ path: info.outputPath('globe-light-africa.png') });
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect
      .poll(() =>
        page.evaluate(() => window.editorTestMap.getSky()['atmosphere-blend']),
      )
      .toBe(0);
    await fixture().pixels(page);
    await page.screenshot({ path: info.outputPath('globe-dark-africa.png') });
    const darkSky = await page.evaluate(() => window.editorTestMap.getSky());
    expect(darkSky['horizon-color']).toBe('#080f20');
    const hashes = new Set<string>();
    for (const centre of [
      [150, -20],
      [-179, 20],
      [179, 20],
      [0, 85],
      [0, -85],
    ]) {
      await page.evaluate(
        (center) =>
          window.editorTestMap.jumpTo({
            center: center as [number, number],
            bearing: 25,
            pitch: 10,
          }),
        centre,
      );
      const data = await fixture().pixels(page);
      hashes.add(
        createHash('sha256')
          .update(data.subarray(0, 1440 * 24 * 4))
          .digest('hex'),
      );
    }
    expect(hashes.size).toBe(5);
    await page.evaluate(() =>
      window.editorTestMap.jumpTo({ center: [150, -20], bearing: 0, pitch: 0 }),
    );
    await fixture().pixels(page);
    await page.screenshot({ path: info.outputPath('globe-dark-pacific.png') });
    await page.emulateMedia({ colorScheme: 'light' });
    await expect
      .poll(() =>
        page.evaluate(() => window.editorTestMap.getSky()['horizon-color']),
      )
      .toBe('#d8e8f2');
    await fixture().pixels(page);
    await page.screenshot({ path: info.outputPath('globe-light-pacific.png') });
    expect(a.some((v, i) => i % 4 !== 3 && v > 32)).toBe(true);
    await page.evaluate(() => window.editorTestMap.jumpTo({ zoom: 6 }));
    await expect
      .poll(() =>
        page
          .locator('.map-canvas')
          .evaluate((el) =>
            (el as HTMLElement).style.getPropertyValue('--space'),
          ),
      )
      .toBe('0%');
  });
  test('globe search stars reuse repaint events without an idle animation loop', async ({
    page,
  }, info) => {
    await fixture().setup(page);
    await fixture().open(page);
    await fixture().settledWorld(page);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.waitForFunction(
      () => window.editorTestMap.loaded() && !window.editorTestMap.isMoving(),
    );
    await page.waitForTimeout(500);
    const timings: Record<string, number[]> = {};
    for (const stars of [true, false]) {
      if (!stars)
        await page
          .getByRole('button', { name: 'Hide stars', exact: true })
          .click();
      timings[String(stars)] = await page.evaluate(async () => {
        const map = window.editorTestMap;
        const times: number[] = [];
        for (let i = 0; i < 15; i++) {
          const start = performance.now();
          await new Promise<void>((resolve) => {
            map.once('render', () => {
              map.getCanvas().getContext('webgl2')!.finish();
              resolve();
            });
            map.triggerRepaint();
          });
          if (i >= 3) times.push(performance.now() - start);
        }
        return times;
      });
    }
    await page.getByRole('button', { name: 'Show stars', exact: true }).click();
    // Wait for the toggle's repaint and pending map work, not an arbitrary delay.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const map = window.editorTestMap;
          map.once('idle', () => resolve());
          map.triggerRepaint();
        }),
    );
    const idleFrames = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const map = window.editorTestMap;
          let frames = 0;
          const count = () => frames++;
          map.on('render', count);
          setTimeout(() => {
            map.off('render', count);
            resolve(frames);
          }, 500);
        }),
    );
    expect(idleFrames).toBe(0);
    await writeFile(
      info.outputPath('star-render-cost.json'),
      JSON.stringify(
        {
          timings,
          idleFrames,
          note: 'Whole-map repaint latency including requestAnimationFrame and GPU completion; software browser, not device performance.',
        },
        null,
        2,
      ),
    );
  });
}
