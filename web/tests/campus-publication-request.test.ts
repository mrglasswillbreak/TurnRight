import { expect, it, vi } from 'vitest';
import {
  publicationRequest,
  requestCampusPublication,
} from '../../scripts/campus-publication-request.mts';

const owner = '10000000-0000-0000-0000-000000000001';
const reviewId = '20000000-0000-0000-0000-000000000002';
const releaseId = '30000000-0000-0000-0000-000000000003';
const contentHash = 'a'.repeat(64);
const prepare = {
  operation: 'prepare',
  review_id: reviewId,
  expected_review_hash: contentHash,
  summary: 'LASU: publish the 20 reviewed exterior model proposals.',
};
const publish = {
  operation: 'publish',
  review_id: reviewId,
  expected_review_hash: contentHash,
  release_id: releaseId,
  expected_version: 'lasu-0123456789ab',
  expected_deployment_id: 'dpl_ExactVerifiedPreview',
};
function fixture() {
  const ids = Array.from(
    { length: 20 },
    (_, i) => 'arcgis:University_Property:' + i,
  );
  const review = {
    id: reviewId,
    campus_id: 'lasu',
    status: 'approved',
    content_hash: contentHash,
    snapshot: {
      edits: ids.map((id, i) => ({
        id,
        kind: 'building',
        deleted: false,
        properties: {
          modelDocumentAsset: {
            id: owner,
            version: 1 as const,
            sha256: 'b'.repeat(64),
            bytes: 1000 + i,
          },
          reviewedModelRevision: 'model1-abcd-1234',
        },
      })),
    },
  };
  const release = {
    id: releaseId,
    campus_id: 'lasu',
    review_id: reviewId,
    status: 'preview',
    version: publish.expected_version,
    deployment_id: publish.expected_deployment_id,
    catalogue_revision: 'c'.repeat(64),
    snapshot: structuredClone(review.snapshot),
  };
  const state = {
    owners: [{ id: owner }],
    review,
    release,
    hashes: [contentHash, contentHash],
  };
  const receipts: Record<string, unknown>[] = [];
  const deps = {
    db: vi.fn(async (route: string, method = 'GET') => {
      if (route.startsWith('admin_users?')) return state.owners;
      if (route.startsWith('gis_reviews?')) return [state.review];
      if (route.startsWith('releases?')) return [state.release];
      if (route === 'rpc/gis_workspace_content_hash' && method === 'POST')
        return state.hashes.shift();
      throw Error('Unexpected database operation: ' + route);
    }),
    access: vi.fn(async () => ({
      userId: owner,
      campusId: 'lasu',
      capabilities: ['read', 'publish'],
    })),
    publication: vi.fn(async () => ({ id: releaseId })),
    expectedModelIds: ids,
    validReference: (ref: { version: number; sha256: string; bytes: number }) =>
      ref.version === 1 &&
      /^[a-f\d]{64}$/.test(ref.sha256) &&
      ref.bytes > 0 &&
      ref.bytes <= 25 * 1024 * 1024,
    saveReceipt: vi.fn(async (receipt: Record<string, unknown>) => {
      receipts.push(structuredClone(receipt));
    }),
  };
  return { state, deps, receipts };
}

it.each([
  {},
  { ...prepare, operation: 'force' },
  { ...prepare, review_id: 'latest' },
  { ...prepare, expected_review_hash: 'bad' },
  { ...prepare, summary: 'no' },
  { ...prepare, release_id: releaseId },
  { ...prepare, extra: 'unexpected' },
  { ...publish, expected_deployment_id: '' },
  { ...publish, expected_version: 'other-campus' },
  { ...publish, summary: 'Not a prepare request' },
])(
  'rejects incomplete or ambiguous inputs before any dependency call: %j',
  async (input) => {
    const { deps } = fixture();
    await expect(requestCampusPublication(input, deps)).rejects.toThrow();
    expect(deps.db).not.toHaveBeenCalled();
    expect(deps.publication).not.toHaveBeenCalled();
  },
);

it('requests the exact review through the existing action only after read guards', async () => {
  const { deps, receipts } = fixture();
  const result = await requestCampusPublication(prepare, deps);
  expect(deps.access).toHaveBeenCalledWith(owner, 'prepare-release');
  expect(deps.publication).toHaveBeenCalledExactlyOnceWith(
    owner,
    'prepare-release',
    {
      reviewId,
      summary: prepare.summary,
    },
  );
  expect(
    deps.db.mock.calls.every(
      ([route]) => !route.includes('gis_prepare_release'),
    ),
  ).toBe(true);
  expect(receipts[0].noRemoteWrites).toBe(true);
  expect(receipts[1]).toMatchObject({
    guardsPassed: true,
    requestMayHaveStarted: true,
    dispatchConfirmed: false,
  });
  expect((receipts[1].models as unknown[]).length).toBe(20);
  expect(result).toMatchObject({ releaseId, dispatchConfirmed: true });
});

