import { describe, expect, it, vi } from 'vitest';
import {
  adminRequest,
  AdminRequestError,
  boundedSession,
} from '../src/admin-client';
import { loadPreparedWorkspace } from '../src/editor-loading';
import type { EditorReliabilityFixture } from './editor-reliability.test';
export function registerDraftAndConflicts(
  _fixture: () => EditorReliabilityFixture,
): void {
  describe('operation-specific admin requests', () => {
    it('retains the original campus across a save retry after navigation', async () => {
      vi.stubGlobal('location', { search: '?campus=lasu' });
      const campuses: string[] = [];
      const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementation(async (_url, init) => {
          campuses.push(JSON.parse(String(init?.body)).campus);
          if (campuses.length === 1) throw new TypeError('Lost response');
          return new Response('[]');
        });
      await adminRequest(
        'save-edits',
        { operationId: 'same-save', edits: [] },
        'owner',
        {
          fetcher,
          delay: async () => {
            vi.stubGlobal('location', { search: '?campus=unilag' });
          },
        },
      );
      expect(campuses).toEqual(['lasu', 'lasu']);
    });
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
      expect(fetcher.mock.calls[0][1]?.body).toBe(
        fetcher.mock.calls[1][1]?.body,
      );
    });
    it.each([
      'publish-release',
      'rollback',
      'prepare-release',
      'check-sources',
    ])('does not replay an uncertain %s request', async (action) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockRejectedValue(new TypeError('Lost acknowledgement'));
      await expect(
        adminRequest(action, { id: 'release' }, undefined, { fetcher }),
      ).rejects.toMatchObject({ action, reason: 'network' });
      expect(fetcher).toHaveBeenCalledOnce();
    });
    it.each([401, 403])(
      'preserves authentication status %s without retrying',
      async (status) => {
        const fetcher = vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response('Denied', { status }));
        await expect(
          adminRequest('export', {}, undefined, { fetcher }),
        ).rejects.toMatchObject({
          action: 'export',
          status,
          reason: 'auth',
        });
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
            headers: new Headers(),
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
}
