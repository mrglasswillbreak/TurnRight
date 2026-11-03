import { expect, it } from 'vitest';
import { evidenceHash } from '../../scripts/cloud.mjs';
import { digest, proposalIds } from '../../scripts/model-proposal-plan.mts';
import {
  verifyAppliedReceipt,
  verifySavedOperation,
  type Operation,
  type Receipt,
} from '../../scripts/model-proposal-reconciliation-input.mts';
import type { GisSnapshot } from '../server/gis-publication';
import type { MapEdit } from '../src/types';

const owner = '11111111-1111-4111-8111-111111111111';
const operationId = '22222222-2222-4222-8222-222222222222';
const sourceSha = 'a'.repeat(64);
const run = '41303133195';
const assetId = (i: number) =>
  `33333333-3333-4333-8333-${String(i).padStart(12, '0')}`;

function fixture() {
  const edits: MapEdit[] = proposalIds.map((id, i) => ({
    id,
    kind: 'building',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [3.2, 6.4],
          [3.3, 6.4],
          [3.3, 6.5],
          [3.2, 6.4],
        ],
      ],
    },
    properties: { name: `Building ${i}`, height: 12, mapLayerId: 'original' },
    deleted: false,
    updated_at: '2026-11-01T00:00:00Z',
  }));
  const before: GisSnapshot = { features: [], edits };
  const changes = edits.map((edit, i) => ({
    id: edit.id,
    slug: `building-${i}`,
    bytes: 2048 + i,
    sha256: sourceSha,
    revision: `model1-${sourceSha}`,
    expectedUpdatedAt: edit.updated_at!,
    previousModel: null,
  }));
  const plan = {
    campus: 'lasu',
    baseline: 'lasu-current',
    archiveSha256: 'b'.repeat(64),
    releaseAssetId: '123456789',
    repository: 'example/campus',
    publication: { version: 'lasu-current', manifestSha256: 'c'.repeat(64) },
    owner,
    originalOwnerOverride: true,
    overrideReason: 'Explicit recorded decision',
    changes,
  };
  const receipt: Receipt = {
    ...plan,
    operation: 'apply',
    githubRun: run,
    operationId,
    batchSaved: true,
    modelsValidated: 20,
    verifiedPrivateModels: 20,
    expectedHash: 'd'.repeat(64),
    planHash: evidenceHash(plan),
    backup: {
      storagePath: `lasu/${operationId}/model-proposals-before.json`,
      sha256: 'e'.repeat(64),
    },
  };
  const request = edits.map((prior, i) => {
    const edit = structuredClone(prior);
    edit.properties.modelDocumentAsset = {
      id: assetId(i),
      version: 1,
      sha256: changes[i].sha256,
      bytes: changes[i].bytes,
    };
    edit.properties.reviewedModelRevision = changes[i].revision;
    return { edit, expectedUpdatedAt: prior.updated_at! };
  });
  const operation: Operation = {
    id: operationId,
    campus_id: 'lasu',
    actor: owner,
    request,
    result: request.map(({ edit }) => ({
      ...structuredClone(edit),
      updated_at: '2026-11-01T01:00:00Z',
    })),
  };
  return { receipt, before, operation };
}

function verify(receipt: Receipt) {
  const bytes = Buffer.from(JSON.stringify(receipt));
  return verifyAppliedReceipt(bytes, run, digest(bytes));
}

it('binds all 20 exact sources to the recorded plan and saved operation', () => {
  const { receipt, before, operation } = fixture();
  expect(verify(receipt)).toEqual(receipt);
  expect(() => verifySavedOperation(receipt, before, operation)).not.toThrow();
  expect(
    before.edits.every((edit) => !edit.properties.modelDocumentAsset),
  ).toBe(true);
});

it('rejects different raw receipt bytes, oversize inputs and another apply run', () => {
  const { receipt } = fixture();
  const bytes = Buffer.from(JSON.stringify(receipt));
  expect(() => verifyAppliedReceipt(bytes, run, 'f'.repeat(64))).toThrow(
    'RECEIPT_SHA',
  );
  const large = Buffer.alloc(65537, ' ');
  expect(() => verifyAppliedReceipt(large, run, digest(large))).toThrow(
    'RECEIPT_SHA',
  );
  expect(() => verifyAppliedReceipt(bytes, 'other', digest(bytes))).toThrow(
    'SAVED_RECEIPT',
  );
});

