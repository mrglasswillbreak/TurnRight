import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adminRequest,
  AdminRequestError,
  boundedSession,
} from '../src/admin-client';
import { loadPreparedWorkspace } from '../src/editor-loading';
import { EditorWorkspace } from '../src/editor-workspace';
import { mergeWorkspace } from '../src/editor-conflicts';
import type { MapEdit } from '../src/types';

const feature = (): MapEdit => ({
  id: 'library',
  kind: 'place',
  geometry: { type: 'Point', coordinates: [3.201, 6.46] },
  properties: { name: 'Library', faculty: 'Science' },
  updated_at: '2026-09-14T01:00:00Z',
});
const workspace = (server: MapEdit[] = [feature()]) =>
  new EditorWorkspace(
    server,
    async (batch) =>
      batch.edits.map(({ edit }) => ({
        ...edit,
        updated_at: '2026-09-14T02:00:00Z',
      })),
    async () => {},
  );
afterEach(() => vi.useRealTimers());

describe('operation-specific admin requests', () => {
  it('retries a lost save acknowledgement with the identical operation and payload', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('Network failed'))
      .mockResolvedValueOnce(new Response('[]'));
    const payload = { operationId: 'receipt-1', edits: [{ id: 'place' }] };
    await adminRequest('save-edits', payload, 'token', {
      fetcher,
      delay: async () => {},
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][1]?.body).toBe(fetcher.mock.calls[1][1]?.body);
  });
  it.each(['publish-release', 'rollback', 'prepare-release', 'check-sources'])(
    'does not replay an uncertain %s request',
    async (action) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockRejectedValue(new TypeError('Lost acknowledgement'));
      await expect(
        adminRequest(action, { id: 'release' }, undefined, { fetcher }),
      ).rejects.toMatchObject({ action, reason: 'network' });
      expect(fetcher).toHaveBeenCalledOnce();
    },
  );
  it.each([401, 403])(
    'preserves authentication status %s without retrying',
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('Denied', { status }));
      await expect(
        adminRequest('export', {}, undefined, { fetcher }),
      ).rejects.toMatchObject({ action: 'export', status, reason: 'auth' });
      expect(fetcher).toHaveBeenCalledOnce();
    },
  );
  it('bounds a hanging request and distinguishes it from a configuration failure', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_url, options) =>
        new Promise((_, reject) => {
          options!.signal!.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const result = adminRequest('export', {}, undefined, {
      fetcher,
      timeoutMs: 100,
      retries: 0,
    });
    const assertion = expect(result).rejects.toMatchObject({
      action: 'export',
      reason: 'timeout',
    });
    await vi.advanceTimersByTimeAsync(101);
    await assertion;
  });
  it('bounds session acquisition before the request starts', async () => {
    vi.useFakeTimers();
    const result = boundedSession('state', new Promise(() => {}), 100);
    const assertion = expect(result).rejects.toMatchObject({
      action: 'state',
      reason: 'timeout',
    });
    await vi.advanceTimersByTimeAsync(101);
    await assertion;
  });
  it('reports a timeout when the response body stalls after headers arrive', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      async (_url, options) =>
        ({
          status: 200,
          ok: true,
          json: () =>
            new Promise((_, reject) =>
              options!.signal!.addEventListener('abort', () =>
                reject(new DOMException('aborted', 'AbortError')),
              ),
            ),
        }) as Response,
    );
    const assertion = expect(
      adminRequest('export', {}, undefined, {
        fetcher,
        timeoutMs: 100,
        retries: 0,
      }),
    ).rejects.toMatchObject({ action: 'export', reason: 'timeout' });
    await vi.advanceTimersByTimeAsync(101);
    await assertion;
  });
  it('describes non-JSON responses without blaming setup', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('<html>Proxy failure</html>', { status: 502 }),
      );
    await expect(
      adminRequest('export', {}, undefined, { fetcher, retries: 0 }),
    ).rejects.toMatchObject({
      action: 'export',
      reason: 'response',
      status: 502,
    });
  });
});

