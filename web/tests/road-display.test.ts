import { afterEach, expect, it, vi } from 'vitest';
import type { FeatureCollection } from 'geojson';
import { requestRoadDisplay } from '../src/road-display';
afterEach(() => vi.unstubAllGlobals());
it('recovers a worker module failure and releases the worker', async () => {
  const terminate = vi.fn();
  let worker: Worker;
  vi.stubGlobal('Worker', class {
    onerror: Worker['onerror'] = null;
    onmessage: Worker['onmessage'] = null;
    terminate = terminate;
    postMessage() {}
    constructor() { worker = this as unknown as Worker; }
  });
  const source: FeatureCollection = { type: 'FeatureCollection', features: [] };
  const result = new Promise<FeatureCollection>((resolve) => requestRoadDisplay(source, resolve));
  worker!.onmessage!({ data: { error: true } } as MessageEvent);
  expect(await result).toEqual(source);
  expect(terminate).toHaveBeenCalled();
});
it('retains road display when a browser synchronously refuses a worker during reload', async () => {
  vi.stubGlobal(
    'Worker',
    class {
      constructor() {
        throw new DOMException('Document is unloading', 'SecurityError');
      }
    },
  );
  const source: FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [3.2, 6.47],
            [3.21, 6.47],
          ],
        },
        properties: { id: 'road', kind: 'path' },
      },
    ],
  };
  const before = structuredClone(source);
  const rendered = await new Promise<FeatureCollection>((resolve) =>
    requestRoadDisplay(source, resolve),
  );
  expect(rendered.features).toHaveLength(1);
  expect(rendered.features[0].geometry).toEqual(source.features[0].geometry);
  expect(source).toEqual(before);
});

it('terminates pending work on pagehide without starting a fallback import', async () => {
  const lifecycle = new EventTarget();
  vi.stubGlobal('window', lifecycle);
  const terminate = vi.fn();
  let worker: Worker;
  vi.stubGlobal('Worker', class {
    onerror: Worker['onerror'] = null;
    onmessage: Worker['onmessage'] = null;
    terminate = terminate;
    postMessage() {}
    constructor() { worker = this as unknown as Worker; }
  });
  const receive = vi.fn();
  requestRoadDisplay({ type: 'FeatureCollection', features: [] }, receive);
  lifecycle.dispatchEvent(new Event('pagehide'));
  expect(terminate).toHaveBeenCalledOnce();
  worker!.onerror!(new Event('error') as ErrorEvent);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(receive).not.toHaveBeenCalled();
});

it.each([true, false])('preserves cached-page work and handles its next lifecycle event (reply: %s)', (reply) => {
  const lifecycle = new EventTarget();
  vi.stubGlobal('window', lifecycle);
  const terminate = vi.fn();
  let worker: Worker;
  vi.stubGlobal('Worker', class {
    onerror: Worker['onerror'] = null;
    onmessage: Worker['onmessage'] = null;
    terminate = terminate;
    postMessage() {}
    constructor() { worker = this as unknown as Worker; }
  });
  const receive = vi.fn();
  const geometry: FeatureCollection = { type: 'FeatureCollection', features: [] };
  requestRoadDisplay(geometry, receive);
  lifecycle.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: true }));
  expect(terminate).not.toHaveBeenCalled();
  if (reply) {
    worker!.onmessage!({ data: geometry } as MessageEvent<FeatureCollection>);
    expect(receive).toHaveBeenCalledWith(geometry);
  } else {
    lifecycle.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: false }));
    expect(receive).not.toHaveBeenCalled();
  }
  expect(terminate).toHaveBeenCalledOnce();
  lifecycle.dispatchEvent(new Event('pagehide'));
  expect(terminate).toHaveBeenCalledOnce();
});
