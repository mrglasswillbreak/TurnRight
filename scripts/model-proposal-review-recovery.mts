/** Guarded continuation of a saved batch. Mutations are limited to the existing review API. */
import { createHash } from 'node:crypto';
import { evidenceHash } from './cloud.mjs';
import { proposalIds } from './model-proposal-inventory.mts';
import type {
  Receipt,
  Operation,
} from './model-proposal-reconciliation-input.mts';
import type { GisSnapshot } from '../web/server/gis-publication';
export interface RecoveryPin {
  apply_run_id: string;
  apply_artifact_id: string;
  receipt_sha256: string;
  reconciliation_run_id: string;
  reconciliation_artifact_id: string;
  reconciliation_sha256: string;
  expected_workspace_hash: string;
  review_operation_id: string;
}
export interface ReconciliationProof {
  [key: string]: unknown;
  operation: string;
  status: string;
  githubRun: string;
  stableRead: boolean;
  noRemoteWrites: boolean;
  reviewSubmitted: boolean;
  approvalRecorded: boolean;
  publicationRequested: boolean;
  pins: Record<string, string>;
  currentHash: string;
  backup: { verified: boolean; canonicalSha256: string; snapshotHash: string };
  comparison: {
    ok: boolean;
    beforeHash: string;
    currentHash: string;
    targetCount: number;
    differenceCount: number;
    differences: unknown[];
  };
  operationReceipt: {
    verified: boolean;
    actorMatchesPinnedOwner: boolean;
    requestHash: string;
    resultHash: string;
    count: number;
    targetResultMatchesCurrent: { id: string; matches: boolean }[];
  };
  sources: {
    id: string;
    referenceId: string;
    sha256: string;
    bytes: number;
    revision: string;
    verified: boolean;
    currentAttachmentMatches: boolean;
  }[];
  publishedCatalogueMatchesApply: boolean;
  publishedVersion: string;
  publicationValidation: {
    passed: boolean;
    modelCount: number;
    geometryUnchanged: boolean;
    graphUnchanged: boolean;
    photosUnchanged: boolean;
    placesUnchanged: boolean;
  };
  publicProjection: {
    beforeProtectedHash: string;
    currentProtectedHash: string;
    count: number;
    differences: unknown[];
    strippedOnly: string[];
  };
}
export interface ReviewRecoveryDependencies {
  db: (route: string, method?: string, body?: unknown) => Promise<unknown>;
  publicationBaseline: () => Promise<unknown>;
  review: (
    actor: string,
    action: string,
    payload: Record<string, unknown>,
  ) => Promise<unknown>;
  saveReceipt: (receipt: Record<string, unknown>) => Promise<void>;
}
const sha = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(value);
const hash = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
function requireRecovery(condition: unknown, code: string): asserts condition {
  if (!condition) throw Error(`RECOVERY_${code}`);
}
const sameIds = (rows: { id: string }[]) =>
  Array.isArray(rows) &&
  rows.length === 20 &&
  evidenceHash(rows.map((row) => row.id).sort()) === evidenceHash(proposalIds);
