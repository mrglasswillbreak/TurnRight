import { useEffect } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { CampusCreateForm } from '../../src/CampusCreateForm';
import { useCampusWorkspace } from '../../src/useCampusWorkspace';
import { lasuCampus } from '../../src/campus-context';
import { getPreference, setPreference } from '../../src/offline';
import type { Position } from '../../src/types';
import { render } from './render';
import { button, click, fill, choose, field } from './interact';

const { request, switched } = vi.hoisted(() => ({
  request: vi.fn(),
  switched: vi.fn(),
}));
vi.mock('../../src/supabase', () => ({ api: request }));
// The canvas renderer has full browser coverage; keep this test on the wizard,
// its real recovery storage and the geographic data sent to the API.
vi.mock('../../src/ImportMapPreview', () => ({
  ImportMapPreview: ({
    onVertex,
    vertices,
    campus,
  }: {
    onVertex: (p: Position) => void;
    vertices: Position[];
    campus: { bounds: Position[] };
  }) => (
    <>
      <button
        onClick={() =>
          onVertex(
            (
              [
                [3.2, 6.46],
                [3.21, 6.46],
                [3.21, 6.47],
                [3.2, 6.47],
              ] as Position[]
            )[vertices.length],
          )
        }
      >
        Add boundary vertex
      </button>
      <output data-testid="bounds">{JSON.stringify(campus.bounds)}</output>
    </>
  ),
}));
const recoveryKey = `import-wizard:campus-create-test:${lasuCampus.id}`;
beforeEach(async () => {
  await setPreference(recoveryKey, null);
  switched.mockReset();
  request
    .mockReset()
    .mockImplementation(async (action: string) =>
      action === 'campus-list'
        ? { campuses: [] }
        : action === 'import-list'
          ? { sources: [], imports: [], scheduledOsmEnabled: false }
          : { campus: { ...lasuCampus, id: 'new-campus', slug: 'new-campus' } },
    );
});
function Editor() {
  const state = useCampusWorkspace({
    owner: 'campus-create-test',
    dark: false,
    onClose: vi.fn(),
    onSwitch: switched,
    onReview: vi.fn(),
  });
  const { setCreating } = state;
  useEffect(() => setCreating(true), [setCreating]);
  return (
    <>
      <CampusCreateForm state={state} />
      {state.error && <p role="alert">{state.error}</p>}
      <output data-testid="creating">{String(state.creating)}</output>
    </>
  );
}

it('creates a closed drawn boundary, validates map positions, and clears its recovery draft', async () => {
  await render(<Editor />);
  await expect.element(button('Create campus')).toBeDisabled();
  await fill('Campus name', 'North Campus!');
  expect((field('Public URL name').element() as HTMLInputElement).value).toBe(
    'north-campus',
  );
  await fill('Public URL name', 'north');
  await fill('Map centre longitude, latitude', '181,91');
  await click('Go to location');
  expect(page.getByRole('alert').element().textContent).toContain(
    'world bounds',
  );
  await fill('Map centre longitude, latitude', '3.2,6.46');
  await click('Go to location');
  expect(
    JSON.parse(page.getByTestId('bounds').element().textContent!)[0][0],
  ).toBeCloseTo(3.19);
  await click('Draw boundary');
  for (let i = 0; i < 3; i++) await click('Add boundary vertex');
  await click('Undo point');
  await expect.element(button('Create campus')).toBeDisabled();
  await click('Add boundary vertex');
  await click('Create campus');
  await expect.poll(() => switched.mock.calls.length).toBe(1);
  expect(request).toHaveBeenCalledWith('campus-create', {
    name: 'North Campus!',
    slug: 'north',
    boundary: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [3.2, 6.46],
            [3.21, 6.46],
            [3.21, 6.47],
            [3.2, 6.46],
          ],
        ],
      },
    },
  });
  expect(await getPreference(recoveryKey, null)).toBeNull();
  await click('Cancel');
  expect(page.getByTestId('creating').element().textContent).toBe('false');
});

it('chooses a polygon from an imported collection and retains it after a failed create', async () => {
  const polygon = (offset: number) => ({
    type: 'Feature',
    properties: { name: `Boundary ${offset}` },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [3 + offset, 6],
          [3.01 + offset, 6],
          [3.01 + offset, 6.01],
          [3 + offset, 6],
        ],
      ],
    },
  });
  await render(<Editor />);
  await fill('Campus name', 'Imported campus');
  await fill('Boundary GeoJSON', 'invalid');
  await expect.element(button('Create campus')).toBeDisabled();
  await fill(
    'Boundary GeoJSON',
    JSON.stringify({
      type: 'FeatureCollection',
      features: [polygon(0), polygon(1)],
    }),
  );
  await choose('Choose imported boundary', '1');
  request.mockRejectedValueOnce(Error('Campus name already exists'));
  await click('Create campus');
  expect(page.getByRole('alert').element().textContent).toContain(
    'already exists',
  );
  expect(switched).not.toHaveBeenCalled();
  await click('Create campus');
  await expect.poll(() => switched.mock.calls.length).toBe(1);
  expect(request).toHaveBeenCalledWith(
    'campus-create',
    expect.objectContaining({ boundary: polygon(1) }),
  );
});
