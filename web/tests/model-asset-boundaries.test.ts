import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  hydrateModelEdits,
  modelAssetAction,
  readModelAsset,
  validModelReference,
} from '../server/model-assets';
import { newModelDocument, type ModelDocument } from '../src/model-document';
import type { MapEdit } from '../src/types';
import { withCampusId } from '../server/campus-scope';
import {
  publishedRecords,
  validateReleaseSnapshot,
} from '../server/release-validation';
import { publicCampus } from '../../scripts/public-campus.mjs';
import { modelDocumentRevision } from '../src/model-document-revision';
import { compileModelDocument } from '../src/model-document-compiler';
import { campusFixture } from './fixture';
import { detailFixture } from './model-detail-fixture';

const id = 'b42efb5a-b4d3-43c0-9e41-732aca364f84';
let document: ModelDocument, bytes: Buffer;
let row: {
  id: string;
  owner: string;
  version: 1;
  sha256: string;
  bytes: number;
  path: string;
  status: 'ready' | 'pending';
};
let found: boolean,
  shared: boolean,
  used: number,
  storageStatus: number,
  race: boolean;
const calls: {
  url: URL;
  method: string;
  body: Record<string, unknown> | undefined;
}[] = [];
const reference = () => ({
  id: row.id,
  version: row.version,
  sha256: row.sha256,
  bytes: row.bytes,
});
const encode = () => {
  bytes = Buffer.from(JSON.stringify(document));
  row.bytes = bytes.length;
  row.sha256 = createHash('sha256').update(bytes).digest('hex');
};
beforeEach(() => {
  document = newModelDocument([3.2, 6.46]);
  row = {
    id,
    owner: 'owner',
    version: 1,
    sha256: '',
    bytes: 0,
    path: `owner/${id}.json`,
    status: 'pending',
  };
  encode();
  found = true;
  shared = false;
  used = 0;
  storageStatus = 200;
  race = false;
  calls.length = 0;
  vi.stubEnv('SUPABASE_URL', 'https://model-test.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit) => {
      const url = new URL(input),
        method = init.method || 'GET',
        body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method, body });
      const json = (value: unknown, status = 200) =>
        new Response(JSON.stringify(value), { status });
      if (url.pathname.startsWith('/storage/v1/')) {
        if (storageStatus !== 200) return json({}, storageStatus);
        if (method === 'GET') return new Response(new Uint8Array(bytes));
        return json({
          url: `/object/upload/sign/building-models/${row.path}?token=test`,
          signedURL: `/object/sign/building-models/${row.path}?token=test`,
        });
      }
      if (url.pathname.endsWith('/gis_asset_attached')) return json(shared);
      if (url.searchParams.get('select') === 'bytes')
        return json([{ bytes: used }]);
      if (method === 'POST') {
        if (race) {
          found = true;
          return json({ message: 'Concurrent identical upload' }, 409);
        }
        row = { ...row, ...body };
        found = true;
        return json([row]);
      }
      if (method === 'PATCH') {
        row.status = 'ready';
        return json([row]);
      }
      return json(found ? [row] : []);
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('registers a scoped upload, confirms verified bytes, and returns short-lived read URLs', async () => {
  found = false;
  await withCampusId('north', async () => {
    const start = await modelAssetAction('owner', 'model-asset-begin', {
      sha256: row.sha256,
      bytes: row.bytes,
    });
    expect(start).toMatchObject({ ready: false, reference: reference() });
    expect(start.url).toContain('/storage/v1/object/upload/sign/');
    const insert = calls.find(
      (c) => c.method === 'POST' && c.url.pathname.endsWith('/model_assets'),
    )!;
    expect(insert.body).toMatchObject({ owner: 'owner', campus_id: 'north' });
    await expect(readModelAsset(reference(), 'owner')).rejects.toMatchObject({
      status: 409,
    });
    expect(
      await modelAssetAction('owner', 'model-asset-confirm', {
        reference: reference(),
      }),
    ).toEqual({ reference: reference() });
    const edit: MapEdit = {
      id: 'block',
      kind: 'building',
      geometry: { type: 'Point', coordinates: [3.2, 6.46] },
      properties: { modelDocumentAsset: reference() },
    };
    const plain = { ...edit, id: 'other', properties: {} };
    const hydrated = await hydrateModelEdits([edit, plain], 'owner');
    expect(hydrated[0].properties.modelDocument).toEqual(document);
    expect(hydrated[1]).toBe(plain);
    expect(edit.properties).not.toHaveProperty('modelDocument');
    await modelAssetAction('owner', 'model-asset-read', {
      reference: reference(),
    });
    expect(calls.at(-1)!.body).toEqual({ expiresIn: 300 });
  });
});

it('deduplicates a concurrent upload and never overwrites a ready asset', async () => {
  found = false;
  race = true;
  await modelAssetAction('owner', 'model-asset-begin', {
    sha256: row.sha256,
    bytes: row.bytes,
  });
  expect(
    calls.filter(
      (c) => c.url.pathname.endsWith('/model_assets') && c.method === 'POST',
    ),
  ).toHaveLength(1);
  row.status = 'ready';
  calls.length = 0;
  expect(
    await modelAssetAction('owner', 'model-asset-begin', {
      sha256: row.sha256,
      bytes: row.bytes,
    }),
  ).toMatchObject({ ready: true });
  await modelAssetAction('owner', 'model-asset-confirm', {
    reference: reference(),
  });
  expect(calls.some((c) => c.url.pathname.startsWith('/storage/v1/'))).toBe(
    false,
  );
});

it('carries a newly hydrated building through release decoration and detail compilation', async () => {
  const fixture = detailFixture(),
    data = campusFixture();
  document = fixture.document;
  row.status = 'ready';
  encode();
  const edit: MapEdit = {
    id: fixture.visual.id,
    kind: 'building',
    geometry: fixture.feature.geometry,
    properties: {
      name: 'New detailed building',
      height: 6,
      heightMode: 'metres',
      modelDocumentAsset: reference(),
      reviewedModelRevision: modelDocumentRevision(document),
    },
  };
  const edits = await hydrateModelEdits([edit], 'owner');
  const output = validateReleaseSnapshot(
    { features: publishedRecords(data), edits },
    data,
  );
  const feature = output.map.features.find(
    (f) => f.properties?.id === edit.id,
  )!;
  const retained = feature.properties!.modelDocument as ModelDocument;
  expect(modelDocumentRevision(retained)).toBe(
    edit.properties.reviewedModelRevision,
  );
  expect(feature.properties!.modelDocumentAsset).toEqual(reference());
  expect(feature.properties!.reviewedModelRevision).toBe(
    edit.properties.reviewedModelRevision,
  );
  expect(
    compileModelDocument(retained, retained.origin).reduce(
      (n, mesh) => n + mesh.indices.length / 3,
      0,
    ),
  ).toBe(36);
  const metadataOnly = {
    ...edit,
    properties: { name: 'Renamed', height: 6, heightMode: 'metres' },
  };
  const unchanged = validateReleaseSnapshot(
    { features: publishedRecords(output), edits: [metadataOnly] },
    data,
  );
  expect(unchanged.map.features[0].properties!.modelDocument).toEqual(retained);
  expect(unchanged.map.features[0].properties!.modelDocumentAsset).toEqual(
    reference(),
  );
  const published = publicCampus(output).map.features[0].properties!;
  expect(published.modelDocument).toBeUndefined();
  expect(published.modelDocumentAsset).toBeUndefined();
  expect(published.authoredModelRevision).toBe(modelDocumentRevision(document));
  expect(edit.properties.modelDocument).toBeUndefined();
});

it('rejects invalid references, quota overflow, digest conflicts and unavailable storage', async () => {
  expect(validModelReference({ ...reference(), bytes: -1 })).toBe(false);
  await expect(
    modelAssetAction('owner', 'model-asset-begin', { sha256: 'bad', bytes: 4 }),
  ).rejects.toMatchObject({ status: 400 });
  found = false;
  used = 500 * 1024 * 1024;
  await expect(
    modelAssetAction('owner', 'model-asset-begin', {
      sha256: row.sha256,
      bytes: row.bytes,
    }),
  ).rejects.toMatchObject({ status: 413 });
  found = true;
  await expect(
    modelAssetAction('owner', 'model-asset-begin', {
      sha256: row.sha256,
      bytes: row.bytes + 1,
    }),
  ).rejects.toMatchObject({ status: 409 });
  storageStatus = 503;
  await expect(
    modelAssetAction('owner', 'model-asset-begin', {
      sha256: row.sha256,
      bytes: row.bytes,
    }),
  ).rejects.toMatchObject({ status: 503 });
});

it('allows shared reads only for ready assets attached to the active campus', async () => {
  row.owner = 'other';
  row.status = 'ready';
  await expect(readModelAsset(reference(), 'owner')).rejects.toMatchObject({
    status: 404,
  });
  shared = true;
  expect(await readModelAsset(reference(), 'owner')).toEqual(document);
  row.status = 'pending';
  await expect(readModelAsset(reference(), 'owner')).rejects.toMatchObject({
    status: 404,
  });
  row.owner = 'owner';
  await expect(
    modelAssetAction('owner', 'model-asset-read', { reference: reference() }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    modelAssetAction('owner', 'unknown', { reference: reference() }),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    readModelAsset({ ...reference(), bytes: row.bytes + 1 }, 'owner'),
  ).rejects.toMatchObject({ status: 404 });
});

it('checks content hashes, JSON structure and actual image encoding before confirming', async () => {
  bytes = Buffer.from('tampered');
  await expect(
    modelAssetAction('owner', 'model-asset-confirm', {
      reference: reference(),
    }),
  ).rejects.toThrow(/integrity/);
  row.bytes = bytes.length;
  row.sha256 = createHash('sha256').update(bytes).digest('hex');
  await expect(
    modelAssetAction('owner', 'model-asset-confirm', {
      reference: reference(),
    }),
  ).rejects.toThrow(/JSON/);
  const image = await sharp({
    create: { width: 8, height: 8, channels: 4, background: '#ffffff' },
  })
    .png()
    .toBuffer();
  document.images = [
    {
      id: 'texture',
      name: 'Texture',
      mime: 'image/jpeg',
      data: image.toString('base64'),
    },
  ];
  encode();
  await expect(
    modelAssetAction('owner', 'model-asset-confirm', {
      reference: reference(),
    }),
  ).rejects.toThrow(/declared image type/);
  document.images[0].mime = 'image/png';
  encode();
  await modelAssetAction('owner', 'model-asset-confirm', {
    reference: reference(),
  });
  expect(row.status).toBe('ready');
});
