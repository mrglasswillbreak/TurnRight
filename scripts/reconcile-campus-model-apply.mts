/** Read-only inspection of one pinned saved model operation. Never resumes it. */
import fs from 'node:fs/promises';
import { db } from '../web/server/backend';
import { withCampusId } from '../web/server/campus-scope';
import { readModelAsset } from '../web/server/model-assets';
import {
  publishedCampus,
  validateReleaseSnapshot,
} from '../web/server/release-validation';
import { modelDocumentRevision } from '../web/src/model-document-revision';
import type { GisSnapshot } from '../web/server/gis-publication';
import { evidenceHash } from './cloud.mjs';
import { proposalIds, protectedCampusHash } from './model-proposal-plan.mts';
import { verifiedPublicationBaseline } from './model-proposal-baseline.mts';
import { reconcileModelBatchReadback } from './model-proposal-reconciliation.mts';
import {
  check,
  sha,
  nonModel,
  verifyAppliedReceipt,
  verifySavedOperation,
  type Operation,
} from './model-proposal-reconciliation-input.mts';

const record: Record<string, unknown> = {
  operation: 'inspect',
  noRemoteWrites: true,
  reviewSubmitted: false,
  approvalRecorded: false,
  publicationRequested: false,
  startedAt: new Date().toISOString(),
  githubRun: process.env.GITHUB_RUN_ID || null,
};
let stage = 'input';
const save = async () => {
  await fs.mkdir('work', { recursive: true });
  await fs.writeFile(
    'work/lasu-model-reconciliation.json',
    JSON.stringify(record, null, 2),
  );
};
const read = <T,>(route: string, method = 'GET', body?: unknown) => {
  const allowed =
    method === 'GET'
      ? ['editor_operations', 'gis_feature_index'].includes(route.split('?')[0])
      : method === 'POST' &&
        [
          'rpc/gis_workspace_snapshot',
          'rpc/gis_workspace_content_hash',
          'rpc/gis_dataset_key',
        ].includes(route);
  check(allowed, 'READ_ROUTE');
  return db<T>(route, method, body);
};
function publicDifferences(before: unknown, current: unknown) {
  const differences: {
    path: string;
    beforeHash: string | null;
    currentHash: string | null;
    beforeRevision?: number;
    currentRevision?: number;
  }[] = [];
  let count = 0;
  const hash = (value: unknown) =>
    value === undefined ? null : evidenceHash(value);
  const visit = (a: unknown, b: unknown, pointer: string) => {
    if (hash(a) === hash(b)) return;
    if (
      a &&
      b &&
      typeof a === 'object' &&
      typeof b === 'object' &&
      Array.isArray(a) === Array.isArray(b)
    ) {
      const left = a as Record<string, unknown>,
        right = b as Record<string, unknown>;
      for (const key of new Set([...Object.keys(left), ...Object.keys(right)]))
        visit(
          left[key],
          right[key],
          `${pointer}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`,
        );
      return;
    }
    count++;
    if (differences.length < 100)
      differences.push({
        path: pointer,
        beforeHash: hash(a),
        currentHash: hash(b),
        ...(pointer.endsWith('/revision') &&
        typeof a === 'number' &&
        typeof b === 'number'
          ? { beforeRevision: a, currentRevision: b }
          : {}),
      });
  };
  visit(before, current, '/publicCampus');
  return {
    count,
    differences,
    strippedOnly: [
      'modelDocument',
      'modelDocumentAsset',
      'reviewedModelRevision',
    ],
  };
}

