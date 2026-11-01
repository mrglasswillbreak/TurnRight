import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import {
  manualArguments,
  parseManualRequest,
  sha256,
  assertEquivalentSource,
  assertExclusiveWindow,
  assertApprovedReview,
  outsideRepository,
  assertNoConflictingReleases,
} from '../../scripts/manual-release-request.mjs';
import {
  assertNoCompetingWork,
  localReleaseEnvironment,
} from '../../scripts/manual-release-provenance.mjs';
import { assertManualComparisonReceipt } from '../../scripts/manual-release-verification.mjs';
const hash = 'a'.repeat(64),
  commit = 'b'.repeat(40);
const run = '11111111-1111-4111-8111-111111111111';
const otherRun = '22222222-2222-4222-8222-222222222222';
const privateRoot = path.join(os.tmpdir(), 'manual-request-fixture');
const repository = path.join(privateRoot, 'repository');
const pin = { path: path.join(privateRoot, 'proof.json'), sha256: hash };
function request(operation = 'inspect') {
  return {
    schemaVersion: 1,
    kind: 'turnright-manual-release',
    campus: 'lasu',
    operation,
    localRunId: run,
    expectedMainCommit: commit,
    journalDirectory: path.join(privateRoot, 'journal'),
    validation: pin,
    recoveryPin: pin,
    applyReceipt: pin,
    reconciliation: pin,
    exclusiveWindow: pin,
  };
}
function parse(value: object, operation = 'inspect') {
  const bytes = Buffer.from(JSON.stringify(value));
  return parseManualRequest(bytes, sha256(bytes), operation, repository);
}
const release = {
  id: run,
  version: 'lasu-123456789abc',
  deploymentId: 'dpl_test',
  origin: 'https://preview.vercel.app',
};
it('requires explicit operations, a private absolute request and a raw SHA pin', () => {
  expect(
    manualArguments([
      'inspect',
      '--request',
      pin.path,
      '--request-sha256',
      hash,
    ]).operation,
  ).toBe('inspect');
  for (const args of [
    ['apply', '--request', pin.path, '--request-sha256', hash],
    ['inspect', '--request', 'relative.json', '--request-sha256', hash],
    ['inspect', '--request', pin.path],
    ['inspect', '--request', pin.path, '--request-sha256', 'bad'],
  ])
    expect(() => manualArguments(args)).toThrow('ARGUMENTS');
});
it('accepts exact inspect and existing saved-batch review requests', () => {
  expect(parse(request()).campus).toBe('lasu');
  expect(parse(request('resume-review'), 'resume-review').operation).toBe(
    'resume-review',
  );
});
it.each([
  ['wrong campus', { campus: 'unilag' }],
  ['wrong kind', { kind: 'other' }],
  ['extra command', { command: 'anything' }],
  ['malformed run', { localRunId: 'LOCAL' }],
  ['upper UUID', { localRunId: 'AAAAAAAA-1111-4111-8111-111111111111' }],
  ['unapproved operation', { operation: 'apply' }],
  ['short commit', { expectedMainCommit: 'abc' }],
  ['missing validation', { validation: null }],
  ['unhashed proof', { reconciliation: { path: pin.path } }],
])('rejects request %s', (_name, delta) => {
  expect(() => parse({ ...request(), ...delta })).toThrow();
});
it('rejects modified raw bytes and private paths inside the source checkout', () => {
  const bytes = Buffer.from(JSON.stringify(request()));
  expect(() =>
    parseManualRequest(
      Buffer.concat([bytes, Buffer.from(' ')]),
      sha256(bytes),
      'inspect',
      repository,
    ),
  ).toThrow('REQUEST_SHA');
  expect(() =>
    outsideRepository(path.join(repository, 'secret.json'), repository),
  ).toThrow('OUTSIDE');
  expect(() =>
    parse({
      ...request(),
      validation: { path: path.join(repository, 'receipt.json'), sha256: hash },
    }),
  ).toThrow('OUTSIDE');
});
it('requires approved review receipt and summary only for preview', () => {
  expect(() =>
    parse(
      { ...request('preview'), summary: 'Create reviewed preview' },
      'preview',
    ),
  ).toThrow('REVIEW_RECEIPT');
  expect(
    parse(
      {
        ...request('preview'),
        summary: 'Create reviewed preview',
        reviewReceipt: pin,
      },
      'preview',
    ).operation,
  ).toBe('preview');
  expect(() => parse({ ...request(), summary: 'Unexpected' })).toThrow(
    'SUMMARY',
  );
});
it('requires exact release and control pins for verify and complete evidence for publish', () => {
  const control = { data: pin, comparator: pin };
  expect(
    parse({ ...request('verify'), release, control }, 'verify').release,
  ).toEqual(release);
  expect(() =>
    parse(
      {
        ...request('verify'),
        release: { ...release, origin: 'http://localhost' },
        control,
      },
      'verify',
    ),
  ).toThrow('RELEASE_PIN');
  expect(() =>
    parse(
      { ...request('publish'), release, control, reviewReceipt: pin },
      'publish',
    ),
  ).toThrow('VERIFICATION_PIN');
  expect(
    parse(
      {
        ...request('publish'),
        release,
        control,
        reviewReceipt: pin,
        verification: { report: pin, comparison: pin },
      },
      'publish',
    ).operation,
  ).toBe('publish');
});
const identity = {
  commit,
  tree: 'c'.repeat(40),
  sourceSnapshot: hash,
  dependencySnapshot: hash,
  coverageSnapshot: hash,
};
const provenance = {
  expectedMainCommit: commit,
  remoteMain: commit,
  localMain: commit,
  clean: true,
  ancestor: true,
};
it('accepts a validated ancestor only with identical complete source identity on current main', () => {
  expect(() =>
    assertEquivalentSource(
      { ...identity, commit: 'd'.repeat(40) },
      identity,
      provenance,
    ),
  ).not.toThrow();
});
it.each(['tree', 'sourceSnapshot', 'dependencySnapshot', 'coverageSnapshot'])(
  'rejects changed validated %s',
  (field) => {
    expect(() =>
      assertEquivalentSource(
        { ...identity, [field]: 'changed' },
        identity,
        provenance,
      ),
    ).toThrow('SOURCE_CHANGED');
  },
);
it.each(['remoteMain', 'localMain', 'expectedMainCommit', 'clean', 'ancestor'])(
  'rejects unproven main %s',
  (field) => {
    expect(() =>
      assertEquivalentSource(identity, identity, {
        ...provenance,
        [field]: false,
      }),
    ).toThrow('CURRENT_MAIN');
  },
);
const now = Date.parse('2026-01-01T12:00:00Z');
function windowReceipt() {
  return {
    schemaVersion: 1,
    kind: 'turnright-exclusive-release-window',
    localRunId: run,
    commit,
    campus: 'lasu',
    checkedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 3600000).toISOString(),
    noConflictingJobs: true,
    noConflictingDeployments: true,
    jobsEvidence: pin,
    deploymentsEvidence: pin,
    workflows: [
      {
        id: 123,
        path: '.github/workflows/release.yml',
        stateBefore: 'active',
        state: 'disabled_manually',
        capturedAt: new Date(now).toISOString(),
        evidence: pin,
      },
    ],
  };
}
it('accepts a fresh operator exclusion receipt and rejects stale or unrelated receipts', () => {
  expect(() =>
    assertExclusiveWindow(windowReceipt(), request(), now),
  ).not.toThrow();
  expect(() =>
    assertExclusiveWindow(windowReceipt(), request(), now + 300001),
  ).toThrow('TIME');
  for (const delta of [
    { noConflictingJobs: false },
    { noConflictingDeployments: false },
    { localRunId: otherRun },
    { workflows: [] },
    { workflows: [{ path: 'release.yml' }] },
  ])
    expect(() =>
      assertExclusiveWindow({ ...windowReceipt(), ...delta }, request(), now),
    ).toThrow();
});
it('requires empty live DB jobs and Vercel deployments with complete responses', async () => {
  const read = async () => [];
  const vercel = async () => ({ deployments: [], pagination: {} });
  await expect(
    assertNoCompetingWork(read, vercel, 'project'),
  ).resolves.toMatchObject({ activeJobs: 0 });
  await expect(
    assertNoCompetingWork(
      async () => [{ status: 'running' }],
      vercel,
      'project',
    ),
  ).rejects.toThrow('ACTIVE_JOBS');
  await expect(
    assertNoCompetingWork(read, async () => ({ deployments: [{}] }), 'project'),
  ).rejects.toThrow('ACTIVE_DEPLOYMENTS');
  await expect(
    assertNoCompetingWork(
      read,
      async () => ({ deployments: [], pagination: { next: 1 } }),
      'project',
    ),
  ).rejects.toThrow('ACTIVE_DEPLOYMENTS');
});
it('uses an explicit local identity without provider identity, injected loaders or fixture flags', () => {
  const env = localReleaseEnvironment(
    {
      PATH: '/bin',
      SUPABASE_SERVICE_ROLE_KEY: 'private',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_RUN_ID: '123',
      GH_TOKEN: 'private2',
      NODE_OPTIONS: '--import bad',
      VERIFY_SCOPE: 'production',
      CAMPUS_ID: 'unilag',
      MODEL_FIXTURE: '1',
    },
    request(),
  );
  expect(env.PATH).toBe('/bin');
  expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe('private');
  expect(env.TURNRIGHT_LOCAL_RUN_ID).toBe(run);
  for (const key of [
    'GITHUB_REF',
    'GITHUB_RUN_ID',
    'GH_TOKEN',
    'NODE_OPTIONS',
    'VERIFY_SCOPE',
    'MODEL_FIXTURE',
  ])
    expect(env[key]).toBeUndefined();
  expect(env.CAMPUS_ID).toBe('lasu');
});
it('requires the actual approved original review and receipt bindings', () => {
  const recovery = {
    operation: 'resume-review',
    status: 'approved',
    approvalConfirmed: true,
    review: { id: run, status: 'approved', contentHash: hash },
    workspaceHash: hash,
    modelWritesPerformed: false,
    publicationRequested: false,
    originalOwnerVerified: true,
    applyReceiptSha256: hash,
    reconciliationSha256: hash,
    planHash: hash,
    reason: 'Original reason',
  };
  const apply = { planHash: hash, overrideReason: 'Original reason' };
  const recoveryPin = {
    review_operation_id: run,
    expected_workspace_hash: hash,
  };
  expect(() =>
    assertApprovedReview(recovery, request(), apply, recoveryPin),
  ).not.toThrow();
  for (const delta of [
    { status: 'submitted' },
    { reason: 'Changed reason' },
    { publicationRequested: true },
    { applyReceiptSha256: 'bad' },
    { modelWritesPerformed: true },
  ])
    expect(() =>
      assertApprovedReview(
        { ...recovery, ...delta },
        request(),
        apply,
        recoveryPin,
      ),
    ).toThrow('APPROVED_REVIEW');
});
it('rejects a hosted or altered comparison and binds a distinct local verification run', () => {
  const current = {
    kind: 'turnright-manual-preview-comparison',
    status: 'passed',
    hostedCi: false,
    localRunId: run,
    reportSha256: hash,
    screenshots: [{ sha256: hash }],
    release,
    counts: { models: 20 },
  };
  const prior = { ...current, localRunId: otherRun };
  expect(() =>
    assertManualComparisonReceipt(prior, current, request()),
  ).not.toThrow();
  expect(() =>
    assertManualComparisonReceipt(current, current, request()),
  ).toThrow('DISTINCT');
  for (const delta of [
    { hostedCi: true },
    { reportSha256: 'bad' },
    { screenshots: [] },
    { counts: { models: 19 } },
  ])
    expect(() =>
      assertManualComparisonReceipt({ ...prior, ...delta }, current, request()),
    ).toThrow('BINDING');
});

it('rejects queued releases without jobs except the exact locally scheduled LASU worker', () => {
  const queued = { id: run, campus_id: 'lasu', status: 'queued' };
  expect(() =>
    assertNoConflictingReleases([], 'lasu', undefined),
  ).not.toThrow();
  expect(() =>
    assertNoConflictingReleases([queued], 'lasu', run),
  ).not.toThrow();
  expect(() =>
    assertNoConflictingReleases([queued], 'lasu', undefined),
  ).toThrow('ACTIVE_RELEASES');
  expect(() => assertNoConflictingReleases([queued], 'lasu', otherRun)).toThrow(
    'ACTIVE_RELEASES',
  );
  expect(() =>
    assertNoConflictingReleases(
      [{ ...queued, status: 'building' }],
      'lasu',
      run,
    ),
  ).toThrow('ACTIVE_RELEASES');
  expect(() =>
    assertNoConflictingReleases(
      [{ ...queued, campus_id: 'unilag' }],
      'unilag',
      run,
    ),
  ).toThrow('ACTIVE_RELEASES');
  expect(() =>
    assertNoConflictingReleases([queued, queued], 'lasu', run),
  ).toThrow('ACTIVE_RELEASES');
});
