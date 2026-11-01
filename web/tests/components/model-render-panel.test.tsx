import { act } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { ModelRenderPanel } from '../../src/ModelRenderPanel';
import { newModelDocument } from '../../src/model-document';
import { render, deferred } from './render';
import { choose, click } from './interact';

const factory = vi.hoisted(() => vi.fn());
vi.mock('../../src/model-render-export', () => ({
  createModelRenderExport: factory,
}));
beforeEach(() => {
  factory.mockReset();
});
const link = () =>
  page.getByRole('link', { name: 'Download building render', exact: true });

it('invalidates finished renders after image settings or the model change', async () => {
  const dispose = vi.fn();
  factory.mockResolvedValue({
    render: () => Promise.resolve(new Blob(['image'], { type: 'image/png' })),
    dispose,
  });
  const document = newModelDocument([3.2, 6.46]),
    native = vi.fn(async () => []);
  const mounted = await render(
    <ModelRenderPanel document={document} native={native} />,
  );
  await click('Prepare PNG');
  await expect.element(link()).toBeVisible();
  expect(dispose).toHaveBeenCalledTimes(1);
  await choose('Image width', '1024');
  await expect.element(link()).not.toBeInTheDocument();
  await click('Prepare PNG');
  await expect.element(link()).toBeVisible();
  expect(factory.mock.calls.at(-1)?.[2]).toBe(1024);
  await choose('View', 'roof');
  await expect.element(link()).not.toBeInTheDocument();
  await click('Prepare PNG');
  await expect.element(link()).toBeVisible();
  await mounted.rerender(
    <ModelRenderPanel document={{ ...document }} native={native} />,
  );
  await expect.element(link()).not.toBeInTheDocument();
});

it('discards a late render when the source model changes and releases the exporter', async () => {
  const pending = deferred<Blob>(),
    dispose = vi.fn();
  const rendering = vi.fn(() => pending.promise);
  factory.mockResolvedValue({ render: rendering, dispose });
  const document = newModelDocument([3.2, 6.46]),
    native = async () => [];
  const mounted = await render(
    <ModelRenderPanel document={document} native={native} />,
  );
  await click('Prepare PNG');
  await expect.poll(() => rendering.mock.calls.length).toBe(1);
  await mounted.rerender(
    <ModelRenderPanel document={{ ...document }} native={native} />,
  );
  await act(() => pending.resolve(new Blob(['old image'])));
  await expect.poll(() => dispose.mock.calls.length).toBe(1);
  await expect.element(link()).not.toBeInTheDocument();
  await expect
    .element(page.getByRole('button', { name: 'Prepare PNG' }))
    .toBeEnabled();
});

it('reports render failures and permits another attempt', async () => {
  factory.mockRejectedValue(new Error('Graphics context unavailable.'));
  await render(
    <ModelRenderPanel
      document={newModelDocument([3.2, 6.46])}
      native={async () => []}
    />,
  );
  await click('Prepare PNG');
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('Graphics context unavailable.');
  await expect
    .element(page.getByRole('button', { name: 'Prepare PNG' }))
    .toBeEnabled();
});
