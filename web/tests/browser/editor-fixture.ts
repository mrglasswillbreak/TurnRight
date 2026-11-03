import { expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { campusFixture } from '../fixture';
import type { CampusData, CampusPackage, MapEdit } from '../../src/types';
import { attachMap } from './editor-map-helpers';

export function browserCampus(): CampusData {
  const data = campusFixture();
  data.graph.edges = data.graph.edges
    .filter((e) => ['ab', 'ba', 'bc', 'cb'].includes(e.id))
    .map((e) => ({ ...e, sourceId: 'road' }));
  data.places[0] = {
    ...data.places[0],
    coordinates: [3.20025, 6.4603],
    arrivalKind: 'mapped-approach',
    approachDistance: 30,
    graphNode: 'b',
  };
  data.places.push({
    ...data.places[0],
    id: 'gate',
    name: 'Main gate',
    coordinates: [3.2, 6.46],
    graphNode: 'a',
    category: 'gate',
  });
  data.map.features = [
    {
      type: 'Feature',
      properties: {
        id: 'road',
        name: 'Main walk',
        kind: 'path',
        walkingAccess: 'yes',
      },
      geometry: {
        type: 'LineString',
        coordinates: data.graph.nodes.slice(0, 3).map((n) => n.coordinates),
      },
    },
    {
      type: 'Feature',
      properties: {
        id: 'library',
        name: 'Library',
        kind: 'building',
        height: 15,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [3.2001, 6.4602],
            [3.2004, 6.4602],
            [3.2004, 6.4604],
            [3.2001, 6.4604],
            [3.2001, 6.4602],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        id: 'unknown-building',
        name: 'New lecture hall',
        kind: 'building',
        height: 0,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [3.20065, 6.4602],
            [3.2008, 6.4602],
            [3.2008, 6.4604],
            [3.20065, 6.4604],
            [3.20065, 6.4602],
          ],
        ],
      },
    },
  ];
  return data;
}

export async function browserRecovery(page: Page) {
  return page.evaluate(
    () =>
      new Promise<
        import('../../src/editor-workspace').WorkspaceRecovery | undefined
      >((resolve, reject) => {
        const request = indexedDB.open('turnright');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const read = db
            .transaction('preferences')
            .objectStore('preferences')
            .get('editor-workspace:owner');
          read.onerror = () => {
            db.close();
            reject(read.error);
          };
          read.onsuccess = () => {
            db.close();
            resolve(read.result);
          };
        };
      }),
  );
}

