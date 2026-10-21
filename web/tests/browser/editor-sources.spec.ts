import { openEditorSection } from './editor-navigation';
import { test, expect } from './coverage-fixture';
import { browserCampus, setup } from './editor-fixture';
import { attachMap } from './editor-map-helpers';

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
});

test('accepted source updates proceed to review without replacing the public baseline', async ({
  page,
}) => {
  await setup(page);
  let replacementRequests = 0;
  await page.route('**/api/admin', async (route) => {
    const { action } = route.request().postDataJSON();
    if (['review-baseline', 'reconcile-baseline'].includes(action))
      replacementRequests++;
    if (action !== 'sources') return route.fallback();
    const data = browserCampus();
    const { map, places, graph, ...meta } = data;
    meta.version = 'accepted-source-origin';
    const record = (entity: string, id: string, payload: unknown) => ({
      entity,
      id,
      payload,
      source: 'fixture',
      hash: id,
    });
    await route.fulfill({
      json: {
        features: [
          record('meta', 'meta:campus', meta),
          ...map.features.map((f, i) => record('feature', 'feature:' + i, f)),
          ...places.map((p) => record('place', 'place:' + p.id, p)),
          ...graph.nodes.map((n) => record('node', 'node:' + n.id, n)),
          ...graph.edges.map((e) => record('edge', 'edge:' + e.id, e)),
        ],
      },
    });
  });
  await page.reload();
  await attachMap(page);
  await openEditorSection(page, 'Releases');
  await expect(
    page.getByText('Publish your accepted updates', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/different version labels/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Use this reviewed baseline' }),
  ).toHaveCount(0);
  await page
    .getByPlaceholder('Describe the corrections in this release…')
    .fill('Reviewed accepted source updates');
  await expect(
    page.getByRole('button', { name: 'Build review preview' }),
  ).toBeEnabled();
  expect(replacementRequests).toBe(0);
});

for (const phone of [false, true])
  test(`source updates reliability ${phone ? 'phone' : 'desktop'}: blocked groups, check evidence and guided private undo`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(240000);
    await page.setViewportSize(
      phone ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await setup(page, true, false, { startupTimeout: 60000 });
    let undone = false,
      reverified = 0;
    let resumeRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => {
      resumeRefresh = resolve;
    });
    const checkId = '11111111-1111-4111-8111-111111111111',
      decisionId = '22222222-2222-4222-8222-222222222222';
    await page.route('**/api/admin', async (route) => {
      const { action } = route.request().postDataJSON();
      if (action === 'state' && undone) {
        await refreshGate;
        if (!phone)
          return route.fulfill({
            status: 400,
            json: { error: 'Workspace refresh unavailable in this fixture.' },
          });
        return route.fallback();
      }
      if (action === 'source-updates-overview')
        return route.fulfill({
          json: {
            ready: true,
            counts: { osm: 1 },
            layers: ['Paths'],
            featureTypes: ['path'],
            sources: [],
            scheduledOsmEnabled: false,
          },
        });
      if (action === 'source-updates-list')
        return route.fulfill({
          json: {
            total: 1,
            eligibleTotal: 0,
            excludedTotal: 1,
            nextCursor: null,
            rows: [
              {
                id: 'held',
                revision: 1,
                sourceId: 'feature:path',
                sourceName: 'Campus OSM',
                kind: 'remove',
                createdAt: '2026-10-12T12:00:00Z',
                meta: {
                  source: 'osm',
                  layer: 'Paths',
                  featureType: 'path',
                  name: 'Library path',
                  fields: [],
                  geometryChanged: true,
                },
                reliability: {
                  eligible: false,
                  verification: 'unverified',
                  classification: 'scope_change',
                  blockingReasons: ['The original path still exists.'],
                  dependencyCount: 4,
                  groupId: 'held',
                  checkId,
                },
              },
            ],
          },
        });
      if (action === 'source-updates-history')
        return route.fulfill({ json: { operations: [], items: [] } });
      if (action === 'source-updates-check-detail')
        return route.fulfill({
          json: {
            checks: [
              {
                id: checkId,
                source_key: 'lasu-enrichment',
                status: 'shadow',
                receipt: {
                  retrievedAt: '2026-10-12T12:00:00Z',
                  contentHash: 'fixture',
                  importerVersion: '2',
                  collections: [
                    { identity: 'osm:objects', complete: false, count: 95 },
                  ],
                },
                diagnostics: [
                  {
                    classification: 'incomplete_collection',
                    message: 'Incomplete download; affected paths held.',
                  },
                ],
              },
            ],
          },
        });
      if (action === 'source-updates-decisions')
        return route.fulfill({
          json: {
            decisions: [
              {
                id: decisionId,
                group_id: 'previous',
                actor: 'Campus editor',
                outcome: undone ? 'reversed' : 'accepted',
                created_at: '2026-10-12T10:00:00Z',
                dependency_count: 4,
                evidence: { checkId, classification: 'upstream_change' },
              },
            ],
            legacyFindings: [
              {
                id: 'legacy',
                finding: 'Historical routing identity requires manual review.',
              },
            ],
          },
        });
      if (action === 'source-updates-undo-preview')
        return route.fulfill({
          json: {
            decisionId,
            eligible: true,
            dependencyCount: 4,
            affected: [
              { id: 'feature:path', kind: 'restore previous source values' },
            ],
            blockingReasons: [],
          },
        });
      if (action === 'source-updates-undo-confirm') {
        undone = true;
        return route.fulfill({ json: { status: 'reversed' } });
      }
      if (action === 'source-updates-reverify') {
        reverified++;
        return route.fulfill({ json: { status: 'queued' } });
      }
      return route.fallback();
    });
    await openEditorSection(page, 'Sources');
    if (phone)
      await page
        .getByRole('button', { name: 'Maximize explorer', exact: true })
        .click();
    await expect(
      page.getByText('Needs verification · 4 dependent records', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(/1 blocked or unverified groups are excluded/),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Load check history', exact: true })
      .click();
    const recovery = page.getByRole('region', {
      name: 'Source checks and recovery',
    });
    await recovery
      .locator('summary')
      .filter({ hasText: 'lasu-enrichment' })
      .click();
    await expect(
      recovery.getByText('Incomplete download; affected paths held.'),
    ).toBeVisible();
    await recovery
      .getByRole('button', { name: 'Verify again', exact: true })
      .click();
    expect(reverified).toBe(1);
    await recovery
      .locator('summary')
      .filter({ hasText: 'accepted · 4 dependent records' })
      .click();
    await recovery
      .getByRole('button', { name: 'Preview undo', exact: true })
      .click();
    await expect(
      page.getByRole('region', { name: 'Undo preview' }),
    ).toContainText('Later editor corrections remain in place.');
    expect(undone).toBe(false);
    await page
      .getByRole('region', { name: 'Undo preview' })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(
        `source-reliability-${phone ? 'mobile' : 'desktop'}.png`,
      ),
    });
    await page
      .getByRole('button', {
        name: 'Confirm private workspace undo',
        exact: true,
      })
      .click();
    await expect(
      recovery.getByText(
        'Reversed in the private workspace. The public map has not changed.',
      ),
    ).toBeVisible();
    expect(undone).toBe(true);
    // A confirmed decision is acknowledged before the workspace reload finishes.
    resumeRefresh();
    if (!phone)
      await expect(
        recovery.getByText(
          /Reversed in the private workspace.*Refresh could not finish/,
        ),
      ).toBeVisible();
    else
      await expect(
        recovery
          .locator('summary')
          .filter({ hasText: 'reversed · 4 dependent records' }),
      ).toBeVisible();
  });
