import { expect, it, vi } from 'vitest';
import { RevisionWorker, type WorkerPort } from '../src/revision-worker';
import { retainCampusSources } from '../src/useEditorValidation';
import { campusFixture } from './fixture';
function port(): WorkerPort {
  return {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    onmessage: null,
    onerror: null,
  };
}
it('initializes once per dataset identity and sends small subsequent requests', async () => {
  const worker = port(),
    client = new RevisionWorker(worker),
    data = { graph: 'campus' };
  const first = client.request(data, { to: 'library' });
  worker.onmessage!({
    data: { id: 1, revision: 1, result: ['path'] },
  } as MessageEvent);
  expect(await first).toEqual(['path']);
  const second = client.request(data, { to: 'gate' });
  expect(worker.postMessage).toHaveBeenCalledTimes(3);
  expect(worker.postMessage).toHaveBeenLastCalledWith({
    type: 'request',
    id: 2,
    revision: 1,
    payload: { to: 'gate' },
  });
  worker.onmessage!({
    data: { id: 2, revision: 1, result: [] },
  } as MessageEvent);
  await second;
  client.close();
});
it('rejects obsolete datasets and ignores stale or mismatched replies', async () => {
  const worker = port(),
    client = new RevisionWorker(worker);
  const old = client.request({}, {}),
    rejected = expect(old).rejects.toThrow('map changed');
  const current = client.request({}, {}),
    resolved = vi.fn();
  void current.then(resolved);
  await rejected;
  worker.onmessage!({
    data: { id: 2, revision: 1, result: 'wrong' },
  } as MessageEvent);
  await Promise.resolve();
  expect(resolved).not.toHaveBeenCalled();
  worker.onmessage!({
    data: { id: 2, revision: 2, result: 'current' },
  } as MessageEvent);
  expect(await current).toBe('current');
});
it('rejects current and future requests after worker failure', async () => {
  const worker = port(),
    client = new RevisionWorker(worker);
  const pending = client.request({}, {}),
    rejected = expect(pending).rejects.toThrow('stopped unexpectedly');
  worker.onerror!({} as ErrorEvent);
  await rejected;
  await expect(client.request({}, {})).rejects.toThrow('unavailable');
});
it('retains unaffected map sources after a metadata edit', () => {
  const before = campusFixture(),
    after = structuredClone(before);
  after.places[0].name = 'New library';
  const next = retainCampusSources(before, after);
  expect(next.map).toBe(before.map);
  expect(next.graph).toBe(before.graph);
  expect(next.places).not.toBe(before.places);
});
