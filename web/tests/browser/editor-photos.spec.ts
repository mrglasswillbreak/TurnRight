import { collapseExplorer } from './editor-navigation';
import { test, expect } from './coverage-fixture';
import { readFileSync } from 'node:fs';
import type { CampusPhoto } from '../../src/types';
import { browserCampus, setup } from './editor-fixture';
import { attachMap, clickMap, focusCampus } from './editor-map-helpers';

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
});

for (const width of [1440, 390])
  test(`photo workspace uploads, recovery and covers at ${width}px`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: width === 390 ? 'dark' : 'light' });
    const server = await setup(page);
    const catalogue = JSON.parse(
      readFileSync(
        new URL('../../../data/photos/catalogue.json', import.meta.url),
        'utf8',
      ),
    ) as CampusPhoto[];
    const samples = catalogue.slice(0, 2);
    const records = new Map<
      string,
      {
        metadata: Partial<CampusPhoto>;
        draft: Partial<CampusPhoto>;
        revision: number;
        status: string;
        filename: string;
      }
    >();
    let failed = false,
      approvalInterrupted = false;
    const approvals = new Map<string, number>();
    await page.route('**/api/admin', async (route) => {
      const { action, payload } = route.request().postDataJSON();
      if (!action.startsWith('media-')) return route.fallback();
      if (action === 'media-begin') {
        if (records.has(payload.uploadId))
          return route.fulfill({
            json: {
              id: payload.uploadId,
              bucket: 'building-media',
              path: `owner/${payload.uploadId}/original`,
              token: 'test-only',
            },
          });
        const index = records.size;
        const sample = samples[index];
        const id = `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`;
        records.set(id, {
          filename: payload.filename,
          status: 'pending',
          revision: 0,
          draft: payload.metadata,
          metadata: {
            id: `owner:${id}`,
            url: sample.url,
            sha256: sample.sha256,
            bytes: sample.bytes,
            width: sample.width,
            height: sample.height,
          },
        });
        return route.fulfill({
          json: {
            id,
            bucket: 'building-media',
            path: `owner/${id}/original`,
            token: 'test-only',
          },
        });
      }
      if (action === 'media-library')
        return route.fulfill({
          json: {
            items: [...records].map(([id, r]) => ({
              ...r,
              id,
              previewUrl: r.metadata.url,
            })),
            nextOffset: null,
          },
        });
      const r = records.get(payload.id)!;
      if (action === 'media-status')
        return route.fulfill({ json: { ...r, previewUrl: r.metadata.url } });
      if (action === 'media-process') {
        if (!failed) {
          failed = true;
          return route.fulfill({
            status: 503,
            json: { error: 'Interrupted processing. Retry this photo.' },
          });
        }
        r.status = 'processed';
        return route.fulfill({ json: { ...r, previewUrl: r.metadata.url } });
      }
      if (action === 'media-preview')
        return route.fulfill({ json: { previewUrl: r.metadata.url } });
      if (action === 'media-draft') {
        if (payload.revision !== r.revision)
          return route.fulfill({
            status: 409,
            json: { error: 'Draft changed' },
          });
        r.draft = payload.metadata;
        r.revision++;
        return route.fulfill({ json: { revision: r.revision } });
      }
      if (action === 'media-approve') {
        approvals.set(payload.id, (approvals.get(payload.id) || 0) + 1);
        if (payload.id.endsWith('2') && !approvalInterrupted) {
          approvalInterrupted = true;
          return route.fulfill({
            status: 503,
            json: { error: 'Approval interrupted; retry the ready batch.' },
          });
        }
        expect(payload.authorshipConfirmed).toBe(true);
        r.metadata = payload.metadata;
        r.status = 'approved';
        return route.fulfill({ json: r.metadata });
      }
      return route.fulfill({ json: {} });
    });
    await page.route('https://editor-test.supabase.co/storage/**', (route) =>
      route.fulfill({ json: { Key: 'uploaded' } }),
    );
    for (const p of samples)
      await page.route(`**${p.url}`, (route) =>
        route.fulfill({
          body: readFileSync(
            new URL(`../../../data/photos/${p.sha256}.webp`, import.meta.url),
          ),
          contentType: 'image/webp',
        }),
      );
    await focusCampus(page);
    await collapseExplorer(page);
    await clickMap(page, [3.20012, 6.46022]);
    await page.getByRole('button', { name: /Manage photos/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Add photos', { exact: true }).setInputFiles(
      samples.map((p, i) => ({
        name: i ? 'courtyard.webp' : 'front.webp',
        mimeType: 'image/webp',
        buffer: readFileSync(
          new URL(`../../../data/photos/${p.sha256}.webp`, import.meta.url),
        ),
      })),
    );
    await page
      .getByRole('dialog', { name: 'Edit & optimise photos' })
      .getByRole('button', { name: 'Local image drafts', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: 'Edit & optimise photos' })
      .getByText('Batch tools', { exact: true })
      .click();
    await page
      .getByRole('dialog', { name: 'Edit & optimise photos' })
      .getByRole('button', { name: 'Use batch for map', exact: true })
      .click();
    await expect(
      page.getByRole('dialog', { name: 'Edit & optimise photos' }),
    ).toBeHidden({
      timeout: 60000,
    });
    await expect(
      dialog.getByText('Interrupted processing. Retry this photo.', {
        exact: true,
      }),
    ).toBeVisible();
    await dialog
      .getByRole('button', { name: 'Retry processing', exact: true })
      .click();
    await expect(
      dialog.locator('.photo-queue-card').filter({ hasText: 'front.webp' }),
    ).toContainText('needs details');
    await dialog
      .getByLabel('Caption', { exact: true })
      .fill('Front view saved privately');
    await expect
      .poll(() => [...records.values()][0].draft.caption)
      .toBe('Front view saved privately');
    await page.reload();
    await attachMap(page);
    await focusCampus(page);
    await clickMap(page, [3.20012, 6.46022]);
    await page.getByRole('button', { name: /Manage photos/ }).click();
    await dialog.getByRole('button', { name: /Review uploads/ }).click();
    await expect(dialog.getByLabel('Caption', { exact: true })).toHaveValue(
      'Front view saved privately',
    );
    for (let i = 0; i < 2; i++) {
      if (i === 1)
        await dialog
          .locator('.photo-queue-card')
          .filter({ hasText: 'courtyard.webp' })
          .getByRole('button')
          .first()
          .click();
      await dialog
        .getByLabel('Caption', { exact: true })
        .fill(i ? 'Courtyard view' : 'Front view');
      await dialog
        .getByLabel('Image description (alternative text)')
        .fill(
          i ? 'Courtyard with covered walkway' : 'Building front with windows',
        );
      await dialog
        .getByLabel('Photo source', { exact: true })
        .selectOption('author-upload');
      await dialog
        .getByLabel('Photographer / public credit')
        .fill('Campus photographer');
      await dialog
        .getByLabel('Reuse license', { exact: true })
        .selectOption('CC BY 4.0');
      await dialog
        .getByRole('checkbox', { name: /I took this photograph/ })
        .check();
      await dialog
        .getByRole('checkbox', { name: /I checked the author/ })
        .check();
      await dialog
        .getByRole('checkbox', { name: /I checked visual quality/ })
        .check();
      await dialog
        .getByRole('button', { name: 'Mark ready', exact: true })
        .click();
    }
    await dialog
      .getByRole('button', { name: 'Add reviewed photos to draft' })
      .click();
    await expect(
      dialog.getByText('Approval interrupted; retry the ready batch.', {
        exact: true,
      }),
    ).toBeVisible();
    await dialog
      .getByRole('button', { name: 'Add reviewed photos to draft' })
      .click();
    await expect(dialog.locator('.photo-card')).toHaveCount(2);
    expect(approvals.get([...records.keys()][0])).toBe(1);
    await expect
      .poll(
        () => server.edits().find((e) => e.id === 'library')?.properties.photos,
      )
      .toHaveLength(2);
    const reorder = dialog.getByRole('button', {
      name: 'Reorder Courtyard view',
      exact: true,
    });
    await reorder.press('Space');
    await reorder.press('Home');
    await reorder.press('Enter');
    await expect(dialog.locator('.photo-card').first()).toContainText(
      'Courtyard view',
    );
    await expect(
      dialog.getByRole('button', {
        name: /Make cover|Move earlier|Move later/,
      }),
    ).toHaveCount(0);
    if (width === 1440) {
      const grip = await reorder.boundingBox();
      const target = await dialog.locator('.photo-card').last().boundingBox();
      await page.mouse.move(
        grip!.x + grip!.width / 2,
        grip!.y + grip!.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(target!.x + target!.width / 2, target!.y + 50, {
        steps: 8,
      });
      await page.mouse.up();
      await expect(dialog.locator('.photo-card').first()).toContainText(
        'Front view',
      );
      await dialog.getByRole('button', { name: 'Undo reorder' }).click();
      await expect(dialog.locator('.photo-card').first()).toContainText(
        'Courtyard view',
      );
    }
    await reorder.press('Space');
    await reorder.press('End');
    await reorder.press('Escape');
    await expect(dialog.locator('.photo-card').first()).toContainText(
      'Courtyard view',
    );
    await dialog
      .getByRole('button', { name: 'Preview public gallery' })
      .click();
    await expect(
      dialog.getByRole('img', { name: 'Courtyard with covered walkway' }),
    ).toBeVisible();
    await dialog.getByText('Photo credits & license', { exact: true }).click();
    await expect(
      dialog.getByText('Photograph provided by the author', { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`photo-workspace-${width}.png`),
    });
    await dialog.getByRole('button', { name: 'Gallery', exact: true }).click();
    await dialog
      .locator('.photo-card')
      .first()
      .getByRole('button', { name: /^Delete photo:/ })
      .click();
    await expect(dialog.locator('.photo-card')).toHaveCount(1);
    await dialog.getByRole('button', { name: 'Undo removal' }).click();
    await expect(dialog.locator('.photo-card')).toHaveCount(2);
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(
      page.getByRole('button', { name: /Manage photos/ }),
    ).toBeFocused();
  });

