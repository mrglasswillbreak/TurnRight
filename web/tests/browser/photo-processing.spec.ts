import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import type { LocalPhoto } from '../../src/photo-local';
test('image worker preserves orientation, formats and flattened redaction and cancels safely', async ({
  page,
}) => {
  await page.goto('/tests/browser/photo-harness.html');
  const input = await sharp({
    create: { width: 400, height: 200, channels: 3, background: '#ee5522' },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const result = await page.evaluate(async (data) => {
    const clientPath = '/src/photo-edit-client.ts',
      recipePath = '/src/photo-edit.ts';
    const { editPhotoTask } = await import(clientPath);
    const { defaultPhotoRecipe } = await import(recipePath);
    const file = new Blob([new Uint8Array(data)], { type: 'image/jpeg' });
    const recipe = {
      ...defaultPhotoRecipe(),
      format: 'image/png' as const,
      rotation: 90,
      masks: [{ x: 0, y: 0, width: 0.5, height: 0.5, mode: 'redact' as const }],
    };
    const output = await editPhotoTask(
      file,
      recipe,
      new AbortController().signal,
    );
    const formats = [];
    for (const format of [
      'image/jpeg',
      'image/webp',
      'image/png',
      'image/avif',
    ] as const) {
      const next = await editPhotoTask(
        file,
        { ...recipe, format },
        new AbortController().signal,
      );
      formats.push(next.blob.type);
    }
    const controller = new AbortController();
    const pending = editPhotoTask(file, recipe, controller.signal);
    controller.abort();
    let cancelled = '';
    try {
      await pending;
    } catch (e) {
      cancelled = (e as Error).name;
    }
    return {
      data: Array.from(new Uint8Array(await output.blob.arrayBuffer())),
      width: output.width,
      height: output.height,
      formats,
      cancelled,
    };
  }, Array.from(input));
  expect(result.formats).toEqual([
    'image/jpeg',
    'image/webp',
    'image/png',
    'image/avif',
  ]);
  expect(result.cancelled).toBe('AbortError');
  expect([result.width, result.height]).toEqual([400, 200]);
  const output = Buffer.from(result.data);
  expect((await sharp(output).metadata()).exif).toBeUndefined();
  const redacted = await sharp(output)
    .extract({ left: 20, top: 20, width: 1, height: 1 })
    .removeAlpha()
    .raw()
    .toBuffer();
  expect([...redacted]).toEqual([17, 24, 39]);
  const retained = await sharp(output)
    .extract({ left: 300, top: 100, width: 1, height: 1 })
    .removeAlpha()
    .raw()
    .toBuffer();
  expect(retained[0]).toBeGreaterThan(220);
});

test('Squoosh codecs reduce a photographic image with bounded distortion', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto('/tests/browser/photo-harness.html');
  const sample = JSON.parse(
    readFileSync(
      new URL('../../../data/photos/catalogue.json', import.meta.url),
      'utf8',
    ),
  )[0];
  const input = await sharp(
    readFileSync(
      new URL(`../../../data/photos/${sample.sha256}.webp`, import.meta.url),
    ),
  )
    .resize(800)
    .png()
    .toBuffer();
  const outputs = await page.evaluate(async (data) => {
    const path = '/src/photo-edit-client.ts',
      recipes = '/src/photo-edit.ts';
    const { editPhotoTask } = await import(path),
      { defaultPhotoRecipe } = await import(recipes);
    const result = [];
    for (const format of ['image/webp', 'image/jpeg', 'image/avif']) {
      const out = await editPhotoTask(
        new Blob([new Uint8Array(data)], { type: 'image/png' }),
        { ...defaultPhotoRecipe(), format, targetKiB: 0, quality: 0.85 },
        new AbortController().signal,
      );
      result.push({
        format,
        data: Array.from(new Uint8Array(await out.blob.arrayBuffer())),
      });
    }
    return result;
  }, Array.from(input));
  const raw = await sharp(input).removeAlpha().raw().toBuffer();
  for (const out of outputs) {
    expect(out.data.length, out.format).toBeLessThan(input.length * 0.65);
    const decoded = await sharp(Buffer.from(out.data))
      .removeAlpha()
      .raw()
      .toBuffer();
    expect(decoded.length).toBe(raw.length);
    const mae =
      decoded.reduce((n, v, i) => n + Math.abs(v - raw[i]), 0) / raw.length;
    expect(mae, out.format).toBeLessThan(12);
    console.log(
      `${out.format}: ${input.length} → ${out.data.length} bytes, mean pixel error ${mae.toFixed(2)}/255`,
    );
  }
});

for (const broken of [false, true])
  test(`photo comparison compresses all added files automatically${broken ? ' and retains failed originals' : ''}`, async ({
    page,
  }) => {
    await page.goto('/tests/browser/photo-harness.html');
    const input = await sharp({
      create: { width: 1800, height: 1000, channels: 3, background: '#ee7755' },
    })
      .png()
      .toBuffer();
    const names = broken
      ? ['First.png', 'Broken.png', 'Last.png']
      : ['First.png', 'Last.png'];
    await page.getByLabel('Add test photograph').setInputFiles(
      names.map((name) => ({
        name,
        mimeType: 'image/png',
        buffer: name === 'Broken.png' ? input.subarray(0, 33) : input,
      })),
    );
    // Never select the last file or press Preview/Optimise: adding the batch starts encoding.
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const path = '/src/photo-local.ts';
            const { localPhotos } = await import(path);
            return (
              await localPhotos('photo-test-owner', 'building:fixture')
            ).filter((p: { output?: Blob }) => p.output).length;
          }),
        { timeout: 30000 },
      )
      .toBe(2);
    const stored = await page.evaluate(async () => {
      const path = '/src/photo-local.ts';
      const { localPhotos } = await import(path);
      return (await localPhotos('photo-test-owner', 'building:fixture')).map(
        (p: LocalPhoto) => ({
          name: p.filename,
          original: p.source.size,
          output: p.output?.size,
          format: p.output?.type,
          width: p.width,
          quality: p.recipe.quality,
        }),
      );
    });
    expect(stored).toHaveLength(names.length);
    for (const photo of stored) {
      expect(photo.original).toBe(
        photo.name === 'Broken.png' ? 33 : input.length,
      );
      if (photo.name === 'Broken.png') expect(photo.output).toBeUndefined();
      else {
        expect(photo.format).toBe('image/webp');
        expect(photo.width).toBe(1600);
        expect(photo.quality).toBe(0.84);
        expect(photo.output).toBeLessThan(input.length);
        expect(photo.output).toBeLessThanOrEqual(250 * 1024);
      }
    }
    if (broken)
      await expect(page.getByRole('dialog')).toContainText(
        '2 of 3 photos compressed. Originals retained.',
      );
    else
      await expect(page.getByRole('dialog')).toContainText(
        '2 photos compressed locally.',
      );
  });

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 390, height: 844, theme: 'dark' },
])
  test(`photo comparison edits and restores local recipes at ${viewport.width}px${viewport.theme ? ' in dark mode' : ''}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await page.goto('/tests/browser/photo-harness.html');
    if (viewport.theme === 'dark')
      await page.evaluate(() => document.documentElement.classList.add('dark'));
    const sample = JSON.parse(
      readFileSync(
        new URL('../../../data/photos/catalogue.json', import.meta.url),
        'utf8',
      ),
    )[0];
    await page.getByLabel('Add test photograph').setInputFiles({
      name: 'School of Communication.webp',
      mimeType: 'image/webp',
      buffer: readFileSync(
        new URL(`../../../data/photos/${sample.sha256}.webp`, import.meta.url),
      ),
    });
    const dialog = page.getByRole('dialog', { name: 'Edit & optimise photos' });
    const download = dialog.getByRole('button', {
      name: 'Download edited image',
      exact: true,
    });
    await expect(download).toBeEnabled({ timeout: 30000 });
    const portrait = viewport.width < 600 && viewport.height > viewport.width;
    const settingsToggle = dialog.getByRole('button', {
      name: 'Show compression settings',
      exact: true,
    });
    if (portrait) {
      await expect(settingsToggle).toHaveAttribute('aria-expanded', 'false');
      await settingsToggle.click();
    }
    await dialog.getByText('Resize', { exact: true }).click();
    await dialog.getByLabel('Longest edge (px)').fill('800');
    await expect(dialog.locator('.photo-result-output')).toContainText(
      '800 × 600',
      { timeout: 30000 },
    );
    await dialog.getByText('Crop & orientation', { exact: true }).click();
    await dialog
      .getByRole('button', { name: 'Rotate right', exact: true })
      .click();
    await expect(dialog.getByLabel('Straighten')).toHaveValue('90');
    await expect(dialog.locator('.photo-result-output')).toContainText(
      '600 × 800',
      { timeout: 30000 },
    );
    await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(dialog.locator('.photo-result-output')).toContainText(
      '800 × 600',
      { timeout: 30000 },
    );
    await dialog.getByText('Crop & orientation', { exact: true }).click();
    await dialog.getByText('Resize', { exact: true }).click();
    const wipe = dialog.getByRole('slider', {
      name: 'Before and after comparison',
    });
    await wipe.press('Home');
    await expect(wipe).toHaveAttribute('aria-valuenow', '0');
    await wipe.press('End');
    await expect(wipe).toHaveAttribute('aria-valuenow', '100');
    await wipe.press('ArrowLeft');
    await expect(wipe).toHaveAttribute('aria-valuenow', '98');
    // Centre it for visual review, then verify two-finger/pointer cancellation doesn't edit a recipe.
    for (let i = 0; i < 24; i++) await wipe.press('ArrowLeft');
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(bounds!.height).toBeLessThanOrEqual(viewport.height + 1);
    await dialog.getByLabel('Download format').scrollIntoViewIfNeeded();
    await dialog.getByLabel('Download format').focus();
    if (portrait) {
      const quality = dialog.getByRole('slider', {
        name: 'Quality',
        exact: true,
      });
      await quality.scrollIntoViewIfNeeded();
      await quality.focus();
      await expect
        .poll(() =>
          quality.evaluate((el) => {
            const b = el.getBoundingClientRect();
            return (
              document.elementFromPoint(
                b.x + b.width / 2,
                b.y + b.height / 2,
              ) === el
            );
          }),
        )
        .toBe(true);
      await page.screenshot({
        path: info.outputPath('photo-editor-390-controls.png'),
      });
      await settingsToggle.click();
      const dismiss = dialog.getByRole('button', {
        name: 'Dismiss image notice',
      });
      if (await dismiss.isVisible()) await dismiss.click();
      await expect(wipe).toHaveAttribute('aria-orientation', 'vertical');
      await wipe.press('ArrowDown');
      await expect(wipe).toHaveAttribute('aria-valuenow', '52');
      const dividerY = await dialog
        .locator('.photo-wipe')
        .evaluate((el) => parseFloat(getComputedStyle(el, '::before').top));
      expect(dividerY).toBeCloseTo(viewport.height * 0.52, 0);
      await page.setViewportSize({ width: 844, height: 390 });
      await expect(wipe).toHaveAttribute('aria-orientation', 'horizontal');
      await expect(wipe).toHaveAttribute('aria-valuenow', '52');
      await page.setViewportSize(viewport);
      await expect(wipe).toHaveAttribute('aria-orientation', 'vertical');
      // Dragging the horizontal divider must move vertically, independently of canvas pan.
      await page.mouse.move(viewport.width / 2, viewport.height * 0.52);
      await page.mouse.down();
      await page.mouse.move(viewport.width / 2, viewport.height * 0.65, {
        steps: 8,
      });
      await page.mouse.up();
      await expect
        .poll(async () => Number(await wipe.getAttribute('aria-valuenow')))
        .toBeGreaterThan(60);
      await wipe.press('Home');
      for (let i = 0; i < 25; i++) await wipe.press('ArrowDown');
      await expect(wipe).toHaveAttribute('aria-valuenow', '50');
      const originalBar = (await dialog
        .locator('.photo-result-original')
        .boundingBox())!;
      const editedBar = (await dialog
        .locator('.photo-result-output')
        .boundingBox())!;
      expect(originalBar.y + originalBar.height).toBeLessThanOrEqual(
        editedBar.y,
      );
      expect(editedBar.y + editedBar.height).toBeLessThanOrEqual(
        viewport.height,
      );
    }
    await page.screenshot({
      path: info.outputPath(`photo-editor-${viewport.width}.png`),
    });
    await dialog.getByRole('button', { name: 'Close image editor' }).click();
    await expect(dialog).toBeHidden();
    const recipe = await page.evaluate(async () => {
      const path = '/src/photo-local.ts';
      const { localPhotos } = await import(path);
      return (await localPhotos('photo-test-owner', 'building:fixture'))[0]
        .recipe;
    });
    expect(recipe.width).toBe(800);
    expect(recipe.rotation).toBe(0);
  });
