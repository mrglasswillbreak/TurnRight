import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { publishDeployment } from '../../scripts/vercel-api.mjs';
import {
  releaseSourceFields,
  assertDeploymentSource,
} from '../../scripts/release-source-revision.mjs';
const revision = 'a'.repeat(40);
beforeEach(() => {
  vi.stubEnv('VERCEL_TOKEN', 'test-token');
  vi.stubEnv('VERCEL_PROJECT_ID', 'prj_test');
  // Ambient provider values must never replace the frozen preview's source.
  vi.stubEnv('GITHUB_SHA', 'b'.repeat(40));
  vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'c'.repeat(40));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function fixture({
  source = revision as unknown,
  recovered = undefined as Record<string, unknown> | undefined,
  readyRevision = revision as unknown,
} = {}) {
  const writes: Record<string, unknown>[] = [];
  let saved = false;
  const onCreated = vi.fn(async () => {
    saved = true;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL, init: RequestInit = {}) => {
      const url = new URL(input);
      if (init.method === 'POST') {
        expect(url.pathname).toBe('/v13/deployments');
        writes.push(JSON.parse(String(init.body)));
        return Response.json({ id: 'dpl_production' });
      }
      if (url.pathname === '/v13/deployments/dpl_preview')
        return Response.json({
          id: 'dpl_preview',
          target: 'preview',
          readyState: 'READY',
          createdAt: 100,
          meta: { turnrightSourceRevision: source },
        });
      if (url.pathname === '/v9/projects/prj_test')
        return Response.json({
          id: 'prj_test',
          name: 'turnright',
          targets: {
            production: { id: saved ? 'dpl_production' : 'dpl_previous' },
          },
        });
      if (url.pathname === '/v6/deployments')
        return Response.json({
          deployments: recovered
            ? [
                {
                  uid: 'dpl_production',
                  meta: {
                    turnrightPromotion: 'release-1',
                    turnrightPreview: 'dpl_preview',
                    ...recovered,
                  },
                },
              ]
            : [],
          pagination: { next: null },
        });
      if (url.pathname === '/v13/deployments/dpl_production') {
        expect(saved).toBe(true);
        return Response.json({
          id: 'dpl_production',
          target: 'production',
          readyState: 'READY',
          aliasAssigned: true,
          url: 'production.vercel.app',
          meta: { turnrightSourceRevision: readyRevision },
        });
      }
      throw Error('Unexpected request');
    }),
  );
  return {
    writes,
    onCreated,
    run: () =>
      publishDeployment('dpl_preview', {
        releaseId: 'release-1',
        operation: 'publish',
        onCreated,
      }),
  };
}
it('uses only the exact frozen source revision in production runtime/build env and metadata', async () => {
  const api = fixture();
  await expect(api.run()).resolves.toMatchObject({ id: 'dpl_production' });
  expect(api.writes).toEqual([
    {
      deploymentId: 'dpl_preview',
      name: 'turnright',
      project: 'prj_test',
      target: 'production',
      env: { TURNRIGHT_RELEASE_SOURCE_SHA: revision },
      build: { env: { TURNRIGHT_RELEASE_SOURCE_SHA: revision } },
      meta: {
        action: 'promote',
        turnrightPromotion: 'release-1',
        turnrightPreview: 'dpl_preview',
        turnrightSourceRevision: revision,
      },
    },
  ]);
  expect(api.onCreated).toHaveBeenCalledExactlyOnceWith('dpl_production');
});
it('recovers a matching production source without repeating creation', async () => {
  const api = fixture({ recovered: { turnrightSourceRevision: revision } });
  await expect(api.run()).resolves.toMatchObject({ id: 'dpl_production' });
  expect(api.writes).toEqual([]);
});
it.each([{}, { turnrightSourceRevision: 'd'.repeat(40) }])(
  'rejects a recovered promotion whose source receipt is missing or differs: %j',
  async (recovered) => {
    const api = fixture({ recovered });
    await expect(api.run()).rejects.toThrow('source revision differs');
    expect(api.writes).toEqual([]);
    expect(api.onCreated).not.toHaveBeenCalled();
  },
);
it.each(['main', 123, null])(
  'rejects malformed frozen source metadata before any production mutation: %j',
  async (source) => {
    const api = fixture({ source });
    await expect(api.run()).rejects.toThrow('exact Git commit');
    expect(api.writes).toEqual([]);
    expect(api.onCreated).not.toHaveBeenCalled();
  },
);
it('retains the created ID but refuses success when readiness returns different source metadata', async () => {
  const api = fixture({ readyRevision: 'd'.repeat(40) });
  await expect(api.run()).rejects.toThrow('source revision differs');
  expect(api.onCreated).toHaveBeenCalledExactlyOnceWith('dpl_production');
});
it('keeps historical deployments compatible while refusing malformed new source receipts', () => {
  expect(() => assertDeploymentSource({ meta: {} }, undefined)).not.toThrow();
  expect(() => releaseSourceFields('branch-name')).toThrow('exact Git commit');
  expect(releaseSourceFields(revision)).toEqual({
    meta: { turnrightSourceRevision: revision },
    env: { TURNRIGHT_RELEASE_SOURCE_SHA: revision },
    build: { env: { TURNRIGHT_RELEASE_SOURCE_SHA: revision } },
  });
});
