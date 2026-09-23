import { randomUUID } from 'node:crypto';
import { db, HttpError, requireConfig } from './backend.js';
import { photoDerivative, MAX_ORIGINAL_BYTES } from './photo-processing.js';
import { publicPhoto, validPhoto } from '../src/arrival.js';
import type { CampusPhoto, MapEdit } from '../src/types.js';
import { photoDetails, samePhotoRights } from '../src/photo-details.js';

const bucket = 'building-media';
interface MediaRow {
  id: string;
  owner: string;
  status: string;
  original_path: string;
  derivative_path?: string;
  public_metadata?: CampusPhoto;
  draft_metadata?: Partial<CampusPhoto> & { replacesPhotoId?: string };
  draft_revision?: number;
  original_filename?: string;
  original_mime?: string;
  original_bytes?: number;
  authorship_confirmed?: boolean;
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
  const preview = async (row: MediaRow) => {
    if (!row.derivative_path) return undefined;
    const signed = await (
      await storage(`object/sign/${bucket}/${row.derivative_path}`, 'POST', {
        expiresIn: 3600,
      })
    ).json();
    return `${process.env.SUPABASE_URL}/storage/v1${signed.signedURL}`;
  };
  if (action === 'media-library') {
    const offset = Number(payload.offset || 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000)
      throw new HttpError(400, 'Invalid photo page.');
    const query = String(payload.query || '')
      .trim()
      .slice(0, 100)
      .replace(/[^\p{L}\p{N} _-]/gu, '');
    const filter = query
      ? `&or=(original_filename.ilike.*${encodeURIComponent(query)}*,public_metadata->>caption.ilike.*${encodeURIComponent(query)}*,draft_metadata->>caption.ilike.*${encodeURIComponent(query)}*)`
      : '';
    const rows = await db<MediaRow[]>(
      `building_media?owner=eq.${owner}&order=created_at.desc,id.desc&limit=21&offset=${offset}${filter}`,
    );
    return {
      items: await Promise.all(
        rows.slice(0, 20).map(async (row) => ({
          id: row.id,
          status: row.status,
          filename: row.original_filename,
          metadata: row.public_metadata,
          draft: row.draft_metadata,
          revision: row.draft_revision || 0,
          authorshipConfirmed: row.authorship_confirmed,
          replacesPhotoId: row.draft_metadata?.replacesPhotoId,
          ...(payload.previews === false
            ? {}
            : {
                previewUrl: await preview(row).catch(() => undefined),
                previewExpiresAt: Date.now() + 3_600_000,
              }),
        })),
      ),
      nextOffset: rows.length > 20 ? offset + 20 : null,
    };
  }
  if (action === 'media-list') {
    const rows = await db<MediaRow[]>(
      `building_media?owner=eq.${owner}&order=created_at.desc&limit=100`,
    );
    return rows.map(({ id, status, public_metadata }) => ({
      id,
      status,
      caption: public_metadata?.caption || 'Private photograph upload',
    }));
  }
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
    if (
      payload.uploadId !== undefined &&
      (typeof payload.uploadId !== 'string' ||
        !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(payload.uploadId))
    )
      throw new HttpError(400, 'Invalid upload identifier.');
    const id = String(payload.uploadId || randomUUID()),
      original_path = `${owner}/${id}/original`;
    const rowForRetry = async () => {
      const [existing] = await db<MediaRow[]>(
        `building_media?id=eq.${id}&owner=eq.${owner}`,
      );
      if (
        !existing ||
        existing.original_bytes !== payload.bytes ||
        existing.original_mime !== payload.mime ||
        existing.original_filename !==
          String(payload.filename || 'Photograph').slice(0, 256)
      )
        throw new HttpError(
          409,
          'This upload identifier belongs to a different file.',
        );
      return existing;
    };
    try {
      await db('building_media', 'POST', {
        id,
        owner,
        original_path,
        original_filename: String(payload.filename || 'Photograph').slice(
          0,
          256,
        ),
        original_mime: payload.mime,
        original_bytes: payload.bytes,
        draft_metadata: photoDetails(payload.metadata),
      });
    } catch (error) {
      if (
        !payload.uploadId ||
        !(error instanceof HttpError) ||
        error.status !== 409
      )
        throw error;
      const existing = await rowForRetry();
      if (existing.status !== 'pending')
        return {
          id,
          status: existing.status,
          metadata: existing.public_metadata,
        };
    }
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
  if (action === 'media-preview')
    return {
      previewUrl: await preview(row),
      previewExpiresAt: Date.now() + 3_600_000,
    };
  if (action === 'media-status')
    return {
      id: row.id,
      status: row.status,
      metadata: row.public_metadata,
      draft: row.draft_metadata,
      revision: row.draft_revision || 0,
    };
  if (action === 'media-draft') {
    if (row.status === 'approved')
      throw new HttpError(
        409,
        'Create a revision before changing an approved photograph.',
      );
    const revision = Number(payload.revision);
    if (
      !Number.isSafeInteger(revision) ||
      revision < 0 ||
      JSON.stringify(payload.metadata || {}).length > 24000
    )
      throw new HttpError(400, 'Invalid photo draft.');
    const updated = await db<MediaRow[]>(
      `building_media?id=eq.${row.id}&owner=eq.${owner}&draft_revision=eq.${revision}&status=neq.approved`,
      'PATCH',
      {
        draft_metadata: {
          ...photoDetails(payload.metadata),
          ...(row.draft_metadata?.replacesPhotoId
            ? { replacesPhotoId: row.draft_metadata.replacesPhotoId }
            : {}),
        },
        draft_revision: revision + 1,
        updated_at: new Date().toISOString(),
      },
    );
    if (!updated.length)
      throw new HttpError(
        409,
        'This photo draft changed in another session. Recover the latest private upload before saving again.',
      );
    return { revision: revision + 1 };
  }
  if (action === 'media-upload-url') {
    if (
      row.status !== 'pending' ||
      payload.bytes !== row.original_bytes ||
      payload.mime !== row.original_mime
    )
      throw new HttpError(
        409,
        'Reselect the original file with the same size and type.',
      );
    const signed = await (
      await storage(
        `object/upload/sign/${bucket}/${row.original_path}`,
        'POST',
        { upsert: false },
      )
    ).json();
    return {
      id: row.id,
      bucket,
      path: row.original_path,
      token: new URL(signed.url, process.env.SUPABASE_URL).searchParams.get(
        'token',
      ),
    };
  }
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
      draft_metadata: {
        ...photoDetails(row.public_metadata),
        replacesPhotoId: row.public_metadata?.id,
      },
      original_filename: row.original_filename,
      authorship_confirmed: row.authorship_confirmed || false,
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
      row.status = 'processed';
      row.derivative_path = derivative_path;
      row.public_metadata = metadata as CampusPhoto;
    }
    return {
      metadata: row.public_metadata,
      draft: row.draft_metadata,
      revision: row.draft_revision || 0,
      previewUrl: await preview(row),
      previewExpiresAt: Date.now() + 3_600_000,
      status: row.status,
      authorshipConfirmed: row.authorship_confirmed || false,
      replacesPhotoId: row.draft_metadata?.replacesPhotoId,
    };
  }
  if (action === 'media-approve') {
    if (
      row.status === 'approved' &&
      payload.reviewed === true &&
      validPhoto(payload.metadata) &&
      JSON.stringify(publicPhoto(payload.metadata)) ===
        JSON.stringify(publicPhoto(row.public_metadata!))
    )
      return row.public_metadata;
    if (row.status !== 'processed' || payload.reviewed !== true)
      throw new HttpError(
        409,
        'Process the image and confirm its identity, quality and redistribution rights first.',
      );
    const metadata = payload.metadata as CampusPhoto;
    if (
      metadata?.sourceKind === 'author-upload' &&
      payload.authorshipConfirmed !== true &&
      !(
        row.authorship_confirmed &&
        samePhotoRights(metadata, row.public_metadata || {})
      )
    )
      throw new HttpError(
        400,
        'Confirm that you took this photograph and selected its reuse license.',
      );
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
        authorship_confirmed: metadata.sourceKind === 'author-upload',
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
    if (!photo.id.startsWith('owner:')) {
      if (photo.sourceKind === 'author-upload')
        throw new HttpError(
          400,
          'Author photographs require a private approved upload.',
        );
      continue;
    } // Published research catalogue is checked by hash during packaging.
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
