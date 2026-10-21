import { beforeEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { GisQualityReview } from '../../src/GisQualityReview';
import { GisSubmissionReview } from '../../src/GisSubmissionReview';
import { GisMemberships } from '../../src/GisMemberships';
import { useGisReview, type GisReviewProps } from '../../src/useGisReview';
import type { QualityIssue, Dataset } from '../../src/gis-types';
import { render } from './render';
import { button, click, fill, choose, toggle, field } from './interact';

const { request, focus, show, flyTo } = vi.hoisted(() => ({
  request: vi.fn(),
  focus: vi.fn(),
  show: vi.fn(() => () => {}),
  flyTo: vi.fn(),
}));
vi.mock('../../src/supabase', () => ({ api: request }));
vi.mock('../../src/gis-map', () => ({
  focusGisFeature: focus,
  showGisPage: show,
}));
const issue: QualityIssue = {
  id: 'issue-one',
  severity: 'warning',
  code: 'overlap',
  message: 'Review overlap',
  status: 'open',
  revision: 2,
  coordinates: [3.2, 6.46],
  comments: [
    {
      actor: 'reviewer',
      text: 'Verify on site',
      createdAt: '2026-10-20T12:00:00Z',
    },
  ],
  evidence: [{ label: 'Survey notes', url: 'https://example.test/notes' }],
};
const dataset: Dataset = {
  id: 'dataset-one',
  name: 'Entrances',
  campus_id: 'lasu',
  schema: {
    version: 1,
    fields: [{ name: 'name', type: 'text', public: true }],
  },
  source_crs: 'EPSG:4326',
  analysis_crs: 'EPSG:32631',
  provenance: {},
  style: { mode: 'single', color: '#123456' },
  included: true,
  revision: 4,
  saved_filters: [],
};
const review = {
  id: 'review-one',
  summary: 'Updated entrances',
  status: 'submitted',
  content_hash: 'a'.repeat(64),
  contributors: ['owner'],
  submitted_by: 'owner',
};
beforeEach(() => {
  vi.clearAllMocks();
  request.mockImplementation(async (action: string) => {
    switch (action) {
      case 'gis-reviews':
        return [review];
      case 'gis-issues':
        return [issue];
      case 'gis-members':
        return [{ user_id: 'colleague', roles: ['editor'] }];
      case 'gis-quality':
        return [
          { ...issue, id: 'automated', message: 'Source revision changed' },
        ];
      case 'gis-review-details':
        return {
          id: review.id,
          current: true,
          sourceCount: 1,
          editCount: 2,
          datasets: [dataset],
          edits: [],
        };
      case 'gis-review-query':
        return {
          total: 2,
          nextKey: 'feature-one',
          features: [
            {
              type: 'Feature',
              id: 'feature-one',
              geometry: { type: 'Point', coordinates: [3.2, 6.46] },
              properties: { name: null, internal: 'private marker' },
            },
          ],
        };
      default:
        return {};
    }
  });
});
function fixture(panel: 'quality' | 'submission' | 'memberships') {
  const onIssue = vi.fn();
  const props = {
    datasets: [dataset],
    capabilities: {
      campusId: 'lasu',
      userId: 'owner',
      roles: ['administrator'],
      capabilities: ['review', 'edit', 'manage'],
    },
    map: { flyTo },
    mutate: async <T,>(work: () => Promise<T>) => work(),
    refresh: vi.fn(),
    onEdit: vi.fn(),
    issues: [
      {
        severity: 'error',
        code: 'disconnected',
        message: 'Unconnected entrance',
      },
    ],
    onIssue,
    membershipsOnly: panel === 'memberships',
  } as unknown as GisReviewProps;
  function Editor() {
    const state = useGisReview(props);
    return panel === 'quality' ? (
      <GisQualityReview state={state} />
    ) : panel === 'submission' ? (
      <GisSubmissionReview state={state} />
    ) : (
      <GisMemberships state={state} />
    );
  }
  return { Editor, onIssue };
}

it('tracks quality findings, preserves failed comments, and records revision-bound evidence', async () => {
  const f = fixture('quality');
  await render(<f.Editor />);
  await expect
    .poll(() => page.getByText('warning · Review overlap').query())
    .not.toBeNull();
  await click('Unconnected entrance');
  expect(f.onIssue).toHaveBeenCalledWith(
    expect.objectContaining({ code: 'disconnected' }),
  );
  await click('Track issue');
  expect(request).toHaveBeenCalledWith(
    'gis-issue-save',
    expect.objectContaining({
      expectedRevision: 0,
      issue: expect.objectContaining({
        severity: 'error',
        code: 'disconnected',
      }),
    }),
    expect.any(Object),
  );
  await click('Track and assign');
  expect(request).toHaveBeenLastCalledWith(
    'gis-quality',
    {},
    expect.any(Object),
  );
  await choose('Disposition', 'accepted');
  expect(request).toHaveBeenCalledWith(
    'gis-issue-save',
    { expectedRevision: 2, issue: { ...issue, status: 'accepted' } },
    expect.any(Object),
  );
  await choose('Assignee', 'colleague');
  expect(request).toHaveBeenCalledWith(
    'gis-issue-save',
    { expectedRevision: 2, issue: { ...issue, assigned_to: 'colleague' } },
    expect.any(Object),
  );
  await fill('Comment', 'Checked the boundary on site');
  await fill('Evidence URL', 'https://example.test/field-notes');
  await fill('Evidence label', 'Field notes');
  request.mockRejectedValueOnce(
    Error('Revision changed; refresh before saving'),
  );
  await click('Add comment / evidence');
  expect((field('Comment').element() as HTMLTextAreaElement).value).toBe(
    'Checked the boundary on site',
  );
  expect(page.getByRole('alert').element().textContent).toContain(
    'Revision changed',
  );
  await click('Add comment / evidence');
  expect(request).toHaveBeenCalledWith(
    'gis-issue-save',
    {
      expectedRevision: 2,
      issue: {
        ...issue,
        comments: [
          ...issue.comments,
          { actor: '', text: 'Checked the boundary on site', createdAt: '' },
        ],
        evidence: [
          ...issue.evidence,
          { label: 'Field notes', url: 'https://example.test/field-notes' },
        ],
      },
    },
    expect.any(Object),
  );
  expect((field('Comment').element() as HTMLTextAreaElement).value).toBe('');
  await fill('New quality issue', 'Review the new gate hours');
  await click('Add issue');
  expect(request).toHaveBeenCalledWith(
    'gis-issue-save',
    expect.objectContaining({
      expectedRevision: 0,
      issue: expect.objectContaining({
        message: 'Review the new gate hours',
        code: 'manual-review',
      }),
    }),
    expect.any(Object),
  );
});

it('requires a recorded administrator override for a contributor to approve an immutable snapshot', async () => {
  const f = fixture('submission');
  await render(<f.Editor />);
  await fill('Summary', 'Survey entrance corrections');
  await click('Validate and submit snapshot');
  expect(request).toHaveBeenCalledWith(
    'gis-review-submit',
    { summary: 'Survey entrance corrections', operationId: expect.any(String) },
    expect.any(Object),
  );
  await click('Inspect immutable submission');
  await choose('Submitted dataset', 'dataset-one');
  await click('Inspect submitted features');
  expect(page.getByText('No value').query()).not.toBeNull();
  expect(page.getByText('private marker').query()).toBeNull();
  await click('feature-one');
  expect(focus).toHaveBeenCalledWith(
    expect.any(Object),
    expect.objectContaining({ id: 'feature-one' }),
  );
  await click('Next submitted page');
  expect(request).toHaveBeenCalledWith(
    'gis-review-query',
    { id: 'review-one', datasetId: 'dataset-one', afterKey: 'feature-one' },
    expect.any(Object),
  );
  await fill('Decision reason', 'Independent field evidence is attached');
  await expect.element(button('Approve exact snapshot')).toBeDisabled();
  await click('Request changes');
  expect(request).toHaveBeenCalledWith(
    'gis-review-decide',
    {
      id: 'review-one',
      approve: false,
      reason: 'Independent field evidence is attached',
    },
    expect.any(Object),
  );
  await toggle('Original-owner override (reason recorded in the audit trail)');
  await click('Approve exact snapshot');
  expect(request).toHaveBeenCalledWith(
    'gis-review-decide',
    {
      id: 'review-one',
      approve: true,
      reason: 'Independent field evidence is attached',
      override: true,
    },
    expect.any(Object),
  );
});

it('composes and revokes campus roles through an explicit membership save', async () => {
  const f = fixture('memberships');
  await render(<f.Editor />);
  await expect.poll(() => button('colleague · editor').query()).not.toBeNull();
  await click('colleague · editor');
  await toggle('reviewer');
  await click('Save membership');
  expect(request).toHaveBeenCalledWith(
    'gis-member-save',
    {
      userId: 'colleague',
      roles: ['editor', 'reviewer'],
      operationId: expect.any(String),
    },
    expect.any(Object),
  );
  await toggle('editor');
  await toggle('reviewer');
  await fill('Account UUID', 'other-account');
  await click('Save membership');
  expect(request).toHaveBeenCalledWith(
    'gis-member-save',
    { userId: 'other-account', roles: [], operationId: expect.any(String) },
    expect.any(Object),
  );
});
