import { openEditorSection } from './editor-navigation';
import { test, expect } from './coverage-fixture';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { CampusData, MapEdit } from '../../src/types';
import { setup } from './editor-fixture';
import { attachMap } from './editor-map-helpers';

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
});

test('editor reliability: uncertain jobs check status before resubmission and read errors recover authentication', async ({
  page,
}) => {
  await setup(page);
  let submissions = 0,
    reads = 0,
    expired = false;
  await page.route('**/api/admin', (route) => {
    const { action } = route.request().postDataJSON();
    if (action === 'check-sources') {
      submissions++;
      return route.abort('failed');
    }
    if (action === 'state') reads++;
    if (action === 'source-updates-overview' && expired)
      return route.fulfill({ status: 401, json: { error: 'Expired' } });
    return route.fallback();
  });
  await openEditorSection(page, 'Sources');
  await page.getByText('Connected sources · 0', { exact: true }).click();
  await page
    .getByRole('button', { name: 'Check LASU sources', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Check action status', exact: true }),
  ).toBeVisible();
  expect(submissions).toBe(1);
  await page
    .getByRole('button', { name: 'Check LASU sources', exact: true })
    .click();
  await expect.poll(() => reads).toBeGreaterThan(0);
  await expect(
    page.getByRole('button', { name: 'Check action status', exact: true }),
  ).not.toBeVisible();
  expect(submissions).toBe(1);
  await page
    .getByRole('button', { name: 'Check LASU sources', exact: true })
    .click();
  await expect.poll(() => submissions).toBe(2);
  expired = true;
  await page
    .getByRole('button', { name: 'Refresh source updates', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Sign in again', exact: true }),
  ).toBeVisible();
});

test('release diagnostics preserve the usable campus and identify the captured missing endpoints', async ({
  page,
}) => {
  await setup(page, true);
  const captured = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL('../fixtures/editor-2026-09-14.json.gz', import.meta.url),
      ),
    ).toString(),
  ) as { base: CampusData; edits: MapEdit[] };
  const { map, places, graph, ...meta } = captured.base;
  const record = (entity: string, payload: unknown, id: string) => ({
    entity,
    payload,
    id,
    source: 'fixture',
    hash: 'fixture',
  });
  const features = [
    record('meta', meta, 'meta:campus'),
    ...map.features.map((f, i) => record('feature', f, `feature:${i}`)),
    ...places.map((p) => record('place', p, p.id)),
    ...graph.nodes.map((n) => record('node', n, n.id)),
    ...graph.edges.map((e) => record('edge', e, e.id)),
  ];
  await page.route('**/api/admin', (route) => {
    const { action } = route.request().postDataJSON();
    // Preserve the shared permission and workspace fixtures while replacing
    // only the captured campus data used by this diagnostic regression.
    if (action !== 'sources' && action !== 'state') return route.fallback();
    return route.fulfill({
      json:
        action === 'sources'
          ? { features }
          : action === 'state'
            ? {
                edits: captured.edits,
                reports: [],
                changes: [],
                jobs: [],
                releases: [],
              }
            : [],
    });
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.reload();
  await attachMap(page);
  await openEditorSection(page, 'Releases');
  await expect(
    page.getByText('Validation needs attention', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Showing the last usable map/)).toBeVisible();
  await expect(
    page.getByText(/osm:way:1534765716:2297333149:2297333129:1/).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Build review preview' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Retry validation' }).click();
  await expect(
    page.getByRole('button', { name: 'Locate feature' }),
  ).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download diagnostics' }).click();
  expect((await download).suggestedFilename()).toBe(
    'turnright-validation.json',
  );
  await page.getByRole('button', { name: 'Locate feature' }).click();
  await expect
    .poll(() => page.evaluate(() => window.editorTestMap.getZoom()))
    .toBeCloseTo(18, 1);
  expect(errors).toEqual([]);
});

test('duplicate queue keeps same-name campus records separate and supports undo and reload', async ({
  page,
}) => {
  const server = await setup(page, true);
  await openEditorSection(page, 'Duplicates');
  await expect(
    page.getByRole('heading', { name: 'Duplicate review', exact: true }),
  ).toBeVisible();
  const pair = page.locator('.duplicate-pair').first();
  await expect(pair).toBeVisible();
  await expect(page.locator('.duplicate-review output')).toHaveText(
    /\d+ pairs to review/,
  );
  const original = await page.locator('.duplicate-review output').textContent();
  await pair
    .getByRole('button', { name: 'Keep these records separate' })
    .click();
  await expect(page.locator('.duplicate-review output')).not.toHaveText(
    original!,
  );
  await expect
    .poll(
      () =>
        server.edits().filter((e) => e.properties.duplicateKeepSeparate).length,
    )
    .toBe(2);
  await expect(page.locator('.editor-save-state')).toHaveText('Saved');
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  await expect(page.locator('.duplicate-review output')).toHaveText(original!);
  await expect(page.locator('.editor-save-state')).toHaveText('Saved');
  await page
    .locator('.duplicate-pair')
    .first()
    .getByRole('button', { name: 'Keep record 1 and merge' })
    .click();
  await expect
    .poll(
      () =>
        server
          .edits()
          .filter(
            (e) =>
              e.deleted &&
              e.properties.mergedInto &&
              !e.properties.revertToSource,
          ).length,
    )
    .toBe(1);
  await expect(page.locator('.editor-save-state')).toHaveText('Saved');
  await expect(page.locator('.duplicate-review output')).toHaveText(
    /\d+ pairs to review/,
  );
  const count = await page.locator('.duplicate-review output').textContent();
  await page.reload();
  await attachMap(page);
  await openEditorSection(page, 'Duplicates');
  await expect(page.locator('.duplicate-review output')).toHaveText(count!);
});

