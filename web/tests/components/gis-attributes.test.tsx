import { act } from 'react';
import { expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { GisAttributeTable } from '../../src/GisAttributeTable';
import { useGisData } from '../../src/useGisData';
import type { GisPanelProps } from '../../src/GisWorkspace';
import type { Dataset } from '../../src/gis-types';
import { render } from './render';
import { click, fill, choose, toggle, expand } from './interact';
const { request, focus, show } = vi.hoisted(() => ({
  request: vi.fn(),
  focus: vi.fn(),
  show: vi.fn(() => () => {}),
}));
vi.mock('../../src/supabase', () => ({ api: request }));
vi.mock('../../src/gis-map', () => ({
  focusGisFeature: focus,
  showGisPage: show,
}));

it('binds filters, pages and typed attribute writes to the current dataset revision', async () => {
  const dataset: Dataset = {
    id: 'assets',
    name: 'Assets',
    campus_id: 'lasu',
    source_crs: 'EPSG:4326',
    analysis_crs: 'EPSG:32631',
    revision: 7,
    provenance: {},
    included: false,
    style: { mode: 'single', color: '#123456' },
    schema: {
      version: 1,
      fields: [
        { name: 'height', type: 'number', required: true },
        { name: 'open', type: 'boolean' },
      ],
    },
    saved_filters: [
      {
        name: 'Tall assets',
        query: {
          datasetId: 'old',
          revision: 1,
          cursor: 'obsolete',
          filters: [{ field: 'height', operator: 'gt', value: 5 }],
        },
      },
    ],
  };
  const feature = {
    type: 'Feature',
    id: 'one',
    geometry: { type: 'Point', coordinates: [3.2, 6.46] },
    properties: { height: 4, open: true },
  };
  request
    .mockReset()
    .mockImplementation(
      async (action: string, payload: { cursor?: string }) => {
        if (action === 'gis-query')
          return {
            revision: 7,
            features: [feature],
            total: 2,
            nextCursor: payload.cursor ? null : 'next-page',
          };
        if (action === 'gis-statistics')
          return { count: 2, nulls: 0, min: 4, max: 8, average: 6, sum: 12 };
        if (action === 'gis-feature')
          return { source: 'dataset-source', edit: { id: 'one' } };
        return {};
      },
    );
  const onEdit = vi.fn();
  const props: GisPanelProps = {
    datasets: [dataset],
    capabilities: {
      userId: 'owner',
      campusId: 'lasu',
      roles: ['editor'],
      capabilities: ['edit'],
    },
    map: null,
    mutate: async (work) => work(),
    refresh: vi.fn(),
    onEdit,
  };
  function Editor() {
    const state = useGisData(props);
    return (
      <>
        <GisAttributeTable state={state} />
        <output data-testid="query">{JSON.stringify(state.query)}</output>
      </>
    );
  }
  await render(<Editor />);
  await expect
    .poll(() => page.getByRole('button', { name: 'one' }).query())
    .not.toBeNull();
  await choose('Field', 'height');
  await choose('Operator', 'gte');
  await fill('Value', '5');
  await click('Filter');
  expect(request).toHaveBeenCalledWith(
    'gis-query',
    expect.objectContaining({
      datasetId: 'assets',
      revision: 7,
      filters: [{ field: 'height', operator: 'gte', value: 5 }],
    }),
    expect.any(Object),
  );
  await click('Statistics');
  expect(page.getByRole('status').first().element().textContent).toContain(
    'mean 6; sum 12',
  );
  await toggle('Select one');
  expect(document.body.textContent).toContain('1 selected');
  await toggle('Select this page');
  expect(document.body.textContent).toContain('0 selected');
  await toggle('Select this page');
  await click('one');
  expect(focus).toHaveBeenCalled();
  await click('Edit geometry');
  expect(onEdit).toHaveBeenCalledWith('dataset-source', { id: 'one' });
  await click('height *');
  await click('height *');
  expect(
    JSON.parse(page.getByTestId('query').element().textContent!).sort,
  ).toEqual({ field: 'height', direction: 'desc' });
  await choose('Saved filter', '0');
  expect(JSON.parse(page.getByTestId('query').element().textContent!)).toEqual({
    filters: [{ field: 'height', operator: 'gt', value: 5 }],
  });
  await click('Next');
  expect(request).toHaveBeenCalledWith(
    'gis-query',
    expect.objectContaining({ cursor: 'next-page' }),
    expect.any(Object),
  );
  await click('Previous');
  await expand('Columns');
  await toggle('open');
  await toggle('open');
  await expand('Columns');
  const heightInput = page.getByRole('textbox', {
    name: 'height',
    exact: true,
  });
  await act(() => heightInput.fill('not a number'));
  await act(() => (heightInput.element() as HTMLElement).blur());
  expect(page.getByRole('alert').element().textContent).toMatch(/number/);
  await act(() => heightInput.fill('12'));
  await act(() => (heightInput.element() as HTMLElement).blur());
  expect(request).toHaveBeenCalledWith(
    'gis-attributes-save',
    {
      datasetId: 'assets',
      expectedRevision: 7,
      operationId: expect.any(String),
      features: [{ key: 'one', values: { height: 12 } }],
    },
    expect.any(Object),
  );
  const openInput = page.getByRole('combobox', { name: 'open', exact: true });
  await act(() => (openInput.element() as HTMLElement).focus());
  await act(() => openInput.selectOptions('false'));
  await act(() => (openInput.element() as HTMLElement).blur());
  expect(request).toHaveBeenCalledWith(
    'gis-attributes-save',
    expect.objectContaining({
      features: [{ key: 'one', values: { open: false } }],
    }),
    expect.any(Object),
  );
  await click('Clear');
  expect(JSON.parse(page.getByTestId('query').element().textContent!)).toEqual(
    {},
  );
});
