import { collapseExplorer, openEditorSection } from './editor-navigation';
import { test, expect } from './coverage-fixture';
import { readFileSync } from 'node:fs';
import type { MapEdit } from '../../src/types';
import { browserCampus, setup } from './editor-fixture';
import { clickMap, focusCampus } from './editor-map-helpers';

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
});

test('editor reliability: field typing is one undo step across an autosave', async ({
  page,
}) => {
  await setup(page);
  await focusCampus(page);
  await collapseExplorer(page);
  await clickMap(page, [3.20012, 6.46022]);
  const name = page
    .getByRole('complementary', { name: 'Feature properties' })
    .getByLabel('Name', { exact: true });
  const original = await name.inputValue();
  await name.press('End');
  await name.pressSequentially(' West');
  await expect(page.locator('.editor-save-state')).toHaveText('Saved');
  await name.pressSequentially(' entrance');
  await expect(page.locator('.editor-save-state')).toHaveText('Saved');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(name).toHaveValue(original);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(name).toHaveValue(original + ' West entrance');
});

test('editor reliability: export retries export and local recovery downloads offline', async ({
  page,
}) => {
  await setup(page);
  await focusCampus(page);
  let exports = 0,
    saves = 0;
  await page.route('**/api/admin', (route) => {
    const { action } = route.request().postDataJSON();
    if (action === 'export') {
      exports++;
      return route.fulfill({
        status: 503,
        json: { error: 'Export temporarily unavailable' },
      });
    }
    if (action === 'save-edits') saves++;
    return route.fallback();
  });
  await page.locator('.editor-header-right .workspace-menu > summary').click();
  await page
    .getByRole('button', { name: 'Export backup', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Retry export', exact: true }),
  ).toBeVisible();
  const initial = exports;
  await page.getByRole('button', { name: 'Retry export', exact: true }).click();
  await expect.poll(() => exports).toBeGreaterThan(initial);
  expect(saves).toBe(0);
  await page.getByRole('button', { name: 'Dismiss action error' }).click();
  await page.getByRole('button', { name: 'Draw path', exact: true }).click();
  await page.context().setOffline(true);
  const download = page.waitForEvent('download');
  await page
    .locator('.workspace-menu')
    .getByRole('button', { name: 'Download local recovery' })
    .click();
  const path = await (await download).path();
  const backup = JSON.parse(readFileSync(path!, 'utf8'));
  expect(backup).toMatchObject({
    schemaVersion: 1,
    baselineVersion: expect.any(String),
    workspace: {
      unfinished: { kind: 'path' },
      past: expect.any(Array),
      future: expect.any(Array),
    },
  });
  expect(saves).toBe(0);
});

test('editor reliability: opening duplicates is read-only until the reviewed batch is applied', async ({
  page,
}) => {
  const server = await setup(page, false, false, {
    mutateCampus: (campus) => {
      const gate = campus.places.find((p) => p.id === 'gate')!;
      campus.places.push({ ...gate, id: 'gate-copy' });
    },
  });
  await openEditorSection(page, 'Duplicates');
  await expect(
    page.getByRole('button', { name: 'Review exact duplicate cleanup' }),
  ).toBeVisible();
  expect(server.edits()).toEqual([]);
  await page
    .getByRole('button', { name: 'Review exact duplicate cleanup' })
    .click();
  await expect(
    page.getByRole('region', { name: 'Proposed duplicate cleanup' }),
  ).toContainText('gate-copy');
  expect(server.edits()).toEqual([]);
  await page
    .getByRole('button', { name: 'Apply reviewed duplicate cleanup' })
    .click();
  await expect
    .poll(
      () =>
        server.edits().filter((e) => e.deleted && e.properties.mergedInto)
          .length,
    )
    .toBe(1);
  await page.getByRole('button', { name: 'Undo last edit' }).click();
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
    .toBe(0);
});

for (const firstCorrection of [false, true])
  test(`editor reliability: conflict choices retain unrelated server properties${firstCorrection ? ' on first correction' : ''}`, async ({
    page,
  }) => {
    const f = browserCampus().map.features.find(
      (f) => f.properties?.id === 'library',
    )!;
    const initial: MapEdit = {
      id: 'library',
      kind: 'building',
      geometry: f.geometry,
      properties: { ...f.properties, faculty: 'Original' },
      updated_at: '2026-09-11T10:00:00Z',
    };
    const server = await setup(page, false, false, {
      initialEdits: firstCorrection ? [] : [initial],
      mutateCampus: (campus) => {
        campus.map.features.find(
          (f) => f.properties?.id === 'library',
        )!.properties!.faculty = 'Original';
      },
    });
    await focusCampus(page);
    await collapseExplorer(page);
    await clickMap(page, [3.20012, 6.46022]);
    server.setEdits([
      {
        ...initial,
        properties: {
          ...initial.properties,
          name: 'Remote library',
          faculty: 'Remote faculty',
        },
        updated_at: '2026-09-11T11:00:00Z',
      },
    ]);
    await page
      .getByRole('complementary', { name: 'Feature properties' })
      .getByLabel('Name', { exact: true })
      .fill('Local library');
    await page
      .getByRole('button', { name: 'Review conflicts', exact: true })
      .click();
    const review = page.getByRole('complementary', {
      name: 'Review draft conflicts',
    });
    await expect(
      review.getByRole('button', { name: 'Apply reviewed choices' }),
    ).toBeDisabled();
    await review.getByLabel('Keep my value').check();
    await review
      .getByRole('button', { name: 'Apply reviewed choices' })
      .click();
    await expect
      .poll(() => server.edits()[0].properties)
      .toMatchObject({ name: 'Local library', faculty: 'Remote faculty' });
  });

test('editor reliability: shared destinations resolve aliases and missing links offer search', async ({
  page,
  context,
  browserName,
}) => {
  const server = await setup(page, false, false, {
    mutateCampus: (campus) => {
      campus.placeIdAliases = { 'old-library': campus.places[0].id };
    },
  });
  await page.goto('/?place=old-library');
  await expect(
    page.getByRole('heading', {
      name: server.campus.places[0].name,
      exact: true,
    }),
  ).toBeVisible();
  let link: string;
  if (browserName === 'webkit') {
    await page.evaluate(() =>
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: undefined,
      }),
    );
    await page.getByRole('button', { name: 'Copy link' }).click();
    link = await page
      .getByLabel('Destination link', { exact: true })
      .inputValue();
  } else {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'Copy link' }).click();
    link = await page.evaluate(() => navigator.clipboard.readText());
  }
  expect(new URL(link).searchParams.get('place')).toBe(
    server.campus.places[0].id,
  );
  await page.getByRole('button', { name: 'Directions', exact: true }).click();
  await page.getByLabel('Starting place').selectOption('gate');
  await expect(page.getByLabel('Recorded steps information')).toContainText(
    'unknown',
  );
  await page.goto('/?place=missing-destination');
  await expect(
    page.getByRole('button', { name: 'Search campus places' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Search campus places' }).click();
  await expect(page.getByLabel('Search campus')).toBeFocused();
});

test('editor reliability: retry route replaces a failed worker and calculates the walk', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    let fail = true;
    window.Worker = class extends OriginalWorker {
      private breakRequest: boolean;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.breakRequest = String(url).includes('routing.worker');
      }
      postMessage(
        message: unknown,
        transfer?: Transferable[] | StructuredSerializeOptions,
      ) {
        if (
          this.breakRequest &&
          fail &&
          (message as { type?: string }).type === 'request'
        ) {
          fail = false;
          queueMicrotask(() =>
            this.dispatchEvent(
              new ErrorEvent('error', { message: 'Simulated worker failure' }),
            ),
          );
          return;
        }
        super.postMessage(
          message,
          Array.isArray(transfer) ? { transfer } : transfer,
        );
      }
    };
  });
  const server = await setup(page);
  await page.getByRole('button', { name: 'Test route', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Route test', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Test route From').selectOption('gate');
  await page
    .getByLabel('Test route To')
    .selectOption(server.campus.places[0].id);
  await page
    .getByRole('button', { name: 'Preview route', exact: true })
    .click();
  await page.getByRole('button', { name: 'Retry route', exact: true }).click();
  await expect(page.locator('.editor-route-test')).toContainText(
    'Shortest walk',
  );
});

