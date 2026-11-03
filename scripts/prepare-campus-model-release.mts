/** Guarded model import; preparation is read-only, approval is always explicit. */
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { allRows, db, evidenceHash } from './cloud.mjs';
import {
  publishedCampus,
  validateReleaseSnapshot,
} from '../web/server/release-validation';
import { hydrateModelEdits } from '../web/server/model-assets';
import { reviewAction } from '../web/server/gis-review';
import type { GisSnapshot } from '../web/server/gis-publication';
import { modelDocumentRevision } from '../web/src/model-document-revision';
import {
  downloadProposalInputs,
  loadProposalInputs,
} from './model-proposal-input.mts';
import { backupWorkspace, uploadProposal } from './model-proposal-storage.mts';
import { verifiedPublicationBaseline } from './model-proposal-baseline.mts';
import {
  assetEdit,
  assertReadback,
  ModelReadbackError,
  modelChanges,
  protectedCampusHash,
  requireApplyGuards,
} from './model-proposal-plan.mts';
import {
  modelDatasetMappings,
  readModelDatasetMembership,
} from './model-proposal-datasets.mts';

if (process.env.CAMPUS_ID !== 'lasu')
  throw Error('Model campaign import is explicitly LASU only');
const apply = process.env.APPLY_LAYER_UPGRADE === 'true';
const ownerOverride = process.env.MODEL_OWNER_OVERRIDE === 'true';
const overrideReason = process.env.MODEL_OVERRIDE_REASON?.trim() || '';
if (
  ownerOverride &&
  (overrideReason.length < 5 || overrideReason.length > 1000)
)
  throw Error(
    'Explicit original-owner approval requires a reason of 5–1000 characters',
  );
const published = await publishedCampus();
const publication = await verifiedPublicationBaseline();
if (
  published.version !== publication.pin.version ||
  published.photos?.length !== 43
)
  throw Error(
    'Published campus or photo baseline differs from the audited campaign',
  );
const owners = (await db('admin_users?select=id&limit=2')) as { id: string }[];
if (owners.length !== 1)
  throw Error('An unambiguous existing original owner identity is required');
const owner = owners[0].id;
const capabilities: Record<string, boolean> = {};
for (const capability of ['edit', 'review', 'publish'])
  capabilities[capability] = await db('rpc/workspace_can', 'POST', {
    actor: owner,
    capability,
    campus: 'lasu',
  });
if (!capabilities.edit || (ownerOverride && !capabilities.review))
  throw Error(
    'The existing original owner lacks the required campus capability',
  );
async function workspace() {
  const hashBefore = await db('rpc/gis_workspace_content_hash', 'POST', {});
  const snapshot = (await db(
    'rpc/gis_workspace_snapshot',
    'POST',
    {},
  )) as GisSnapshot;
  const contentHash = (await db(
    'rpc/gis_workspace_content_hash',
    'POST',
    {},
  )) as string;
  if (hashBefore !== contentHash)
    throw Error(
      'Workspace changed during preparation; retry read-only preparation',
    );
  return { snapshot, contentHash };
}
const { snapshot: previous, contentHash: expectedHash } = await workspace();
const assets = (await allRows('model_assets')).filter(
  (a: { owner: string }) => a.owner === owner,
) as { sha256: string; bytes: number; status: string }[];
const usedBytes = assets.reduce((sum, a) => sum + a.bytes, 0);
const inspection = {
  operation: 'inspect',
  campus: 'lasu',
  owner,
  capabilities,
  expectedHash,
  publication,
  publishedVersion: published.version,
  publishedBuildings: published.map.features.filter(
    (f) => f.properties?.kind === 'building',
  ).length,
  sourceRecords: previous.features.length,
  savedCorrections: previous.edits.length,
  authoredDrafts: previous.edits
    .filter((e) => e.properties.modelDocumentAsset)
    .map((e) => ({ id: e.id, updatedAt: e.updated_at })),
  modelAssets: {
    count: assets.length,
    bytes: usedBytes,
    pending: assets.filter((a) => a.status !== 'ready').length,
    budget: 500 * 1024 * 1024,
  },
  recentReviews: await db(
    'gis_reviews?select=id,status,content_hash,submitted_by,reviewed_by,created_at&order=created_at.desc&limit=10',
  ),
  activeReleases: await db(
    'releases?status=in.(queued,building,preview)&select=id,status,review_id&limit=20',
  ),
  noRemoteWrites: true,
};
await fs.mkdir('work', { recursive: true });
await fs.writeFile(
  'work/lasu-model-inspection.json',
  JSON.stringify(inspection, null, 2),
);
if (process.env.MODEL_INSPECT_ONLY === 'true') {
  if (apply) throw Error('Inspection cannot apply changes');
  console.log(
    JSON.stringify({
      operation: 'inspect',
      expectedHash,
      publishedVersion: published.version,
      privateAssetBytes: usedBytes,
    }),
  );
  process.exit(0);
}
const input = await downloadProposalInputs();
const { proposals, manifest } = await loadProposalInputs(input.directory);
if (
  published.version !== manifest.baseline ||
  inspection.publishedBuildings !== 614
)
  throw Error(
    'Published LASU baseline changed; reconcile evidence before importing',
  );
