import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mapImportAction } from '../server/map-imports';

const id = '11111111-1111-4111-8111-111111111111';
const job = { id, status: 'failed', phase: 'inspect', run_token: 'old-token' };
const payload = {
  importId: id,
  name: 'Road width.geojson.json',
  bytes: 40,
  sha256: 'a'.repeat(64),
};
// Release workers supply their real campus through the environment. These
// isolated fixtures must declare their own campus instead of inheriting it.
beforeEach(() => vi.stubEnv('CAMPUS_ID', 'lasu'));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it('keeps expired import history readable but rejects retries before any write', async () => {
  vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only');
  const expired = {
    ...job,
    status: 'cancelled',
    artifacts_expired_at: '2026-10-10T00:00:00Z',
    summary: { errors: [] },
  };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json([expired]))
    .mockResolvedValueOnce(Response.json([]));
  vi.stubGlobal('fetch', fetcher);
  expect(await mapImportAction('import-get', { importId: id })).toMatchObject({
    job: expired,
  });
  fetcher.mockReset().mockImplementation(async () => Response.json([expired]));
  for (const action of [
    'import-run',
    'import-queue',
    'import-upload',
    'import-cancel',
  ]) {
    await expect(mapImportAction(action, { importId: id })).rejects.toThrow(
      'Start a new source check',
    );
  }
  expect(fetcher).toHaveBeenCalledTimes(4);
  expect(fetcher.mock.calls.every((call) => call[1].method === 'GET')).toBe(
    true,
  );
});
it.each(['lasu', 'campus-test'])(
  'dispatches manual review for %s without downloading a large candidate',
  async (campusId) => {
    vi.stubEnv('CAMPUS_ID', campusId);
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only');
    vi.stubEnv('GITHUB_REPOSITORY', 'test/repository');
    vi.stubEnv('GITHUB_WORKFLOW_TOKEN', 'test-only');
    const preview = {
      ...job,
      status: 'preview',
      candidate_path: `${campusId}/${id}/candidate.json`,
      summary: { errors: [] },
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json([preview]))
      .mockResolvedValueOnce(
        Response.json([{ ...preview, status: 'queued', phase: 'queue' }]),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetcher);
    expect(
      await mapImportAction('import-queue', { importId: id }),
    ).toMatchObject({ job: { status: 'queued', phase: 'queue' } });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(String(fetcher.mock.calls[2][0])).toContain(
      'map-import.yml/dispatches',
    );
    expect(JSON.parse(fetcher.mock.calls[2][1].body).inputs.campus_id).toBe(
      campusId,
    );
    expect(
      fetcher.mock.calls.some(
        (c) =>
          String(c[0]).includes('/storage/') || String(c[0]).includes('/rpc/'),
      ),
    ).toBe(false);
  },
);
it('rejects another campus candidate before dispatch or writes', async () => {
  vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only');
  vi.stubEnv('CAMPUS_ID', 'campus-test');
  const fetcher = vi.fn().mockResolvedValueOnce(
    Response.json([
      {
        ...job,
        status: 'preview',
        candidate_path: `lasu/${id}/candidate.json`,
        summary: { errors: [] },
      },
    ]),
  );
  vi.stubGlobal('fetch', fetcher);
  await expect(
    mapImportAction('import-queue', { importId: id }),
  ).rejects.toThrow('Prepare a complete import preview first');
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][1].method).toBe('GET');
});
it('omits large preview summaries from the import history', async () => {
  vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only');
  const fetcher = vi.fn().mockImplementation(async () => Response.json([]));
  vi.stubGlobal('fetch', fetcher);
  await mapImportAction('import-list', {});
  const url = new URL(
    String(
      fetcher.mock.calls.find((c) =>
        String(c[0]).includes('campus_imports'),
      )![0],
    ),
  );
  expect(url.searchParams.get('select')?.split(',')).not.toContain('summary');
  expect(url.searchParams.get('select')).toContain('status');
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