describe('prepared workspace fallback', () => {
  it('still tries the server when the offline hint is wrong and storage is unavailable', async () => {
    const context = { prepared: false };
    await expect(
      loadPreparedWorkspace(
        async () => context,
        async () => {
          throw new Error('Storage unavailable');
        },
        true,
      ),
    ).resolves.toEqual({ context, offline: false });
  });
  it('opens prepared local work when online reports true but the server is unreachable', async () => {
    const cached = { prepared: true, syncedAt: '2026-09-14T00:00:00Z' };
    const result = await loadPreparedWorkspace(
      async () => {
        throw new AdminRequestError('sources', 'Offline', 0, 'network');
      },
      async () => cached,
      false,
    );
    expect(result).toEqual({ context: cached, offline: true });
  });
  it.each([401, 403])(
    'does not fall back after server authorization rejection %s',
    async (status) => {
      const cached = vi.fn(async () => ({ prepared: true }));
      await expect(
        loadPreparedWorkspace(
          async () => {
            throw new AdminRequestError('state', 'Denied', status, 'auth');
          },
          cached,
          false,
        ),
      ).rejects.toMatchObject({ status });
      expect(cached).not.toHaveBeenCalled();
    },
  );
  it('never opens an unprepared cache after a network failure', async () => {
    await expect(
      loadPreparedWorkspace(
        async () => {
          throw new AdminRequestError('state', 'Offline', 0, 'network');
        },
        async () => ({ prepared: false }),
        false,
      ),
    ).rejects.toThrow('Offline');
  });
});

describe('field history and recovery exports', () => {
  it('can retry recovery storage even after every edit was saved to the server', async () => {
    let unavailable = true;
    const w = new EditorWorkspace(
      [feature()],
      async () => [],
      async () => {
        if (unavailable) throw new Error('Storage unavailable');
      },
    );
    expect(await w.preserveRecovery()).toBe(false);
    expect(w.status).toBe('Recovery unavailable');
    unavailable = false;
    expect(await w.preserveRecovery()).toBe(true);
    await w.flush();
    expect(w.status).toBe('Saved');
    expect(w.error).toBe('');
  });
  it('does not consume the first undo snapshot for an equivalent field value', () => {
    const w = workspace();
    w.commit([feature()], null, 'field:name');
    w.commit(
      [
        {
          ...feature(),
          properties: { ...feature().properties, name: 'Edited' },
        },
      ],
      null,
      'field:name',
    );
    expect(w.past).toHaveLength(1);
    w.undo();
    expect(w.edits[0].properties.name).toBe('Library');
  });
  it('merges independent first corrections using the original source feature', () => {
    const w = workspace([]);
    w.setSourceBaseline(() => feature());
    w.commit([
      { ...feature(), properties: { ...feature().properties, name: 'Local' } },
    ]);
    const remote = [
      {
        ...feature(),
        properties: { ...feature().properties, faculty: 'Remote' },
      },
    ];
    expect(w.reviewConflicts(remote).conflicts).toEqual([]);
    expect(w.reconcile(remote, true)).toBe(true);
    expect(w.edits[0].properties).toMatchObject({
      name: 'Local',
      faculty: 'Remote',
    });
  });
  it('retains the original source and pending comparison across a reload and save conflict', async () => {
    const send = vi.fn(async () => {
      throw Object.assign(new Error('Conflict'), { status: 409 });
    });
    const w = new EditorWorkspace([], send, async () => {});
    w.setSourceBaseline(() => feature());
    w.commit([
      { ...feature(), properties: { ...feature().properties, name: 'Local' } },
    ]);
    await w.flush();
    const remote = [
      {
        ...feature(),
        properties: { ...feature().properties, faculty: 'Remote' },
      },
    ];
    const reopened = new EditorWorkspace(
      remote,
      send,
      async () => {},
      w.recoveryCopy(),
    );
    await reopened.flush();
    expect(reopened.status).toBe('Conflict');
    expect(reopened.reviewConflicts(remote).conflicts).toEqual([]);
    expect(reopened.reconcile(remote, true)).toBe(true);
    expect(reopened.edits[0].properties).toMatchObject({
      name: 'Local',
      faculty: 'Remote',
    });
  });
  it('undoes one field session across autosave while preserving each recovery value', async () => {
    const w = workspace();
    w.commit(
      [
        {
          ...feature(),
          properties: { ...feature().properties, name: 'Library W' },
        },
      ],
      null,
      'place:library:name',
    );
    await w.flush();
    w.commit(
      [
        {
          ...feature(),
          properties: { ...feature().properties, name: 'Library West' },
        },
      ],
      null,
      'place:library:name',
    );
    expect(w.recoveryCopy().edits[0].properties.name).toBe('Library West');
    expect(w.past).toHaveLength(1);
    w.endHistoryGroup();
    w.undo();
    expect(w.edits[0].properties.name).toBe('Library');
    w.redo();
    expect(w.edits[0].properties.name).toBe('Library West');
  });
  it('starts a separate undo group after blur or a different command', () => {
    const w = workspace();
    const renamed = {
      ...feature(),
      properties: { ...feature().properties, name: 'West' },
    };
    w.commit([renamed], null, 'name');
    w.endHistoryGroup();
    w.commit(
      [
        {
          ...renamed,
          properties: { ...renamed.properties, name: 'West library' },
        },
      ],
      null,
      'name',
    );
    expect(w.past).toHaveLength(2);
    w.undo();
    expect(w.edits[0].properties.name).toBe('West');
  });
  it('exports pending receipts, undo and unfinished geometry without sending or writing storage', async () => {
    const send = vi.fn(async (): Promise<MapEdit[]> => {
      throw new Error('Offline');
    });
    const persist = vi.fn(async () => {
      throw new Error('Quota exceeded');
    });
    const w = new EditorWorkspace([], send, persist);
    w.commit([feature()]);
    await w.flush();
    w.draft({
      id: 'drawing',
      kind: 'path',
      geometry: { type: 'LineString', coordinates: [[3.201, 6.46]] },
      properties: { name: 'Path' },
    });
    const calls = send.mock.calls.length;
    const backup = w.localBackup('campus-v1');
    expect(backup).toMatchObject({
      baselineVersion: 'campus-v1',
      schemaVersion: 1,
      workspace: {
        unfinished: { id: 'drawing' },
        pending: { operationId: expect.any(String) },
      },
    });
    expect(backup.workspace.past).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(calls);
    backup.workspace.edits[0].properties.name = 'Export modified';
    expect(w.edits[0].properties.name).toBe('Library');
  });
  it('retains undo when a refresh has no remote changes', () => {
    const w = workspace();
    w.commit([{ ...feature(), properties: { name: 'West' } }]);
    w.reconcile([feature()], true);
    expect(w.past).toHaveLength(1);
  });
});

