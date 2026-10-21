import { expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { SourceFieldReview } from '../../src/SourceFieldReview';
import type { SourceRecord } from '../../src/editor-model';
import type { MapChange } from '../../src/types';
import { campusFixture } from '../fixture';
import { render } from './render';
import { click, toggle, expand } from './interact';

it('retains selected details after a failed review and sends only approved metadata with its revision', async () => {
  const data = campusFixture();
  const before: SourceRecord = {
    id: 'library',
    source: 'survey',
    hash: 'before',
    entity: 'place',
    payload: structuredClone(data.places[0]),
  };
  const after = structuredClone(before);
  if (after.entity !== 'place') throw Error('Expected place');
  after.payload.name = 'Campus library';
  after.payload.website = 'https://library.example.test/';
  after.payload.coordinates = [3.202, 6.462];
  after.payload.evidence = {
    name: [
      {
        sourceId: 'survey',
        recordId: 'library',
        checkedAt: '2026-10-20',
        url: 'https://evidence.example.test/library',
      },
      {
        sourceId: 'survey',
        recordId: 'unsafe',
        checkedAt: '2026-10-20',
        url: 'javascript:alert(1)',
      },
    ],
  };
  data.places.push({
    ...data.places[0],
    id: 'duplicate',
    sourceId: 'duplicate',
    sourceRefs: ['library'],
    coordinates: after.payload.coordinates,
  });
  const change: MapChange & { review_revision: number } = {
    id: 'change-one',
    source_id: before.id,
    kind: 'modify',
    before,
    after,
    status: 'pending',
    summary: 'Updated details and position',
    review_revision: 7,
  };
  const action = vi
    .fn()
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(true);
  await render(
    <SourceFieldReview
      change={change}
      data={data}
      busy={false}
      action={action}
    />,
  );
  await expect
    .element(page.getByRole('button', { name: 'Accept selected details' }))
    .toBeDisabled();
  expect(
    page.getByText(/Possible duplicates:/).element().textContent,
  ).toContain('Review identity');
  await expand('Source evidence');
  expect(page.getByRole('link', { name: 'Source' }).all()).toHaveLength(1);
  await expect
    .element(page.getByRole('link', { name: 'Source' }))
    .toHaveAttribute('rel', 'noopener noreferrer');
  expect(
    page.getByRole('checkbox', { name: 'coordinates', exact: true }).query(),
  ).toBeNull();
  await toggle('name');
  await toggle('website');
  await toggle('name');
  await click('Accept selected details');
  expect(action).toHaveBeenLastCalledWith(
    'review-change',
    { id: 'change-one', accept: true, fields: ['website'], revision: 7 },
    expect.any(String),
  );
  await expect
    .element(page.getByRole('checkbox', { name: 'website', exact: true }))
    .toBeChecked();
  await click('Accept selected details');
  await expect
    .element(page.getByRole('checkbox', { name: 'website', exact: true }))
    .not.toBeChecked();
  await expect
    .element(page.getByRole('button', { name: 'Accept selected details' }))
    .toBeDisabled();
});

it('treats a missing source record as uncertain removal instead of inferred demolition', async () => {
  const data = campusFixture();
  const change: MapChange = {
    id: 'removed',
    source_id: 'library',
    kind: 'remove',
    before: {
      id: 'library',
      source: 'survey',
      hash: 'before',
      entity: 'place',
      payload: data.places[0],
    },
    after: null,
    status: 'pending',
    summary: 'Absent from source',
  };
  await render(
    <SourceFieldReview
      change={change}
      data={data}
      busy={true}
      action={vi.fn()}
    />,
  );
  expect(
    page.getByText(/Absent from this source snapshot/).element().textContent,
  ).toContain('does not establish closure or demolition');
  expect(
    page.getByRole('button', { name: 'Accept selected details' }).query(),
  ).toBeNull();
});
