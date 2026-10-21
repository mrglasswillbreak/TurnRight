import { expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { ReportForm } from '../../src/ReportForm';
import { getPreference, setPreference } from '../../src/offline';
import { campusFixture } from '../fixture';
import { render } from './render';
import { click, fill, choose, field } from './interact';

it('recovers a local report, retains it on a failed submission, then removes it after success', async () => {
  const place = campusFixture().places[0],
    onDone = vi.fn(),
    onDraftSaved = vi.fn();
  await setPreference(`report:${place.id}`, {
    category: 'blocked-path',
    description: 'The library approach is blocked',
  });
  await setPreference('report-drafts', [
    { key: `report:${place.id}`, placeId: place.id, name: place.name },
  ]);
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Service unavailable' }), {
        status: 503,
      }),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
  await render(
    <ReportForm place={place} onDone={onDone} onDraftSaved={onDraftSaved} />,
  );
  await expect
    .poll(() => (field('Description').element() as HTMLTextAreaElement).value)
    .toBe('The library approach is blocked');
  await choose('What’s wrong?', 'missing-path');
  await fill('Description', 'The entrance footpath needs mapping');
  await click('Save draft');
  await expect.poll(() => buttonText()).toContain('Draft saved');
  await click('Submit report');
  expect(page.getByRole('alert').element().textContent).toContain(
    'Service unavailable',
  );
  expect(onDone).not.toHaveBeenCalled();
  expect(await getPreference(`report:${place.id}`, null)).toMatchObject({
    description: 'The entrance footpath needs mapping',
    category: 'missing-path',
  });
  await click('Submit report');
  await expect.poll(() => onDone.mock.calls.length).toBe(1);
  expect(JSON.parse(fetch.mock.calls[1][1]!.body as string)).toMatchObject({
    campus: 'lasu',
    placeId: place.id,
    coordinates: place.coordinates,
    description: 'The entrance footpath needs mapping',
    category: 'missing-path',
    website: '',
  });
  expect(await getPreference('report-drafts', [])).toEqual([]);
});
const buttonText = () => document.body.textContent || '';

it('refuses a report without a location and allows explicit draft discard', async () => {
  const onDone = vi.fn(),
    onDraftSaved = vi.fn(),
    fetch = vi.spyOn(globalThis, 'fetch');
  const view = await render(
    <ReportForm onDone={onDone} onDraftSaved={onDraftSaved} />,
  );
  await fill('Description', 'A path needs attention');
  await click('Submit report');
  expect(page.getByRole('alert').element().textContent).toContain(
    'Choose a place or a map pin',
  );
  expect(fetch).not.toHaveBeenCalled();
  await click('Save draft');
  await expect.poll(() => buttonText()).toContain('Draft saved');
  await click('Discard draft');
  await expect.poll(() => onDone.mock.calls.length).toBe(1);
  await view.unmount();
});
