import { expect, vi } from 'vitest';
import { evidenceHash } from '../../scripts/cloud.mjs';
import { proposalIds } from '../../scripts/model-proposal-inventory.mts';
import { digest } from '../../scripts/model-proposal-plan.mts';
import type {
  Receipt,
  Operation,
} from '../../scripts/model-proposal-reconciliation-input.mts';
import {
  resumeModelReview,
  verifyReconciliationProof,
  type RecoveryPin,
  type ReconciliationProof,
} from '../../scripts/model-proposal-review-recovery.mts';
import type { GisSnapshot } from '../server/gis-publication';

export const owner = '11111111-1111-4111-8111-111111111111';
export const operationId = '22222222-2222-4222-8222-222222222222';
export const reviewId = '33333333-3333-4333-8333-333333333333';
export const sha = (letter: string) => letter.repeat(64);

export function fixture() {
  const changes = proposalIds.map((id, i) => ({
    id,
    slug: `building-${i}`,
    bytes: 2000 + i,
    sha256: sha('a'),
    revision: `model1-${i}`,
    expectedUpdatedAt: 'before',
    previousModel: null,
  }));
  const receipt: Receipt = {
    operation: 'apply',
    campus: 'lasu',
    githubRun: '100',
    owner,
    operationId,
    batchSaved: true,
    modelsValidated: 20,
    verifiedPrivateModels: 20,
    expectedHash: sha('b'),
    planHash: sha('c'),
    archiveSha256: sha('d'),
    baseline: 'lasu-current',
    changes,
    backup: {
      storagePath: `lasu/${operationId}/model-proposals-before.json`,
      sha256: sha('e'),
    },
    originalOwnerOverride: true,
    overrideReason: 'Exact recorded owner reason',
    publication: { version: 'lasu-current', revision: 7 },
  };
  const result: Operation['result'] = changes.map((change, i) => ({
    id: change.id,
    kind: 'building',
    geometry: { type: 'Point', coordinates: [3.2, 6.4] },
    properties: {
      name: `Building ${i}`,
      reviewedModelRevision: change.revision,
      modelDocumentAsset: {
        id: `44444444-4444-4444-8444-${String(i).padStart(12, '0')}`,
        version: 1,
        bytes: change.bytes,
        sha256: change.sha256,
      },
    },
    updated_at: 'after',
    deleted: false,
  }));
  const operation: Operation = {
    id: operationId,
    campus_id: 'lasu',
    actor: owner,
    request: result.map((edit) => ({
      edit: structuredClone(edit),
      expectedUpdatedAt: 'before',
    })),
    result,
  };
  const current: GisSnapshot = { features: [], edits: structuredClone(result) };
  const pin: RecoveryPin = {
    apply_run_id: '100',
    apply_artifact_id: '101',
    receipt_sha256: sha('f'),
    reconciliation_run_id: '200',
    reconciliation_artifact_id: '201',
    reconciliation_sha256: '',
    expected_workspace_hash: sha('1'),
    review_operation_id: reviewId,
  };
  const proof: ReconciliationProof = {
    operation: 'inspect',
    status: 'inspected-exact-derived-revisions',
    githubRun: '200',
    stableRead: true,
    noRemoteWrites: true,
    reviewSubmitted: false,
    approvalRecorded: false,
    publicationRequested: false,
    pins: {
      apply_run_id: pin.apply_run_id,
      apply_artifact_id: pin.apply_artifact_id,
      receipt_sha256: pin.receipt_sha256,
      operationId,
      expectedBeforeHash: receipt.expectedHash,
      planHash: receipt.planHash,
      archiveSha256: receipt.archiveSha256,
      backupCanonicalSha256: receipt.backup.sha256,
      sourceSetHash: evidenceHash(
        changes
          .map(({ id, bytes, sha256, revision }) => ({
            id,
            bytes,
            sha256,
            revision,
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      ),
    },
    currentHash: pin.expected_workspace_hash,
    backup: {
      verified: true,
      canonicalSha256: receipt.backup.sha256,
      snapshotHash: sha('2'),
    },
    comparison: {
      ok: true,
      beforeHash: sha('2'),
      currentHash: evidenceHash(current),
      targetCount: 20,
      differenceCount: 0,
      differences: [],
    },
    operationReceipt: {
      verified: true,
      actorMatchesPinnedOwner: true,
      requestHash: evidenceHash(operation.request),
      resultHash: evidenceHash(result),
      count: 20,
      targetResultMatchesCurrent: proposalIds.map((id) => ({
        id,
        matches: true,
      })),
    },
    sources: result.map((edit, i) => ({
      id: edit.id,
      referenceId: edit.properties.modelDocumentAsset!.id,
      sha256: changes[i].sha256,
      bytes: changes[i].bytes,
      revision: changes[i].revision,
      verified: true,
      currentAttachmentMatches: true,
    })),
    publishedCatalogueMatchesApply: true,
    publishedVersion: receipt.baseline,
    publicationValidation: {
      passed: true,
      modelCount: 20,
      geometryUnchanged: true,
      graphUnchanged: true,
      photosUnchanged: true,
      placesUnchanged: true,
    },
    publicProjection: {
      beforeProtectedHash: sha('3'),
      currentProtectedHash: sha('3'),
      count: 0,
      differences: [],
      strippedOnly: [
        'modelDocument',
        'modelDocumentAsset',
        'reviewedModelRevision',
      ],
    },
  };
  pin.reconciliation_sha256 = digest(Buffer.from(JSON.stringify(proof)));
  return { receipt, pin, proof, current, operation };
}

export function inputs(pin: RecoveryPin) {
  return {
    operation: 'resume-review',
    upgrade: 'models',
    campus_id: 'lasu',
    reconciliation_pin: JSON.stringify(pin),
  };
}
export function verify(f: ReturnType<typeof fixture>) {
  const bytes = Buffer.from(JSON.stringify(f.proof));
  f.pin.reconciliation_sha256 = digest(bytes);
  return verifyReconciliationProof(f.receipt, bytes, f.pin);
}
export function harness() {
  const f = fixture();
  type Row = {
    id: string;
    campus_id: string;
    status: string;
    content_hash: string;
    submitted_by: string;
    reviewed_by: string | null;
    reason: string | null;
  };
  const state = {
    owners: [{ id: owner }],
    allowed: true,
    workspaceHash: f.pin.expected_workspace_hash,
    baseline: f.receipt.publication,
    current: f.current,
    operations: [f.operation],
    reviews: [] as Row[],
    failAction: '',
    changedAfterSubmit: false,
    badSubmittedHash: false,
    badApprovedReason: false,
  };
  const saved: Record<string, unknown>[] = [],
    events: string[] = [];
  const db = vi.fn(async (route: string, method = 'GET') => {
    if (route.startsWith('admin_users?') && method === 'GET')
      return state.owners;
    if (route.startsWith('editor_operations?') && method === 'GET')
      return state.operations;
    if (route.startsWith('gis_reviews?') && method === 'GET')
      return state.reviews;
    if (method !== 'POST') throw Error('Unexpected read route');
    if (route === 'rpc/workspace_can') return state.allowed;
    if (route === 'rpc/gis_workspace_content_hash') return state.workspaceHash;
    if (route === 'rpc/gis_workspace_snapshot') return state.current;
    throw Error('Unexpected RPC or mutation');
  });
  const review = vi.fn(
    async (actor: string, action: string, payload: Record<string, unknown>) => {
      events.push(`review:${action}`);
      expect(actor).toBe(owner);
      if (state.failAction === action)
        throw Error('Transport failed after request');
      const approved = action === 'gis-review-decide';
      expect(['gis-review-submit', 'gis-review-decide']).toContain(action);
      expect(approved ? payload.id : payload.operationId).toBe(reviewId);
      const row: Row = {
        id: reviewId,
        campus_id: 'lasu',
        status: approved ? 'approved' : 'submitted',
        content_hash:
          !approved && state.badSubmittedHash
            ? sha('9')
            : f.pin.expected_workspace_hash,
        submitted_by: owner,
        reviewed_by: approved ? owner : null,
        reason: approved
          ? state.badApprovedReason
            ? 'Wrong reason'
            : (f.receipt.overrideReason as string)
          : null,
      };
      state.reviews = [row];
      if (!approved && state.changedAfterSubmit) state.workspaceHash = sha('9');
      return row;
    },
  );
  const saveReceipt = vi.fn(async (record: Record<string, unknown>) => {
    events.push(`save:${record.status}`);
    saved.push(structuredClone(record));
  });
  const deps = {
    db,
    review,
    saveReceipt,
    publicationBaseline: vi.fn(async () => state.baseline),
  };
  return {
    ...f,
    state,
    saved,
    events,
    deps,
    run: () => resumeModelReview(f.receipt, f.proof, f.pin, deps),
  };
}
