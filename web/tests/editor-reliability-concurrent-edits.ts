import { describe, expect, it, vi } from 'vitest';
import { adminRequest, sessionAccessToken } from '../src/admin-client';
import { EditorWorkspace } from '../src/editor-workspace';
import { mergeWorkspace } from '../src/editor-conflicts';
import type { MapEdit } from '../src/types';
import type { EditorReliabilityFixture } from './editor-reliability.test';
export function registerConcurrentEdits(
  fixture: () => EditorReliabilityFixture,
): void {
  describe('field history and recovery exports', () => {
    it('can retry recovery storage even after every edit was saved to the server', async () => {
      let unavailable = true;
      const w = new EditorWorkspace(
        [fixture().feature()],
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
      const w = fixture().workspace();
      w.commit([fixture().feature()], null, 'field:name');
      w.commit(
        [
          {
            ...fixture().feature(),
            properties: { ...fixture().feature().properties, name: 'Edited' },
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
      const w = fixture().workspace([]);
      w.setSourceBaseline(() => fixture().feature());
      w.commit([
        {
          ...fixture().feature(),
          properties: { ...fixture().feature().properties, name: 'Local' },
        },
      ]);
      const remote = [
        {
          ...fixture().feature(),
          properties: { ...fixture().feature().properties, faculty: 'Remote' },
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
      w.setSourceBaseline(() => fixture().feature());
      w.commit([
        {
          ...fixture().feature(),
          properties: { ...fixture().feature().properties, name: 'Local' },
        },
      ]);
      await w.flush();
      const remote = [
        {
          ...fixture().feature(),
          properties: { ...fixture().feature().properties, faculty: 'Remote' },
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
      const w = fixture().workspace();
      w.commit(
        [
          {
            ...fixture().feature(),
            properties: {
              ...fixture().feature().properties,
              name: 'Library W',
            },
          },
        ],
        null,
        'place:library:name',
      );
      await w.flush();
      w.commit(
        [
          {
            ...fixture().feature(),
            properties: {
              ...fixture().feature().properties,
              name: 'Library West',
            },
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
      const w = fixture().workspace();
      const renamed = {
        ...fixture().feature(),
        properties: { ...fixture().feature().properties, name: 'West' },
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
      w.commit([fixture().feature()]);
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
      const w = fixture().workspace();
      w.commit([{ ...fixture().feature(), properties: { name: 'West' } }]);
      w.reconcile([fixture().feature()], true);
      expect(w.past).toHaveLength(1);
    });
  });
  describe('three-way field conflict review', () => {
    it('keeps a remote faculty update alongside a local name update', () => {
      const b = fixture().feature(),
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
      const b = fixture().feature(),
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
        ...fixture().feature(),
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
      const b = fixture().feature();
      expect(
        mergeWorkspace(
          [b],
          [{ ...b, deleted: true }],
          [{ ...b, properties: { name: 'Remote' } }],
        ).unresolved[0].field,
      ).toBe('Feature existence');
    });
    it('keeps the original conflict base across reload', () => {
      const b = fixture().feature(),
        w = fixture().workspace();
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
  describe('temporary startup and session failures', () => {
    it.each([
      'workspace-capabilities',
      'campus-list',
      'process-status',
      'gis-datasets',
      'import-list',
    ])(
      'recovers a transient %s read without changing campus or credentials',
      async (action) => {
        const fetcher = vi
          .fn<typeof fetch>()
          .mockResolvedValueOnce(
            new Response('{"error":"Unavailable"}', { status: 503 }),
          )
          .mockResolvedValueOnce(new Response('{}'));
        await adminRequest(
          action,
          {},
          'same-session',
          { fetcher, delay: async () => {} },
          'unilag',
        );
        expect(fetcher).toHaveBeenCalledTimes(2);
        expect(fetcher.mock.calls[0][1]?.body).toBe(
          fetcher.mock.calls[1][1]?.body,
        );
        expect(fetcher.mock.calls[1][1]?.headers).toMatchObject({
          Authorization: 'Bearer same-session',
        });
      },
    );
    it.each([0, 500, 503])(
      'keeps refresh failure %s distinct from expiry',
      (status) => {
        try {
          sessionAccessToken('state', {
            data: { session: null },
            error: { status },
          });
          throw Error('expected failure');
        } catch (e) {
          expect(e).toMatchObject({ reason: 'network', status });
        }
      },
    );
    it('does not ignore a refresh rejection or discard a valid token', () => {
      expect(() =>
        sessionAccessToken('state', {
          data: { session: null },
          error: { status: 400 },
        }),
      ).toThrow('expired');
      expect(
        sessionAccessToken('state', {
          data: { session: { access_token: 'valid' } },
          error: null,
        }),
      ).toBe('valid');
    });
  });
}