export function reviewRecoveryPin(
  inputs: Record<string, unknown>,
  ref: string,
): RecoveryPin {
  requireRecovery(
    ref === 'refs/heads/main' &&
      inputs.operation === 'resume-review' &&
      inputs.upgrade === 'models' &&
      inputs.campus_id === 'lasu',
    'MAIN_REVIEW_ONLY',
  );
  requireRecovery(
    typeof inputs.reconciliation_pin === 'string',
    'PIN_REQUIRED',
  );
  const pin = JSON.parse(inputs.reconciliation_pin) as RecoveryPin;
  const keys = [
    'apply_run_id',
    'apply_artifact_id',
    'receipt_sha256',
    'reconciliation_run_id',
    'reconciliation_artifact_id',
    'reconciliation_sha256',
    'expected_workspace_hash',
    'review_operation_id',
  ];
  requireRecovery(
    Object.keys(pin).sort().join() === keys.sort().join(),
    'PIN_FIELDS',
  );
  requireRecovery(
    [
      pin.apply_run_id,
      pin.apply_artifact_id,
      pin.reconciliation_run_id,
      pin.reconciliation_artifact_id,
    ].every((value) => typeof value === 'string' && /^\d+$/.test(value)),
    'ARTIFACT_IDENTITIES',
  );
  requireRecovery(
    sha(pin.receipt_sha256) &&
      sha(pin.reconciliation_sha256) &&
      sha(pin.expected_workspace_hash) &&
      uuid(pin.review_operation_id),
    'PIN_IDENTITIES',
  );
  return pin;
}
function proofContent(
  receipt: Receipt,
  proof: ReconciliationProof,
  pin: RecoveryPin,
) {
  requireRecovery(
    receipt.originalOwnerOverride === true &&
      typeof receipt.overrideReason === 'string' &&
      receipt.overrideReason === receipt.overrideReason.trim() &&
      receipt.overrideReason.length >= 5 &&
      receipt.overrideReason.length <= 1000,
    'ORIGINAL_OWNER_DECISION',
  );
  requireRecovery(
    proof.operation === 'inspect' &&
      proof.status === 'inspected-exact-derived-revisions' &&
      proof.githubRun === pin.reconciliation_run_id &&
      proof.stableRead === true &&
      proof.noRemoteWrites === true &&
      proof.reviewSubmitted === false &&
      proof.approvalRecorded === false &&
      proof.publicationRequested === false &&
      !proof.failure,
    'COMPLETE_READ_ONLY_PROOF',
  );
  const sourceSetHash = evidenceHash(
    receipt.changes
      .map(({ id, bytes, sha256, revision }) => ({
        id,
        bytes,
        sha256,
        revision,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
  const expectedPins = {
    apply_run_id: pin.apply_run_id,
    apply_artifact_id: pin.apply_artifact_id,
    receipt_sha256: pin.receipt_sha256,
    operationId: receipt.operationId,
    expectedBeforeHash: receipt.expectedHash,
    planHash: receipt.planHash,
    archiveSha256: receipt.archiveSha256,
    backupCanonicalSha256: receipt.backup.sha256,
    sourceSetHash,
  };
  requireRecovery(
    evidenceHash(proof.pins) === evidenceHash(expectedPins),
    'PROOF_APPLY_BINDING',
  );
  requireRecovery(
    proof.backup?.verified === true &&
      proof.backup.canonicalSha256 === receipt.backup.sha256 &&
      sha(proof.backup.snapshotHash),
    'PROOF_BACKUP',
  );
  requireRecovery(
    proof.currentHash === pin.expected_workspace_hash &&
      proof.comparison?.ok === true &&
      proof.comparison.targetCount === 20 &&
      proof.comparison.differenceCount === 0 &&
      proof.comparison.differences.length === 0 &&
      proof.comparison.beforeHash === proof.backup.snapshotHash &&
      sha(proof.comparison.currentHash),
    'PROOF_WORKSPACE',
  );
  const operation = proof.operationReceipt;
  requireRecovery(
    operation?.verified === true &&
      operation.actorMatchesPinnedOwner === true &&
      operation.count === 20 &&
      sha(operation.requestHash) &&
      sha(operation.resultHash) &&
      sameIds(operation.targetResultMatchesCurrent) &&
      operation.targetResultMatchesCurrent.every((row) => row.matches === true),
    'PROOF_OPERATION',
  );
  requireRecovery(sameIds(proof.sources), 'PROOF_SOURCE_SET');
  for (const source of proof.sources) {
    const expected = receipt.changes.find((change) => change.id === source.id)!;
    requireRecovery(
      source.verified === true &&
        source.currentAttachmentMatches === true &&
        uuid(source.referenceId) &&
        source.sha256 === expected.sha256 &&
        source.bytes === expected.bytes &&
        source.revision === expected.revision,
      'PROOF_SOURCE',
    );
  }
  const publication = proof.publicationValidation,
    projection = proof.publicProjection;
  requireRecovery(
    proof.publishedCatalogueMatchesApply === true &&
      proof.publishedVersion === receipt.baseline &&
      publication?.passed === true &&
      publication.modelCount === 20 &&
      publication.geometryUnchanged === true &&
      publication.graphUnchanged === true &&
      publication.photosUnchanged === true &&
      publication.placesUnchanged === true,
    'PROOF_PUBLICATION',
  );
  requireRecovery(
    projection?.count === 0 &&
      projection.differences.length === 0 &&
      sha(projection.beforeProtectedHash) &&
      projection.beforeProtectedHash === projection.currentProtectedHash &&
      evidenceHash(projection.strippedOnly) ===
        evidenceHash([
          'modelDocument',
          'modelDocumentAsset',
          'reviewedModelRevision',
        ]),
    'PROOF_PUBLIC_PROJECTION',
  );
}
export function verifyReconciliationProof(
  receipt: Receipt,
  proofBytes: Uint8Array,
  pin: RecoveryPin,
): ReconciliationProof {
  requireRecovery(
    proofBytes.length <= 2 * 1024 * 1024 &&
      hash(proofBytes) === pin.reconciliation_sha256,
    'PROOF_SHA',
  );
  const proof = JSON.parse(
    Buffer.from(proofBytes).toString(),
  ) as ReconciliationProof;
  proofContent(receipt, proof, pin);
  return proof;
}
interface Review {
  id: string;
  campus_id: string;
  status: string;
  content_hash: string;
  submitted_by: string;
  reviewed_by: string | null;
  reason: string | null;
}
export async function resumeModelReview(
  receipt: Receipt,
  proof: ReconciliationProof,
  pin: RecoveryPin,
  dependencies: ReviewRecoveryDependencies,
) {
  proofContent(receipt, proof, pin);
  const { db, publicationBaseline, review, saveReceipt } = dependencies;
  const read = async <T,>(route: string, method = 'GET', body?: unknown) => {
    requireRecovery(
      method === 'GET'
        ? ['admin_users', 'editor_operations', 'gis_reviews'].includes(
            route.split('?')[0],
          )
        : method === 'POST' &&
            [
              'rpc/workspace_can',
              'rpc/gis_workspace_content_hash',
              'rpc/gis_workspace_snapshot',
            ].includes(route),
      'READ_ROUTE',
    );
    return (await db(route, method, body)) as T;
  };
  const output: Record<string, unknown> = {
    operation: 'resume-review',
    campus: 'lasu',
    status: 'preflight',
    originalApplyOperationId: receipt.operationId,
    reviewOperationId: pin.review_operation_id,
    expectedWorkspaceHash: pin.expected_workspace_hash,
    applyReceiptSha256: pin.receipt_sha256,
    reconciliationSha256: pin.reconciliation_sha256,
    planHash: receipt.planHash,
    changes: receipt.changes.map(({ id, slug, sha256, bytes, revision }) => ({
      id,
      slug,
      sha256,
      bytes,
      revision,
    })),
    modelWritesPerformed: false,
    publicationRequested: false,
    noRemoteWrites: true,
    originalOwnerOverride: true,
    reason: receipt.overrideReason,
  };
  await saveReceipt(output);
  const owners = await read<{ id: string }[]>('admin_users?select=id&limit=2');
  requireRecovery(
    owners.length === 1 && owners[0].id === receipt.owner && uuid(owners[0].id),
    'ORIGINAL_OWNER',
  );
  const owner = owners[0].id;
  for (const capability of ['edit', 'review'])
    requireRecovery(
      (await read('rpc/workspace_can', 'POST', {
        actor: owner,
        capability,
        campus: 'lasu',
      })) === true,
      'CAPABILITY',
    );
  const reviewRoute = `gis_reviews?id=eq.${pin.review_operation_id}&select=id,campus_id,status,content_hash,submitted_by,reviewed_by,reason&limit=2`;
  requireRecovery(
    (await read<Review[]>(reviewRoute)).length === 0,
    'REVIEW_ID_EXISTS_INSPECT_FIRST',
  );
  const assertCurrent = async () => {
    requireRecovery(
      evidenceHash(await publicationBaseline()) ===
        evidenceHash(receipt.publication),
      'PUBLISHED_BASELINE_CHANGED',
    );
    requireRecovery(
      (await read('rpc/gis_workspace_content_hash', 'POST', {})) ===
        pin.expected_workspace_hash,
      'WORKSPACE_CHANGED',
    );
  };
  await assertCurrent();
  const current = await read<GisSnapshot>(
    'rpc/gis_workspace_snapshot',
    'POST',
    {},
  );
  requireRecovery(
    evidenceHash(current) === proof.comparison.currentHash,
    'SNAPSHOT_CHANGED',
  );
  const operations = await read<Operation[]>(
    `editor_operations?id=eq.${receipt.operationId}&select=id,campus_id,actor,request,result&limit=2`,
  );
  requireRecovery(operations.length === 1, 'OPERATION_MISSING');
  const operation = operations[0];
  requireRecovery(
    operation.id === receipt.operationId &&
      operation.actor === owner &&
      operation.campus_id === 'lasu' &&
      evidenceHash(operation.request) === proof.operationReceipt.requestHash &&
      evidenceHash(operation.result) === proof.operationReceipt.resultHash,
    'OPERATION_CHANGED',
  );
  requireRecovery(
    sameIds(operation.result) &&
      sameIds(operation.request.map((item) => item.edit)),
    'OPERATION_TARGETS',
  );
  for (const result of operation.result) {
    const rows = current.edits.filter(
      (edit) => edit.kind === 'building' && edit.id === result.id,
    );
    const source = proof.sources.find((item) => item.id === result.id)!;
    const reference = result.properties.modelDocumentAsset;
    requireRecovery(
      result.kind === 'building' &&
        rows.length === 1 &&
        evidenceHash(rows[0]) === evidenceHash(result),
      'TARGET_ROW_CHANGED',
    );
    requireRecovery(
      reference?.version === 1 &&
        reference.id === source.referenceId &&
        reference.sha256 === source.sha256 &&
        reference.bytes === source.bytes &&
        result.properties.reviewedModelRevision === source.revision &&
        !result.deleted,
      'TARGET_SOURCE_CHANGED',
    );
  }
  await assertCurrent();
  Object.assign(output, {
    guardsPassed: true,
    originalOwnerVerified: true,
    noRemoteWrites: false,
    status: 'submission-requested',
    submissionMayHaveStarted: true,
  });
  await saveReceipt(output);
  const summary =
    'LASU Ojo: continue review of the verified 20-model batch after read-only reconciliation confirmed only expected GIS dataset counters. Existing 614-building baseline, routing and photographs preserved; dimensions remain estimates; 3 holds and 4 gaps remain.';
  const assertReview = (value: unknown, status: string) => {
    const saved = value as Review;
    requireRecovery(
      saved &&
        saved.id === pin.review_operation_id &&
        saved.campus_id === 'lasu' &&
        saved.status === status &&
        saved.content_hash === pin.expected_workspace_hash &&
        saved.submitted_by === owner,
      'REVIEW_READBACK',
    );
    if (status === 'approved')
      requireRecovery(
        saved.reviewed_by === owner && saved.reason === receipt.overrideReason,
        'APPROVAL_READBACK',
      );
    else
      requireRecovery(
        saved.reviewed_by === null && saved.reason === null,
        'SUBMISSION_READBACK',
      );
    return {
      id: saved.id,
      status: saved.status,
      contentHash: saved.content_hash,
    };
  };
  output.review = assertReview(
    await review(owner, 'gis-review-submit', {
      operationId: pin.review_operation_id,
      summary,
    }),
    'submitted',
  );
  const submitted = await read<Review[]>(reviewRoute);
  requireRecovery(submitted.length === 1, 'SUBMITTED_REVIEW_MISSING');
  output.review = assertReview(submitted[0], 'submitted');
  Object.assign(output, { status: 'submitted', submissionConfirmed: true });
  await saveReceipt(output);
  await assertCurrent();
  Object.assign(output, {
    status: 'approval-requested',
    approvalMayHaveStarted: true,
  });
  await saveReceipt(output);
  output.review = assertReview(
    await review(owner, 'gis-review-decide', {
      id: pin.review_operation_id,
      approve: true,
      override: true,
      reason: receipt.overrideReason,
    }),
    'approved',
  );
  const approved = await read<Review[]>(reviewRoute);
  requireRecovery(approved.length === 1, 'APPROVED_REVIEW_MISSING');
  output.review = assertReview(approved[0], 'approved');
  await assertCurrent();
  Object.assign(output, {
    status: 'approved',
    approvalConfirmed: true,
    workspaceHash: pin.expected_workspace_hash,
  });
  await saveReceipt(output);
  return output;
}
