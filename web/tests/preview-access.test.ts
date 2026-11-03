import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  cleanupTemporaryAccess,
  maskTemporaryAccessSecret,
  temporaryAccessNote,
} from '../../scripts/preview-access.mjs';
import { withDeploymentAccess } from '../../scripts/vercel-api.mjs';
const run = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const local = { TURNRIGHT_LOCAL_RUN_ID: run, VERCEL_PROJECT_ID: 'prj_test' };
beforeEach(() => {
  vi.stubEnv('GITHUB_ACTIONS', '');
  vi.stubEnv('GITHUB_RUN_ID', '');
  vi.stubEnv('CLEANUP_RUN_ID', '');
  vi.stubEnv('TURNRIGHT_LOCAL_RUN_ID', run);
  vi.stubEnv('VERCEL_TOKEN', 'test-token');
  vi.stubEnv('VERCEL_PROJECT_ID', 'prj_test');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('uses a recorded local UUID and preserves exact Actions cleanup identities', () => {
  expect(temporaryAccessNote(local)).toBe(
    'Temporary campus release check local:' + run,
  );
  const actions = {
    GITHUB_ACTIONS: 'true',
    GITHUB_RUN_ID: '123',
    CLEANUP_RUN_ID: '456',
  };
  expect(temporaryAccessNote(actions)).toBe(
    'Temporary campus release check 123',
  );
  expect(temporaryAccessNote(actions, true)).toBe(
    'Temporary campus release check 456',
  );
});
it.each([
  {},
  { GITHUB_RUN_ID: '123' },
  { TURNRIGHT_LOCAL_RUN_ID: 'local' },
  { TURNRIGHT_LOCAL_RUN_ID: run, CLEANUP_RUN_ID: '123' },
  { GITHUB_ACTIONS: 'true', GITHUB_RUN_ID: 'local' },
  { GITHUB_ACTIONS: 'true', GITHUB_RUN_ID: '1', CLEANUP_RUN_ID: '../other' },
])(
  'rejects missing or ambiguous identities before cleanup requests: %j',
  async (environment) => {
    const api = vi.fn();
    await expect(cleanupTemporaryAccess(api, environment)).rejects.toThrow();
    expect(api).not.toHaveBeenCalled();
  },
);
it('never emits a masking command or secret in ordinary local logs', () => {
  const log = vi.fn();
  for (const environment of [local, { ...local, GITHUB_ACTIONS: 'false' }])
    maskTemporaryAccessSecret('temporary-private-value', environment, log);
  expect(log).not.toHaveBeenCalled();
  maskTemporaryAccessSecret(
    'actions-only-value',
    { GITHUB_ACTIONS: 'true' },
    log,
  );
  expect(log).toHaveBeenCalledExactlyOnceWith('::add-mask::actions-only-value');
});
it('revokes only the interrupted local execution, retaining other local and Actions credentials', async () => {
  const note = temporaryAccessNote(local);
  const api = vi.fn(async (_endpoint: string, options?: { body: string }) => {
    if (options) return null;
    return {
      protectionBypass: {
        'mine-one': { note },
        'mine-two': { note },
        'other-local': {
          note: 'Temporary campus release check local:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        },
        'old-generic-local': { note: 'Temporary campus release check local' },
        'actions-secret': { note: 'Temporary campus release check 123' },
        'unrelated-secret': { note: 'Other project verification' },
      },
    };
  });
  const log = vi.fn();
  await expect(cleanupTemporaryAccess(api, local, log)).resolves.toBe(2);
  expect(
    api.mock.calls.slice(1).map(([endpoint, options]) => ({
      endpoint,
      body: JSON.parse(options!.body),
    })),
  ).toEqual([
    {
      endpoint: '/v1/projects/prj_test/protection-bypass',
      body: { revoke: { secret: 'mine-one', regenerate: false } },
    },
    {
      endpoint: '/v1/projects/prj_test/protection-bypass',
      body: { revoke: { secret: 'mine-two', regenerate: false } },
    },
  ]);
  expect(log).toHaveBeenCalledExactlyOnceWith(
    'Preview credential cleanup complete (2 remaining credentials revoked)',
  );
});
it('local historical verification creates identifiable access and revokes it after a failed asset read without logging secrets', async () => {
  const updates: {
    generate?: { secret: string; note: string };
    revoke?: { secret: string; regenerate: boolean };
  }[] = [];
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL | string, init: RequestInit = {}) => {
      const url = new URL(input);
      if (url.pathname === '/v13/deployments/dpl_history')
        return Response.json({
          projectId: 'prj_test',
          url: 'history.vercel.app',
        });
      if (url.pathname === '/v1/projects/prj_test/protection-bypass') {
        updates.push(JSON.parse(String(init.body)));
        return Response.json({});
      }
      if (url.origin === 'https://history.vercel.app') {
        expect(init.redirect).toBe('manual');
        expect(init.headers).toEqual({
          'x-vercel-protection-bypass': updates[0].generate!.secret,
        });
        return new Response('ready');
      }
      throw Error('Unexpected request');
    }),
  );
  await expect(
    withDeploymentAccess(
      'https://history.vercel.app',
      async () => {
        throw Error('immutable asset hash mismatch');
      },
      'dpl_history',
    ),
  ).rejects.toThrow('immutable asset hash mismatch');
  expect(updates).toHaveLength(2);
  expect(updates[0].generate!.note).toBe(temporaryAccessNote(local));
  expect(updates[1]).toEqual({
    revoke: { secret: updates[0].generate!.secret, regenerate: false },
  });
  expect(log).not.toHaveBeenCalled();
});
it('cleanup failure is reported instead of claiming credential removal', async () => {
  const api = vi.fn(async (_endpoint: string, options?: unknown) => {
    if (options) throw Error('cleanup request failed');
    return {
      protectionBypass: { secret: { note: temporaryAccessNote(local) } },
    };
  });
  const log = vi.fn();
  await expect(cleanupTemporaryAccess(api, local, log)).rejects.toThrow(
    'cleanup request failed',
  );
  expect(log).not.toHaveBeenCalled();
});