it.each([
  [
    'not saved',
    (r: Receipt) => {
      r.batchSaved = false;
    },
    'SAVED_RECEIPT',
  ],
  [
    'wrong operation',
    (r: Receipt) => {
      r.operation = 'prepare';
    },
    'SAVED_RECEIPT',
  ],
  [
    'partial verification',
    (r: Receipt) => {
      r.verifiedPrivateModels = 19;
    },
    'SAVED_RECEIPT',
  ],
  [
    'duplicate target',
    (r: Receipt) => {
      r.changes[1].id = r.changes[0].id;
    },
    'TARGET_IDS',
  ],
  [
    'invalid source hash',
    (r: Receipt) => {
      r.changes[0].sha256 = 'invalid';
    },
    'SOURCE_PIN',
  ],
  [
    'oversized source',
    (r: Receipt) => {
      r.changes[0].bytes = 26214401;
    },
    'SOURCE_PIN',
  ],
  [
    'changed source',
    (r: Receipt) => {
      r.changes[0].bytes += 1;
    },
    'PLAN_HASH',
  ],
  [
    'changed decision',
    (r: Receipt) => {
      r.overrideReason = 'Different decision';
    },
    'PLAN_HASH',
  ],
  [
    'changed publication',
    (r: Receipt) => {
      r.publication = { version: 'changed' };
    },
    'PLAN_HASH',
  ],
  [
    'unsafe backup path',
    (r: Receipt) => {
      r.backup.storagePath = 'lasu/../model-proposals-before.json';
    },
    'BACKUP_PATH',
  ],
] as const)(
  'rejects receipt %s despite a matching raw-byte hash',
  (_name, mutate, error) => {
    const { receipt } = fixture();
    mutate(receipt);
    expect(() => verify(receipt)).toThrow(error);
  },
);

it.each(['id', 'actor', 'campus_id'] as const)('pins operation %s', (key) => {
  const { receipt, before, operation } = fixture();
  operation[key] = 'different';
  expect(() => verifySavedOperation(receipt, before, operation)).toThrow(
    'OPERATION_IDENTITY',
  );
});

it.each(['request', 'result'] as const)(
  'rejects duplicated or incomplete %s targets',
  (key) => {
    const { receipt, before, operation } = fixture();
    if (key === 'request')
      operation.request[1] = structuredClone(operation.request[0]);
    else operation.result[1] = structuredClone(operation.result[0]);
    expect(() => verifySavedOperation(receipt, before, operation)).toThrow(
      key === 'request' ? 'OPERATION_TARGETS' : 'OPERATION_RESULTS',
    );
    operation[key].pop();
    expect(() => verifySavedOperation(receipt, before, operation)).toThrow(
      'OPERATION_SIZE',
    );
  },
);

it('requires exact pre-save edit revisions and previous model references', () => {
  const { receipt, before, operation } = fixture();
  before.edits[0].updated_at = 'changed';
  expect(() => verifySavedOperation(receipt, before, operation)).toThrow(
    'ORIGINAL_REVISION',
  );
  before.edits[0].updated_at = receipt.changes[0].expectedUpdatedAt!;
  before.edits[0].properties.modelDocumentAsset = {
    id: assetId(99),
    version: 1,
    bytes: 500,
    sha256: 'f'.repeat(64),
  };
  expect(() => verifySavedOperation(receipt, before, operation)).toThrow(
    'PREVIOUS_MODEL_REFERENCE',
  );
});

it('rejects altered source pins or review fingerprints in the saved request', () => {
  const { receipt, before, operation } = fixture();
  operation.request[0].edit.properties.modelDocumentAsset!.sha256 = 'f'.repeat(
    64,
  );
  expect(() => verifySavedOperation(receipt, before, operation)).toThrow(
    'OPERATION_MODEL_REFERENCE',
  );
  operation.request[0].edit.properties.modelDocumentAsset!.sha256 = sourceSha;
  operation.request[0].edit.properties.reviewedModelRevision = 'model1-other';
  expect(() => verifySavedOperation(receipt, before, operation)).toThrow(
    'OPERATION_MODEL_REFERENCE',
  );
});

it.each([
  [
    'name',
    (e: MapEdit) => {
      e.properties.name = 'Unexpected';
    },
  ],
  [
    'layer',
    (e: MapEdit) => {
      e.properties.mapLayerId = 'different';
    },
  ],
  [
    'geometry',
    (e: MapEdit) => {
      e.geometry = { type: 'Point', coordinates: [3.2, 6.4] };
    },
  ],
  [
    'deletion',
    (e: MapEdit) => {
      e.deleted = true;
    },
  ],
] as const)(
  'rejects non-model %s changes even when request and result agree',
  (_name, mutate) => {
    const { receipt, before, operation } = fixture();
    mutate(operation.request[0].edit);
    operation.result[0] = structuredClone(operation.request[0].edit);
    expect(() => verifySavedOperation(receipt, before, operation)).toThrow(
      'UNEXPECTED_REQUEST_CHANGE',
    );
  },
);

it('rejects result content that differs from the pinned request', () => {
  const { receipt, before, operation } = fixture();
  operation.result[0].properties.name = 'Changed during save';
  expect(() => verifySavedOperation(receipt, before, operation)).toThrow(
    'OPERATION_RESULT_CONTENT',
  );
});
