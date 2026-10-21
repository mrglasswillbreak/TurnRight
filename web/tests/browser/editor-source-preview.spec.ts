import { openEditorSection } from './editor-navigation';
import type { SourceSummary, SourceOperation } from '../../src/source-updates';
import { test, expect } from './coverage-fixture';
import { setup } from './editor-fixture';
import { attachMap } from './editor-map-helpers';

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
});

for (const previewOnly of [false, true])
  for (const phone of [false, true]) {
    test(
      (previewOnly
        ? 'source updates map preview '
        : 'source updates bulk review ') +
        (phone ? 'phone' : 'desktop') +
        (previewOnly
          ? ': all pages, before shapes and read-only close'
          : ': selection, frozen confirmation, progress and results'),
      async ({ page }, testInfo) => {
        await page.setViewportSize(
          phone ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
        );
        test.setTimeout(
          testInfo.project.use.browserName === 'webkit' ? 240000 : 120000,
        );
        await page.emulateMedia({ colorScheme: 'light' });
        const server = await setup(page, true, false, {
          startupTimeout: 30000,
        });
        const before = server.campus.map.features.find(
          (f) => f.properties?.id === 'arcgis:University_Property:120',
        )!;
        const after = structuredClone(before);
        after.properties!.name = 'Senate House';
        const previewBuildings = server.campus.map.features.filter(
          (f) =>
            f.properties?.kind === 'building' && f.geometry.type === 'Polygon',
        );
        const names = [
          'Senate House',
          'Main Library',
          'Faculty of Arts',
          'Medical Centre',
          'Student Centre',
          'Central Green',
        ];
        const rows: SourceSummary[] = Array.from({ length: 101 }, (_, n) => ({
          id: 'proposal-' + String(n).padStart(3, '0'),
          revision: 1,
          sourceId: 'feature:' + n,
          sourceName: 'Campus ArcGIS',
          kind: n === 0 ? 'remove' : 'modify',
          createdAt: '2026-10-11T00:00:00Z',
          meta: {
            source: 'import:11111111-1111-4111-8111-111111111111',
            name: names[n] || 'Campus building ' + n,
            layer: 'Buildings',
            featureType: 'building',
            fields: ['name', 'height'],
            geometryChanged: n % 3 === 0,
          },
        }));
        let operation: SourceOperation | undefined;
        let preparedIds: string[] = [],
          confirmed = 0;
        let mapRequests = 0;
        await page.route('**/api/admin', (route) => {
          const { action, payload } = route.request().postDataJSON();
          if (action === 'source-updates-overview')
            return route.fulfill({
              json: {
                ready: true,
                counts: { [rows[0].meta.source]: 101 },
                layers: ['Buildings'],
                featureTypes: ['building'],
                scheduledOsmEnabled: false,
                sources: [
                  {
                    id: '11111111-1111-4111-8111-111111111111',
                    name: 'Campus ArcGIS',
                    kind: 'arcgis',
                    schedule: 'daily',
                    configured: true,
                    lastSuccess: '2026-10-11T03:48:00Z',
                    latest: {
                      id: 'import',
                      status: 'reviewed',
                      message: '101 updates ready for review',
                      updatedAt: '2026-10-11T03:48:00Z',
                    },
                  },
                ],
              },
            });
          if (action === 'source-updates-map') {
            mapRequests++;
            const matching = rows.filter(
              (r) =>
                !payload.filters.query ||
                r.meta.name
                  .toLowerCase()
                  .includes(payload.filters.query.toLowerCase()),
            );
            const offset = payload.cursor
              ? matching.findIndex((r) => r.id === payload.cursor.id) + 1
              : 0;
            const selected = matching.slice(offset, offset + 50);
            return route.fulfill({
              json: {
                total: matching.length,
                asOf: '2026-10-11T12:00:00Z',
                rows: selected.map((r) => ({
                  id: r.id,
                  revision: r.revision,
                  name: r.meta.name,
                  kind: r.kind,
                  before: {
                    geometry:
                      previewBuildings[rows.indexOf(r)]?.geometry ||
                      before.geometry,
                    simplified: false,
                  },
                  after:
                    r.kind === 'remove'
                      ? null
                      : {
                          geometry:
                            previewBuildings[rows.indexOf(r)]?.geometry ||
                            after.geometry,
                          simplified: false,
                        },
                })),
                nextCursor:
                  offset + 50 < matching.length
                    ? {
                        id: selected.at(-1)!.id,
                        createdAt: selected.at(-1)!.createdAt,
                      }
                    : null,
              },
            });
          }
          if (action === 'source-updates-list') {
            const matching = rows.filter(
              (r) =>
                (!payload.filters.kind || r.kind === payload.filters.kind) &&
                (!payload.filters.query ||
                  r.meta.name
                    .toLowerCase()
                    .includes(payload.filters.query.toLowerCase())),
            );
            const offset = payload.cursor
              ? matching.findIndex((r) => r.id === payload.cursor.id) + 1
              : 0;
            const selected = matching.slice(offset, offset + 50);
            return route.fulfill({
              json: {
                rows: selected,
                total: matching.length,
                nextCursor:
                  offset + 50 < matching.length
                    ? {
                        id: selected.at(-1)!.id,
                        createdAt: selected.at(-1)!.createdAt,
                      }
                    : null,
              },
            });
          }
          if (action === 'source-updates-detail')
            return route.fulfill({
              json: {
                change: {
                  id: payload.id,
                  source_id: 'source',
                  kind: payload.id === rows[0].id ? 'remove' : 'modify',
                  before: { payload: before },
                  after: payload.id === rows[0].id ? null : { payload: after },
                  status: 'pending',
                  summary: 'Senate House',
                  review_revision: 1,
                },
                overrides: [
                  {
                    id: 'building',
                    kind: 'building',
                    fields: ['name'],
                    deleted: false,
                  },
                ],
              },
            });
          if (action === 'source-updates-prepare') {
            preparedIds =
              payload.selection.mode === 'filter'
                ? rows.map((r) => r.id)
                : payload.selection.items.map((i: { id: string }) => i.id);
            operation = {
              id: payload.operationId,
              actor: 'owner',
              accept: null,
              total: preparedIds.length,
              applied: 0,
              skipped: 0,
              failed: 0,
              status: 'prepared',
              breakdown: {
                add: 0,
                modify: preparedIds.length - 1,
                remove: 1,
                geometry: 34,
              },
              created_at: '2026-10-11T05:00:00Z',
              updated_at: '2026-10-11T05:00:00Z',
            };
            return route.fulfill({ json: operation });
          }
          if (action === 'source-updates-control') {
            confirmed++;
            operation = {
              ...operation!,
              status: 'running',
              accept: payload.accept,
              applied: 25,
              message: 'Applying reviewed changes',
            };
            return route.fulfill({ json: operation });
          }
          if (action === 'source-updates-history')
            return route.fulfill({
              json: {
                operations:
                  operation && operation.status !== 'prepared'
                    ? [operation]
                    : [],
                items:
                  operation?.status === 'completed'
                    ? [
                        {
                          change_id: rows[0].id,
                          name: 'Senate House',
                          kind: 'remove',
                          status: 'applied',
                          message: 'Accepted into the source baseline',
                        },
                      ]
                    : [],
              },
            });
          return route.fallback();
        });
        await openEditorSection(page, 'Sources');
        await expect(
          page.getByText('101 pending', { exact: true }),
        ).toBeVisible();
        expect(mapRequests).toBe(0);
        if (previewOnly) {
          await page
            .getByRole('button', {
              name: 'Preview all matching changes on map',
              exact: true,
            })
            .click();
          const previewMap = page.getByRole('region', {
            name: 'Proposed changes map preview',
          });
          await expect(previewMap).toContainText('Preview ready · 101 updates');
          expect(mapRequests).toBe(3);
          expect(confirmed).toBe(0);
          await attachMap(page);
          const previewFeatures = () =>
            page.evaluate(async () => {
              const source = window.editorTestMap.getSource(
                'source-proposals',
              ) as import('maplibre-gl').GeoJSONSource | undefined;
              return source
                ? (
                    (await source.getData()) as import('geojson').FeatureCollection
                  ).features.length
                : 0;
            });
          await expect.poll(previewFeatures).toBe(101);
          await previewMap
            .getByRole('checkbox', { name: /Show previous shapes/ })
            .check();
          await expect.poll(previewFeatures).toBe(201);
          await previewMap
            .getByRole('button', { name: 'Fit all changes', exact: true })
            .click();
          await expect
            .poll(() => page.evaluate(() => window.editorTestMap.isMoving()))
            .toBe(false);
          await page.screenshot({
            path: testInfo.outputPath(
              'source-map-preview-' + (phone ? 'mobile' : 'desktop') + '.png',
            ),
          });
          await previewMap
            .getByRole('button', { name: 'Close map preview', exact: true })
            .click();
          if (phone)
            await page
              .getByRole('navigation', { name: 'Source review views' })
              .getByRole('button', { name: 'List', exact: true })
              .click();
          await expect(previewMap).toBeHidden();
          await expect.poll(previewFeatures).toBe(0);
          expect(confirmed).toBe(0);
          return;
        }
        await page
          .getByRole('checkbox', { name: 'Select Senate House', exact: true })
          .check();
        await page.getByRole('button', { name: 'Next', exact: true }).click();
        await expect(
          page.getByRole('checkbox', {
            name: 'Select Campus building 50',
            exact: true,
          }),
        ).toBeVisible();
        await page
          .getByRole('checkbox', {
            name: 'Select Campus building 50',
            exact: true,
          })
          .check();
        await expect(
          page.getByText('2 selected', { exact: true }),
        ).toBeVisible();
        await page
          .getByRole('button', { name: 'Previous', exact: true })
          .click();
        await expect(
          page.getByRole('checkbox', {
            name: 'Select Senate House',
            exact: true,
          }),
        ).toBeChecked();
        await page.getByLabel('Find an update').fill('Library');
        await expect(
          page.getByText('Selection cleared because the filters changed.', {
            exact: true,
          }),
        ).toBeVisible();
        await page.getByLabel('Find an update').fill('');
        await expect(
          page.getByText('101 pending', { exact: true }),
        ).toBeVisible();
        await page
          .getByRole('button', { name: 'Review Senate House', exact: true })
          .click();
        const views = page.getByRole('navigation', {
          name: 'Source review views',
        });
        if (phone)
          await views
            .getByRole('button', { name: 'Details', exact: true })
            .click();
        await expect(
          page.getByText('Your editor corrections take precedence', {
            exact: true,
          }),
        ).toBeVisible();
        if (phone)
          await views
            .getByRole('button', { name: 'List', exact: true })
            .click();
        await page.screenshot({
          path: testInfo.outputPath(
            'source-updates-' + (phone ? 'mobile' : 'desktop') + '.png',
          ),
        });
        await page
          .getByRole('button', {
            name: 'Select all 101 matching results',
            exact: true,
          })
          .click();
        await page
          .getByRole('button', { name: 'Accept selected', exact: true })
          .click();
        await expect(
          page.getByRole('heading', {
            name: 'Accept 101 updates?',
            exact: true,
          }),
        ).toBeVisible();
        const decisionDialog = page.getByRole('dialog', {
          name: 'Confirm source decisions',
        });
        await expect(decisionDialog).toHaveCSS(
          'background-color',
          'rgb(255, 255, 255)',
        );
        await expect(page.locator('.source-bulk-bar')).toHaveCSS(
          'background-color',
          'rgb(255, 255, 255)',
        );
        expect(preparedIds).toHaveLength(101);
        expect(confirmed).toBe(0);
        const confirm = page.getByRole('button', {
          name: 'Confirm acceptance',
          exact: true,
        });
        await expect(confirm).toBeDisabled();
        await page
          .getByRole('checkbox', { name: /I reviewed the 1 removals/ })
          .check();
        await expect(confirm).toBeEnabled();
        await confirm.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: testInfo.outputPath(
            'source-updates-confirm-' + (phone ? 'mobile' : 'desktop') + '.png',
          ),
        });
        await confirm.click();
        await expect(
          page.getByText(/Review queued. You can close the editor/),
        ).toBeVisible();
        expect(confirmed).toBe(1);
        operation = {
          ...operation!,
          status: 'completed',
          applied: 100,
          skipped: 1,
          message: 'Review finished. Publication is a separate step.',
        };
        await page
          .getByRole('button', { name: 'Refresh source updates', exact: true })
          .click();
        await expect(
          page.getByText(
            'Background review finished. The editor is refreshed; publishing is still a separate step.',
            { exact: true },
          ),
        ).toBeVisible();
        const viewResults = page.getByRole('button', {
          name: 'View results',
          exact: true,
        });
        if (!(await viewResults.isVisible()))
          await page.getByText('Recent decisions', { exact: true }).click();
        await page
          .getByRole('button', { name: 'View results', exact: true })
          .click();
        await expect(
          page.getByRole('region', { name: 'Decision results' }),
        ).toContainText('Accepted into the source baseline');
      },
    );
  }
