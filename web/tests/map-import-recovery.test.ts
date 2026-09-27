import { afterEach, expect, it, vi } from 'vitest';
import { mapImportAction } from '../server/map-imports';

const id = '11111111-1111-4111-8111-111111111111';
const job = { id, status: 'failed', phase: 'inspect', run_token: 'old-token' };
const payload = {
  importId: id,
  name: 'Road width.geojson.json',
  bytes: 40,
  sha256: 'a'.repeat(64),
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it('reopens a failed upload with a new token and reuses its reserved asset', async () => {
  vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only');
  const asset = { id: 'asset-id', path: `lasu/${id}/existing.json` };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json([job]))
    .mockResolvedValueOnce(
      Response.json([{ ...job, status: 'draft', phase: 'inspect' }]),
    )
    .mockResolvedValueOnce(Response.json(asset))
    .mockResolvedValueOnce(
      Response.json({
        url: `/object/upload/sign/campus-imports/${asset.path}?token=test-only`,
      }),
    );
  vi.stubGlobal('fetch', fetcher);
  const result = await mapImportAction('import-upload', payload);
  expect(result).toMatchObject({
    asset,
    job: { status: 'draft' },
    url: `https://test.supabase.co/storage/v1/object/upload/sign/campus-imports/${asset.path}?token=test-only`,
  });
  expect(String(fetcher.mock.calls[1][0])).toContain('status=eq.failed');
  const update = JSON.parse(fetcher.mock.calls[1][1].body);
  expect(update).toMatchObject({
    phase: 'inspect',
    summary: null,
    candidate_path: null,
  });
  expect(update.run_token).not.toBe(job.run_token);
});
it('does not reopen a failed import that another worker/session changed', async () => {
  vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only');
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json([job]))
    .mockResolvedValueOnce(Response.json([]));
  vi.stubGlobal('fetch', fetcher);
  await expect(mapImportAction('import-upload', payload)).rejects.toThrow(
    'changed in another session',
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('does not reset a failed job for an invalid file request', async () => {
  vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only');
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json([job]));
  vi.stubGlobal('fetch', fetcher);
  await expect(
    mapImportAction('import-upload', { ...payload, name: '../private.json' }),
  ).rejects.toThrow('supported map file');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
