import { expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import GisSchema from '../../src/GisSchema';
import type { Dataset } from '../../src/gis-types';
import { render } from './render';
import { click, fill, choose, toggle, expand, setPicker } from './interact';
const dataset: Dataset = {
  id: 'dataset-one',
  name: 'Places',
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
      { name: 'height', type: 'number' },
      { name: 'open', type: 'boolean' },
      { name: 'name', type: 'text' },
    ],
  },
};

it('saves typed domains, public fields and legend classes while retaining failed edits', async () => {
  const save = vi.fn().mockResolvedValue({});
  const query = {
    datasetId: dataset.id,
    filters: [{ field: 'height', operator: 'gte' as const, value: 2 }],
  };
  await render(<GisSchema dataset={dataset} query={query} save={save} />);
  await expand('Schema, styling and publication fields');
  await fill('Dataset name', 'Campus places');
  await fill('Analysis CRS (UTM, metres)', 'EPSG:32631');
  await fill('height alias', 'Building height');
  await fill('height unit', 'm');
  await toggle('height required');
  await toggle('height public');
  await fill('height coded domain', '10\n20');
  await fill('open coded domain', 'yes');
  await click('Save schema and style');
  expect(save).not.toHaveBeenCalled();
  expect(page.getByRole('alert').element().textContent).toContain(
    'true or false',
  );
  await fill('open coded domain', 'true\nfalse');
  await fill('New field name', 'category');
  await click('Add field');
  await choose('category type', 'text');
  await fill('category coded domain', 'library\nlab');
  await choose('Style', 'categorical');
  await choose('Classification field', 'height');
  await choose('Label field', 'name');
  await choose('Proportional size field', 'height');
  await setPicker('Default color', '#445566');
  await click('Add legend class');
  await fill('Class 1 value', '10');
  await fill('Class 1 label', 'Low rise');
  await setPicker('Class 1 color', '#abcdef');
  await toggle('Include dataset in the reviewed public map');
  await fill('Saved filter name', 'Tall places');
  await click('Add current filter');
  save.mockRejectedValueOnce(Error('Revision conflict'));
  await click('Save schema and style');
  expect(page.getByRole('alert').element().textContent).toBe(
    'Revision conflict',
  );
  await click('Save schema and style');
  expect(save).toHaveBeenLastCalledWith(
    expect.objectContaining({
      name: 'Campus places',
      revision: 7,
      included: true,
      saved_filters: [{ name: 'Tall places', query }],
      schema: {
        version: 1,
        fields: [
          expect.objectContaining({
            name: 'height',
            domain: [10, 20],
            required: true,
            public: true,
          }),
          expect.objectContaining({ name: 'open', domain: [true, false] }),
          expect.objectContaining({ name: 'name', domain: [] }),
          expect.objectContaining({
            name: 'category',
            domain: ['library', 'lab'],
            public: false,
          }),
        ],
      },
      style: {
        mode: 'categorical',
        color: '#445566',
        field: 'height',
        labelField: 'name',
        sizeField: 'height',
        classes: [{ value: 10, label: 'Low rise', color: '#abcdef' }],
      },
    }),
  );
  await click('Remove class 1');
  await choose('Style', 'graduated');
  await click('Add legend class');
  await fill('Class 1 value', '25');
  await click('Save schema and style');
  expect(save.mock.calls.at(-1)![0].style.classes).toEqual([
    { maximum: 25, color: '#445566', label: '' },
  ]);
});