export async function setup(
  page: Page,
  realCampus = false,
  enhanced = false,
  options: {
    initialEdits?: MapEdit[];
    publishedEdits?: MapEdit[];
    mutateCampus?: (data: CampusData) => void;
    snapshot?: { data: CampusData; manifest: CampusPackage };
    publicEntry?: boolean;
    startupTimeout?: number;
  } = {},
) {
  let edits: MapEdit[] = structuredClone(options.initialEdits || []);
  let revision = 0;
  const receipts = new Map<string, MapEdit[]>();
  const campus: CampusData =
    options.snapshot?.data ||
    (realCampus
      ? JSON.parse(
          readFileSync(
            new URL(
              '../../public/packages/lasu-4e4c8008b38b/campus.json',
              import.meta.url,
            ),
            'utf8',
          ),
        )
      : browserCampus());
  if (enhanced) {
    campus.visuals = JSON.parse(
      readFileSync(
        new URL('../../../data/visuals/catalogue.json', import.meta.url),
        'utf8',
      ),
    );
    // This fixture represents acceptance of the reviewed ring corrections.
    for (const visual of campus.visuals!.buildings)
      if (visual.geometryReview) {
        const feature = campus.map.features.find(
          (f) => f.properties?.id === visual.id,
        );
        if (feature) feature.geometry = visual.geometryReview.geometry;
      }
    for (const sector of campus.visuals!.sectors)
      await page.context().route(`**${sector.url}`, (route) =>
        route.fulfill({
          body: readFileSync(
            new URL(
              `../../../data/visuals/${sector.url.split('/').at(-1)}`,
              import.meta.url,
            ),
          ),
          contentType: 'application/json',
        }),
      );
  }
  options.mutateCampus?.(campus);
  let published = options.publishedEdits
    ? {
        version: campus.version,
        edits: structuredClone(options.publishedEdits),
      }
    : null;
  const bytes = JSON.stringify(campus);
  const user = {
    id: 'owner',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'owner@example.test',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  };
  await page.addInitScript(
    ({ user }) => {
      localStorage.setItem(
        'sb-editor-test-auth-token',
        JSON.stringify({
          access_token: 'test-token',
          token_type: 'bearer',
          refresh_token: 'test-refresh',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          expires_in: 3600,
          user,
        }),
      );
    },
    { user },
  );
  await page.route('https://editor-test.supabase.co/**', (route) =>
    route.fulfill({ json: { user } }),
  );
  await page.context().route('**/packages/latest.json', (route) =>
    route.fulfill({
      json: options.snapshot
        ? {
            ...options.snapshot.manifest,
            dataUrl: '/packages/fixture/campus.json',
            assets: options.snapshot.manifest.assets.map((a) =>
              a.url === options.snapshot!.manifest.dataUrl
                ? {
                    ...a,
                    url: '/packages/fixture/campus.json',
                    sha256: createHash('sha256').update(bytes).digest('hex'),
                    bytes: Buffer.byteLength(bytes),
                  }
                : a,
            ),
            bytes:
              options.snapshot.manifest.bytes -
              options.snapshot.manifest.assets.find(
                (a) => a.url === options.snapshot!.manifest.dataUrl,
              )!.bytes +
              Buffer.byteLength(bytes),
          }
        : {
            schemaVersion: 1,
            version: campus.version,
            createdAt: campus.createdAt,
            summary: 'Test campus',
            dataUrl: '/packages/fixture/campus.json',
            bytes: Buffer.byteLength(bytes) + (campus.visuals?.bytes || 0),
            ...(campus.visuals
              ? {
                  visuals: {
                    bytes: campus.visuals.bytes,
                    assetUrls: campus.visuals.sectors.map((s) => s.url),
                  },
                }
              : {}),
            assets: [
              {
                url: '/packages/fixture/campus.json',
                sha256: createHash('sha256').update(bytes).digest('hex'),
                bytes: Buffer.byteLength(bytes),
              },
              ...(campus.visuals?.sectors || []),
            ],
          },
    }),
  );
  await page
    .context()
    .route('**/packages/fixture/campus.json', (route) =>
      route.fulfill({ body: bytes, contentType: 'application/json' }),
    );
  const modelFiles = new Map<string, Buffer>(),
    modelRefs = new Map<
      string,
      { id: string; version: 1; sha256: string; bytes: number }
    >();
  await page.route('**/__model-assets/*', async (route) => {
    const id = route.request().url().split('/').at(-1)!;
    if (route.request().method() === 'PUT') {
      modelFiles.set(id, route.request().postDataBuffer()!);
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({
      body: modelFiles.get(id),
      contentType: 'application/json',
    });
  });
  await page.route('**/api/admin', async (route) => {
    const { action, payload } = route.request().postDataJSON();
    if (action === 'workspace-capabilities')
      return route.fulfill({
        json: {
          campusId: 'lasu',
          userId: user.id,
          roles: ['administrator'],
          capabilities: ['read', 'edit', 'review', 'publish', 'manage'],
        },
      });
    if (
      [
        'gis-datasets',
        'gis-reviews',
        'gis-issues',
        'gis-members',
        'gis-quality',
        'gis-views',
        'gis-jobs',
      ].includes(action)
    )
      return route.fulfill({ json: [] });
    if (action === 'model-asset-begin') {
      let reference = modelRefs.get(payload.sha256);
      if (!reference) {
        reference = {
          id: crypto.randomUUID(),
          version: 1,
          sha256: payload.sha256,
          bytes: payload.bytes,
        };
        modelRefs.set(payload.sha256, reference);
      }
      return route.fulfill({
        json: {
          reference,
          ready: modelFiles.has(reference.id),
          url: `http://127.0.0.1:5183/__model-assets/${reference.id}`,
        },
      });
    }
    if (action === 'model-asset-confirm')
      return route.fulfill({ json: { reference: payload.reference } });
    if (action === 'model-asset-read')
      return route.fulfill({
        json: {
          url: `http://127.0.0.1:5183/__model-assets/${payload.reference.id}`,
        },
      });
    if (action === 'source-updates-overview')
      return route.fulfill({
        json: {
          ready: true,
          counts: {},
          layers: [],
          featureTypes: [],
          sources: [],
          scheduledOsmEnabled: false,
          legacy: null,
        },
      });
    if (action === 'source-updates-list')
      return route.fulfill({ json: { rows: [], total: 0, nextCursor: null } });
    if (action === 'source-updates-history')
      return route.fulfill({ json: { operations: [], items: [] } });
    if (action === 'state')
      return route.fulfill({
        json: {
          capabilities: {
            campusId: 'lasu',
            userId: user.id,
            roles: ['administrator'],
            capabilities: ['read', 'edit', 'review', 'publish', 'manage'],
          },
          edits,
          reports: [],
          changes: [],
          jobs: [],
          releases: [],
          published,
        },
      });
    if (action === 'review-status')
      return route.fulfill({
        json: { changes: [], jobs: [], releases: [], published },
      });
    if (action === 'sources') return route.fulfill({ json: { features: [] } });
    if (action === 'survey-list') return route.fulfill({ json: [] });
    if (action === 'save-edits') {
      if (receipts.has(payload.operationId))
        return route.fulfill({ json: receipts.get(payload.operationId) });
      for (const item of payload.edits) {
        const previous = edits.find(
          (e) => e.id === item.edit.id && e.kind === item.edit.kind,
        );
        if ((previous?.updated_at || null) !== item.expectedUpdatedAt)
          return route.fulfill({
            status: 409,
            json: { error: 'Draft changed in another session' },
          });
      }
      const saved = payload.edits.map(({ edit }: { edit: MapEdit }) => ({
        ...edit,
        updated_at: new Date(
          Date.UTC(2026, 8, 11, 12, 0, revision++),
        ).toISOString(),
      }));
      saved.forEach((edit: MapEdit) => {
        edits = [
          ...edits.filter((e) => !(e.id === edit.id && e.kind === edit.kind)),
          edit,
        ];
      });
      receipts.set(payload.operationId, saved);
      return route.fulfill({ json: saved });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto(options.publicEntry ? '/' : '/admin');
  if (!options.publicEntry)
    await expect(
      page.getByRole('button', { name: 'Draw path', exact: true }),
    ).toBeEnabled({ timeout: options.startupTimeout ?? 30000 });
  await attachMap(page);
  return {
    edits: (): MapEdit[] =>
      edits.map((edit) => {
        const ref = edit.properties.modelDocumentAsset;
        return ref && modelFiles.has(ref.id)
          ? {
              ...edit,
              properties: {
                ...edit.properties,
                modelDocument: JSON.parse(modelFiles.get(ref.id)!.toString()),
              },
            }
          : edit;
      }),
    setEdits: (value: MapEdit[]) => {
      edits = value;
    },
    publish: () => {
      published = { version: campus.version, edits: structuredClone(edits) };
    },
    campus,
  };
}
