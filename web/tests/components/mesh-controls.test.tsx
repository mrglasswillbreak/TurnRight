import { act, useState } from 'react';
import { expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { useModelMesh } from '../../src/useModelMesh';
import { MeshObjectSettings } from '../../src/MeshObjectSettings';
import { MeshGeometryTools } from '../../src/MeshGeometryTools';
import type { MapEdit } from '../../src/types';
import type { MeshSelection, ModelDocument } from '../../src/model-document';
import type { EditorWorkspace } from '../../src/editor-workspace';
import { campusFixture } from '../fixture';
import { render } from './render';
import {
  button,
  click,
  fill,
  choose,
  toggle,
  blur,
  setPicker,
  expand,
} from './interact';

function fixture() {
  const data = campusFixture();
  const commit = vi.fn<(edit: MapEdit) => boolean>(() => true),
    preview = vi.fn(),
    recoverModelInput = vi.fn();
  const workspace = {
    modelInputs: {},
    recoverModelInput,
  } as unknown as EditorWorkspace;
  function Editor() {
    const [edit, setEdit] = useState<MapEdit>({
      id: 'library',
      kind: 'building',
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
      properties: { name: 'Library', height: 6 },
    });
    const [selection, onSelection] = useState<MeshSelection | null>(null);
    const state = useModelMesh({
      edit,
      data,
      scene: null,
      selection,
      onSelection,
      onPreview: preview,
      workspace,
      view: 'mesh',
      disabled: false,
      onCommit: (next) => {
        const ok = commit(next);
        if (ok) setEdit(next);
        return ok;
      },
    });
    return (
      <>
        <MeshGeometryTools state={state} />
        <MeshObjectSettings state={state} />
        <output data-testid="model">{JSON.stringify(state.document)}</output>
        {state.error && <p role="alert">{state.error}</p>}
      </>
    );
  }
  return { Editor, commit, preview, recoverModelInput };
}
const model = () =>
  JSON.parse(page.getByTestId('model').element().textContent!) as ModelDocument;

it('commits object transforms, independent duplicates, locks, materials and surface operations', async () => {
  const f = fixture();
  await render(<f.Editor />);
  await choose('Primitive', 'plane');
  await click('Add primitive');
  expect(model().objects).toHaveLength(1);
  await fill('Object name', 'Canopy');
  await blur('Object name');
  await choose('Pointer tool', 'move');
  await choose('Transform axis', 'x');
  await choose('Mesh snap grid', '1');
  await toggle('Add to selection (or Shift-click)');
  await fill('Mesh X amount', '2');
  await fill('Mesh Y amount', '3');
  await fill('Mesh Z amount', '4');
  await click('Move (m)');
  expect(model().objects[0]).toMatchObject({
    name: 'Canopy',
    transform: { position: [2, 3, 10] },
  });
  await fill('Mesh X amount', '0');
  await fill('Mesh Y amount', '0');
  await fill('Mesh Z amount', '90');
  await click('Rotate (°)');
  expect(model().objects[0].transform.rotation[2]).toBeCloseTo(90);
  await fill('Mesh X amount', '2');
  await fill('Mesh Y amount', '2');
  await fill('Mesh Z amount', '2');
  await click('Scale (factor)');
  expect(model().objects[0].transform.scale).toEqual([2, 2, 2]);
  await setPicker('Surface colour', '#123456');
  for (const [name, value] of [
    ['opacity', '0.8'],
    ['roughness', '0.3'],
    ['metalness', '0.4'],
  ]) {
    await fill(`Material ${name}`, value);
    await blur(`Material ${name}`);
  }
  expect(model().materials.at(-1)).toMatchObject({
    colour: '#123456',
    opacity: 0.8,
    roughness: 0.3,
    metalness: 0.4,
  });
  await click('Duplicate selection');
  expect(model().objects).toHaveLength(2);
  expect(model().objects[1].id).not.toBe(model().objects[0].id);
  await click('Hide object');
  expect(model().objects[1].hidden).toBe(true);
  await click('Show object');
  await click('Lock object');
  await expect.element(button('Move (m)')).toBeDisabled();
  await click('Unlock object');
  await click('Delete selection');
  expect(model().objects).toHaveLength(1);
  await click('Add primitive');
  await choose('Mesh selection', 'face');
  await choose('Mesh component', model().objects[1].faces[0].id);
  await fill('Surface operation distance (m)', '0.2');
  await click('Extrude faces');
  expect(model().objects[1].faces.length).toBeGreaterThan(2);
  await click('Inset face');
  await click('Subdivide');
  await choose('Mesh selection', 'vertex');
  await choose('Mesh component', Object.keys(model().objects[1].vertices)[0]);
  const before = model();
  await click('Merge vertices');
  expect(page.getByRole('alert').element().textContent).toMatch(
    /select|vertices/i,
  );
  expect(model()).toEqual(before);
});

it('keeps rejected geometry locally and supports editable curve depth and conversion', async () => {
  const f = fixture();
  await render(<f.Editor />);
  f.commit.mockReturnValueOnce(false);
  await click('Add primitive');
  expect(model().objects).toHaveLength(0);
  expect(f.recoverModelInput).toHaveBeenCalledWith(
    'library',
    'mesh:candidate',
    expect.any(String),
  );
  expect(page.getByRole('alert').element().textContent).toContain(
    'kept locally',
  );
  await click('New curve profile');
  await click('Add profile edge');
  await fill('End Y', '4');
  await click('Add profile edge');
  await fill('End X', '0');
  await click('Add profile edge');
  await click('Close and extrude profile');
  expect(model().objects[0].curve?.closed).toBe(true);
  await fill('Profile extrusion (m)', '5');
  await blur('Profile extrusion (m)');
  expect(model().objects[0].curve?.depth).toBe(5);
  await expand('Curve segment 1 · line');
  const endpoint = page.getByLabelText('end east (m)').first();
  await act(() => endpoint.fill('5'));
  await act(() => (endpoint.element() as HTMLElement).blur());
  expect(model().objects[0].curve?.segments[0].end[0]).toBe(5);
  await click('Convert curve to mesh');
  expect(model().objects[0].curve).toBeUndefined();
  expect(model().objects[0].faces.length).toBeGreaterThan(0);
  await toggle('Replace building visual');
  expect(model().replaceVisual).toBe(true);
  await click('Create editable mesh copy');
  await expect.poll(() => model().objects.length).toBeGreaterThan(1);
  expect(model().objects.at(-1)?.source?.kind).toBe('native');
});