test('view settings: single button, keyboard switching and shared preferences', async ({
  page,
}) => {
  test.setTimeout(90000);
  await setup(page);
  await page.goto('/');
  await attachMap(page);
  await page.getByRole('button', { name: 'Expand card', exact: true }).click();
  const toggle = page.locator('button.map-view-control');
  await expect(toggle).toHaveCount(1);
  await expect(toggle).toHaveAccessibleName('Switch to 2D');
  await expect(toggle).toHaveText('2D');
  await expect(page.locator('.map-rendering-options')).toHaveCount(0);
  await toggle.press('Enter');
  await expect(toggle).toHaveAccessibleName('Switch to 3D');
  await expect(toggle).toHaveText('3D');
  await toggle.press('Space');
  await expect(toggle).toHaveAccessibleName('Switch to 2D');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(
    page.getByRole('radio', { name: 'Enhanced', exact: true }),
  ).toBeChecked();
  await page.getByRole('radio', { name: 'Simple', exact: true }).check();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await page.reload();
  await attachMap(page);
  await page.getByRole('button', { name: 'Expand card', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(
    page.getByRole('radio', { name: 'Simple', exact: true }),
  ).toBeChecked();
  await page.goto('/admin');
  await attachMap(page);
  await expect(toggle).toHaveAccessibleName('Switch to 3D');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(
    page.getByRole('radio', { name: 'Simple', exact: true }),
  ).toBeChecked();
  await expect(page.getByLabel('Map tilt', { exact: true })).toBeDisabled();
  await page.getByRole('radio', { name: 'Enhanced', exact: true }).check();
  await page
    .getByRole('button', { name: 'Close settings', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Settings', exact: true }),
  ).toBeFocused();
  await page.goto('/');
  await attachMap(page);
  await page.getByRole('button', { name: 'Expand card', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(
    page.getByRole('radio', { name: 'Enhanced', exact: true }),
  ).toBeChecked();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage blocked', 'SecurityError');
    };
  });
  await page.getByRole('radio', { name: 'Simple', exact: true }).check();
  await expect(
    page.getByRole('radio', { name: 'Simple', exact: true }),
  ).toBeChecked();
  await page.screenshot({ path: 'test-results/view-settings-public.png' });
});

test.describe('view settings touch', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('view settings phone: single tap toggle and accessible editor settings', async ({
    page,
  }) => {
    test.setTimeout(90000);
    await setup(page);
    const toggle = page.locator('button.map-view-control');
    await expect(toggle).toHaveCount(1);
    await toggle.tap();
    await expect(toggle).toHaveAccessibleName('Switch to 2D');
    await page.getByRole('button', { name: 'Settings', exact: true }).tap();
    await expect(
      page.getByRole('complementary', { name: 'Editor settings' }),
    ).toBeVisible();
    const settingsCard = await page
      .locator('.workspace-pane[data-pane="right"]')
      .boundingBox();
    expect(settingsCard!.height).toBeLessThanOrEqual(844 * 0.43);
    expect(settingsCard!.y).toBeGreaterThan(844 * 0.4);
    const header = await page.evaluate(() => ({
      brandRight: document
        .querySelector('.editor-brand strong')!
        .getBoundingClientRect().right,
      navigationLeft: document
        .querySelector('.editor-navigation')!
        .getBoundingClientRect().left,
    }));
    expect(header.brandRight).toBeLessThanOrEqual(header.navigationLeft);
    // Tap the visible label: the semantic radio is visually hidden.
    const appearance = page
      .locator('.appearance-options label')
      .filter({ hasText: 'Dark' });
    await appearance.tap();
    await expect(
      page.getByRole('radio', { name: 'Dark', exact: true }),
    ).toBeChecked();
    const target = await appearance.boundingBox();
    expect(target!.height).toBeGreaterThanOrEqual(44);
    await page.getByRole('radio', { name: 'Simple', exact: true }).tap();
    await expect(
      page.getByRole('radio', { name: 'Simple', exact: true }),
    ).toBeChecked();
    await page.getByLabel('Building opacity', { exact: true }).fill('0.4');
    await page.screenshot({
      path: 'test-results/view-settings-editor-phone.png',
    });
    await page
      .getByRole('button', { name: 'Close settings', exact: true })
      .tap();
    await toggle.tap();
    await expect(toggle).toHaveAccessibleName('Switch to 3D');
    await page.goto('/');
    await attachMap(page);
    await page
      .getByRole('button', { name: 'Expand card', exact: true })
      .click();
    await expect(toggle).toHaveAccessibleName('Switch to 2D');
    await toggle.tap();
    await expect(toggle).toHaveAccessibleName('Switch to 3D');
    await page.getByRole('button', { name: 'Settings', exact: true }).tap();
    await expect(
      page.getByRole('radio', { name: 'Dark', exact: true }),
    ).toBeChecked();
    await expect(
      page.getByRole('radio', { name: 'Simple', exact: true }),
    ).toBeChecked();
    await page.getByRole('radio', { name: 'Enhanced', exact: true }).tap();
    const dialogCard = await page.getByRole('dialog').boundingBox();
    expect(dialogCard!.height).toBeLessThanOrEqual(844 * 0.57);
    expect(dialogCard!.y).toBeGreaterThan(844 * 0.4);
    await page.screenshot({ path: 'test-results/compact-mobile-dialog.png' });
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Close', exact: true })
      .tap();
    await page.screenshot({
      path: 'test-results/view-toggle-public-phone.png',
    });
    await expect(page.locator('.map-rendering-options')).toHaveCount(0);
  });
});
