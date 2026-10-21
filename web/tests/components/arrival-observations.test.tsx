import { useState } from 'react';
import { expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { ArrivalEditor } from '../../src/ArrivalEditor';
import type { ArrivalGuide, MapEdit } from '../../src/types';
import { campusFixture } from '../fixture';
import { render } from './render';
import { expand, fill, choose, toggle } from './interact';

it('records evidence-backed arrival facts and preserves unknown values without granting access', async () => {
  function Editor() {
    const [edit, setEdit] = useState<MapEdit>({
      id: 'entrance',
      kind: 'entrance',
      geometry: { type: 'Point', coordinates: [3.2, 6.46] },
      properties: { arrival: { needsReview: true } },
    });
    return (
      <>
        <ArrivalEditor
          data={campusFixture()}
          edit={edit}
          onProperty={(key, value) =>
            setEdit({
              ...edit,
              properties: { ...edit.properties, [key]: value },
            })
          }
        />
        <output data-testid="arrival">
          {JSON.stringify(edit.properties.arrival)}
        </output>
      </>
    );
  }
  const guide = () =>
    JSON.parse(
      page.getByTestId('arrival').element().textContent!,
    ) as ArrivalGuide;
  await render(<Editor />);
  await expand('Entrance & arrival observations');
  await fill('Approach instructions', 'Use the east door');
  await fill('Recorded restrictions', 'Staff entrance');
  await fill('Recorded surface', 'Paved');
  await fill('Recorded steps', '0');
  await choose('Ramp', 'yes');
  await fill('Measured doorway width', '95');
  await fill('Public evidence description', 'Site visit');
  await fill('Observation date', '2026-10-20');
  await toggle('I reviewed instructions and photos after this entrance moved.');
  expect(guide()).toMatchObject({
    description: 'Use the east door',
    restrictions: 'Staff entrance',
    surface: 'Paved',
    steps: 0,
    ramp: 'yes',
    doorwayWidthCm: 95,
    observedAt: '2026-10-20',
    needsReview: false,
  });
  expect(Object.values(guide().evidence!)).toHaveLength(6);
  expect(guide().evidence!.description).toEqual([
    {
      sourceId: 'Site visit',
      recordId: 'arrival:entrance',
      checkedAt: '2026-10-20',
    },
  ]);
  await fill('Recorded steps', '');
  await fill('Measured doorway width', '');
  await fill('Recorded restrictions', '');
  await choose('Ramp', 'unknown');
  expect(guide()).not.toHaveProperty('steps');
  expect(guide()).not.toHaveProperty('doorwayWidthCm');
  expect(guide()).not.toHaveProperty('restrictions');
  expect(guide().ramp).toBe('unknown');
});
