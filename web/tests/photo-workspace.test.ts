import { afterEach, describe, expect, it, vi } from 'vitest';
import { photoEdits } from '../src/photo-workspace';
import { photoDetailErrors, samePhotoRights } from '../src/photo-details';
import { publicPhoto, validPhoto } from '../src/arrival';
import { publicCampus } from '../../scripts/public-campus.mjs';
import { mediaAction } from '../server/building-media';
import { campusFixture } from './fixture';
import type { CampusPhoto } from '../src/types';

const photo = (id = 'p'): CampusPhoto => ({
  id,
  buildingId: 'one',
  caption: 'Front elevation',
  alt: 'The front of the library',
  author: 'Photographer',
  sourceUrl: 'https://example.org/photo',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  attribution: 'Photographer · CC BY 4.0',
  checkedAt: '2026-09-23',
  modifications: 'Converted to WebP',
  width: 800,
  height: 600,
  bytes: 100,
  sha256: 'a'.repeat(64),
  url: `/packages/photos/${'a'.repeat(64)}.webp`,
});
function campus() {
  const data = campusFixture();
  data.map.features = ['one', 'two'].map((id) => ({
    ...data.boundary,
    properties: {
      id,
      kind: 'building',
      name: id,
      visual: { wallColor: '#abcdef' },
    },
  }));
  data.photos = [photo('a'), photo('b'), photo('c')];
  return data;
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('photo management', () => {
  it('accepts an author-provided photo without inventing a URL, but still requires external source evidence', () => {
    const own = {
      ...photo(),
      sourceKind: 'author-upload' as const,
      sourceUrl: undefined,
    };
    expect(validPhoto(own)).toBe(true);
    expect(photoDetailErrors(own)).toEqual({});
    expect(validPhoto({ ...own, sourceKind: undefined })).toBe(false);
    expect(
      photoDetailErrors({ ...own, sourceKind: 'external' }).sourceUrl,
    ).toBeTruthy();
    expect(samePhotoRights(photo(), { ...photo(), caption: 'Changed' })).toBe(
      true,
    );
    expect(
      samePhotoRights(photo(), { ...photo(), author: 'Someone else' }),
    ).toBe(false);
    const dirty = {
      ...own,
      reviewer: 'secret',
      authorshipConfirmed: true,
      draft_metadata: { private: true },
    };
    expect(publicPhoto(dirty)).not.toHaveProperty('authorshipConfirmed');
    expect(JSON.stringify(publicCampus({ photos: [dirty] }))).not.toMatch(
      /secret|draft_metadata|authorshipConfirmed/,
    );
    expect(publicCampus({ photos: [dirty] }).photos[0].sourceKind).toBe(
      'author-upload',
    );
  });
  it('keeps edited photos in place and reorders covers without losing building appearance', () => {
    const data = campus();
    const edited = photoEdits(data, [], {
      photos: [{ ...photo('b'), caption: 'New caption' }],
      removeIds: [],
    });
    expect(
      (edited[0].properties.photos as CampusPhoto[]).map((p) => p.id),
    ).toEqual(['a', 'b', 'c']);
    expect(edited[0].properties.visual).toEqual({ wallColor: '#abcdef' });
    const ordered = photoEdits(data, [], {
      photos: [data.photos![2], data.photos![0], data.photos![1]],
      removeIds: [],
    });
    expect(
      (ordered[0].properties.photos as CampusPhoto[]).map((p) => p.id),
    ).toEqual(['c', 'a', 'b']);
  });
  it('moves one photograph with both galleries in the same batch and removes invalid old guide references', () => {
    const data = campus();
    data.places[0].buildingId = 'one';
    data.places[0].arrival = { photoIds: ['b'] };
    const changes = photoEdits(data, [], {
      photos: [{ ...photo('b'), buildingId: 'two' }],
      removeIds: [],
    });
    expect(changes).toHaveLength(3);
    expect(
      (
        changes.find((e) => e.id === 'one')!.properties.photos as CampusPhoto[]
      ).map((p) => p.id),
    ).toEqual(['a', 'c']);
    expect(
      (
        changes.find((e) => e.id === 'two')!.properties.photos as CampusPhoto[]
      ).map((p) => p.id),
    ).toEqual(['b']);
    expect(changes.find((e) => e.id === 'library')!.properties.arrival).toEqual(
      { photoIds: [] },
    );
  });
  it('keeps an immutable owner revision in its old position and updates shared guide references', () => {
    const data = campus();
    data.places[0].buildingId = 'one';
    data.places[0].arrival = { photoIds: ['b'] };
    const changes = photoEdits(data, [], {
      photos: [
        { ...photo('owner:new-revision'), caption: 'Updated entrance view' },
      ],
      removeIds: ['b'],
      replaces: { b: 'owner:new-revision' },
    });
    expect(
      (
        changes.find((e) => e.id === 'one')!.properties.photos as CampusPhoto[]
      ).map((p) => p.id),
    ).toEqual(['a', 'owner:new-revision', 'c']);
    expect(changes.find((e) => e.id === 'library')!.properties.arrival).toEqual(
      { photoIds: ['owner:new-revision'] },
    );
  });
  it('paginates private uploads without exposing original paths and preserves review targets', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test');
    const rows = Array.from({ length: 21 }, (_, i) => ({
      id: String(i),
      owner: 'owner',
      status: 'pending',
      original_path: 'private-original',
      draft_metadata: { buildingId: 'one', caption: `View ${i}` },
      draft_revision: 2,
    }));
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(rows)));
    vi.stubGlobal('fetch', fetcher);
    const result = (await mediaAction('owner', 'media-library', {
      offset: 20,
      query: 'View',
    })) as { items: { draft: unknown }[]; nextOffset: number };
    expect(result.items).toHaveLength(20);
    expect(result.nextOffset).toBe(40);
    expect(result.items[0].draft).toEqual({
      buildingId: 'one',
      caption: 'View 0',
    });
    expect(JSON.stringify(result)).not.toContain('private-original');
    expect(String(fetcher.mock.calls[0][0])).toContain('owner=eq.owner');
    expect(String(fetcher.mock.calls[0][0])).toContain('limit=21&offset=20');
  });
  it('guards private draft revisions and rejects stale saves', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test');
    const id = '11111111-1111-4111-8111-111111111111';
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([{ id, status: 'processed', draft_revision: 4 }]),
        ),
      )
      .mockResolvedValueOnce(new Response('[]'));
    vi.stubGlobal('fetch', fetcher);
    await expect(
      mediaAction('owner', 'media-draft', {
        id,
        revision: 3,
        metadata: { caption: 'Mine' },
      }),
    ).rejects.toThrow('another session');
    expect(String(fetcher.mock.calls[1][0])).toContain(
      'owner=eq.owner&draft_revision=eq.3&status=neq.approved',
    );
  });
  it('retains the original photo association across private revision saves', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test');
    const id = '11111111-1111-4111-8111-111111111111';
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id,
              status: 'processed',
              draft_revision: 1,
              draft_metadata: { replacesPhotoId: 'owner:original' },
            },
          ]),
        ),
      )
      .mockResolvedValueOnce(new Response('[{}]'));
    vi.stubGlobal('fetch', fetcher);
    await mediaAction('owner', 'media-draft', {
      id,
      revision: 1,
      metadata: { caption: 'Revised', replacesPhotoId: 'forged' },
    });
    expect(JSON.parse(fetcher.mock.calls[1][1].body).draft_metadata).toEqual({
      caption: 'Revised',
      replacesPhotoId: 'owner:original',
    });
  });
  it('requires authorship confirmation before approving an author upload', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test');
    const id = '11111111-1111-4111-8111-111111111111';
    const metadata = {
      ...photo(`owner:${id}`),
      sourceKind: 'author-upload',
      sourceUrl: undefined,
    };
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify([
            { id, status: 'processed', public_metadata: metadata },
          ]),
        ),
      );
    vi.stubGlobal('fetch', fetcher);
    await expect(
      mediaAction('owner', 'media-approve', { id, metadata, reviewed: true }),
    ).rejects.toThrow('Confirm that you took');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('renews a private preview without reading or processing original bytes', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test');
    const id = '11111111-1111-4111-8111-111111111111';
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id,
              status: 'processed',
              derivative_path: 'owner/derivative.webp',
            },
          ]),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ signedURL: '/signed/preview' })),
      );
    vi.stubGlobal('fetch', fetcher);
    expect(await mediaAction('owner', 'media-preview', { id })).toMatchObject({
      previewUrl: 'https://test.supabase.co/storage/v1/signed/preview',
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1][0])).toContain('/object/sign/');
  });
  it('lists metadata without waiting for storage signing', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test');
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify([
            { id: 'one', derivative_path: 'private', status: 'processed' },
          ]),
        ),
      );
    vi.stubGlobal('fetch', fetcher);
    const result = await mediaAction('owner', 'media-library', {
      previews: false,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toMatch(/previewUrl|private/);
  });
  it('reconciles stable upload IDs without overwriting drafts or another owner', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test');
    const id = '11111111-1111-4111-8111-111111111111';
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 409 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id,
              status: 'processed',
              original_filename: 'front.jpg',
              original_bytes: 100,
              original_mime: 'image/jpeg',
              public_metadata: { caption: 'Preserved' },
            },
          ]),
        ),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 409 }))
      .mockResolvedValueOnce(new Response('[]'));
    vi.stubGlobal('fetch', fetcher);
    const payload = {
      uploadId: id,
      filename: 'front.jpg',
      bytes: 100,
      mime: 'image/jpeg',
    };
    expect(await mediaAction('owner', 'media-begin', payload)).toMatchObject({
      id,
      status: 'processed',
      metadata: { caption: 'Preserved' },
    });
    await expect(mediaAction('other', 'media-begin', payload)).rejects.toThrow(
      'different file',
    );
    expect(String(fetcher.mock.calls[3][0])).toContain('owner=eq.other');
  });
});
