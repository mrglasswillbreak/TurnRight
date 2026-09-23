import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { CampusData } from '../../src/types';
const data: CampusData = JSON.parse(
  readFileSync('work/performance-campus.json', 'utf8'),
);
const buildings = data.map.features.filter(
  (f) => f.properties?.kind === 'building',
);
const sample = data.photos![0];
const image = readFileSync(`../data/photos/${sample.sha256}.webp`);
async function fixture(page: Page, restored = true) {
  await page.route('**/fixture-campus.json', (route) =>
    route.fulfill({ json: data }),
  );
  await page.route('**/packages/photos/**', (route) =>
    route.fulfill({ body: image, contentType: 'image/webp' }),
  );
  await page.route('https://editor-test.supabase.co/**', (route) =>
    route.fulfill({ json: {} }),
  );
  await page.addInitScript(
    ({ building, sample, restored }) => {
      if (restored)
        localStorage.setItem(
          `turnright:photo-drafts:performance-owner:building:${building}`,
          JSON.stringify(
            Array.from({ length: 20 }, (_, i) => ({
              key: `recovered-${i}`,
              filename: `View ${i + 1}`,
              metadata: { ...sample, buildingId: building },
              revision: 0,
              original: sample,
              state: 'needs details',
              reviewed: false,
              rightsReviewed: true,
              authorshipConfirmed: false,
            })),
          ),
        );
    },
    { building: String(buildings[0].properties!.id), sample, restored },
  );
  await page.goto('/tests/performance/index.html');
  await page.getByRole('button', { name: /Manage photos/ }).click();
}
for (const [width, height] of [
  [320, 700],
  [390, 844],
  [768, 900],
  [1440, 900],
  [640, 360],
])
  for (const theme of ['light', 'dark'])
    test(`photo layout ${width}x${height} ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height });
      await fixture(page);
      await page.evaluate(
        (theme) =>
          document.documentElement.classList.toggle('dark', theme === 'dark'),
        theme,
      );
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: /Review uploads/ }).click();
      await dialog
        .getByLabel('Caption', { exact: true })
        .fill('A responsive caption');
      await expect(dialog.getByLabel('Caption', { exact: true })).toHaveValue(
        'A responsive caption',
      );
      expect(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      ).toBe(true);
      const box = await dialog.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(-1);
      expect(box!.y).toBeGreaterThanOrEqual(-1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height + 1);
      await dialog.getByRole('button', { name: 'Next photo' }).click();
      await expect(
        dialog.locator('.photo-queue-card').nth(1).getByRole('button').first(),
      ).toHaveAttribute('aria-pressed', 'true');
      await dialog.getByLabel('Caption', { exact: true }).focus();
      await page.keyboard.press('Tab');
      await expect(
        dialog.getByLabel('Image description (alternative text)'),
      ).toBeFocused();
      await page.screenshot({ path: info.outputPath('photo-layout.png') });
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(
        page.getByRole('button', { name: /Manage photos/ }),
      ).toBeFocused();
    });
test('twenty uploads survive selection changes; a failure preserves the rest', async ({
  page,
}) => {
  let active = 0,
    maximum = 0,
    failed = false;
  const records = new Map<
    string,
    { metadata: Record<string, unknown>; status: string; revision: number }
  >();
  await page.route('**/api/admin', async (route) => {
    const { action, payload } = route.request().postDataJSON();
    if (action === 'media-begin') {
      records.set(payload.uploadId, {
        metadata: payload.metadata,
        status: 'pending',
        revision: 0,
      });
      return route.fulfill({
        json: {
          id: payload.uploadId,
          bucket: 'private',
          path: payload.uploadId,
          token: 'test',
        },
      });
    }
    const row = records.get(payload.id);
    if (action === 'media-status')
      return route.fulfill({ json: { status: row!.status } });
    if (action === 'media-process') {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise((r) => setTimeout(r, 80));
      active--;
      if (!failed) {
        failed = true;
        return route.fulfill({
          status: 503,
          json: { error: 'Processing interrupted' },
        });
      }
      row!.status = 'processed';
      return route.fulfill({
        json: {
          metadata: { ...sample, id: `owner:${payload.id}` },
          previewUrl: sample.url,
        },
      });
    }
    if (action === 'media-draft') {
      row!.metadata = payload.metadata;
      return route.fulfill({ json: { revision: ++row!.revision } });
    }
    return route.fulfill({ json: { previewUrl: sample.url } });
  });
  await fixture(page, false);
  await page.getByLabel('Add photos', { exact: true }).setInputFiles(
    Array.from({ length: 20 }, (_, i) => ({
      name: `view-${i}.webp`,
      mimeType: 'image/webp',
      buffer: image,
    })),
  );
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await page
    .getByLabel('Fixture building')
    .selectOption(String(buildings[1].properties!.id));
  await page.getByRole('button', { name: /Manage photos/ }).click();
  await page.getByRole('button', { name: /Review uploads/ }).click();
  await expect(page.getByText(/No unfinished photos/)).toBeVisible();
  await expect
    .poll(
      () =>
        [...records.values()].filter((r) => r.status === 'processed').length,
      { timeout: 30_000 },
    )
    .toBe(19);
  expect(maximum).toBe(1);
  expect(
    [...records.values()].every(
      (r) => r.metadata.buildingId === buildings[0].properties!.id,
    ),
  ).toBe(true);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await page
    .getByLabel('Fixture building')
    .selectOption(String(buildings[0].properties!.id));
  await page.getByRole('button', { name: /Manage photos/ }).click();
  await page.getByRole('button', { name: /Review uploads/ }).click();
  await page
    .getByRole('button', { name: 'Retry processing', exact: true })
    .click();
  await expect
    .poll(
      () =>
        [...records.values()].filter((r) => r.status === 'processed').length,
    )
    .toBe(20);
});
test('mobile keyboard viewport keeps focused fields and primary actions reachable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /Review uploads/ }).click();
  await page.evaluate(() => {
    Object.defineProperty(visualViewport!, 'height', {
      configurable: true,
      get: () => 360,
    });
    visualViewport!.dispatchEvent(new Event('resize'));
  });
  const caption = dialog.getByLabel('Caption', { exact: true });
  await caption.focus();
  await caption.scrollIntoViewIfNeeded();
  await expect(caption).toBeFocused();
  expect((await dialog.boundingBox())!.height).toBeLessThanOrEqual(361);
  const action = await dialog
    .getByRole('button', { name: 'Add reviewed photos to draft' })
    .boundingBox();
  expect(action!.height).toBeGreaterThanOrEqual(44);
  expect(action!.y + action!.height).toBeLessThanOrEqual(361);
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: /Manage photos/ }),
  ).toBeFocused();
});
test('200 private uploads stay paginated and request visible previews once', async ({
  page,
}) => {
  let signed = 0;
  await page.route('**/api/admin', async (route) => {
    const { action, payload } = route.request().postDataJSON();
    if (action === 'media-library')
      return route.fulfill({
        json: {
          items: Array.from({ length: 20 }, (_, n) => ({
            id: String(payload.offset + n),
            status: 'processed',
            metadata: {
              ...sample,
              caption: `Library view ${payload.offset + n}`,
            },
            revision: 0,
          })),
          nextOffset: payload.offset < 180 ? payload.offset + 20 : null,
        },
      });
    if (action === 'media-preview') signed++;
    return route.fulfill({
      json: {
        previewUrl: sample.url,
        previewExpiresAt: Date.now() + 3_600_000,
      },
    });
  });
  await fixture(page);
  await page
    .getByRole('button', { name: 'Private uploads', exact: true })
    .click();
  await expect(page.locator('.photo-card')).toHaveCount(20);
  await expect(page.getByText('Library view 0', { exact: true })).toBeVisible();
  expect(signed).toBeLessThanOrEqual(20);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.locator('.photo-card')).toHaveCount(20);
  await expect(
    page.getByText('Library view 20', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Previous page', exact: true })
    .click();
  await expect(page.getByText('Library view 0', { exact: true })).toBeVisible();
  expect(signed).toBeLessThanOrEqual(40);
  for (let offset = 20; offset <= 180; offset += 20) {
    await page.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(
      page.getByText(`Library view ${offset}`, { exact: true }),
    ).toBeVisible();
    await expect(page.locator('.photo-card')).toHaveCount(20);
  }
  await expect(
    page.getByRole('button', { name: 'Next page', exact: true }),
  ).toHaveCount(0);
  expect(signed).toBeLessThanOrEqual(200);
});
for (const dark of [false, true])
  test(`photo workspace at 200% equivalent reflow, ${dark ? 'dark' : 'light'}`, async ({
    page,
  }) => {
    const cdp = await page.context().newCDPSession(page);
    // A 1440x900 DPR-1 desktop at 200% zoom has a 720x450 CSS viewport and DPR 2.
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 720,
      height: 450,
      screenWidth: 1440,
      screenHeight: 900,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await fixture(page);
    await page.evaluate(
      (dark) => document.documentElement.classList.toggle('dark', dark),
      dark,
    );
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /Review uploads/ }).click();
    await dialog
      .getByLabel('Caption', { exact: true })
      .fill('Readable at two hundred percent');
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    const action = await dialog
      .getByRole('button', { name: 'Add reviewed photos to draft' })
      .boundingBox();
    expect(action!.height).toBeGreaterThanOrEqual(44);
    expect(action!.y + action!.height).toBeLessThanOrEqual(450);
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: /Manage photos/ }),
    ).toBeFocused();
  });