describe('three-way field conflict review', () => {
  it('keeps a remote faculty update alongside a local name update', () => {
    const b = feature(),
      l = { ...b, properties: { ...b.properties, name: 'West library' } },
      r = { ...b, properties: { ...b.properties, faculty: 'Arts' } };
    const result = mergeWorkspace([b], [l], [r]);
    expect(result.unresolved).toEqual([]);
    expect(result.edits[0].properties).toEqual({
      name: 'West library',
      faculty: 'Arts',
    });
  });
  it('requires a choice for a field changed differently on both sides', () => {
    const b = feature(),
      l = { ...b, properties: { ...b.properties, name: 'Local' } },
      r = { ...b, properties: { ...b.properties, name: 'Remote' } };
    const review = mergeWorkspace([b], [l], [r]);
    expect(review.unresolved[0]).toMatchObject({
      field: 'name',
      base: 'Library',
      local: 'Local',
      server: 'Remote',
    });
    const result = mergeWorkspace([b], [l], [r], {
      [review.conflicts[0].key]: 'server',
    });
    expect(result.unresolved).toEqual([]);
    expect(result.edits[0].properties.name).toBe('Remote');
  });
  it('reviews geometry and connections as one atomic choice', () => {
    const b = {
      ...feature(),
      kind: 'entrance' as const,
      properties: {
        name: 'Door',
        placeId: 'library',
        connectTo: 'original-node',
      },
    };
    const l = {
      ...b,
      geometry: { type: 'Point' as const, coordinates: [3.202, 6.46] },
    };
    const r = {
      ...b,
      properties: { ...b.properties, connectTo: 'remote-node' },
    };
    const review = mergeWorkspace([b], [l], [r]);
    expect(review.unresolved).toHaveLength(1);
    expect(review.unresolved[0].field).toBe('Geometry and connections');
    const chosen = mergeWorkspace([b], [l], [r], {
      [review.conflicts[0].key]: 'server',
    }).edits[0];
    expect(chosen.geometry).toEqual(b.geometry);
    expect(chosen.properties.connectTo).toBe('remote-node');
  });
  it('requires a whole-feature choice when deletion conflicts with a remote edit', () => {
    const b = feature();
    expect(
      mergeWorkspace(
        [b],
        [{ ...b, deleted: true }],
        [{ ...b, properties: { name: 'Remote' } }],
      ).unresolved[0].field,
    ).toBe('Feature existence');
  });
  it('keeps the original conflict base across reload', () => {
    const b = feature(),
      w = workspace();
    w.commit([{ ...b, properties: { ...b.properties, name: 'Local' } }]);
    const remote = [
      {
        ...b,
        properties: { ...b.properties, name: 'Remote', faculty: 'Arts' },
      },
    ];
    expect(w.reconcile(remote, true)).toBe(false);
    const reopened = new EditorWorkspace(
      remote,
      async () => [],
      async () => {},
      w.recoveryCopy(),
    );
    const review = reopened.reviewConflicts(remote);
    expect(review.conflicts[0].base).toBe('Library');
    reopened.reconcile(remote, true, { [review.conflicts[0].key]: 'local' });
    expect(reopened.edits[0].properties).toEqual({
      name: 'Local',
      faculty: 'Arts',
    });
  });
});
