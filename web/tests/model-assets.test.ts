import { afterEach, expect, it, vi } from 'vitest';
import {
  hydrateModelResponse,
  prepareModelSave,
} from '../src/model-asset-client';
import {
  newModelDocument,
  type ModelAssetReference,
} from '../src/model-document';
import { primitive } from '../src/model-primitives';
import type { MapEdit } from '../src/types';
afterEach(() => vi.unstubAllGlobals());
it('uploads one immutable source, sends only its reference and hydrates current and published revisions', async () => {
  const document = newModelDocument([3.2, 6.46]);
  document.objects = [primitive('box')];
  const edit: MapEdit = {
    id: 'asset-test',
    kind: 'building',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [0, 1],
          [1, 1],
          [0, 0],
        ],
      ],
    },
    properties: { modelDocument: document },
  };
  let reference: ModelAssetReference;
  let uploaded: Uint8Array;
  const calls: string[] = [];
  const api = async <T>(action: string, payload: unknown): Promise<T> => {
    calls.push(action);
    if (action === 'model-asset-begin') {
      reference = {
        version: 1,
        id: crypto.randomUUID(),
        ...(payload as { sha256: string; bytes: number }),
      };
      return {
        reference,
        url: 'https://storage.test/upload',
        ready: false,
      } as T;
    }
    if (action === 'model-asset-read')
      return { url: 'https://storage.test/read' } as T;
    return { reference } as T;
  };
  const fetcher = vi.fn(async (_url: unknown, options?: RequestInit) => {
    if (options?.method === 'PUT') {
      uploaded = options.body as Uint8Array;
      return new Response('{}');
    }
    return new Response(uploaded!.slice().buffer);
  });
  vi.stubGlobal('fetch', fetcher);
  const batch = await prepareModelSave(
    { edits: [{ edit }], operationId: 'one' },
    api,
    'owner-a',
  );
  expect(batch.edits[0].edit.properties.modelDocument).toBeUndefined();
  expect(edit.properties.modelDocument).toBe(document);
  expect(calls).toEqual(['model-asset-begin', 'model-asset-confirm']);
  const stored = batch.edits[0].edit;
  const hydrated = await hydrateModelResponse(
    { edits: [stored], published: { edits: [stored] } },
    api,
    'owner-reopened',
  );
  expect(hydrated.edits[0].properties.modelDocument).toEqual(document);
  expect(hydrated.published.edits[0].properties.modelDocument).toEqual(
    document,
  );
  expect(calls.filter((c) => c === 'model-asset-read')).toHaveLength(1);
  await prepareModelSave(
    { edits: [{ edit }], operationId: 'two' },
    api,
    'owner-a',
  );
  expect(calls.filter((c) => c === 'model-asset-begin')).toHaveLength(1);
});
it('rejects altered assets without hydrating them into the draft', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}')),
  );
  const edit = {
    properties: {
      modelDocumentAsset: {
        version: 1,
        id: crypto.randomUUID(),
        bytes: 2,
        sha256: 'a'.repeat(64),
      },
    },
  };
  await expect(
    hydrateModelResponse(
      [edit],
      async <T>() => ({ url: 'https://storage.test/corrupt' }) as T,
      'isolated-owner',
    ),
  ).rejects.toThrow(/integrity/);
  expect(edit.properties).not.toHaveProperty('modelDocument');
});
