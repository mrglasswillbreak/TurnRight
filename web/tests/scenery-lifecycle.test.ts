import { beforeEach, expect, it, vi } from 'vitest';
import type { CustomLayerInterface, Map as MapInstance } from 'maplibre-gl';
import { Group } from 'three';
import {
  createCampusModels,
  type ModelOptions,
} from '../src/campus-model-layer';
import { createScenery } from '../src/scenery-renderer';
import { campusFixture } from './fixture';
import { ALL_VISITOR_LAYERS, visitorPresentation } from '../src/visitor-layers';

vi.mock('../src/scenery-renderer', () => ({ createScenery: vi.fn() }));
vi.mock('three', async (original) => ({
  ...(await original<typeof import('three')>()),
  WebGLRenderer: class {
    autoClear = false;
    render() {}
    resetState() {}
    dispose() {}
  },
}));

beforeEach(() => {
  vi.mocked(createScenery)
    .mockReset()
    .mockImplementation(() => ({
      group: new Group(),
      update: vi.fn(),
      dispose: vi.fn(),
    }));
});

function fixture() {
  let layer: CustomLayerInterface | undefined;
  const map = {
    getZoom: () => 16,
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
  const data = campusFixture();
  const options: ModelOptions = {
    data,
    sceneryData: data,
    enabled: true,
    dark: false,
    selectedId: '',
    onReady: vi.fn(),
    onStatus: vi.fn(),
  };
  return { options, models: createCampusModels(map, options) };
}

it('reuses scenery across visitor filtering, selection and visibility changes', () => {
  const { options, models } = fixture();
  const scenery = vi.mocked(createScenery).mock.results[0].value;
  const hidden = { ...ALL_VISITOR_LAYERS, buildings: false, greenery: false };
  models.update({
    ...options,
    data: visitorPresentation(options.data, hidden),
    sceneryEnabled: false,
  });
  expect(createScenery).toHaveBeenCalledTimes(1);
  expect(scenery.update).toHaveBeenLastCalledWith(false, false, 16, false);
  models.update({
    ...options,
    data: visitorPresentation(options.data, hidden, 'selected-place'),
    selectedId: 'selected-place',
    sceneryEnabled: true,
  });
  expect(createScenery).toHaveBeenCalledTimes(1);
  expect(scenery.update).toHaveBeenLastCalledWith(true, false, 16, false);
  expect(scenery.dispose).not.toHaveBeenCalled();
  models.dispose();
  expect(scenery.dispose).toHaveBeenCalledTimes(1);
});

it('rebuilds scenery when its authoritative campus changes, even with unchanged display data', () => {
  const { options, models } = fixture();
  const first = vi.mocked(createScenery).mock.results[0].value;
  const updatedCampus = { ...options.data, graph: { ...options.data.graph } };
  models.update({ ...options, sceneryData: updatedCampus });
  expect(createScenery).toHaveBeenCalledTimes(2);
  expect(vi.mocked(createScenery).mock.calls[1][0]).toBe(updatedCampus);
  expect(first.dispose).toHaveBeenCalledTimes(1);
  const second = vi.mocked(createScenery).mock.results[1].value;
  models.dispose();
  expect(second.dispose).toHaveBeenCalledTimes(1);
});
