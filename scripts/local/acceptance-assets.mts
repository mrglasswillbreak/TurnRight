import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import type sharpType from 'sharp';
import {
  newModelDocument,
  type ModelAssetReference,
} from '../../web/src/model-document.ts';
import { primitive } from '../../web/src/model-primitives.ts';

const sharp: typeof sharpType = createRequire(
  new URL('../../web/package.json', import.meta.url),
)('sharp');

export type LocalApi = <T = Record<string, unknown>>(
  role: string,
  action: string,
  payload?: unknown,
  campus?: string,
  status?: number,
) => Promise<T>;

export async function verifyPrivateAssets(
  api: LocalApi,
  serviceOrigin: string,
) {
  const image = await sharp({
    create: { width: 128, height: 128, channels: 3, background: '#20634c' },
  })
    .png()
    .toBuffer();
  const photo = await api<{
    id: string;
    bucket: string;
    path: string;
    token: string;
  }>('editor', 'media-begin', {
    mime: 'image/png',
    bytes: image.length,
    filename: 'synthetic-local.png',
  });
  const upload = await fetch(
    `${serviceOrigin}/storage/v1/object/upload/sign/${photo.bucket}/${photo.path}?token=${encodeURIComponent(photo.token)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: new Uint8Array(image),
    },
  );
  assert(upload.ok, 'Private photograph upload');
  const processed = await api<{ status: string; previewUrl: string }>(
    'editor',
    'media-process',
    { id: photo.id },
  );
  assert.equal(processed.status, 'processed');
  assert.equal(new URL(processed.previewUrl).origin, serviceOrigin);
  assert(
    (await fetch(processed.previewUrl)).ok,
    'Private photograph derivative readback',
  );
  await api('reviewer', 'media-status', { id: photo.id }, 'lasu', 404);
  await api('editor', 'media-status', { id: photo.id }, 'local-south', 403);

  const document = newModelDocument([3.2, 6.46]);
  document.objects = [primitive('box')];
  const bytes = Buffer.from(JSON.stringify(document));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const model = await api<{ reference: ModelAssetReference; url: string }>(
    'editor',
    'model-asset-begin',
    { sha256, bytes: bytes.length },
  );
  await api(
    'editor',
    'model-asset-read',
    { reference: model.reference },
    'lasu',
    409,
  );
  assert.equal(new URL(model.url).origin, serviceOrigin);
  assert(
    (
      await fetch(model.url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: bytes,
      })
    ).ok,
    'Private editable model upload',
  );
  await api('editor', 'model-asset-confirm', { reference: model.reference });
  const read = await api<{ url: string }>('editor', 'model-asset-read', {
    reference: model.reference,
  });
  const retrieved = Buffer.from(await (await fetch(read.url)).arrayBuffer());
  assert.equal(createHash('sha256').update(retrieved).digest('hex'), sha256);
  await api(
    'reviewer',
    'model-asset-read',
    { reference: model.reference },
    'lasu',
    404,
  );
  await api(
    'editor',
    'model-asset-read',
    { reference: model.reference },
    'local-south',
    403,
  );
  return { photoId: photo.id, model: model.reference };
}
