import { expect, it } from 'vitest';
import {
  identityTransform,
  MODEL_LIMITS,
  newModelDocument,
} from '../src/model-document';
import {
  compactImportedModel,
  quantizeImportedMesh,
} from '../../scripts/solidcraft/import-compaction.mts';

function fixture() {
  const document = newModelDocument([3.2, 6.47]);
  const x = 1.123456789123,
    y = 2.987654321987,
    z = 3.123456789123;
  document.objects = [
    {
      id: 'imported',
      name: 'Imported facade',
      hidden: false,
      locked: false,
      detailTier: 'facade',
      source: { kind: 'import', name: 'master.obj' },
      transform: identityTransform(),
      vertices: { a: [x, y, z], b: [x + 2, y, z], c: [x, y + 2, z] },
      faces: [
        {
          id: 'component-0',
          material: document.materials[0].id,
          corners: ['a', 'b', 'c'].map((vertex) => ({
            vertex,
            normal: [1e-10, -1e-10, 1],
            uv: [0.123456789123, 0.987654321987],
          })),
        },
      ],
    },
  ];
  return document;
}

it('keeps a bounded finished document at full precision and preserves its identity', () => {
  const source = fixture(),
    before = JSON.stringify(source);
  const result = compactImportedModel(source);
  expect(result.document).toBe(source);
  expect(result.quantization).toBeUndefined();
  expect(JSON.stringify(result.document)).toBe(before);
});

it('bounds vector and compiled-placement error while preserving editable topology and metadata', () => {
  const source = fixture(),
    before = JSON.stringify(source);
  source.images.push({
    id: 'image',
    name: 'Evidence',
    mime: 'image/png',
    data: 'AAAA',
  });
  const result = quantizeImportedMesh(source),
    { document, verification } = result;
  expect(verification.maxPositionErrorMetres).toBeGreaterThan(0);
  expect(verification.maxPositionErrorMetres).toBeLessThan(1e-6);
  expect(verification.maxBoundsErrorMetres).toBeLessThan(1e-6);
  expect(verification.maxNormalError).toBeLessThanOrEqual(1e-8);
  expect(verification.maxUvError).toBeLessThanOrEqual(1e-8);
  expect(verification.trianglesAfter).toBe(verification.trianglesBefore);
  expect(verification.trianglesAfter).toBe(1);
  expect(verification.topologyAndIdentitiesPreserved).toBe(true);
  expect(verification.normalsAndWindingVerified).toBe(true);
  expect(document.origin).toEqual(source.origin);
  expect(document.images).toEqual(source.images);
  expect(document.materials).toEqual(source.materials);
  expect(Object.keys(document.objects[0].vertices)).toEqual(['a', 'b', 'c']);
  expect(document.objects[0].source).toEqual(source.objects[0].source);
  expect(document.objects[0].faces[0].id).toBe('component-0');
  expect(document.objects[0].faces[0].corners.map((c) => c.vertex)).toEqual([
    'a',
    'b',
    'c',
  ]);
  expect(document.objects[0].faces[0].material).toBe(
    source.objects[0].faces[0].material,
  );
  expect(JSON.stringify({ ...source, images: [] })).toBe(before);
});

it('rejects quantization that collapses a face without changing its source', () => {
  const source = fixture();
  source.objects[0].vertices.b = [
    source.objects[0].vertices.a[0] + 1e-7,
    ...source.objects[0].vertices.a.slice(1),
  ] as [number, number, number];
  const before = JSON.stringify(source);
  expect(() => quantizeImportedMesh(source)).toThrow('degenerate or reverse');
  expect(JSON.stringify(source)).toBe(before);
});

it('rejects transformed meshes instead of misstating metre precision', () => {
  const source = fixture();
  source.objects[0].transform.scale = [2, 2, 2];
  expect(() => quantizeImportedMesh(source)).toThrow('identity transforms');
});

it('only compacts oversized documents and enforces the unchanged 25 MiB boundary', () => {
  const source = fixture();
  source.images = Array.from({ length: 6 }, (_, i) => ({
    id: 'image-' + i,
    name: 'Serialization boundary fixture',
    mime: 'image/png' as const,
    data: '',
  }));
  let remaining =
    MODEL_LIMITS.documentBytes + 32 - Buffer.byteLength(JSON.stringify(source));
  for (const image of source.images) {
    const length = Math.min(4400000, remaining - (remaining % 4));
    image.data = 'A'.repeat(length);
    remaining -= length;
  }
  const result = compactImportedModel(source);
  expect(result.quantization?.bytesBefore).toBeGreaterThan(
    MODEL_LIMITS.documentBytes,
  );
  expect(result.quantization?.bytesAfter).toBeLessThanOrEqual(
    MODEL_LIMITS.documentBytes,
  );
  expect(result.quantization?.sourceDocumentSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(result.quantization?.uploadLimitBytes).toBe(25 * 1024 * 1024);
  expect(Buffer.byteLength(JSON.stringify(result.document))).toBe(
    result.quantization?.bytesAfter,
  );
  source.images[5].data += 'AAAA'.repeat(1024);
  expect(() => compactImportedModel(source)).toThrow(
    'still exceeds the 25 MiB',
  );
});
