import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error Node-only deployment module.
import { publishDeployment } from '../../scripts/vercel-api.mjs';

beforeEach(() => {
  vi.stubEnv('VERCEL_TOKEN', 'test-token');
  vi.stubEnv('VERCEL_PROJECT_ID', 'prj_test');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

function vercel({
  sourceTarget = 'preview',
  candidates = [] as Record<string, unknown>[],
  current = 'dpl_previous',
  buildState = 'READY',
} = {}) {
  const writes: { pathname: string; body: Record<string, unknown> }[] = [];
  const reads: string[] = [];
  let receiptSaved = false;
  const onCreated = vi.fn(async () => {
    receiptSaved = true;
  });
  const fetch = vi.fn(async (input: URL, init: RequestInit = {}) => {
    const url = new URL(input);
    const route = url.pathname;
    if (init.method === 'POST') {
      expect(init.headers).toMatchObject({
        'Content-Type': 'application/json',
      });
      const body = JSON.parse(String(init.body));
      writes.push({ pathname: route, body });
      if (route === '/v13/deployments')
        return Response.json({ id: 'dpl_production' });
      if (
        route === '/v10/projects/prj_test/promote/dpl_source' ||
        route === '/v1/projects/prj_test/rollback/dpl_source'
      ) {
        current = 'dpl_source';
        return new Response(null, { status: 201 });
      }
      throw new Error(`Unexpected mutation: ${route}`);
    }
    reads.push(route);
    if (route === '/v9/projects/prj_test')
      return Response.json({
        id: 'prj_test',
        name: 'turnright',
        targets: { production: { id: current } },
      });
    if (route === '/v6/deployments') {
      expect(url.searchParams.get('projectId')).toBe('prj_test');
      expect(url.searchParams.get('target')).toBe('production');
      return Response.json({
        deployments: candidates,
        pagination: { next: null },
      });
    }
    if (route === '/v13/deployments/dpl_source')
      return Response.json({
        id: 'dpl_source',
        target: sourceTarget,
        readyState: 'READY',
        aliasAssigned: 123,
        createdAt: 100,
      });
    if (route === '/v13/deployments/dpl_production') {
      expect(receiptSaved).toBe(true);
      current = 'dpl_production';
      return Response.json({
        id: 'dpl_production',
        target: 'production',
        readyState: buildState,
        aliasAssigned: 123,
        url: 'production.vercel.app',
      });
    }
    throw new Error(`Unexpected read: ${route}`);
  });
  vi.stubGlobal('fetch', fetch);
  return { writes, reads, onCreated };
}

const options = { releaseId: 'release-1', operation: 'publish' };
describe('reviewed preview publication', () => {
  it('rebuilds the exact preview for production and saves the new ID before waiting', async () => {
    const api = vercel();
    const result = await publishDeployment('dpl_source', {
      ...options,
      onCreated: api.onCreated,
    });
    expect(result.id).toBe('dpl_production');
    expect(api.onCreated).toHaveBeenCalledWith('dpl_production');
    expect(api.writes).toEqual([
      {
        pathname: '/v13/deployments',
        body: {
          deploymentId: 'dpl_source',
          name: 'turnright',
          project: 'prj_test',
          target: 'production',
          meta: {
            action: 'promote',
            turnrightPromotion: 'release-1',
            turnrightPreview: 'dpl_source',
          },
        },
      },
    ]);
    expect(api.reads.at(-1)).toBe('/v9/projects/prj_test');
  });

  it('recovers a production build after a lost creation acknowledgement without creating another', async () => {
    const api = vercel({
      candidates: [
        {
          uid: 'dpl_production',
          meta: {
            turnrightPromotion: 'release-1',
            turnrightPreview: 'dpl_source',
          },
        },
      ],
    });
    expect(
      (
        await publishDeployment('dpl_source', {
          ...options,
          onCreated: api.onCreated,
        })
      ).id,
    ).toBe('dpl_production');
    expect(api.writes).toHaveLength(0);
    expect(api.onCreated).toHaveBeenCalledWith('dpl_production');
  });

  it('stops when the creation status is ambiguous', async () => {
    const api = vercel({
      candidates: ['a', 'b'].map((uid) => ({
        uid,
        meta: {
          turnrightPromotion: 'release-1',
          turnrightPreview: 'dpl_source',
        },
      })),
    });
    await expect(
      publishDeployment('dpl_source', { ...options, onCreated: api.onCreated }),
    ).rejects.toThrow('Multiple production builds');
    expect(api.writes).toHaveLength(0);
  });

  it('does not report success if the production rebuild fails', async () => {
    const api = vercel({ buildState: 'ERROR' });
    await expect(
      publishDeployment('dpl_source', { ...options, onCreated: api.onCreated }),
    ).rejects.toThrow('ERROR');
    expect(api.onCreated).toHaveBeenCalledWith('dpl_production');
  });

  it('sends the required JSON body when promoting a production deployment', async () => {
    const api = vercel({ sourceTarget: 'production' });
    await publishDeployment('dpl_source', {
      ...options,
      onCreated: api.onCreated,
    });
    expect(api.writes).toEqual([
      { pathname: '/v10/projects/prj_test/promote/dpl_source', body: {} },
    ]);
    expect(api.onCreated).not.toHaveBeenCalled();
  });

  it('does not repeat a promotion when the project already serves that deployment', async () => {
    const api = vercel({ sourceTarget: 'production', current: 'dpl_source' });
    await publishDeployment('dpl_source', {
      ...options,
      onCreated: api.onCreated,
    });
    expect(api.writes).toHaveLength(0);
  });

  it('uses the rollback endpoint for a previous production release', async () => {
    const api = vercel({ sourceTarget: 'production' });
    await publishDeployment('dpl_source', {
      ...options,
      operation: 'rollback',
      onCreated: api.onCreated,
    });
    expect(api.writes).toEqual([
      { pathname: '/v1/projects/prj_test/rollback/dpl_source', body: {} },
    ]);
  });

  it('refuses to rebuild a preview as a rollback', async () => {
    const api = vercel();
    await expect(
      publishDeployment('dpl_source', {
        ...options,
        operation: 'rollback',
        onCreated: api.onCreated,
      }),
    ).rejects.toThrow('previously published production');
    expect(api.writes).toHaveLength(0);
  });

  it('checks current project assignment instead of trusting an old alias timestamp', async () => {
    vi.useFakeTimers();
    let assignmentReads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL, init: RequestInit = {}) => {
        if (new URL(input).pathname === '/v9/projects/prj_test') {
          assignmentReads++;
          return Response.json({
            targets: {
              production: { id: assignmentReads > 2 ? 'dpl_source' : 'old' },
            },
          });
        }
        if (init.method === 'POST') return new Response(null, { status: 201 });
        return Response.json({
          id: 'dpl_source',
          target: 'production',
          readyState: 'READY',
          aliasAssigned: 123,
        });
      }),
    );
    const pending = publishDeployment('dpl_source', {
      ...options,
      onCreated: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(5000);
    await expect(pending).resolves.toMatchObject({ id: 'dpl_source' });
    expect(assignmentReads).toBe(3);
  });
});
