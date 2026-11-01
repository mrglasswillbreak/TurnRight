/** Pure guards binding one saved operation to its exact verified apply receipt. */
import type { ModelAssetReference } from '../web/src/model-document';
import type { MapEdit } from '../web/src/types';
import type { GisSnapshot } from '../web/server/gis-publication';
import { validModelReference } from '../web/server/model-assets';
import { evidenceHash } from './cloud.mjs';
import { digest, proposalIds } from './model-proposal-plan.mts';

interface Change {
  id: string;
  slug: string;
  bytes: number;
  sha256: string;
  revision: string;
  expectedUpdatedAt: string | null;
  previousModel: ModelAssetReference | null;
}
export interface Receipt extends Record<string, unknown> {
  operation: string;
  campus: string;
  githubRun: string;
  owner: string;
  operationId: string;
  batchSaved: boolean;
  modelsValidated: number;
  verifiedPrivateModels: number;
  expectedHash: string;
  planHash: string;
  archiveSha256: string;
  baseline: string;
  changes: Change[];
  backup: { storagePath: string; sha256: string };
}
interface Item {
  edit: MapEdit;
  expectedUpdatedAt: string | null;
}
export interface Operation {
  id: string;
  campus_id: string;
  actor: string;
  request: Item[];
  result: MapEdit[];
}
export const sha = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(value);
export function check(condition: unknown, code: string): asserts condition {
  if (!condition) throw Error(`DIAGNOSTIC_${code}`);
}
const content = (edit: MapEdit) => ({
  geometry: edit.geometry,
  properties: edit.properties,
  deleted: !!edit.deleted,
});
export const nonModel = (properties: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(properties).filter(
      ([key]) =>
        ![
          'modelDocument',
          'modelDocumentAsset',
          'reviewedModelRevision',
        ].includes(key),
    ),
  );
export function verifyAppliedReceipt(
  receiptBytes: Uint8Array,
  expectedRun: string,
  expectedSha: string,
): Receipt {
  check(
    receiptBytes.length <= 65536 && digest(receiptBytes) === expectedSha,
    'RECEIPT_SHA',
  );
  const receipt = JSON.parse(Buffer.from(receiptBytes).toString()) as Receipt;
  check(
    receipt.operation === 'apply' &&
      receipt.campus === 'lasu' &&
      receipt.githubRun === expectedRun &&
      receipt.batchSaved === true &&
      receipt.modelsValidated === 20 &&
      receipt.verifiedPrivateModels === 20,
    'SAVED_RECEIPT',
  );
  check(
    uuid(receipt.operationId) &&
      uuid(receipt.owner) &&
      sha(receipt.expectedHash) &&
      sha(receipt.planHash) &&
      sha(receipt.archiveSha256) &&
      sha(receipt.backup?.sha256),
    'RECEIPT_IDENTITIES',
  );
  check(
    Array.isArray(receipt.changes) &&
      receipt.changes.length === 20 &&
      evidenceHash(receipt.changes.map((change) => change.id).sort()) ===
        evidenceHash(proposalIds),
    'TARGET_IDS',
  );
  for (const change of receipt.changes)
    check(
      sha(change.sha256) &&
        Number.isSafeInteger(change.bytes) &&
        change.bytes > 0 &&
        change.bytes <= 26214400 &&
        typeof change.revision === 'string' &&
        change.revision.startsWith('model1-'),
      'SOURCE_PIN',
    );
  const planKeys = [
    'campus',
    'baseline',
    'archiveSha256',
    'releaseAssetId',
    'repository',
    'publication',
    'owner',
    'originalOwnerOverride',
    'overrideReason',
    'changes',
  ];
  check(
    evidenceHash(
      Object.fromEntries(planKeys.map((key) => [key, receipt[key]])),
    ) === receipt.planHash,
    'PLAN_HASH',
  );
  check(
    /^lasu\/[a-f\d-]{36}\/model-proposals-before\.json$/.test(
      receipt.backup.storagePath,
    ),
    'BACKUP_PATH',
  );
  return receipt;
}
export function verifySavedOperation(
  receipt: Receipt,
  before: GisSnapshot,
  operation: Operation,
): void {
  check(
    operation.id === receipt.operationId &&
      operation.campus_id === 'lasu' &&
      operation.actor === receipt.owner,
    'OPERATION_IDENTITY',
  );
  check(
    Array.isArray(operation.request) &&
      Array.isArray(operation.result) &&
      operation.request.length === 20 &&
      operation.result.length === 20,
    'OPERATION_SIZE',
  );
  check(
    evidenceHash(
      operation.request
        .map((item) => `${item.edit.kind}:${item.edit.id}`)
        .sort(),
    ) === evidenceHash(proposalIds.map((id) => `building:${id}`)),
    'OPERATION_TARGETS',
  );
  check(
    evidenceHash(
      operation.result.map((edit) => `${edit.kind}:${edit.id}`).sort(),
    ) === evidenceHash(proposalIds.map((id) => `building:${id}`)),
    'OPERATION_RESULTS',
  );
  for (const item of operation.request) {
    const change = receipt.changes.find((entry) => entry.id === item.edit.id)!;
    const prior = before.edits.find(
      (edit) => edit.kind === 'building' && edit.id === change.id,
    );
    const result = operation.result.find(
      (edit) => edit.kind === 'building' && edit.id === change.id,
    )!;
    const ref = item.edit.properties.modelDocumentAsset;
    check(
      prior &&
        prior.updated_at === change.expectedUpdatedAt &&
        item.expectedUpdatedAt === change.expectedUpdatedAt,
      'ORIGINAL_REVISION',
    );
    check(
      ref &&
        validModelReference(ref) &&
        ref.sha256 === change.sha256 &&
        ref.bytes === change.bytes &&
        item.edit.properties.reviewedModelRevision === change.revision &&
        !item.edit.properties.modelDocument,
      'OPERATION_MODEL_REFERENCE',
    );
    check(
      evidenceHash(prior.properties.modelDocumentAsset || null) ===
        evidenceHash(change.previousModel),
      'PREVIOUS_MODEL_REFERENCE',
    );
    check(
      evidenceHash({
        geometry: prior.geometry,
        properties: nonModel(prior.properties),
        deleted: !!prior.deleted,
      }) ===
        evidenceHash({
          geometry: item.edit.geometry,
          properties: nonModel(item.edit.properties),
          deleted: !!item.edit.deleted,
        }),
      'UNEXPECTED_REQUEST_CHANGE',
    );
    check(
      evidenceHash(content(result)) === evidenceHash(content(item.edit)),
      'OPERATION_RESULT_CONTENT',
    );
  }
}
