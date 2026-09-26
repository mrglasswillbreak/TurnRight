import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { db, HttpError, requireConfig } from './backend.js';
import {
  MODEL_LIMITS,
  modelDocumentErrors,
  type ModelDocument,
  type ModelAssetReference,
} from '../src/model-document.js';
import type { MapEdit } from '../src/types.js';
interface AssetRow {
  id: string;
  owner: string;
  version: 1;
  sha256: string;
  bytes: number;
  path: string;
  status: 'pending' | 'ready';
}
const bucket = 'building-models';
export const validModelReference = (r: ModelAssetReference): boolean =>
  !!r &&
  r.version === 1 &&
  typeof r.id === 'string' &&
  /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(r.id) &&
  /^[a-f\d]{64}$/.test(r.sha256) &&
  Number.isSafeInteger(r.bytes) &&
  r.bytes > 0 &&
  r.bytes <= MODEL_LIMITS.documentBytes;
async function storage(route: string, method = 'POST', body?: unknown) {
  requireConfig();
  const result = await fetch(
    `${process.env.SUPABASE_URL}/storage/v1/${route}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        'Content-Type': 'application/json',
      },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body || {}) }),
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!result.ok)
    throw new HttpError(
      503,
      'Model asset storage is unavailable. Apply migration 012 before enabling model saves. Your local draft is retained.',
    );
  return result;
}
const reference = (row: AssetRow): ModelAssetReference => ({
  id: row.id,
  version: row.version,
  sha256: row.sha256,
  bytes: row.bytes,
});
async function rowFor(ref: ModelAssetReference, owner?: string) {
  if (!validModelReference(ref))
    throw new HttpError(400, 'Invalid editable model asset reference.');
  const [row] = await db<AssetRow[]>(
    `model_assets?id=eq.${ref.id}${owner ? `&owner=eq.${owner}` : ''}`,
  );
  if (
    !row ||
    row.sha256 !== ref.sha256 ||
    row.bytes !== ref.bytes ||
    row.version !== ref.version
  )
    throw new HttpError(
      404,
      'This model asset is not available to this account.',
    );
  return row;
}
async function readRow(row: AssetRow): Promise<ModelDocument> {
  const response = await storage(`object/${bucket}/${row.path}`, 'GET');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (
    bytes.length !== row.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== row.sha256
  )
    throw new HttpError(400, 'Model asset integrity check failed.');
  let document: ModelDocument;
  try {
    document = JSON.parse(bytes.toString());
  } catch {
    throw new HttpError(400, 'The editable model document is not valid JSON.');
  }
  const errors = modelDocumentErrors(document);
  if (errors.length) throw new HttpError(400, errors.join(' '));
  return document;
}
export async function readModelAsset(ref: ModelAssetReference, owner?: string) {
  const row = await rowFor(ref, owner);
  if (row.status !== 'ready')
    throw new HttpError(409, 'Finish the model asset upload before saving.');
  return readRow(row);
}
export async function hydrateModelEdits(edits: MapEdit[], owner?: string) {
  const next: MapEdit[] = [];
  for (const edit of edits) {
    const ref = edit.properties?.modelDocumentAsset;
    next.push(
      ref
        ? {
            ...edit,
            properties: {
              ...edit.properties,
              modelDocument: await readModelAsset(ref, owner),
            },
          }
        : edit,
    );
  }
  return next;
}
export async function modelAssetAction(
  owner: string,
  action: string,
  payload: Record<string, unknown>,
) {
  if (action === 'model-asset-begin') {
    const { sha256, bytes } = payload;
    if (
      typeof sha256 !== 'string' ||
      !Number.isSafeInteger(bytes) ||
      !validModelReference({
        id: randomUUID(),
        version: 1,
        sha256,
        bytes: Number(bytes),
      })
    )
      throw new HttpError(400, 'Choose a valid model document up to 25 MiB.');
    let [row] = await db<AssetRow[]>(
      `model_assets?owner=eq.${owner}&sha256=eq.${sha256}`,
    );
    if (!row) {
      const usage = await db<AssetRow[]>(
        `model_assets?owner=eq.${owner}&select=bytes&limit=1000`,
      );
      if (
        usage.reduce((n, a) => n + a.bytes, 0) + Number(bytes) >
        500 * 1024 * 1024
      )
        throw new HttpError(
          413,
          'Private model assets exceed the 500 MiB account budget. Retain the draft and archive unused assets before retrying.',
        );
      const id = randomUUID();
      try {
        [row] = await db<AssetRow[]>('model_assets', 'POST', {
          id,
          owner,
          version: 1,
          sha256,
          bytes,
          path: `${owner}/${id}.json`,
        });
      } catch (error) {
        if (!(error instanceof HttpError) || error.status !== 409) throw error;
        [row] = await db<AssetRow[]>(
          `model_assets?owner=eq.${owner}&sha256=eq.${sha256}`,
        );
      }
    }
    if (row.bytes !== bytes)
      throw new HttpError(
        409,
        'This digest is registered with a different size.',
      );
    if (row.status === 'ready')
      return { reference: reference(row), ready: true };
    const signed = await (
      await storage(`object/upload/sign/${bucket}/${row.path}`, 'POST', {
        upsert: false,
      })
    ).json();
    const url = new URL(signed.url, process.env.SUPABASE_URL);
    if (!url.pathname.startsWith('/storage/v1/'))
      url.pathname = `/storage/v1${url.pathname}`;
    return { reference: reference(row), url: url.toString(), ready: false };
  }
  const ref = payload.reference as ModelAssetReference,
    row = await rowFor(ref, owner);
  if (action === 'model-asset-confirm') {
    if (row.status === 'ready') return { reference: reference(row) };
    const document = await readRow(row);
    let imagePixels = 0;
    for (const image of document.images) {
      const bytes = Buffer.from(image.data, 'base64'),
        info = await sharp(bytes, { limitInputPixels: 4096 * 4096 })
          .metadata()
          .catch(() => null);
      if (
        !info ||
        !['png', 'jpeg', 'webp'].includes(info.format) ||
        !info.width ||
        !info.height ||
        info.width > 4096 ||
        info.height > 4096 ||
        (info.pages || 1) > 1
      )
        throw new HttpError(
          400,
          'Model textures must be static PNG, JPEG, or WebP images up to 4096 pixels per side.',
        );
      if (`image/${info.format}` !== image.mime)
        throw new HttpError(
          400,
          'A model texture does not match its declared image type.',
        );
      imagePixels += info.width * info.height;
      if (imagePixels > MODEL_LIMITS.imagePixels)
        throw new HttpError(
          400,
          'Model textures exceed 16 megapixels in total. Reduce their resolution; your local draft is retained.',
        );
    }
    await db(
      `model_assets?id=eq.${row.id}&owner=eq.${owner}&status=eq.pending`,
      'PATCH',
      { status: 'ready' },
    );
    return { reference: reference(row) };
  }
  if (action === 'model-asset-read') {
    if (row.status !== 'ready')
      throw new HttpError(409, 'The model asset is not ready.');
    const signed = await (
      await storage(`object/sign/${bucket}/${row.path}`, 'POST', {
        expiresIn: 300,
      })
    ).json();
    return {
      url: `${process.env.SUPABASE_URL}/storage/v1${signed.signedURL}`,
      reference: reference(row),
    };
  }
  throw new HttpError(400, 'Unknown model asset action.');
}
