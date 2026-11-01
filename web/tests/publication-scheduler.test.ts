import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { publicationAction } from '../server/publication';
import { withCampusId } from '../server/campus-scope';

const mocks = vi.hoisted(() => ({
  db: vi.fn(),
  dispatch: vi.fn(),
  catalogue: vi.fn(),
  hydrate: vi.fn(),
  published: vi.fn(),
  validate: vi.fn(),
}));
vi.mock('../server/backend', async (original) => ({
  ...(await original<typeof import('../server/backend')>()),
  db: mocks.db,
  dispatch: mocks.dispatch,
}));
vi.mock('../scripts/published-campus-catalogue.mjs', () => ({
  readPublishedCatalogue: mocks.catalogue,
}));
vi.mock('../server/model-assets', () => ({ hydrateModelEdits: mocks.hydrate }));
vi.mock('../server/release-validation', () => ({
  publishedCampus: mocks.published,
  validateReleaseSnapshot: mocks.validate,
}));
const releaseId = '11111111-1111-4111-8111-111111111111';
const reviewId = '22222222-2222-4222-8222-222222222222';
const snapshot = { features: [], edits: [{ id: 'private-model' }] };
let release: Record<string, unknown>;
beforeEach(() => {
  vi.clearAllMocks();
  release = {
    id: releaseId,
    status: 'preview',
    deployment_id: 'dpl_exact',
    catalogue_revision: 'catalogue',
  };
  mocks.catalogue.mockResolvedValue({ revision: 'catalogue' });
  mocks.hydrate.mockResolvedValue([{ id: 'hydrated-model' }]);
  mocks.published.mockResolvedValue({ version: 'published' });
  mocks.validate.mockImplementation(() => undefined);
  mocks.dispatch.mockResolvedValue(undefined);
  mocks.db.mockImplementation(async (route: string) => {
    if (route === 'rpc/gis_prepare_release') return releaseId;
    if (route.endsWith('select=snapshot,restored_from')) return [{ snapshot }];
    if (route.startsWith('releases?')) return [release];
    return null;
  });
});
afterEach(() => vi.unstubAllEnvs());
const prepare = { reviewId, summary: '  Exact reviewed preview  ' };

it('keeps Actions as the default scheduler', async () => {
  await withCampusId('lasu', () =>
    publicationAction('owner', 'prepare-release', prepare),
  );
  expect(mocks.dispatch).toHaveBeenCalledExactlyOnceWith('release.yml', {
    release_id: releaseId,
    operation: 'preview',
    campus_id: 'lasu',
  });
});
it('schedules locally only after exact review preparation and hydrated snapshot validation', async () => {
  const schedule = vi.fn(async () => {
    expect(mocks.validate).toHaveBeenCalledExactlyOnceWith(
      { ...snapshot, edits: [{ id: 'hydrated-model' }] },
      { version: 'published' },
      { restoring: false },
    );
  });
  await expect(
    withCampusId('north', () =>
      publicationAction('owner', 'prepare-release', prepare, schedule),
    ),
  ).resolves.toEqual({ id: releaseId });
  expect(mocks.db).toHaveBeenCalledWith('rpc/gis_prepare_release', 'POST', {
    actor: 'owner',
    review_identity: reviewId,
    catalogue_hash: 'catalogue',
    release_summary: 'Exact reviewed preview',
  });
  expect(mocks.hydrate).toHaveBeenCalledWith(snapshot.edits, 'owner');
  expect(schedule).toHaveBeenCalledExactlyOnceWith('release.yml', {
    release_id: releaseId,
    operation: 'preview',
    campus_id: 'north',
  });
  expect(mocks.dispatch).not.toHaveBeenCalled();
});
it('rejects a stale SQL review before invoking either scheduler', async () => {
  mocks.db.mockRejectedValueOnce(Error('review is stale'));
  const schedule = vi.fn();
  await expect(
    publicationAction('owner', 'prepare-release', prepare, schedule),
  ).rejects.toThrow('review is stale');
  expect(schedule).not.toHaveBeenCalled();
  expect(mocks.dispatch).not.toHaveBeenCalled();
  expect(mocks.validate).not.toHaveBeenCalled();
});
it('records failed validation without scheduling a preview', async () => {
  mocks.validate.mockImplementation(() => {
    throw Error('model asset mismatch');
  });
  const schedule = vi.fn();
  await expect(
    publicationAction('owner', 'prepare-release', prepare, schedule),
  ).rejects.toThrow('model asset mismatch');
  expect(schedule).not.toHaveBeenCalled();
  expect(mocks.db).toHaveBeenLastCalledWith(
    'releases?id=eq.' + releaseId,
    'PATCH',
    { status: 'failed', error: 'model asset mismatch' },
  );
});
it('retains failure recording when the local scheduler cannot accept a preview', async () => {
  const schedule = vi.fn(async () => {
    throw Error('durable queue unavailable');
  });
  await expect(
    publicationAction('owner', 'prepare-release', prepare, schedule),
  ).rejects.toThrow('durable queue unavailable');
  expect(mocks.db).toHaveBeenLastCalledWith(
    'releases?id=eq.' + releaseId,
    'PATCH',
    { status: 'failed', error: 'durable queue unavailable' },
  );
});
it('checks approval and records the request before scheduling local promotion', async () => {
  const schedule = vi.fn(async () => {
    expect(mocks.db.mock.calls.slice(-2)).toEqual([
      [
        'rpc/gis_assert_release_approval',
        'POST',
        { release_identity: releaseId },
      ],
      [
        'workspace_audit',
        'POST',
        { actor: 'owner', action: 'publication-request', subject: releaseId },
      ],
    ]);
  });
  await withCampusId('lasu', () =>
    publicationAction('owner', 'publish-release', { id: releaseId }, schedule),
  );
  expect(schedule).toHaveBeenCalledExactlyOnceWith('release.yml', {
    release_id: releaseId,
    operation: 'publish',
    campus_id: 'lasu',
  });
  expect(mocks.dispatch).not.toHaveBeenCalled();
});
it.each([
  { status: 'building' },
  { deployment_id: null },
  { catalogue_revision: 'changed' },
])(
  'rejects an unready or stale preview before local scheduling: %j',
  async (changed) => {
    Object.assign(release, changed);
    const schedule = vi.fn();
    await expect(
      publicationAction(
        'owner',
        'publish-release',
        { id: releaseId },
        schedule,
      ),
    ).rejects.toThrow();
    expect(schedule).not.toHaveBeenCalled();
    expect(
      mocks.db.mock.calls.some(([route]) => route === 'workspace_audit'),
    ).toBe(false);
  },
);
it('does not schedule or audit promotion after SQL approval rejection', async () => {
  mocks.db.mockImplementation(async (route: string) => {
    if (route.startsWith('releases?')) return [release];
    throw Error('review approval revoked');
  });
  const schedule = vi.fn();
  await expect(
    publicationAction('owner', 'publish-release', { id: releaseId }, schedule),
  ).rejects.toThrow('review approval revoked');
  expect(schedule).not.toHaveBeenCalled();
  expect(
    mocks.db.mock.calls.some(([route]) => route === 'workspace_audit'),
  ).toBe(false);
});
