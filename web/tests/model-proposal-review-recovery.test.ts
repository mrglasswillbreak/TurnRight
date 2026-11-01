import { expect, it } from 'vitest';
import { digest } from '../../scripts/model-proposal-plan.mts';
import {
  reviewRecoveryPin,
  verifyReconciliationProof,
  type ReconciliationProof,
} from '../../scripts/model-proposal-review-recovery.mts';
import {
  fixture,
  harness,
  inputs,
  operationId,
  owner,
  reviewId,
  sha,
  verify,
} from './model-proposal-review-fixture';

it('requires explicit main-only LASU review continuation and exact pin fields', () => {
  const { pin } = fixture();
  expect(reviewRecoveryPin(inputs(pin), 'refs/heads/main')).toEqual(pin);
  expect(() => reviewRecoveryPin(inputs(pin), 'refs/heads/feature')).toThrow(
    'MAIN_REVIEW_ONLY',
  );
  expect(() =>
    reviewRecoveryPin(
      { ...inputs(pin), operation: 'apply' },
      'refs/heads/main',
    ),
  ).toThrow('MAIN_REVIEW_ONLY');
  expect(() =>
    reviewRecoveryPin(
      {
        ...inputs(pin),
        reconciliation_pin: JSON.stringify({ ...pin, extra: true }),
      },
      'refs/heads/main',
    ),
  ).toThrow('PIN_FIELDS');
  expect(() =>
    reviewRecoveryPin(
      inputs({ ...pin, review_operation_id: 'invalid' }),
      'refs/heads/main',
    ),
  ).toThrow('PIN_IDENTITIES');
});

it('requires the exact bounded raw proof bytes', () => {
  const f = fixture(),
    bytes = Buffer.from(JSON.stringify(f.proof));
  expect(verifyReconciliationProof(f.receipt, bytes, f.pin)).toEqual(f.proof);
  expect(() =>
    verifyReconciliationProof(
      f.receipt,
      Buffer.concat([bytes, Buffer.from(' ')]),
      f.pin,
    ),
  ).toThrow('PROOF_SHA');
  const oversized = Buffer.alloc(2 * 1024 * 1024 + 1, ' ');
  expect(() =>
    verifyReconciliationProof(f.receipt, oversized, {
      ...f.pin,
      reconciliation_sha256: digest(oversized),
    }),
  ).toThrow('PROOF_SHA');
});

it.each([
  [
    'incomplete diagnostic',
    (p: ReconciliationProof) => {
      p.status = 'inspection-failed';
    },
    'COMPLETE_READ_ONLY_PROOF',
  ],
  [
    'unstable read',
    (p: ReconciliationProof) => {
      p.stableRead = false;
    },
    'COMPLETE_READ_ONLY_PROOF',
  ],
  [
    'already approved',
    (p: ReconciliationProof) => {
      p.approvalRecorded = true;
    },
    'COMPLETE_READ_ONLY_PROOF',
  ],
  [
    'different apply',
    (p: ReconciliationProof) => {
      p.pins.apply_run_id = '999';
    },
    'PROOF_APPLY_BINDING',
  ],
  [
    'wrong backup',
    (p: ReconciliationProof) => {
      p.backup.canonicalSha256 = sha('9');
    },
    'PROOF_BACKUP',
  ],
  [
    'workspace differences',
    (p: ReconciliationProof) => {
      p.comparison.differenceCount = 1;
    },
    'PROOF_WORKSPACE',
  ],
  [
    'result mismatch',
    (p: ReconciliationProof) => {
      p.operationReceipt.targetResultMatchesCurrent[0].matches = false;
    },
    'PROOF_OPERATION',
  ],
  [
    'duplicate source',
    (p: ReconciliationProof) => {
      p.sources[1] = p.sources[0];
    },
    'PROOF_SOURCE_SET',
  ],
  [
    'source changed',
    (p: ReconciliationProof) => {
      p.sources[0].sha256 = sha('9');
    },
    'PROOF_SOURCE',
  ],
  [
    'changed routing',
    (p: ReconciliationProof) => {
      p.publicationValidation.graphUnchanged = false;
    },
    'PROOF_PUBLICATION',
  ],
  [
    'projection changed',
    (p: ReconciliationProof) => {
      p.publicProjection.currentProtectedHash = sha('9');
    },
    'PROOF_PUBLIC_PROJECTION',
  ],
  [
    'extra excluded property',
    (p: ReconciliationProof) => {
      p.publicProjection.strippedOnly.push('height');
    },
    'PROOF_PUBLIC_PROJECTION',
  ],
] as const)(
  'rejects %s even with a matching proof SHA',
  (_name, mutate, error) => {
    const f = fixture();
    mutate(f.proof);
    expect(() => verify(f)).toThrow(error);
  },
);

it('rejects proof without the exact original-owner decision', () => {
  const f = fixture();
  f.receipt.originalOwnerOverride = false;
  expect(() => verify(f)).toThrow('ORIGINAL_OWNER_DECISION');
  f.receipt.originalOwnerOverride = true;
  f.receipt.overrideReason = ' ';
  expect(() => verify(f)).toThrow('ORIGINAL_OWNER_DECISION');
});

