import { useState } from 'react';
import { expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { DrivingEditor } from '../../src/DrivingEditor';
import type { MapEdit } from '../../src/types';
import { campusFixture } from '../fixture';
import { render } from './render';
import { click, fill, choose, toggle } from './interact';

function Editor({ kind }: { kind: MapEdit['kind'] }) {
  const [properties, setProperties] = useState<Record<string, unknown>>({
    name: 'Library access',
    untouched: 42,
  });
  const data = campusFixture();
  data.graph.edges.forEach((e) => {
    e.vehicleAllowed = true;
  });
  const edit: MapEdit = {
    id: 'ab',
    kind,
    properties,
    geometry:
      kind === 'path'
        ? {
            type: 'LineString',
            coordinates: [
              [3.2, 6.46],
              [3.2005, 6.46],
            ],
          }
        : { type: 'Point', coordinates: [3.2, 6.46] },
  };
  return (
    <>
      <DrivingEditor
        edit={edit}
        data={data}
        onProperty={(key, value) =>
          setProperties((p) => ({ ...p, [key]: value }))
        }
      />
      <output data-testid="properties">{JSON.stringify(properties)}</output>
    </>
  );
}
const saved = () =>
  JSON.parse(page.getByTestId('properties').element().textContent!);
async function review() {
  await fill('Permitted vehicle audience', 'Visitors');
  await fill('Driving approval date', '2026-10-20');
  await fill(
    'Driving approval evidence and restrictions',
    'Owner confirmed; daylight only',
  );
}

it('preserves road review evidence while editing direction, speed and turn restrictions', async () => {
  await render(<Editor kind="path" />);
  await choose('Vehicle access', 'reviewed');
  await review();
  await choose('Vehicle direction', 'forward');
  await fill('Recorded speed (km/h)', '25');
  await toggle('Parking aisle (10 km/h estimated)');
  await toggle('Roundabout');
  await toggle('Unresolved conditional restriction — exclude driving');
  expect(saved()).toMatchObject({
    untouched: 42,
    vehicle: {
      access: 'reviewed',
      direction: 'forward',
      speedKph: 25,
      parkingAisle: true,
      roundabout: true,
      conditional: true,
      review: {
        id: 'ab:driving-review',
        audience: 'Visitors',
        confirmedAt: '2026-10-20',
        summary: 'Owner confirmed; daylight only',
      },
    },
  });
  await fill('Recorded speed (km/h)', '');
  expect(saved().vehicle.speedKph).toBeUndefined();
  await click('Add turn restriction');
  await choose('Junction', 'b');
  await choose('Destination road', 'bc');
  await choose('Rule', 'only');
  expect(saved().turnRestrictions).toEqual([
    expect.objectContaining({
      fromSourceId: 'ab',
      viaNodeId: 'b',
      toSourceId: 'bc',
      kind: 'only',
    }),
  ]);
  await choose('Junction', '');
  expect(saved().turnRestrictions[0].toSourceId).toBe('');
  await click('Remove turn restriction');
  expect(saved().turnRestrictions).toEqual([]);
});

it('requires an explicit shared parking connection and keeps approval details', async () => {
  await render(<Editor kind="place" />);
  await choose('Vehicle transfer point', 'parking');
  await choose('Parking access', 'reviewed');
  await review();
  await choose('Shared road / walking transfer node', 'b');
  await fill('Parking restrictions', 'No overnight parking');
  expect(saved().parking).toMatchObject({
    id: 'ab',
    kind: 'parking',
    vehicleNodeId: 'b',
    walkingNodeId: 'b',
    access: 'reviewed',
    restrictions: 'No overnight parking',
    review: { audience: 'Visitors', confirmedAt: '2026-10-20' },
  });
  await choose('Vehicle transfer point', '');
  expect(saved().parking).toBeNull();
});

it('keeps gate driving approval separate from the closure mode', async () => {
  await render(<Editor kind="barrier" />);
  await choose('Closure affects', 'walking');
  await toggle('Vehicle passage reviewed at this gate');
  await review();
  expect(saved()).toMatchObject({
    closureMode: 'walking',
    vehiclePassable: true,
    vehicleReview: { audience: 'Visitors' },
  });
  await toggle('Vehicle passage reviewed at this gate');
  expect(saved().vehiclePassable).toBe(false);
  expect(page.getByLabelText('Permitted vehicle audience').query()).toBeNull();
});
