import { act, useState } from 'react';
import { expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { useLayerWorkspace } from '../../src/useLayerWorkspace';
import { LayerFeatureTable } from '../../src/LayerFeatureTable';
import { newLayer } from '../../src/campus-layers';
import type { LayerViewState } from '../../src/campus-layer-types';
import type { MapEdit } from '../../src/types';
import { campusFixture } from '../fixture';
import { render } from './render';
import { click, choose, fill, toggle, button } from './interact';

function fixture(selected: string[] = ['building:block']) {
  const data = campusFixture();
  data.map.features.push({
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [3.2, 6.46],
          [3.2002, 6.46],
          [3.2002, 6.4602],
          [3.2, 6.4602],
          [3.2, 6.46],
        ],
      ],
    },
    properties: {
      id: 'block',
      kind: 'building',
      name: 'Block',
      height: 6,
      privateNote: 'Private source comment',
    },
  });
  const source = {
    ...newLayer('Buildings', 'building', 'buildings'),
    members: ['building:block'],
  };
  const target = newLayer('Review', 'overlay', 'review');
  data.layers = { version: 1, items: [source, target] };
  const commit = vi.fn(),
    preview = vi.fn(),
    select = vi.fn(),
    geometry = vi.fn();
  const initialEdits: MapEdit[] = [];
  function Editor() {
    const [view, onView] = useState<LayerViewState>({ selected });
    const [edits, setEdits] = useState(initialEdits);
    const state = useLayerWorkspace({
      data,
      edits,
      view,
      onView,
      issues: [],
      onCommit: commit,
      onSelect: select,
      onZoom: vi.fn(),
      onDraw: vi.fn(),
      onImport: vi.fn(),
      onGeometry: geometry,
      onAppearancePreview: preview,
      onClose: vi.fn(),
    });
    return (
      <>
        <button onClick={() => state.setExplorerTab('features')}>
          Show features
        </button>
        <button onClick={() => setEdits([...edits])}>Refresh workspace</button>
        <button onClick={state.exportLayer}>Export selected layer</button>
        <LayerFeatureTable state={state} />
      </>
    );
  }
  return { Editor, data, source, target, commit, preview, select, geometry };
}

it('previews atomic edits, rejects incompatible fields and invalidates stale previews', async () => {
  const f = fixture();
  await render(<f.Editor />);
  await click('Show features');
  await fill('Bulk value', 'paved');
  await click('Preview bulk edit');
  expect(document.body.textContent).toContain('apply only to paths');
  expect(f.commit).not.toHaveBeenCalled();
  await choose('Bulk field', 'name');
  await fill('Bulk value', 'Teaching block');
  await click('Preview bulk edit');
  await click('Refresh workspace');
  await expect.element(button('Apply changes')).toBeDisabled();
  await click('Preview bulk edit');
  await click('Apply changes');
  expect(f.commit.mock.calls[0][0]).toMatchObject([
    { id: 'block', properties: { name: 'Teaching block' } },
  ]);
  await click('Preview appearance');
  expect(
    f.preview.mock.calls.some(([batch]) => batch?.[0]?.properties.appearance),
  ).toBe(true);
  await click('Cancel');
  expect(f.preview.mock.calls.at(-1)![0]).toBeNull();
  await click('Preview move');
  expect(document.body.textContent).toContain('editable target layer');
  await choose('Move to layer', 'review');
  await click('Preview move');
  await click('Apply changes');
  const moves = f.commit.mock.calls.at(-1)![0] as MapEdit[];
  expect(moves.map((e) => e.kind)).toEqual(['layer', 'layer']);
  expect(JSON.stringify(moves)).toContain('building:block');
  expect(f.source.members).toEqual(['building:block']);
  expect(f.target.members).toEqual([]);
  await click('square');
  expect(f.geometry).toHaveBeenCalledWith('square', ['building:block']);
  await toggle('Select Block block');
  await expect.element(button('Preview appearance')).not.toBeInTheDocument();
  await toggle('Select Block block');
  await click('Edit Block · block');
  expect(f.select).toHaveBeenCalledWith('building', 'block');
});

it('protects campus boundaries and strips private properties from exported layer data', async () => {
  const f = fixture(['boundary:campus-boundary']);
  await render(<f.Editor />);
  await click('Show features');
  await click('Preview bulk edit');
  expect(document.body.textContent).toContain('managed in Campus settings');
  expect(f.commit).not.toHaveBeenCalled();
  const blobs: Blob[] = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    blobs.push(blob as Blob);
    return 'blob:layer-test';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  await fill('Search layer features', 'Block');
  await click('Export selected layer');
  const exported = JSON.parse(await blobs[0].text());
  expect(exported.features).toHaveLength(1);
  expect(exported.features[0].properties.name).toBe('Block');
  expect(exported.features[0].properties).not.toHaveProperty('privateNote');
  expect(exported.features[0].geometry).toEqual(
    f.data.map.features[0].geometry,
  );
  await act(() =>
    page.getByRole('checkbox', { name: /Select shown results/ }).click(),
  );
  await click('Preview appearance');
  await click('Apply changes');
  expect(f.commit).toHaveBeenCalledOnce();
});
