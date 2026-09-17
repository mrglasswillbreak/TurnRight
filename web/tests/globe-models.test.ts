import { expect, it, vi } from 'vitest';
import type { CustomLayerInterface, Map as MapInstance } from 'maplibre-gl';
import { createCampusModels } from '../src/campus-model-layer';
import { campusFixture } from './fixture';

const draw = vi.hoisted(() => vi.fn());
vi.mock('three', async (original) => ({
  ...(await original<typeof import('three')>()),
  WebGLRenderer: class {
    autoClear = false;
    render = draw;
    resetState() {}
    dispose() {}
  },
}));

it('never passes a globe matrix to the Mercator building renderer and resumes rendering on campus', () => {
  let zoom = 1;
  let layer: CustomLayerInterface | undefined;
  const map = {
    getZoom: () => zoom,
    getBounds: () => ({
      getWest: () => 3.19,
      getEast: () => 3.22,
      getSouth: () => 6.45,
      getNorth: () => 6.48,
    }),
    getCanvas: () => ({}),
    addLayer: (next: CustomLayerInterface) => {
      layer = next;
      next.onAdd?.(map, {} as WebGL2RenderingContext);
    },
    getLayer: () => layer,
    removeLayer: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    triggerRepaint: vi.fn(),
  } as unknown as MapInstance;
  const onStatus = vi.fn();
  const models = createCampusModels(map, {
    data: campusFixture(),
    enabled: true,
    dark: false,
    selectedId: '',
    onReady: vi.fn(),
    onStatus,
  });
  const render = layer!.render.bind(layer!);
  const args = {
    defaultProjectionData: {
      mainMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    },
  } as Parameters<typeof render>[1];
  render({} as WebGL2RenderingContext, args);
  expect(draw).not.toHaveBeenCalled();
  expect(models.pick([20, 20])).toBeUndefined();
  zoom = 18;
  Object.assign(map, { isMoving: () => false });
  render({} as WebGL2RenderingContext, args);
  expect(draw).toHaveBeenCalledOnce();
  zoom = 11.9;
  render({} as WebGL2RenderingContext, args);
  expect(draw).toHaveBeenCalledOnce();
  expect(onStatus).not.toHaveBeenCalledWith('unavailable');
  models.dispose();
});
