import { act, useState } from 'react';
import { expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { useBuildingAppearance } from '../../src/useBuildingAppearance';
import { BuildingSurfaceSettings } from '../../src/BuildingSurfaceSettings';
import type { MapEdit } from '../../src/types';
import type { BuildingSelection } from '../../src/visual-types';
import { campusFixture } from '../fixture';
import { render } from './render';
import {
  click,
  fill,
  choose,
  toggle,
  blur,
  setPicker,
  field,
} from './interact';

function Editor() {
  const [edit, setEdit] = useState<MapEdit>({
    id: 'block',
    kind: 'building',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [3.2, 6.46],
          [3.2003, 6.46],
          [3.2003, 6.4602],
          [3.2, 6.4602],
          [3.2, 6.46],
        ],
      ],
    },
    properties: { name: 'Block', height: 6 },
  });
  const [selection, onSelection] = useState<BuildingSelection>({
    buildingId: 'block',
  });
  const state = useBuildingAppearance({
    edit,
    data: campusFixture(),
    mode: 'appearance',
    onMode: () => {},
    selection,
    onSelection,
    onEdit: (next) => {
      setEdit(next);
      return true;
    },
    roofDraft: null,
    onRoofDraft: () => {},
    onApplyRoof: setEdit,
    embedded: true,
  });
  return (
    <>
      <BuildingSurfaceSettings state={state} />
      <button onClick={() => state.choose(state.topology.parts[0].id)}>
        Select wing
      </button>
      <button
        onClick={() =>
          state.choose(
            state.topology.parts[0].id,
            state.topology.parts[0].rings[0].wallIds[0],
          )
        }
      >
        Select wall
      </button>
      <output data-testid="appearance-edit">{JSON.stringify(edit)}</output>
    </>
  );
}
const edit = () =>
  JSON.parse(
    page.getByTestId('appearance-edit').element().textContent!,
  ) as MapEdit;
const commitText = async (name: string, text: string) => {
  await fill(name, text);
  await blur(name);
};

it('edits inherited building, wing and wall properties without fabricating a measured height', async () => {
  await render(<Editor />);
  await choose('Building height information', 'floors');
  await commitText('Building floors', '3');
  expect(edit().properties).toMatchObject({ heightMode: 'floors', floors: 3 });
  await choose('Building height information', 'metres');
  await commitText('Building height (m)', '10');
  await toggle('Height is approximate');
  await commitText('Building height source / notes', 'Site survey');
  for (const name of [
    'Wall colour',
    'Roof colour',
    'Window colour',
    'Trim colour',
  ]) {
    await act(() => (field(name).element() as HTMLElement).focus());
    await setPicker(name, '#234567');
    await blur(name);
  }
  await choose('Windows', 'hide');
  await commitText('Window spacing (m)', '5');
  await choose('Standard roof form', 'gable');
  await commitText('Standard roof pitch (degrees)', '20');
  await choose('Ridge direction', 'short');
  await choose('Evidence confidence', 'documented');
  await commitText('Appearance source / date', 'Survey 2026-10-20');
  expect(edit().properties.appearance).toMatchObject({
    wallColour: '#234567',
    windows: false,
    windowSpacing: 5,
    roofForm: 'gable',
    roofPitch: 20,
    roofOrientation: 'short',
    confidence: 'documented',
    provenance: 'Survey 2026-10-20',
  });
  await click('Select wing');
  await choose('Wing height information', 'floors');
  await commitText('Wing floors', '2');
  const partId = edit().properties.buildingTopology!.parts[0].id;
  expect(edit().properties.appearance!.parts![partId]).toMatchObject({
    heightMode: 'floors',
    floors: 2,
  });
  await choose('Wing height information', 'metres');
  await commitText('Wing total height (m)', '7');
  await choose('Wing height information', 'unknown');
  expect(edit().properties.appearance!.parts![partId].heightMode).toBe(
    'unknown',
  );
  await choose('Wing height information', 'inherit');
  expect(edit().properties.appearance!.parts![partId]).not.toHaveProperty(
    'height',
  );
  await click('Select wall');
  await choose('Windows', 'show');
  const wallId =
    edit().properties.buildingTopology!.parts[0].rings[0].wallIds[0];
  expect(edit().properties.appearance!.walls![wallId].windows).toBe(true);
  await click('Use inherited value for windows');
  expect(edit().properties.appearance!.walls![wallId]).not.toHaveProperty(
    'windows',
  );
  await click('Use unknown building height');
  expect(edit().properties).not.toHaveProperty('height');
  expect(edit().properties).not.toHaveProperty('floors');
});
