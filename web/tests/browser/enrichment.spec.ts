import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { campusFixture } from '../fixture';

async function prepare(page: Page) {
  const data = campusFixture();
  data.places.push({
    ...data.places[0],
    id: 'cafe',
    name: 'Campus Café',
    aliases: ['Student kitchen'],
    category: 'food',
    subtype: 'restaurant',
    address: '12 Faculty Road',
    website: 'https://example.com/cafe',
    phone: '+234 123456',
    openingHours: 'Mo-Fr 08:00-18:00',
    graphNode: undefined,
    arrivalKind: 'unmapped',
    evidence: {
      openingHours: [
        {
          sourceId: 'campus-review',
          recordId: 'business-notice',
          checkedAt: '2026-09-22',
        },
      ],
    },
  });
  data.map.features.push({
    type: 'Feature',
    properties: {
      id: 'faculty-road',
      kind: 'path',
      name: 'Faculty Road',
      walkingAccess: 'yes',
    },
    geometry: {
      type: 'LineString',
      coordinates: [
        [3.2, 6.46],
        [3.201, 6.46],
      ],
    },
  });
  const bytes = JSON.stringify(data);
  await page
    .context()
    .route('**/packages/latest.json', (route) =>
      route.fulfill({
        json: {
          schemaVersion: 1,
          version: data.version,
          createdAt: data.createdAt,
          dataUrl: '/packages/fixture/campus.json',
          bytes: Buffer.byteLength(bytes),
          assets: [
            {
              url: '/packages/fixture/campus.json',
              bytes: Buffer.byteLength(bytes),
              sha256: createHash('sha256').update(bytes).digest('hex'),
            },
          ],
        },
      }),
    );
  await page
    .context()
    .route('**/packages/fixture/campus.json', (route) =>
      route.fulfill({ json: data }),
    );
  return data;
}

for (const width of [1440, 390])
  test(`enriched details and street search at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await prepare(page);
    await page.goto('/?place=cafe');
    await expect(
      page.getByRole('heading', { name: 'Campus Café', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Mo-Fr 08:00-18:00', { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText('Walking connection not yet mapped.', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Business website (online)' }),
    ).toHaveAttribute('href', 'https://example.com/cafe');
    await page
      .getByRole('button', { name: 'Back to places', exact: true })
      .click();
    const search = page.getByPlaceholder(/Search/).first();
    await search.fill('Faculty Road');
    await expect(
      page.getByRole('button', { name: /Faculty Road Street/ }),
    ).toBeVisible();
    await page.getByRole('button', { name: /Faculty Road Street/ }).click();
    await expect(
      page.getByText('Faculty Road highlighted.', { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Start walking', exact: true }),
    ).toHaveCount(0);
  });

test('prepared offline enrichment retains business details on reload', async ({
  page,
  context,
}) => {
  await prepare(page);
  await page.goto('/?place=cafe');
  await expect(
    page.getByRole('heading', { name: 'Campus Café', exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Campus Café', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Mo-Fr 08:00-18:00', { exact: false }),
  ).toBeVisible();
});
