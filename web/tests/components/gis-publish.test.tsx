import { act } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import type { Map as MapInstance } from 'maplibre-gl';
import GisPublish from '../../src/GisPublish';
import type { GisPanelProps } from '../../src/GisWorkspace';
import type { Dataset, SavedMapView } from '../../src/gis-types';
import { render, deferred } from './render';
import { button, click, fill, choose, toggle, expand } from './interact';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  show: vi.fn(),
  cleanup: vi.fn(),
  layout: vi.fn(),
  download: vi.fn(),
  print: vi.fn(),
}));
vi.mock('../../src/supabase', () => ({ api: mocks.request }));
vi.mock('../../src/gis-map', () => ({ showGisPage: mocks.show }));
vi.mock('../../src/gis-layout', () => ({
  renderMapLayout: mocks.layout,
  downloadLayout: mocks.download,
  printLayout: mocks.print,
}));
const dataset: Dataset = {
  id: 'paths',
  name: 'Survey paths',
  campus_id: 'lasu',
  revision: 4,
  schema: { version: 1, fields: [] },
  source_crs: 'EPSG:4326',
  analysis_crs: 'EPSG:32631',
  provenance: {},
  style: { mode: 'single', color: '#123456' },
  included: true,
  saved_filters: [],
};
const savedView: SavedMapView = {
  id: 'view-one',
  name: 'North campus',
  revision: 3,
  center: [3.2, 6.46],
  zoom: 18,
  pitch: 0,
  bearing: 20,
  datasets: ['paths'],
};
const releases = [
  {
    id: 'preview-one',
    summary: 'Reviewed paths',
    status: 'preview',
    preview_url: 'https://preview.example.test',
  },
  {
    id: 'release-one',
    summary: 'Published paths',
    status: 'published',
    deployment_url: 'https://map.example.test/?existing=1',
    review_id: 'approved',
    version: 'v1',
  },
];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.show.mockReturnValue(mocks.cleanup);
  mocks.layout.mockResolvedValue({ image: 'rendered-layout' });
  mocks.request.mockImplementation(async (action: string) => {
    if (action === 'gis-reviews')
      return [
        {
          id: 'approved',
          summary: 'Approved changes',
          content_hash: 'a'.repeat(64),
          status: 'approved',
        },
        {
          id: 'pending',
          summary: 'Unapproved changes',
          content_hash: 'b'.repeat(64),
          status: 'submitted',
        },
      ];
    if (action === 'review-status') return { releases };
    if (action === 'gis-views') return [savedView];
    if (action === 'gis-query')
      return { features: [], revision: 4, nextCursor: null, total: 0 };
    return {};
  });
});
function fixture(publish = true) {
  const move = new Set<() => Promise<void>>();
  const map = {
    getBounds: () => ({
      getWest: () => -190,
      getSouth: () => -100,
      getEast: () => 190,
      getNorth: () => 100,
    }),
    getCenter: () => ({ lng: 3.2, lat: 6.46 }),
    getZoom: () => 18,
    getBearing: () => 20,
    getPitch: () => 0,
    on: vi.fn((_name: string, cb: () => Promise<void>) => move.add(cb)),
    off: vi.fn((_name: string, cb: () => Promise<void>) => move.delete(cb)),
    jumpTo: vi.fn(),
  };
  const props: GisPanelProps = {
    datasets: [dataset],
    capabilities: {
      campusId: 'lasu',
      userId: 'owner',
      roles: [] as never[],
      capabilities: publish
        ? (['edit', 'publish'] as ('edit' | 'publish')[])
        : [],
    },
    map: map as unknown as MapInstance,
    mutate: vi.fn(async <T,>(work: () => Promise<T>) =>
      work(),
    ) as GisPanelProps['mutate'],
    refresh: vi.fn(),
    onEdit: vi.fn(),
  };
  return { props, map, move };
}

