import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import LayerGeometry from '../../src/LayerGeometry';
import {
  runGeometry,
  type GeometryRequest,
} from '../../src/layer-geometry-engine';
import type { MapEdit } from '../../src/types';
import { campusFixture } from '../fixture';
import { render } from './render';
import { button, click, fill, choose, toggle } from './interact';

class ControlledWorker {
  static instances: ControlledWorker[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() {
    ControlledWorker.instances.push(this);
  }
  static last() {
    return ControlledWorker.instances.at(-1)!;
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  ControlledWorker.instances = [];
});
function fixture(operation: GeometryRequest['operation'] = 'square') {
  vi.stubGlobal('Worker', ControlledWorker);
  const data = campusFixture();
  const edits: MapEdit[] = [
    {
      id: 'building',
      kind: 'building',
      properties: { name: 'Library' },
      geometry: data.boundary!.geometry,
    },
  ];
  const props = {
    data,
    edits,
    request: { operation, keys: ['building:building'] } as GeometryRequest,
    onClose: vi.fn(),
    onPreview: vi.fn(),
    onWindow: vi.fn(),
    onDrawCutter: vi.fn(),
  };
  return props;
}

it('calculates a real geometry result and invalidates previews when map inputs change', async () => {
  const props = fixture('offset');
  const view = await render(<LayerGeometry {...props} />);
  await fill('Offset in metres (negative shrinks)', '2');
  await click('Generate preview');
  const worker = ControlledWorker.last();
  const payload = worker.postMessage.mock.calls[0][0];
  expect(payload.request).toMatchObject({ operation: 'offset', distance: 2 });
  const result = runGeometry(payload.data, payload.edits, payload.request);
  await act(() => worker.onmessage!({ data: { result } }));
  expect(result.afterArea).toBeGreaterThan(result.beforeArea);
  await expect.element(button('Review on map')).toBeEnabled();
  await view.rerender(<LayerGeometry {...props} edits={[...props.edits]} />);
  await expect.element(button('Review on map')).toBeDisabled();
  expect(props.onPreview).not.toHaveBeenCalled();
  await click('Generate preview');
  await act(() => ControlledWorker.last().onmessage!({ data: { result } }));
  await click('Review on map');
  expect(props.onPreview).toHaveBeenCalledWith(
    result.edits,
    'Review offset · 1 source features',
  );
  expect(props.onClose).toHaveBeenCalledOnce();
});

it('handles bad cutters, worker failure, cancellation and fresh settings without mutating the draft', async () => {
  const props = fixture('split');
  const before = structuredClone(props.edits);
  const view = await render(<LayerGeometry {...props} />);
  await fill('Cutting line (GeoJSON geometry)', '{broken');
  await click('Generate preview');
  expect(page.getByRole('alert').element().textContent).toContain(
    'Enter a GeoJSON',
  );
  expect(ControlledWorker.instances).toHaveLength(0);
  await click('Draw cutting line on map');
  expect(props.onDrawCutter).toHaveBeenCalledWith(props.request);
  await choose('Operation', 'hole');
  await click('Draw hole on map');
  expect(props.onDrawCutter).toHaveBeenLastCalledWith({
    ...props.request,
    operation: 'hole',
  });
  await choose('Operation', 'align');
  await fill('Longest-edge bearing (° clockwise from north)', '45');
  await click('Generate preview');
  expect(
    ControlledWorker.last().postMessage.mock.calls[0][0].request.bearing,
  ).toBe(45);
  await act(() => ControlledWorker.last().onerror!());
  expect(page.getByRole('alert').element().textContent).toContain(
    'Your draft is unchanged',
  );
  expect(ControlledWorker.last().terminate).toHaveBeenCalled();
  await choose('Operation', 'regenerate');
  await toggle(
    'Replace manually reshaped derived surfaces. Unchecked retains them.',
  );
  await click('Generate preview');
  expect(
    ControlledWorker.last().postMessage.mock.calls[0][0].request.replaceManual,
  ).toBe(true);
  await click('Cancel operation');
  expect(ControlledWorker.last().terminate).toHaveBeenCalled();
  await click('Generate preview');
  await view.rerender(<LayerGeometry {...props} data={{ ...props.data }} />);
  await act(() =>
    ControlledWorker.last().onmessage!({
      data: { error: 'Should not replace stale-map warning' },
    }),
  );
  expect(page.getByRole('alert').element().textContent).toContain(
    'map changed while calculating',
  );
  await fill('First vertex', '1');
  await choose('Part', '0');
  await choose('Ring', '0');
  await click('Edit next 100 vertices on map');
  expect(props.onWindow).toHaveBeenCalledWith(0, 0, 0);
  await click('Close geometry tools');
  expect(props.onClose).toHaveBeenCalledTimes(2);
  expect(props.edits).toEqual(before);
});