it('only submits and approves through normal review actions after durable guarded receipts', async () => {
  const h = harness(),
    output = await h.run();
  expect(output).toMatchObject({
    status: 'approved',
    modelWritesPerformed: false,
    publicationRequested: false,
    originalApplyOperationId: operationId,
    reviewOperationId: reviewId,
    approvalConfirmed: true,
    workspaceHash: h.pin.expected_workspace_hash,
  });
  expect(h.deps.review).toHaveBeenCalledTimes(2);
  expect(h.deps.review.mock.calls[1]).toEqual([
    owner,
    'gis-review-decide',
    {
      id: reviewId,
      approve: true,
      override: true,
      reason: h.receipt.overrideReason,
    },
  ]);
  expect(h.events).toEqual([
    'save:preflight',
    'save:submission-requested',
    'review:gis-review-submit',
    'save:submitted',
    'save:approval-requested',
    'review:gis-review-decide',
    'save:approved',
  ]);
  expect(
    h.deps.db.mock.calls.every(
      ([route, method]) =>
        method === 'GET' ||
        (method === 'POST' &&
          [
            'rpc/workspace_can',
            'rpc/gis_workspace_content_hash',
            'rpc/gis_workspace_snapshot',
          ].includes(route)),
    ),
  ).toBe(true);
});

it.each([
  [
    'ambiguous owner',
    (h: ReturnType<typeof harness>) => {
      h.state.owners.push({ id: owner });
    },
    'ORIGINAL_OWNER',
  ],
  [
    'missing capability',
    (h: ReturnType<typeof harness>) => {
      h.state.allowed = false;
    },
    'CAPABILITY',
  ],
  [
    'existing review',
    (h: ReturnType<typeof harness>) => {
      h.state.reviews.push({
        id: reviewId,
        campus_id: 'lasu',
        status: 'submitted',
        content_hash: h.pin.expected_workspace_hash,
        submitted_by: owner,
        reviewed_by: null,
        reason: null,
      });
    },
    'REVIEW_ID_EXISTS_INSPECT_FIRST',
  ],
  [
    'changed baseline',
    (h: ReturnType<typeof harness>) => {
      h.state.baseline = {};
    },
    'PUBLISHED_BASELINE_CHANGED',
  ],
  [
    'changed hash',
    (h: ReturnType<typeof harness>) => {
      h.state.workspaceHash = sha('9');
    },
    'WORKSPACE_CHANGED',
  ],
  [
    'changed snapshot',
    (h: ReturnType<typeof harness>) => {
      h.state.current.edits[0].properties.name = 'Changed';
    },
    'SNAPSHOT_CHANGED',
  ],
  [
    'missing operation',
    (h: ReturnType<typeof harness>) => {
      h.state.operations = [];
    },
    'OPERATION_MISSING',
  ],
  [
    'changed saved operation',
    (h: ReturnType<typeof harness>) => {
      h.state.operations[0].request[0].edit.properties.name = 'Changed';
    },
    'OPERATION_CHANGED',
  ],
] as const)('performs no mutation on %s', async (_name, mutate, error) => {
  const h = harness();
  mutate(h);
  await expect(h.run()).rejects.toThrow(error);
  expect(h.deps.review).not.toHaveBeenCalled();
  expect(h.saved[0]).toMatchObject({
    originalApplyOperationId: operationId,
    reviewOperationId: reviewId,
    noRemoteWrites: true,
  });
});

it('does not approve a submitted review with a different content hash', async () => {
  const h = harness();
  h.state.badSubmittedHash = true;
  await expect(h.run()).rejects.toThrow('REVIEW_READBACK');
  expect(h.deps.review).toHaveBeenCalledTimes(1);
  expect(h.saved.at(-1)).toMatchObject({
    status: 'submission-requested',
    submissionMayHaveStarted: true,
  });
});

it('rechecks the workspace before approval and leaves a recoverable submitted receipt', async () => {
  const h = harness();
  h.state.changedAfterSubmit = true;
  await expect(h.run()).rejects.toThrow('WORKSPACE_CHANGED');
  expect(h.deps.review).toHaveBeenCalledTimes(1);
  expect(h.saved.at(-1)).toMatchObject({
    status: 'submitted',
    submissionConfirmed: true,
    originalApplyOperationId: operationId,
  });
});

it.each(['gis-review-submit', 'gis-review-decide'])(
  'never retries uncertain %s and preserves operation identity',
  async (action) => {
    const h = harness();
    h.state.failAction = action;
    await expect(h.run()).rejects.toThrow('Transport failed');
    expect(
      h.deps.review.mock.calls.filter(([, name]) => name === action),
    ).toHaveLength(1);
    expect(h.saved.at(-1)).toMatchObject({
      originalApplyOperationId: operationId,
      reviewOperationId: reviewId,
      status:
        action === 'gis-review-submit'
          ? 'submission-requested'
          : 'approval-requested',
      modelWritesPerformed: false,
    });
  },
);

it('requires the actual approved owner and exact reason on readback', async () => {
  const h = harness();
  h.state.badApprovedReason = true;
  await expect(h.run()).rejects.toThrow('APPROVAL_READBACK');
  expect(h.deps.review).toHaveBeenCalledTimes(2);
  expect(h.saved.at(-1)).toMatchObject({
    status: 'approval-requested',
    approvalMayHaveStarted: true,
  });
});

it('does not start a review mutation if its preceding receipt cannot be saved', async () => {
  const h = harness();
  h.deps.saveReceipt
    .mockImplementationOnce(async () => {})
    .mockImplementationOnce(async () => {
      throw Error('Disk write failed');
    });
  await expect(h.run()).rejects.toThrow('Disk write failed');
  expect(h.deps.review).not.toHaveBeenCalled();
});
