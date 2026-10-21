import { beforeEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import GisAnalyze from '../../src/GisAnalyze';
import type { GisPanelProps } from '../../src/GisWorkspace';
import type { Dataset } from '../../src/gis-types';
import { render } from './render';
import { button, click, fill, choose, toggle } from './interact';
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../src/supabase', () => ({ api: request }));
const source: Dataset = {
  id: 'source',
  name: 'Paths',
  campus_id: 'lasu',
  source_crs: 'EPSG:4326',
  analysis_crs: 'EPSG:32631',
  revision: 7,
  provenance: {},
  included: false,
  saved_filters: [],
  style: { mode: 'single', color: '#123456' },
  schema: {
    version: 1,
    fields: [
      { name: 'id', type: 'text' },
      { name: 'height', type: 'number' },
    ],
  },
};
const props: GisPanelProps = {
  datasets: [
    source,
    { ...source, id: 'overlay', name: 'Survey table', revision: 3 },
  ],
  capabilities: {
    userId: 'owner',
    campusId: 'lasu',
    roles: ['editor'],
    capabilities: ['edit'],
  },
  map: null,
  mutate: async (work) => work(),
  refresh: vi.fn(),
  onEdit: vi.fn(),
};
beforeEach(() =>
  request
    .mockReset()
    .mockImplementation(async (action: string) =>
      action === 'gis-jobs' ? [] : {},
    ),
);
const lastRequest = () =>
  request.mock.calls.filter((c) => c[0] === 'gis-job-start').at(-1)![1];

it('submits current dataset revisions, typed join fields and metric parameters', async () => {
  await render(<GisAnalyze {...props} />);
  await fill('Result name', 'Survey analysis');
  await fill('Distance (metres)', '25');
  await click('Run buffer');
  expect(lastRequest()).toMatchObject({
    input: { datasetId: 'source', revision: 7 },
    parameters: { distance: 25 },
    name: 'Survey analysis',
  });
  await click('attribute join');
  await expect.element(button('Run attribute join')).toBeDisabled();
  await choose('Overlay / join table', 'overlay');
  await choose('Input key', 'id');
  await choose('Table key', 'id');
  await toggle('height');
  await toggle('height');
  await toggle('height');
  await click('Run attribute join');
  expect(lastRequest()).toMatchObject({
    input: { datasetId: 'source', revision: 7 },
    overlay: { datasetId: 'overlay', revision: 3 },
    parameters: { inputField: 'id', overlayField: 'id', fields: ['height'] },
  });
  await click('select location');
  await choose('Predicate', 'within');
  await click('Run select location');
  expect(lastRequest().parameters.predicate).toBe('within');
  await click('dissolve');
  await choose('Group by', 'id');
  await click('Run dissolve');
  expect(lastRequest().parameters.field).toBe('id');
  await click('calculate');
  await fill('Output field', 'height_twice');
  await fill('Expression', 'height * 2');
  await click('Run calculate');
  expect(lastRequest().parameters).toMatchObject({
    field: 'height_twice',
    expression: 'height * 2',
  });
  await click('export');
  await choose('Format', 'gpkg');
  await choose('Input', 'overlay');
  await click('Run export');
  expect(lastRequest()).toMatchObject({
    input: { datasetId: 'overlay', revision: 3 },
    parameters: { format: 'gpkg' },
  });
  await fill('Search toolbox', 'buffer');
  expect(button('calculate').query()).toBeNull();
  expect(button('buffer').query()).not.toBeNull();
  request.mockRejectedValueOnce(Error('Worker temporarily unavailable'));
  await click('Run export');
  expect(page.getByRole('alert').element().textContent).toContain(
    'Worker temporarily unavailable',
  );
});