const hydrated = await hydrateModelEdits(previous.edits, owner);
const before = validateReleaseSnapshot(
  { ...previous, edits: hydrated },
  published,
);
const changes = modelChanges(proposals, published, before, previous.edits);
const candidateEdits = hydrated.filter(
  (e) => !changes.some((c) => c.edit.kind === e.kind && c.edit.id === e.id),
);
candidateEdits.push(...changes.map((change) => change.edit));
const candidate = validateReleaseSnapshot(
  { ...previous, edits: candidateEdits },
  published,
);
if (protectedCampusHash(before) !== protectedCampusHash(candidate))
  throw Error(
    'Import changed protected campus geometry, routing, photos or existing properties',
  );
for (const change of changes) {
  const effective = candidate.map.features.find(
    (f) => f.properties?.id === change.edit.id,
  );
  if (
    !effective?.properties?.modelDocument ||
    modelDocumentRevision(effective.properties.modelDocument) !==
      change.revision ||
    effective.properties.reviewedModelRevision !== change.revision
  )
    throw Error(
      `Publication does not retain the reviewed model: ${change.proposal.slug}`,
    );
}
const existing = new Set(assets.map((a) => a.sha256));
const additionalBytes = proposals
  .filter((p) => !existing.has(p.sha256))
  .reduce((sum, p) => sum + p.bytes, 0);
if (usedBytes + additionalBytes > 500 * 1024 * 1024)
  throw Error(
    'Immutable model assets would exceed the existing 500 MiB owner budget',
  );
const plan = {
  campus: 'lasu',
  baseline: manifest.baseline,
  archiveSha256: input.sha256,
  releaseAssetId: input.assetId,
  repository: input.repository,
  publication,
  owner,
  originalOwnerOverride: ownerOverride,
  overrideReason,
  changes: changes.map((c) => ({
    id: c.edit.id,
    slug: c.proposal.slug,
    bytes: c.proposal.bytes,
    sha256: c.proposal.sha256,
    revision: c.revision,
    expectedUpdatedAt: c.expectedUpdatedAt,
    previousModel:
      previous.edits.find((e) => e.id === c.edit.id && e.kind === 'building')
        ?.properties.modelDocumentAsset || null,
  })),
};
const planHash = evidenceHash(plan);
const report: Record<string, unknown> = {
  operation: apply ? 'apply' : 'prepare',
  expectedHash,
  planHash,
  ...plan,
  capabilities,
  buildingCount: 614,
  modelsValidated: changes.length,
  protectedCampusHash: protectedCampusHash(before),
  geometryRoutingPhotosPreserved: true,
  savedCorrections: previous.edits.length,
  privateAssetBytes: {
    used: usedBytes,
    additional: additionalBytes,
    limit: 500 * 1024 * 1024,
  },
  sourceRecordsUnchanged: true,
  otherCampusesUntouched: true,
  githubRun: process.env.GITHUB_RUN_ID || null,
  githubActor: process.env.GITHUB_ACTOR || null,
  reviewPolicy: ownerOverride
    ? 'Explicit original-owner override requested; no independent approval claimed'
    : 'Submit only; independent review required',
};
const reportFile = 'work/lasu-model-receipt.json';
const saveReport = () =>
  fs.writeFile(reportFile, JSON.stringify(report, null, 2));
