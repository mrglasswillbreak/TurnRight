import { test, expect } from '@playwright/test';
import sharp from 'sharp';
test('image worker preserves orientation, formats and flattened redaction and cancels safely', async ({
  page,
}) => {
  await page.goto('/');
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
    for (const format of ['image/jpeg', 'image/webp', 'image/png'] as const) {
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
  expect(result.formats).toEqual(['image/jpeg', 'image/webp', 'image/png']);
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
