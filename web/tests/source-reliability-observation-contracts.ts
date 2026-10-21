import { expect, it, vi } from 'vitest';
import type { SourceFixtureObservation } from './source-fixture-types';
import { identityOf } from '../../scripts/source-comparison.mjs';
import {
  evidenceBatches,
  runSourceCheck,
} from '../../scripts/source-check-worker.mjs';
import { hash } from '../../scripts/cloud.mjs';
import type { SourceReliabilityFixture } from './source-reliability.test';
export function registerObservationContracts(
  fixture: () => SourceReliabilityFixture,
): void {
  it('keeps 100,000-feature archive batches bounded and localizes changes to one identity bucket', () => {
    const rows = Array.from({ length: 100000 }, (_, i) => ({
      identity: `object-${i}`,
      value: i,
    }));
    const key = (r: { identity: string }) => r.identity;
    const before = evidenceBatches(rows, key);
    const after = evidenceBatches([...rows].reverse(), key);
    expect(after).toEqual(before);
    expect(
      before.flatMap((b: { records: unknown[] }) => b.records),
    ).toHaveLength(100000);
    expect(
      before.every(
        (b: { records: unknown[] }) =>
          b.records.length <= 100 &&
          Buffer.byteLength(JSON.stringify(b.records)) < 384 * 1024,
      ),
    ).toBe(true);
    const fingerprints = new Set(
      before.map((b: { records: unknown[] }) => hash(b.records)),
    );
    const changed = evidenceBatches(
      [...rows, { identity: 'new-object', value: -1 }],
      key,
    );
    expect(
      changed.filter(
        (b: { records: unknown[] }) => !fingerprints.has(hash(b.records)),
      ).length,
    ).toBeLessThan(10);
  });
  it('waits for bounded finalization beyond the ordinary HTTP deadline without duplicate dispatch', async () => {
    vi.useFakeTimers();
    vi.stubEnv('SUPABASE_URL', 'https://source-check-test.invalid');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fixture-only');
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(
        () => controller.abort(new DOMException('Timeout', 'TimeoutError')),
        ms,
      );
      return controller.signal;
    });
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string, options: RequestInit) => {
      const route = new URL(url).pathname.split('/').at(-1)!;
      calls.push(route);
      if (route === 'source_check_finish') {
        await new Promise<void>((resolve, reject) => {
          setTimeout(resolve, 45000);
          options.signal!.addEventListener('abort', () =>
            reject(options.signal!.reason),
          );
        });
        return Response.json({ status: 'shadow', counts: { observation: 0 } });
      }
      return Response.json(
        route === 'source_check_begin' ? { status: 'staging' } : [],
      );
    });
    try {
      const result = runSourceCheck({
        sourceKey: 'slow-finalization',
        observations: [],
        receipt: {
          ...fixture().receipt,
          retrievedAt: '2026-10-13T12:00:00Z',
          contentHash: 'empty',
        },
      });
      void result.catch(() => {});
      await vi.advanceTimersByTimeAsync(45000);
      expect(calls.filter((c) => c === 'source_check_finish')).toHaveLength(1);
      expect(calls).not.toContain('source_check_interrupted');
      expect(await result).toMatchObject({ status: 'shadow' });
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
  it('checkpoints independent verification and resumes without repeating completed identities', async () => {
    const accepted = Array.from({ length: 301 }, (_, i) => {
      const item = { ...fixture().observation(String(i)), provider: 'file' };
      return { ...item, identity: identityOf(item) };
    });
    const saved = new Map<string, { status: string }>();
    const request = {
      sourceKey: 'verification-fixture',
      runId: '11111111-1111-4111-8111-111111111111',
      token: '22222222-2222-4222-8222-222222222222',
      receipt: {
        ...fixture().receipt,
        retrievedAt: '2026-10-12T12:00:00Z',
        contentHash: 'empty',
      },
      observations: [],
      completeReplacement: true,
    };
    let calls = 0;
    const transport = async (
      route: string,
      _method: string | undefined,
      args: {
        part?: string;
        records: Array<{ identity: string; value: { status: string } }>;
      },
    ) => {
      if (route.endsWith('source_check_begin')) return { status: 'staging' };
      if (route.endsWith('source_check_baseline'))
        return args.part === 'observations'
          ? accepted
          : args.part === 'records'
            ? accepted.flatMap((o) => o.records)
            : [...saved].map(([identity, value]) => ({ identity, value }));
      if (route.endsWith('source_check_evidence'))
        for (const entry of args.records)
          saved.set(entry.identity, entry.value);
      if (route.endsWith('source_check_finish')) return { status: 'complete' };
      return null;
    };
    const proof = (o: SourceFixtureObservation) => ({
      checkedAt: '2026-10-12T12:00:00Z',
      status: 'verified',
      method: 'declared-complete-file',
      contentHash: o.contentHash,
      configurationHash: fixture().receipt.configurationHash,
    });
    await expect(
      runSourceCheck(
        request,
        transport,
        async (o: SourceFixtureObservation) => {
          if (++calls === 101) throw new Error('Worker interrupted');
          return proof(o);
        },
      ),
    ).rejects.toThrow('Worker interrupted');
    expect(saved.size).toBe(100);
    calls = 0;
    expect(
      await runSourceCheck(
        request,
        transport,
        async (o: SourceFixtureObservation) => {
          calls++;
          return proof(o);
        },
      ),
    ).toEqual({ status: 'complete' });
    expect(calls).toBe(201);
    expect(saved.size).toBe(301);
    expect([...saved.values()].every((v) => v.status === 'verified')).toBe(
      true,
    );
  });
}