for (const width of [1440, 390])
  test(`owner photo review preserves captions through undo and reload at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const originalPhoto = JSON.parse(
      readFileSync(
        new URL('../../../data/photos/catalogue.json', import.meta.url),
        'utf8',
      ),
    )[0];
    const photo = { ...originalPhoto, buildingId: 'library' };
    const feature = browserCampus().map.features.find(
      (f) => f.properties?.id === 'library',
    )!;
    await page.route(`**${photo.url}`, (route) =>
      route.fulfill({
        body: readFileSync(
          new URL(`../../../data/photos/${photo.sha256}.webp`, import.meta.url),
        ),
        contentType: 'image/webp',
      }),
    );
    const server = await setup(page, false, false, {
      initialEdits: [
        {
          id: 'library',
          kind: 'building',
          geometry: feature.geometry,
          properties: { ...feature.properties, photos: [photo] },
          deleted: false,
        },
      ],
    });
    await focusCampus(page);
    await collapseExplorer(page);
    await clickMap(page, [3.20012, 6.46022]);
    const panel = page.getByRole('complementary', {
      name: 'Feature properties',
    });
    await panel
      .getByRole('button', { name: 'Manage photos · 1', exact: true })
      .click();
    const galleryDialog = page.getByRole('dialog', { name: /Photos ·/ });
    await galleryDialog.getByRole('button', { name: /^Edit photo:/ }).click();
    const photosDialog = page.getByRole('dialog', {
      name: 'Edit & optimise photos',
    });
    await photosDialog
      .getByRole('button', { name: 'Photo details', exact: true })
      .click();
    await photosDialog
      .getByLabel('Caption', { exact: true })
      .fill('Reviewed courtyard view');
    await photosDialog
      .getByRole('checkbox', { name: /I checked visual quality/ })
      .check();
    await photosDialog
      .getByRole('button', { name: 'Mark ready', exact: true })
      .click();
    await photosDialog
      .getByRole('button', { name: 'Save reviewed details to draft' })
      .click();
    await galleryDialog
      .getByRole('button', { name: 'Close', exact: true })
      .click();
    await expect(page.locator('.editor-save-state')).toHaveText('Saved');
    await expect
      .poll(
        () =>
          (server.edits()[0].properties.photos as { caption: string }[])[0]
            .caption,
      )
      .toBe('Reviewed courtyard view');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect
      .poll(
        () =>
          (server.edits()[0].properties.photos as { caption: string }[])[0]
            .caption,
      )
      .toBe(originalPhoto.caption);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(page.locator('.editor-save-state')).toHaveText('Saved');
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Draw path', exact: true }),
    ).toBeEnabled();
    expect(
      (server.edits()[0].properties.photos as { caption: string }[])[0].caption,
    ).toBe('Reviewed courtyard view');
  });
