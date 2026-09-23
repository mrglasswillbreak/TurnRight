import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { campusFixture } from '../fixture';
async function prepare(page: Page) {
  const data = campusFixture();
  data.places[0].buildingId = 'building';
  data.places.push({
    ...data.places[0],
    id: 'gate',
    name: 'Main gate',
    buildingId: undefined,
    graphNode: 'a',
    coordinates: data.graph.nodes[0].coordinates,
  });
  data.map.features.push({
    ...data.boundary,
    properties: { id: 'building', kind: 'building', name: 'Library' },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [3.202, 6.46],
          [3.203, 6.46],
          [3.203, 6.461],
          [3.202, 6.46],
        ],
      ],
    },
  });
  data.entrances = ['b', 'c'].map((id) => ({
    id: `door-${id}`,
    name: id === 'c' ? 'Library east entrance' : 'Library courtyard entrance',
    placeId: 'library',
    buildingId: 'building',
    source: 'review',
    coordinates: data.graph.nodes.find((n) => n.id === id)!.coordinates,
    graphNode: id,
    walkingAccess: 'yes',
  }));
  const photoBytes = await sharp({
    create: { width: 40, height: 30, channels: 3, background: '#bd8a59' },
  })
    .webp()
    .toBuffer();
  const sha256 = createHash('sha256').update(photoBytes).digest('hex'),
    url = `/packages/photos/${sha256}.webp`;
  data.photos = [1, 2, 3, 4].map((n) => ({
    id: `p${n}`,
    buildingId: 'building',
    url,
    sha256,
    bytes: photoBytes.length,
    width: 40,
    height: 30,
    caption: `Library photograph ${n}`,
    alt: `Library exterior view ${n}`,
    author: 'Campus photographer',
    sourceUrl: 'https://example.org/photos',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    attribution: 'Campus photographer · CC BY-SA 4.0',
    modifications: 'Converted to WebP; metadata removed',
    checkedAt: '2026-09-23',
    historical: n === 4,
  }));
  const bytes = JSON.stringify(data),
    dataUrl = '/packages/fixture/campus.json';
  const assets = [
    {
      url: dataUrl,
      bytes: Buffer.byteLength(bytes),
      sha256: createHash('sha256').update(bytes).digest('hex'),
    },
    { url, sha256, bytes: photoBytes.length },
  ];
  await page.context().route('**/packages/latest.json', (route) =>
    route.fulfill({
      json: {
        schemaVersion: 1,
        version: 'fixture',
        createdAt: data.createdAt,
        summary: 'Arrival fixture',
        dataUrl,
        bytes: assets.reduce((n, a) => n + a.bytes, 0),
        assets,
        photos: { bytes: photoBytes.length, assetUrls: [url] },
      },
    }),
  );
  await page
    .context()
    .route('**/packages/fixture/campus.json', (route) =>
      route.fulfill({ json: data }),
    );
  await page
    .context()
    .route('**/packages/photos/*.webp', (route) =>
      route.fulfill({ body: photoBytes, contentType: 'image/webp' }),
    );
}
for (const width of [1440, 390])
  test(`gallery, entrance links and route selection at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await prepare(page);
    await page.goto('/?place=library&entrance=door-c');
    await expect(
      page.getByRole('img', { name: 'Library exterior view 1', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Next photograph' }).focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('img', { name: 'Library exterior view 2', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel('Destination entrance', { exact: true }),
    ).toHaveValue('door-c');
    await page.getByText('Photo credits & license', { exact: true }).click();
    await expect(
      page.getByRole('link', { name: 'CC BY-SA 4.0', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Directions', exact: true }).click();
    await page.getByLabel('Starting place').selectOption('gate');
    await expect(
      page.getByRole('button', { name: 'Start walking', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel('Destination entrance', { exact: true }),
    ).toHaveValue('door-c');
    await page
      .getByText('Chosen entrance & arrival guide', { exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Library east entrance · selected' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Library courtyard entrance' }),
    ).toHaveCount(0);
    await page.goto('/?place=library&entrance=missing');
    await expect(
      page.getByText('The selected entrance is no longer available.', {
        exact: false,
      }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Directions', exact: true }).click();
    await page.getByLabel('Starting place').selectOption('gate');
    await expect(
      page.getByText(
        'The selected entrance is unavailable or has no permitted mapped connection.',
        { exact: false },
      ),
    ).toBeVisible();
    await page
      .getByLabel('Destination entrance', { exact: true })
      .selectOption('door-b');
    await expect(
      page.getByRole('button', { name: 'Start walking', exact: true }),
    ).toBeVisible();
  });
test('prepared offline arrival photographs survive reload with credits and entrance selection', async ({
  page,
  context,
  baseURL,
}) => {
  test.skip(!baseURL?.includes('5184'), 'Production service worker test');
  await prepare(page);
  await page.goto('/?place=library&entrance=door-c');
  await expect(
    page.getByRole('img', { name: 'Library exterior view 1', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Offline', exact: true }).click();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page
    .getByRole('button', { name: 'Download campus map', exact: true })
    .click();
  await expect(page.getByText('Ready offline', { exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole('img', { name: 'Library exterior view 1', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Destination entrance', { exact: true }),
  ).toHaveValue('door-c');
  await page.getByText('Photo credits & license', { exact: true }).click();
  await expect(
    page.getByText('Campus photographer · CC BY-SA 4.0', { exact: true }),
  ).toBeVisible();
  const loaded = await page
    .getByRole('img', { name: 'Library exterior view 1', exact: true })
    .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
  expect(loaded).toBe(true);
});
