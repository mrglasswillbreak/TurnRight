import { randomUUID } from 'node:crypto';
import { db, HttpError, requireConfig } from './backend.js';
import { photoDerivative, MAX_ORIGINAL_BYTES } from './photo-processing.js';
import { publicPhoto, validPhoto } from '../src/arrival.js';
import type { CampusPhoto, MapEdit } from '../src/types.js';

const bucket = 'building-media';
interface MediaRow {
  id: string;
  owner: string;
  status: string;
  original_path: string;
  derivative_path?: string;
  public_metadata?: CampusPhoto;
}
async function storage(
  route: string,
  method = 'POST',
  body?: unknown,
  binary?: Buffer,
) {
  requireConfig();
  const response = await fetch(
    `${process.env.SUPABASE_URL}/storage/v1/${route}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        'Content-Type': binary ? 'image/webp' : 'application/json',
      },
      ...(method !== 'GET'
        ? { body: binary ? new Uint8Array(binary) : JSON.stringify(body || {}) }
        : {}),
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!response.ok)
    throw new HttpError(
      503,
      'Private photograph storage is unavailable. Check migration 008 and retry.',
    );
  return response;
}
export async function mediaAction(
  owner: string,
  action: string,
  payload: Record<string, unknown>,
) {
  if (action === 'media-begin') {
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(
        String(payload.mime),
      ) ||
      !Number.isInteger(payload.bytes) ||
      Number(payload.bytes) <= 0 ||
      Number(payload.bytes) > MAX_ORIGINAL_BYTES
    )
      throw new HttpError(400, 'Choose a JPEG, PNG or WebP up to 10 MiB.');
    const id = randomUUID(),
      original_path = `${owner}/${id}/original`;
    await db('building_media', 'POST', { id, owner, original_path });
    const signed = await (
      await storage(`object/upload/sign/${bucket}/${original_path}`, 'POST', {
        upsert: false,
      })
    ).json();
    const signedUrl = new URL(signed.url, process.env.SUPABASE_URL);
    const token = signedUrl.searchParams.get('token');
    if (!token)
      throw new HttpError(503, 'Storage did not return an upload token.');
    return { id, path: original_path, token, bucket };
  }
  if (typeof payload.id !== 'string' || !/^[a-f0-9-]{36}$/.test(payload.id))
    throw new HttpError(400, 'Choose a photograph upload.');
  const [row] = await db<MediaRow[]>(
    `building_media?id=eq.${payload.id}&owner=eq.${owner}`,
  );
  if (!row) throw new HttpError(404, 'Photograph not found.');
  if (action === 'media-revise') {
    if (row.status !== 'approved')
      throw new HttpError(400, 'Choose an approved photograph to revise.');
    const id = randomUUID();
    await db('building_media', 'POST', {
      id,
      owner,
      status: 'processed',
      original_path: row.original_path,
      derivative_path: row.derivative_path,
      public_metadata: { ...row.public_metadata, id: `owner:${id}` },
    });
    return { id };
  }
  if (action === 'media-process') {
    if (row.status === 'pending') {
      const response = await storage(
        `object/${bucket}/${row.original_path}`,
        'GET',
      );
      const reader = response.body!.getReader(),
        chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > MAX_ORIGINAL_BYTES) {
          await reader.cancel();
          throw new HttpError(400, 'Original exceeds 10 MiB.');
        }
        chunks.push(value);
      }
      const image = await photoDerivative(Buffer.concat(chunks));
      const derivative_path = `${owner}/${row.id}/${image.sha256}.webp`;
      // A retry may already have uploaded this immutable derivative.
      try {
        await storage(
          `object/${bucket}/${derivative_path}`,
          'POST',
          undefined,
          image.bytes,
        );
      } catch (error) {
        const existing = await storage(
          `object/${bucket}/${derivative_path}`,
          'GET',
        ).catch(() => {
          throw error;
        });
        if (!Buffer.from(await existing.arrayBuffer()).equals(image.bytes))
          throw error;
      }
      const metadata = {
        id: `owner:${row.id}`,
        url: `/packages/photos/${image.sha256}.webp`,
        sha256: image.sha256,
        bytes: image.bytes.length,
        width: image.width,
        height: image.height,
      };
      await db(`building_media?id=eq.${row.id}&status=eq.pending`, 'PATCH', {
        status: 'processed',
        derivative_path,
        original_sha256: image.originalSha256,
        public_metadata: metadata,
      });
      row.derivative_path = derivative_path;
      row.public_metadata = metadata as CampusPhoto;
    }
    const signed = await (
      await storage(`object/sign/${bucket}/${row.derivative_path}`, 'POST', {
        expiresIn: 3600,
      })
    ).json();
    return {
      metadata: row.public_metadata,
      previewUrl: `${process.env.SUPABASE_URL}/storage/v1${signed.signedURL}`,
    };
  }
  if (action === 'media-approve') {
    if (row.status !== 'processed' || payload.reviewed !== true)
      throw new HttpError(
        409,
        'Process the image and confirm its identity, quality and redistribution rights first.',
      );
    const metadata = payload.metadata as CampusPhoto;
    if (
      !validPhoto(metadata) ||
      ['id', 'url', 'sha256', 'bytes', 'width', 'height'].some(
        (key) =>
          metadata[key as keyof CampusPhoto] !==
          row.public_metadata?.[key as keyof CampusPhoto],
      )
    )
      throw new HttpError(
        400,
        'Complete the photograph match, caption, alternative text, original source and license evidence.',
      );
    const clean = publicPhoto(metadata);
    const updated = await db<MediaRow[]>(
      `building_media?id=eq.${row.id}&owner=eq.${owner}&status=eq.processed`,
      'PATCH',
      {
        status: 'approved',
        public_metadata: clean,
        reviewed_at: new Date().toISOString(),
      },
    );
    if (!updated.length)
      throw new HttpError(
        409,
        'This photograph was already reviewed. Refresh before attaching it.',
      );
    return clean;
  }
  throw new HttpError(400, 'Unknown photograph action.');
}
/** Uploaded bytes must be processed and reviewed, even if the editor request is hand-crafted. */
export async function validateMediaEdits(edits: MapEdit[]) {
  for (const photo of edits.flatMap((e) =>
    Array.isArray(e.properties.photos)
      ? (e.properties.photos as CampusPhoto[])
      : [],
  )) {
    if (!validPhoto(photo))
      throw new HttpError(400, 'Invalid photograph metadata.');
    if (!photo.id.startsWith('owner:')) continue; // Published research catalogue is checked by hash during packaging.
    const [row] = await db<MediaRow[]>(
      `building_media?id=eq.${encodeURIComponent(photo.id.slice(6))}&status=eq.approved`,
    );
    if (
      !row?.public_metadata ||
      JSON.stringify(publicPhoto(row.public_metadata)) !==
        JSON.stringify(publicPhoto(photo))
    )
      throw new HttpError(
        400,
        'This upload has not been approved with these details.',
      );
  }
}