test('editor reliability: expired authentication offers sign-in and retains the pending save', async ({
  page,
}) => {
  await setup(page);
  await focusCampus(page);
  await page.route('**/api/admin', (route) => {
    if (route.request().postDataJSON().action === 'save-edits')
      return route.fulfill({ status: 401, json: { error: 'Expired' } });
    return route.fallback();
  });
  await collapseExplorer(page);
  await clickMap(page, [3.20012, 6.46022]);
  await page
    .getByRole('complementary', { name: 'Feature properties' })
    .getByLabel('Name', { exact: true })
    .fill('Retained local name');
  await expect(
    page.getByRole('button', { name: 'Sign in again', exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent('download');
  await page
    .locator('.editor-error-stack')
    .getByRole('button', { name: 'Download local recovery' })
    .click();
  const backup = JSON.parse(
    readFileSync((await (await download).path())!, 'utf8'),
  );
  expect(backup.workspace.pending.edits[0].edit.properties.name).toBe(
    'Retained local name',
  );
});

test('editor reliability: source comparisons and release status refresh without saving', async ({
  page,
}, testInfo) => {
  const server = await setup(page, true);
  let polls = 0,
    saves = 0;
  const before = server.campus.map.features.find(
    (f) => f.properties?.id === 'arcgis:University_Property:120',
  )!;
  const after = structuredClone(before);
  after.properties!.name = 'Reviewed Senate name';
  const change = {
    id: 'change-test',
    source_id: 'source-test',
    kind: 'modify',
    summary: 'Senate name update',
    before: { payload: before },
    after: { payload: after },
    status: 'pending',
    review_revision: 1,
  };
  await page.route('**/api/admin', (route) => {
    const { action } = route.request().postDataJSON();
    if (action === 'save-edits') saves++;
    if (action === 'source-updates-list') {
      polls++;
      return route.fulfill({
        json: {
          rows: [
            {
              id: change.id,
              sourceId: change.source_id,
              sourceName: 'ArcGIS',
              revision: 1,
              createdAt: '2026-10-11T00:00:00Z',
              kind: 'modify',
              meta: {
                name: 'Senate name update',
                source: 'arcgis',
                layer: 'Buildings',
                featureType: 'building',
                fields: ['name'],
                geometryChanged: false,
              },
            },
          ],
          total: 1,
          nextCursor: null,
        },
      });
    }
    if (action === 'source-updates-detail')
      return route.fulfill({ json: { change, overrides: [] } });
    return route.fallback();
  });
  await openEditorSection(page, 'Sources');
  await page.getByRole('button', { name: 'Review Senate name update' }).click();
  const detailView = page
    .getByRole('navigation', { name: 'Source review views' })
    .getByRole('button', { name: 'Details', exact: true });
  if (await detailView.isVisible()) await detailView.click();
  await expect(page.locator('.source-update-details table')).toContainText(
    'Reviewed Senate name',
  );
  expect(polls).toBeGreaterThan(0);
  expect(saves).toBe(0);
  await openEditorSection(page, 'Releases');
  const impact = page.getByRole('region', { name: 'Release impact' });
  await expect(impact).toContainText('Clinic–Law');
  await expect(impact.locator('tbody')).toContainText('Connected');
  await impact.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath('desktop-release-impact.png'),
  });
  expect(saves).toBe(0);
});