it.each(['none', 'multiple', 'wrong-campus', 'wrong-user', 'no-publish'])(
  'rejects owner/capability ambiguity: %s',
  async (kind) => {
    const { state, deps } = fixture();
    if (kind === 'none') state.owners = [];
    if (kind === 'multiple') state.owners.push({ id: reviewId });
    if (kind === 'wrong-campus')
      deps.access.mockResolvedValue({
        userId: owner,
        campusId: 'other',
        capabilities: ['publish'],
      });
    if (kind === 'wrong-user')
      deps.access.mockResolvedValue({
        userId: reviewId,
        campusId: 'lasu',
        capabilities: ['publish'],
      });
    if (kind === 'no-publish')
      deps.access.mockResolvedValue({
        userId: owner,
        campusId: 'lasu',
        capabilities: ['read'],
      });
    await expect(requestCampusPublication(prepare, deps)).rejects.toThrow();
    expect(deps.publication).not.toHaveBeenCalled();
  },
);

it.each([
  'wrong-review',
  'wrong-campus',
  'unapproved',
  'hash-mismatch',
  'stale',
  'concurrent-change',
])('rejects changed review/workspace evidence: %s', async (kind) => {
  const { state, deps } = fixture();
  if (kind === 'wrong-review') state.review.id = releaseId;
  if (kind === 'wrong-campus') state.review.campus_id = 'other';
  if (kind === 'unapproved') state.review.status = 'submitted';
  if (kind === 'hash-mismatch') state.review.content_hash = 'b'.repeat(64);
  if (kind === 'stale') state.hashes[0] = 'b'.repeat(64);
  if (kind === 'concurrent-change') state.hashes[1] = 'b'.repeat(64);
  await expect(requestCampusPublication(prepare, deps)).rejects.toThrow();
  expect(deps.publication).not.toHaveBeenCalled();
});

it.each(['missing', 'duplicate', 'deleted', 'unreviewed', 'invalid-source'])(
  'rejects incomplete accepted model coverage: %s',
  async (kind) => {
    const { state, deps } = fixture();
    const edits = state.review.snapshot.edits;
    if (kind === 'missing') edits.pop();
    if (kind === 'duplicate') edits.push(structuredClone(edits[0]));
    if (kind === 'deleted') edits[0].deleted = true;
    if (kind === 'unreviewed') edits[0].properties.reviewedModelRevision = '';
    if (kind === 'invalid-source')
      edits[0].properties.modelDocumentAsset.bytes = 26 * 1024 * 1024;
    await expect(requestCampusPublication(prepare, deps)).rejects.toThrow();
    expect(deps.publication).not.toHaveBeenCalled();
  },
);

it('requests publication only for the pinned preview and approved model references', async () => {
  const { deps } = fixture();
  await requestCampusPublication(publish, deps);
  expect(deps.publication).toHaveBeenCalledExactlyOnceWith(
    owner,
    'publish-release',
    { id: releaseId },
  );
});

it.each(['release', 'review', 'status', 'version', 'deployment', 'source'])(
  'rejects mismatched preview binding: %s',
  async (kind) => {
    const { state, deps } = fixture();
    if (kind === 'release') state.release.id = reviewId;
    if (kind === 'review') state.release.review_id = releaseId;
    if (kind === 'status') state.release.status = 'building';
    if (kind === 'version') state.release.version = 'lasu-ffffffffffff';
    if (kind === 'deployment')
      state.release.deployment_id = 'dpl_AnotherPreview';
    if (kind === 'source')
      state.release.snapshot.edits[0].properties.modelDocumentAsset.sha256 =
        'd'.repeat(64);
    await expect(requestCampusPublication(publish, deps)).rejects.toThrow();
    expect(deps.publication).not.toHaveBeenCalled();
  },
);

it('inspection reports stale state without requesting any mutation or exposing snapshots', async () => {
  const { state, deps } = fixture();
  state.hashes[0] = 'e'.repeat(64);
  const result = await requestCampusPublication(
    {
      operation: 'inspect',
      review_id: reviewId,
      expected_review_hash: contentHash,
      release_id: releaseId,
    },
    deps,
  );
  expect(result).toMatchObject({
    noRemoteWrites: true,
    workspaceCurrent: false,
    release: { id: releaseId, status: 'preview' },
  });
  expect(JSON.stringify(result)).not.toContain('snapshot');
  expect(deps.publication).not.toHaveBeenCalled();
});

it('retains an uncertain request receipt and never automatically retries dispatch', async () => {
  const { deps, receipts } = fixture();
  deps.publication.mockRejectedValue(Error('Dispatch transport failed'));
  await expect(requestCampusPublication(prepare, deps)).rejects.toThrow(
    'transport',
  );
  expect(deps.publication).toHaveBeenCalledTimes(1);
  expect(receipts.at(-1)).toMatchObject({
    requestMayHaveStarted: true,
    dispatchConfirmed: false,
  });
});

it('does not interpret workflow boolean or injected object inputs as strings', () => {
  expect(() =>
    publicationRequest({ ...prepare, summary: { toString: () => 'injected' } }),
  ).toThrow('strings');
});
