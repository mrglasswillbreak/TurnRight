import fs from 'node:fs/promises';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { downloadProposalInputs } from '../../scripts/model-proposal-input.mts';

beforeEach(() => {
  vi.stubEnv('MODEL_RELEASE_ASSET_ID', '123');
  vi.stubEnv('MODEL_ARCHIVE_SHA256', 'a'.repeat(64));
  vi.stubEnv('GITHUB_REPOSITORY', 'example/repository');
  vi.stubEnv('GH_TOKEN', 'private-workflow-token');
  vi.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
  vi.spyOn(fs, 'open').mockRejectedValue(
    Error('Failed downloads must not create an archive'),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('reports a denied draft download with only its HTTP status and safe request ID', async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response('private response body and signed URL', {
      status: 403,
      headers: {
        'x-github-request-id': 'AB12:CD34:EF56',
        location: 'https://private.example/?signature=secret',
      },
    }),
  );
  vi.stubGlobal('fetch', fetch);
  await expect(downloadProposalInputs()).rejects.toEqual(
    Error(
      'Pinned release asset cannot be downloaded (HTTP 403; GitHub request ID AB12:CD34:EF56).',
    ),
  );
  expect(fetch).toHaveBeenCalledWith(
    'https://api.github.com/repos/example/repository/releases/assets/123',
    expect.objectContaining({
      headers: expect.objectContaining({ Accept: 'application/octet-stream' }),
    }),
  );
  expect(fs.open).not.toHaveBeenCalled();
});

it('does not expose an unsafe request header when the response has no body', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: { 'x-github-request-id': 'https://private.example/secret' },
      }),
    ),
  );
  await expect(downloadProposalInputs()).rejects.toEqual(
    Error(
      'Pinned release asset cannot be downloaded (HTTP 200; GitHub request ID unavailable).',
    ),
  );
  expect(fs.open).not.toHaveBeenCalled();
});
