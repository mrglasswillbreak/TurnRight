import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import PrecisionControls from '../../src/PrecisionControls';
import { DEFAULT_PRECISION } from '../../src/editor-precision';
import { render } from './render';
import { button, click, fill, choose, toggle } from './interact';

it('retains snapping choices and traces the selected ring in either direction', async () => {
  const onTrace = vi.fn(),
    onClose = vi.fn(),
    onSegment = vi.fn(),
    onRectangle = vi.fn();
  const coordinates = [
    [
      [0, 0],
      [1, 0],
      [1, 1],
    ],
    [
      [2, 2],
      [3, 2],
      [3, 3],
      [4, 3],
    ],
  ];
  function Editor({ drawing = false }: { drawing?: boolean }) {
    const [settings, onSettings] = useState(DEFAULT_PRECISION);
    return (
      <>
        <PrecisionControls
          {...{
            settings,
            onSettings,
            drawing,
            onTrace,
            onClose,
            onSegment,
            onRectangle,
          }}
          selection={{ type: 'MultiLineString', coordinates }}
        />
        <output data-testid="settings">{JSON.stringify(settings)}</output>
      </>
    );
  }
  const view = await render(<Editor />);
  await expect.element(button('Add precise segment')).toBeDisabled();
  await toggle('Reference snapping');
  await toggle('vertex');
  await toggle('vertex');
  await choose('Segment constraint', 'parallel');
  await fill('Reference bearing (°)', '35');
  expect(
    JSON.parse(page.getByTestId('settings').element().textContent!),
  ).toMatchObject({
    enabled: false,
    constraint: 'parallel',
    referenceBearing: 35,
    kinds: ['endpoint', 'midpoint', 'edge', 'vertex'],
  });
  await click('Use selected feature as reference');
  await choose('Part / ring', '1');
  await view.rerender(<Editor drawing />);
  await fill('First vertex (0 based)', '1');
  await fill('Last vertex', '2');
  await click('Add reference vertices to drawing');
  expect(onTrace).toHaveBeenLastCalledWith([
    [3, 2],
    [3, 3],
  ]);
  await toggle('Reverse direction');
  await click('Add reference vertices to drawing');
  expect(onTrace).toHaveBeenLastCalledWith([
    [3, 3],
    [3, 2],
  ]);
  await fill('Last vertex', '9');
  await click('Add reference vertices to drawing');
  expect(page.getByRole('alert').element().textContent).toContain(
    'valid consecutive vertex range',
  );
  expect(onTrace).toHaveBeenCalledTimes(2);
  await fill('Length / width (m)', '12.5');
  await fill('Rectangle depth (m)', '7');
  await fill('Bearing (° clockwise from north)', '90');
  await click('Add precise segment');
  expect(onSegment).toHaveBeenCalledWith(12.5, 90);
  await click('Construct rectangle from first point');
  expect(onRectangle).toHaveBeenCalledWith(12.5, 7, 90);
  expect(page.getByRole('alert').query()).toBeNull();
  await click('Close precision drawing');
  expect(onClose).toHaveBeenCalledOnce();
});

it('shows construction failures without discarding the entered measurements', async () => {
  const onSegment = vi.fn(() => {
    throw Error('Place the first point');
  });
  await render(
    <PrecisionControls
      settings={DEFAULT_PRECISION}
      onSettings={vi.fn()}
      drawing
      onSegment={onSegment}
      onRectangle={vi.fn()}
      onTrace={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  await fill('Length / width (m)', '21');
  await click('Add precise segment');
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('Place the first point');
  await expect
    .element(page.getByLabelText('Length / width (m)', { exact: true }))
    .toHaveValue(21);
});