await saveReport();
if (apply) {
  requireApplyGuards(
    expectedHash,
    planHash,
    process.env.EXPECTED_SNAPSHOT,
    process.env.EXPECTED_MODEL_PLAN,
    ownerOverride,
    overrideReason,
  );
  const assertCurrent = async () => {
    if (
      (await db('rpc/gis_workspace_content_hash', 'POST', {})) !== expectedHash
    )
      throw Error(
        'Workspace changed since preparation; imported assets remain private and reusable',
      );
    if ((await publishedCampus()).version !== manifest.baseline)
      throw Error('Published baseline changed since preparation');
    if (
      evidenceHash(await verifiedPublicationBaseline()) !==
      evidenceHash(publication)
    )
      throw Error(
        'Published campus catalogue changed since preparation; reconcile other campuses',
      );
    if (
      (await db('releases?status=in.(queued,building)&select=id&limit=1'))
        .length
    )
      throw Error('Complete the active campus release before applying models');
  };
  await assertCurrent();
  const beforeMembership = await readModelDatasetMembership(previous);
  await assertCurrent();
  report.beforeDatasetMembership = beforeMembership;
  await saveReport();
  report.backup = await backupWorkspace(previous, expectedHash, planHash);
  await saveReport();
  const items = [];
  for (const change of changes) {
    const reference = await uploadProposal(
      owner,
      change.proposal,
      input.directory,
    );
    items.push(assetEdit(change, reference));
    report.verifiedPrivateModels = items.length;
    await saveReport();
  }
  await assertCurrent();
  const preSaveMembership = await readModelDatasetMembership(previous);
  if (evidenceHash(preSaveMembership) !== evidenceHash(beforeMembership))
    throw Error('GIS index membership changed before saving models');
  await assertCurrent();
  const operationId = randomUUID();
  report.operationId = operationId;
  await saveReport();
  await db(
    'rpc/save_editor_model_batch',
    'POST',
    { operation_id: operationId, actor_id: owner, items },
    'return=representation',
    75000,
  );
  report.batchSaved = true;
  await saveReport();
  const { snapshot: accepted, contentHash: acceptedHash } = await workspace();
  report.workspaceHash = acceptedHash;
  await saveReport();
  const currentMembership = await readModelDatasetMembership(accepted);
  const mappings = modelDatasetMappings(beforeMembership, currentMembership);
  report.datasetMappings = mappings;
  if ((await db('rpc/gis_workspace_content_hash', 'POST', {})) !== acceptedHash)
    throw Error(
      'Workspace changed during model readback; reconcile before review',
    );
  try {
    report.readback = assertReadback(previous, accepted, items, mappings);
  } catch (error) {
    if (error instanceof ModelReadbackError)
      report.readback = error.reconciliation;
    await saveReport();
    throw error;
  }
  await saveReport();
  validateReleaseSnapshot(
    { ...accepted, edits: await hydrateModelEdits(accepted.edits, owner) },
    published,
  );
  await saveReport();
  const review = (await reviewAction(owner, 'gis-review-submit', {
    operationId: randomUUID(),
    summary:
      'LASU Ojo: 20 detailed exterior model proposals from verified immutable source assets. Published 614-building baseline, routing, photos and saved corrections preserved. Dimensions and unseen elevations remain estimates; 3 identification holds and 4 further evidence gaps excluded.',
  })) as { id: string; status: string; content_hash: string };
  report.review = {
    id: review.id,
    status: review.status,
    contentHash: review.content_hash,
  };
  await saveReport();
  if (review.content_hash !== acceptedHash)
    throw Error(
      'Workspace changed before submission; retain the unapproved review and reconcile',
    );
  if (ownerOverride) {
    await reviewAction(owner, 'gis-review-decide', {
      id: review.id,
      approve: true,
      override: true,
      reason: overrideReason,
    });
    report.review = {
      id: review.id,
      status: 'approved',
      contentHash: review.content_hash,
      originalOwnerOverride: true,
      reason: overrideReason,
    };
    await saveReport();
  }
}
console.log(
  JSON.stringify(
    {
      operation: report.operation,
      expectedHash,
      planHash,
      modelsValidated: changes.length,
      privateAssetBytes: report.privateAssetBytes,
      review: report.review || null,
    },
    null,
    2,
  ),
);