async function inspect() {
  check(process.env.CAMPUS_ID === 'lasu' && process.argv.length === 3, 'SCOPE');
  const eventBytes = await fs.readFile(process.argv[2]);
  check(eventBytes.length <= 1024 * 1024, 'EVENT_SIZE');
  const event = JSON.parse(eventBytes.toString());
  check(
    event.inputs?.operation === 'inspect' &&
      event.inputs?.upgrade === 'models' &&
      event.inputs?.campus_id === 'lasu',
    'INSPECT_ONLY',
  );
  const pin = JSON.parse(event.inputs.reconciliation_pin);
  check(
    Object.keys(pin).sort().join(',') ===
      'apply_artifact_id,apply_run_id,receipt_sha256',
    'PIN_FIELDS',
  );
  check(
    /^\d+$/.test(pin.apply_run_id) &&
      /^\d+$/.test(pin.apply_artifact_id) &&
      sha(pin.receipt_sha256),
    'PIN_FORMAT',
  );
  const receiptBytes = await fs.readFile(
    'work/model-apply-input/lasu-model-receipt.json',
  );
  const receipt = verifyAppliedReceipt(
    receiptBytes,
    String(pin.apply_run_id),
    pin.receipt_sha256,
  );
  record.pins = {
    ...pin,
    operationId: receipt.operationId,
    expectedBeforeHash: receipt.expectedHash,
    planHash: receipt.planHash,
    archiveSha256: receipt.archiveSha256,
    backupCanonicalSha256: receipt.backup.sha256,
    sourceSetHash: evidenceHash(
      receipt.changes
        .map(({ id, bytes, sha256, revision }) => ({
          id,
          bytes,
          sha256,
          revision,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    ),
  };
  await save();
  stage = 'verified-backup';
  const response = await fetch(
    `${process.env.SUPABASE_URL}/storage/v1/object/campus-imports/${receipt.backup.storagePath}`,
    {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      redirect: 'error',
      signal: AbortSignal.timeout(60000),
    },
  );
  check(response.ok && response.body, 'BACKUP_READ');
  const chunks: Uint8Array[] = [];
  let backupBytes = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    backupBytes += chunk.length;
    check(backupBytes <= 64 * 1024 * 1024, 'BACKUP_SIZE');
    chunks.push(chunk);
  }
  const backup = JSON.parse(Buffer.concat(chunks).toString()) as {
    snapshot: GisSnapshot;
    workspaceHash: string;
    planHash: string;
  };
  check(
    evidenceHash(backup) === receipt.backup.sha256 &&
      backup.workspaceHash === receipt.expectedHash &&
      backup.planHash === receipt.planHash,
    'BACKUP_IDENTITY',
  );
  record.backup = {
    verified: true,
    bytes: backupBytes,
    canonicalSha256: evidenceHash(backup),
    snapshotHash: evidenceHash(backup.snapshot),
  };
  stage = 'stable-workspace';
  const hashBefore = await read<string>(
    'rpc/gis_workspace_content_hash',
    'POST',
    {},
  );
  const current = await read<GisSnapshot>(
    'rpc/gis_workspace_snapshot',
    'POST',
    {},
  );
  const currentHash = await read<string>(
    'rpc/gis_workspace_content_hash',
    'POST',
    {},
  );
  check(sha(currentHash) && hashBefore === currentHash, 'CONCURRENT_WORKSPACE');
  record.currentHash = currentHash;
  stage = 'operation-receipt';
  const operations = await read<Operation[]>(
    `editor_operations?id=eq.${receipt.operationId}&select=id,campus_id,actor,request,result&limit=2`,
  );
  check(operations.length === 1, 'OPERATION_MISSING');
  const operation = operations[0];
  verifySavedOperation(receipt, backup.snapshot, operation);
  const targetResultMatchesCurrent = operation.result.map((result) => ({
    id: result.id,
    matches:
      evidenceHash(result) ===
      evidenceHash(
        current.edits.find(
          (edit) => edit.kind === result.kind && edit.id === result.id,
        ) || null,
      ),
  }));
  record.operationReceipt = {
    verified: true,
    actorMatchesPinnedOwner: true,
    requestHash: evidenceHash(operation.request),
    resultHash: evidenceHash(operation.result),
    count: 20,
    targetResultMatchesCurrent,
  };
  stage = 'dataset-mappings';
  const datasetFor = async (snapshot: GisSnapshot, id: string) => {
    const source = snapshot.features.find(
      (row) =>
        row.entity === 'feature' &&
        row.payload.properties?.kind === 'building' &&
        row.payload.properties?.id === id,
    );
    const edit = snapshot.edits.find(
      (row) => row.kind === 'building' && row.id === id,
    );
    check(
      source?.entity === 'feature' &&
        edit &&
        !edit.deleted &&
        !edit.properties.revertToSource,
      'TARGET_SOURCE',
    );
    const properties = {
      ...source.payload.properties,
      ...edit.properties,
      id,
      kind: 'building',
    };
    return read<string>('rpc/gis_dataset_key', 'POST', {
      properties,
      source: source.source ?? 'authored',
    });
  };
  const keys = proposalIds.map((id) => `building:${id}`);
  const query = new URLSearchParams({
    select: 'feature_key,dataset_id',
    feature_key: `in.(${keys.map((key) => JSON.stringify(key)).join(',')})`,
    limit: '21',
  });
  const index = await read<{ feature_key: string; dataset_id: string }[]>(
    `gis_feature_index?${query}`,
  );
  check(
    index.length === 20 &&
      new Set(index.map((row) => row.feature_key)).size === 20,
    'INDEX_TARGETS',
  );
  const datasets = [];
  for (const id of proposalIds)
    datasets.push({
      kind: 'building' as const,
      id,
      beforeDatasetId: await datasetFor(backup.snapshot, id),
      currentDatasetId: await datasetFor(current, id),
      currentIndexDatasetId:
        index.find((row) => row.feature_key === `building:${id}`)?.dataset_id ||
        '',
    });
  const comparison = reconcileModelBatchReadback({
    before: backup.snapshot,
    current,
    items: operation.request,
    datasets,
  });
  record.datasetMappings = datasets;
  record.comparison = comparison;
  await save();
  stage = 'immutable-source-validation';
  const sources = [];
  const hydrated = new Map<
    string,
    Awaited<ReturnType<typeof readModelAsset>>
  >();
  for (const item of operation.request) {
    const change = receipt.changes.find((entry) => entry.id === item.edit.id)!;
    const reference = item.edit.properties.modelDocumentAsset!;
    // Existing read helper GETs a ready immutable asset, rehashes its bytes and validates its schema.
    const document = await readModelAsset(reference, receipt.owner);
    check(
      modelDocumentRevision(document) === change.revision,
      'STORED_DOCUMENT_REVISION',
    );
    hydrated.set(change.id, document);
    const attached = current.edits.find(
      (edit) => edit.kind === 'building' && edit.id === change.id,
    )?.properties.modelDocumentAsset;
    sources.push({
      id: change.id,
      referenceId: reference.id,
      sha256: reference.sha256,
      bytes: reference.bytes,
      revision: change.revision,
      verified: true,
      currentAttachmentMatches:
        evidenceHash(attached || null) === evidenceHash(reference),
    });
    record.sources = sources;
    await save();
  }
  stage = 'publication-validation';
  const publication = await verifiedPublicationBaseline();
  record.publishedCatalogueMatchesApply =
    evidenceHash(publication) === evidenceHash(receipt.publication);
  const published = await publishedCampus();
  record.publishedVersion = published.version;
  if (
    sources.every((source) => source.currentAttachmentMatches) &&
    published.version === receipt.baseline
  ) {
    const before = validateReleaseSnapshot(backup.snapshot, published);
    const candidate = validateReleaseSnapshot(
      {
        ...current,
        edits: current.edits.map((edit) =>
          edit.kind === 'building' && hydrated.has(edit.id)
            ? {
                ...edit,
                properties: {
                  ...edit.properties,
                  modelDocument: hydrated.get(edit.id)!,
                },
              }
            : edit,
        ),
      },
      published,
    );
    const geometry = (campus: typeof candidate) =>
      campus.map.features
        .map((feature) => ({
          id: feature.properties?.id,
          kind: feature.properties?.kind,
          geometry: feature.geometry,
        }))
        .sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
    record.publicationValidation = {
      passed: true,
      modelCount: candidate.map.features.filter(
        (feature) => feature.properties?.modelDocument,
      ).length,
      geometryUnchanged:
        evidenceHash(geometry(before)) === evidenceHash(geometry(candidate)),
      graphUnchanged:
        evidenceHash(before.graph) === evidenceHash(candidate.graph),
      photosUnchanged:
        evidenceHash(before.photos) === evidenceHash(candidate.photos),
      placesUnchanged:
        evidenceHash(before.places) === evidenceHash(candidate.places),
    };
    const withoutModels = (campus: typeof candidate) => ({
      ...campus,
      map: {
        ...campus.map,
        features: campus.map.features
          .map((feature) => ({
            ...feature,
            properties: nonModel(feature.properties || {}),
          }))
          .sort((a, b) =>
            `${a.properties.kind}:${a.properties.id || a.id}`.localeCompare(
              `${b.properties.kind}:${b.properties.id || b.id}`,
            ),
          ),
      },
    });
    record.publicProjection = {
      beforeProtectedHash: protectedCampusHash(before),
      currentProtectedHash: protectedCampusHash(candidate),
      ...publicDifferences(withoutModels(before), withoutModels(candidate)),
    };
  } else
    record.publicationValidation = {
      passed: false,
      skipped:
        'Current model attachments or baseline differ from pinned application',
    };
  stage = 'final-stability';
  check(
    (await read<string>('rpc/gis_workspace_content_hash', 'POST', {})) ===
      currentHash,
    'CONCURRENT_WORKSPACE',
  );
  record.status =
    comparison.ok &&
    targetResultMatchesCurrent.every((result) => result.matches)
      ? 'inspected-exact-derived-revisions'
      : 'inspected-unexplained-differences';
  record.stableRead = true;
}
try {
  await withCampusId('lasu', inspect);
} catch (error) {
  record.status = 'inspection-failed';
  record.failure = {
    stage,
    code:
      error instanceof Error && /^DIAGNOSTIC_[A-Z_]+$/.test(error.message)
        ? error.message
        : 'DEPENDENCY_OR_VALIDATION_FAILURE',
  };
  process.exitCode = 1;
} finally {
  record.finishedAt = new Date().toISOString();
  await save();
  console.log(
    JSON.stringify({ status: record.status, stage, noRemoteWrites: true }),
  );
}