it('builds only approved snapshots and keeps release and restoration requests separate', async () => {
  const f = fixture();
  await render(<GisPublish {...f.props} />);
  await expect
    .poll(() => page.getByRole('option', { name: /Approved changes/ }).query())
    .not.toBeNull();
  expect(
    page.getByRole('option', { name: /Unapproved changes/ }).query(),
  ).toBeNull();
  await expect.element(button('Build approved preview')).toBeDisabled();
  await choose('Approved snapshot', 'approved');
  await fill('Release summary', 'Review completed for north campus');
  await click('Build approved preview');
  expect(mocks.request).toHaveBeenCalledWith('prepare-release', {
    reviewId: 'approved',
    summary: 'Review completed for north campus',
  });
  await click('Publish this preview');
  expect(mocks.request).toHaveBeenCalledWith('publish-release', {
    id: 'preview-one',
  });
  await click('Submit restoration for review');
  expect(mocks.request).toHaveBeenCalledWith(
    'gis-review-restore',
    { id: 'release-one', operationId: expect.any(String) },
    expect.any(Object),
  );
  expect(f.props.mutate).toHaveBeenCalledTimes(3);
  const url = new URL(
    (
      page
        .getByRole('link', { name: 'Export released map layout' })
        .element() as HTMLAnchorElement
    ).href,
  );
  expect(url.searchParams.get('mapLayout')).toBe('1');
  expect(url.searchParams.get('layoutVersion')).toBe('v1');
  expect(url.searchParams.get('existing')).toBe('1');
  mocks.request.mockRejectedValueOnce(
    Error('Preview revision changed; rebuild it'),
  );
  await click('Publish this preview');
  await expect
    .poll(() => page.getByRole('alert').query()?.textContent)
    .toContain('Preview revision changed');
  await expect.element(button('Publish this preview')).toBeEnabled();
});

it('disables release mutations for a reader even with an approved snapshot selected', async () => {
  const f = fixture(false);
  await render(<GisPublish {...f.props} />);
  await expect
    .poll(() => page.getByRole('option', { name: /Approved changes/ }).query())
    .not.toBeNull();
  await choose('Approved snapshot', 'approved');
  await fill('Release summary', 'Cannot publish as reader');
  for (const label of [
    'Build approved preview',
    'Publish this preview',
    'Submit restoration for review',
  ])
    await expect.element(button(label)).toBeDisabled();
  expect(f.props.mutate).not.toHaveBeenCalled();
});

it('exports only complete visible map pages and saves the current shared-view revision', async () => {
  const f = fixture();
  const view = await render(<GisPublish {...f.props} />);
  await expand('Shared map views');
  await click('North campus');
  expect(f.map.jumpTo).toHaveBeenCalledWith(savedView);
  expect(mocks.request).toHaveBeenCalledWith(
    'gis-query',
    { datasetId: 'paths', revision: 4, limit: 500, bbox: [-180, -90, 180, 90] },
    expect.any(Object),
  );
  await fill('View name', 'North campus');
  await click('Save view');
  expect(mocks.request).toHaveBeenCalledWith(
    'gis-view-save',
    { operationId: expect.any(String), view: savedView },
    expect.any(Object),
  );
  await expand('Map layout: A4 / A3 PNG and PDF');
  await fill('Map title', 'Reviewed campus layout');
  await choose('Paper', 'A3');
  await fill('Attribution', 'Campus survey team');
  await click('Export PNG');
  expect(mocks.layout).toHaveBeenCalledWith(
    f.map,
    [dataset],
    'Reviewed campus layout',
    'A3',
    'Campus survey team',
  );
  expect(mocks.download).toHaveBeenCalledWith(
    { image: 'rendered-layout' },
    'Reviewed campus layout',
  );
  mocks.request.mockResolvedValueOnce({
    features: [],
    revision: 4,
    nextCursor: 'next-page',
    total: 501,
  });
  await act(async () => {
    await Promise.all([...f.move].map((cb) => cb()));
  });
  await expect.element(button('Export PNG')).toBeDisabled();
  expect(page.getByRole('status').element().textContent).toContain(
    'exceed 500 visible features',
  );
  await toggle('Survey paths');
  await expect.element(button('Export PNG')).toBeEnabled();
  await view.unmount();
  expect(mocks.cleanup).toHaveBeenCalled();
  expect(f.move.size).toBe(0);
});

it('ignores outdated map responses and recovers when a print window is unavailable', async () => {
  const f = fixture();
  const view = await render(<GisPublish {...f.props} />);
  const pending = deferred<unknown>();
  mocks.request.mockReturnValueOnce(pending.promise);
  await toggle('Survey paths');
  await toggle('Survey paths');
  await act(async () => {
    pending.resolve({ features: [], nextCursor: 'old-page' });
    await pending.promise;
  });
  expect(mocks.show).not.toHaveBeenCalled();
  await expand('Map layout: A4 / A3 PNG and PDF');
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  await click('Print / Save as PDF');
  expect(page.getByRole('alert').element().textContent).toContain(
    'Allow the print window',
  );
  const popup = { opener: {}, close: vi.fn() };
  open.mockReturnValue(popup as unknown as Window);
  mocks.layout.mockRejectedValueOnce(Error('Map rendering failed'));
  await click('Print / Save as PDF');
  expect(popup.opener).toBeNull();
  expect(popup.close).toHaveBeenCalledOnce();
  await click('Print / Save as PDF');
  expect(mocks.print).toHaveBeenCalledWith(
    popup,
    { image: 'rendered-layout' },
    'A4',
    'Campus map',
  );
  await view.unmount();
});
