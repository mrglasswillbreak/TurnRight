import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { SurveyStart } from '../../src/SurveyStart';
import type { SurveySessionState } from '../../src/useSurveySession';
import type { MapEdit, Position } from '../../src/types';
import { campusFixture } from '../fixture';
import { render } from './render';
import { button, click, fill } from './interact';

it('prepares offline access and requires two mapped boundaries before recording a replacement', async () => {
  const data = campusFixture(),
    start = vi.fn(),
    saved = vi.fn(),
    prepareOffline = vi.fn(),
    easeTo = vi.fn();
  data.map.features = [
    {
      type: 'Feature',
      properties: { id: 'road', kind: 'path', name: 'Library path' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [3.2, 6.46],
          [3.2002, 6.46],
          [3.2004, 6.46],
        ],
      },
    },
  ];
  function Editor({ center = [3.2, 6.46] }: { center?: Position }) {
    const [screen, setScreen] = useState('home'),
      [message, setMessage] = useState(''),
      [error, setError] = useState('');
    const [query, setQuery] = useState(''),
      [path, setPath] = useState<MapEdit | null>(null),
      [boundaries, setBoundaries] = useState<number[]>([]);
    const state = {
      screen,
      setScreen,
      message,
      setMessage,
      query,
      setQuery,
      path,
      setPath,
      boundaries,
      setBoundaries,
      data,
      edits: [],
      map: { easeTo },
      center,
      setReselecting: vi.fn(),
      reselecting: false,
      start,
      saved,
      prepareOffline,
      attempt: async (work: () => Promise<void>) => {
        try {
          await work();
          setError('');
        } catch (e) {
          setError((e as Error).message);
        }
      },
    } as unknown as SurveySessionState;
    return (
      <>
        <SurveyStart state={state} />
        <output>{message}</output>
        {error && <p role="alert">{error}</p>}
      </>
    );
  }
  const view = await render(<Editor />);
  await click('Record new path');
  expect(start).toHaveBeenCalledWith();
  await click('Saved surveys');
  expect(saved).toHaveBeenCalledOnce();
  await click('Prepare for offline survey');
  expect(prepareOffline).toHaveBeenCalledOnce();
  expect(page.getByRole('status').element().textContent).toContain(
    'Ready for offline surveying',
  );
  await click('Correct existing path');
  await click('Set boundary here');
  expect(page.getByRole('alert').element().textContent).toContain(
    'Select a path first',
  );
  await fill('Find existing path', 'missing');
  expect(button('Library path').query()).toBeNull();
  await fill('Find existing path', 'library');
  await click('Library path');
  expect(easeTo).toHaveBeenCalledWith({ center: [3.2, 6.46], zoom: 19 });
  await click('Set boundary here');
  await expect.element(button('Record replacement')).toBeDisabled();
  await view.rerender(<Editor center={[3.3, 6.46]} />);
  await click('Set boundary here');
  expect(page.getByRole('alert').element().textContent).toContain(
    'closer to a purple boundary vertex',
  );
  await view.rerender(<Editor center={[3.2004, 6.46]} />);
  await click('Set boundary here');
  await click('Record replacement');
  expect(start).toHaveBeenLastCalledWith(true);
  await click('Back');
  expect(button('Record new path').query()).not.toBeNull();
});
