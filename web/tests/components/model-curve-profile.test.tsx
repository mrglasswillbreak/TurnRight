import { expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { ModelCurveProfileForm } from '../../src/ModelCurveProfileForm';
import type { EditorWorkspace } from '../../src/editor-workspace';
import type { ModelObject } from '../../src/model-document';
import { render } from './render';
import { click, fill, choose } from './interact';

it('keeps a failed profile editable, then closes and extrudes real geometry', async () => {
  const onAdd = vi.fn<(_: ModelObject) => boolean>(() => true),
    recoverModelInput = vi.fn();
  const workspace = {
    modelInputs: {},
    recoverModelInput,
  } as unknown as EditorWorkspace;
  await render(
    <ModelCurveProfileForm
      buildingId="library"
      workspace={workspace}
      onAdd={onAdd}
    />,
  );
  await click('New curve profile');
  await fill('End X', '');
  await click('Add profile edge');
  expect(page.getByRole('alert').element().textContent).toContain(
    'finite profile coordinates',
  );
  expect(onAdd).not.toHaveBeenCalled();
  await fill('End X', '4');
  await click('Add profile edge');
  await click('Close and extrude profile');
  expect(onAdd).not.toHaveBeenCalled();
  await fill('End Y', '4');
  await click('Add profile edge');
  await fill('End X', '0');
  await click('Add profile edge');
  await fill('Profile depth (m)', '3');
  await click('Close and extrude profile');
  expect(onAdd).toHaveBeenCalledOnce();
  const model = onAdd.mock.calls[0][0];
  expect(model.curve).toMatchObject({
    closed: true,
    depth: 3,
    start: [0, 0, 0],
  });
  expect(model.curve!.segments.at(-1)?.end).toEqual([0, 0, 0]);
  expect(model.faces.length).toBeGreaterThan(0);
  expect(recoverModelInput).toHaveBeenLastCalledWith(
    'library',
    'mesh:profile',
    undefined,
  );
});

it('recovers editable arc and Bézier profiles, removes edges, and cancels without adding an object', async () => {
  const onAdd = vi.fn<(_: ModelObject) => boolean>(() => false),
    recoverModelInput = vi.fn();
  const workspace = {
    modelInputs: { library: { 'mesh:profile': '{invalid' } },
    recoverModelInput,
  } as unknown as EditorWorkspace;
  await render(
    <ModelCurveProfileForm
      buildingId="library"
      workspace={workspace}
      onAdd={onAdd}
    />,
  );
  await click('New curve profile');
  await choose('Profile edge', 'arc');
  await fill('Through X', '2');
  await fill('Through Y', '1');
  await click('Add profile edge');
  await choose('Profile edge', 'bezier');
  await fill('End Y', '4');
  await fill('Control 1 X', '5');
  await fill('Control 1 Y', '1');
  await fill('Control 2 X', '5');
  await fill('Control 2 Y', '3');
  await click('Add profile edge');
  const saved = JSON.parse(recoverModelInput.mock.calls.at(-1)![2]);
  expect(saved.segments).toEqual([
    expect.objectContaining({ kind: 'arc', through: [2, 1, 0] }),
    expect.objectContaining({
      kind: 'bezier',
      control1: [5, 1, 0],
      control2: [5, 3, 0],
    }),
  ]);
  await click('Remove profile edge 1');
  expect(
    JSON.parse(recoverModelInput.mock.calls.at(-1)![2]).segments,
  ).toHaveLength(1);
  await click('Cancel profile');
  expect(onAdd).not.toHaveBeenCalled();
  expect(recoverModelInput).toHaveBeenLastCalledWith(
    'library',
    'mesh:profile',
    undefined,
  );
});
