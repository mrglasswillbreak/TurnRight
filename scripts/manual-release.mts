/** Operator-run local release path; never replays model imports or fabricates CI identity. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../web/server/backend';
import { withCampusId } from '../web/server/campus-scope';
import { workspaceAccess } from '../web/server/workspace-access';
import { reviewAction } from '../web/server/gis-review';
import { publicationAction } from '../web/server/publication';
import { validModelReference } from '../web/server/model-assets';
import { evidenceHash } from './cloud.mjs';
import { proposalIds } from './model-proposal-inventory.mts';
import { verifyAppliedReceipt } from './model-proposal-reconciliation-input.mts';
import {
  verifyReconciliationProof,
  resumeModelReview,
  type RecoveryPin,
} from './model-proposal-review-recovery.mts';
import { verifiedPublicationBaseline } from './model-proposal-baseline.mts';
import { requestCampusPublication } from './campus-publication-request.mts';
import {
  manualArguments,
  parseManualRequest,
  requireManual,
  isSha,
  isUuid,
  assertApprovedReview,
  sha256,
} from './manual-release-request.mjs';
import {
  createManualJournal,
  readPinnedFile,
} from './manual-release-journal.mjs';
import {
  verifyManualProvenance,
  verifyExclusiveReceipt,
  localReleaseEnvironment,
} from './manual-release-provenance.mjs';
import {
  compareManualPreview,
  assertManualComparison,
} from './manual-release-verification.mjs';
import { createManualWorkerWorkspace } from './manual-release-workspace.mjs';
import {
  noCompetingManualWork,
  assertReleasePin,
  assertOwnerAndModels,
  manualSchedule,
  writeManualResult,
  runManualWorker,
} from './manual-release-operations.mts';
const repository = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const json = (bytes: Uint8Array) =>
  JSON.parse(Buffer.from(bytes).toString('utf8'));
async function main() {
  const args = manualArguments(process.argv.slice(2));
  const bytes = await readPinnedFile(
    { path: args.filename, sha256: args.sha256 },
    repository,
    65536,
  );
  const request = parseManualRequest(
    bytes,
    args.sha256,
    args.operation,
    repository,
  );
  const environment = localReleaseEnvironment(process.env, request);
  for (const key of Object.keys(process.env))
    if (!(key in environment)) delete process.env[key];
  Object.assign(process.env, environment);
  const journal = await createManualJournal(request, bytes, repository);
  let needsCleanup = false;
  try {
    const provenance = await verifyManualProvenance(request, repository);
    await journal.append('provenance-verified', provenance);
    await verifyExclusiveReceipt(request, repository);
    const pin = json(
      await readPinnedFile(request.recoveryPin, repository),
    ) as RecoveryPin;
    requireManual(
      Object.keys(pin).sort().join() ===
        [
          'apply_run_id',
          'apply_artifact_id',
          'receipt_sha256',
          'reconciliation_run_id',
          'reconciliation_artifact_id',
          'reconciliation_sha256',
          'expected_workspace_hash',
          'review_operation_id',
        ]
          .sort()
          .join() &&
        [
          pin.apply_run_id,
          pin.apply_artifact_id,
          pin.reconciliation_run_id,
          pin.reconciliation_artifact_id,
        ].every((value) => typeof value === 'string' && /^\d+$/.test(value)) &&
        [
          pin.receipt_sha256,
          pin.reconciliation_sha256,
          pin.expected_workspace_hash,
        ].every(isSha) &&
        isUuid(pin.review_operation_id),
      'RECOVERY_PIN',
    );
    requireManual(
      pin.receipt_sha256 === request.applyReceipt.sha256 &&
        pin.reconciliation_sha256 === request.reconciliation.sha256,
      'RECOVERY_FILE_BINDING',
    );
    const apply = verifyAppliedReceipt(
      await readPinnedFile(request.applyReceipt, repository),
      pin.apply_run_id,
      pin.receipt_sha256,
    );
    const proof = verifyReconciliationProof(
      apply,
      await readPinnedFile(request.reconciliation, repository),
      pin,
    );
    const readPreview = () =>
      assertReleasePin(
        request.release,
        pin.review_operation_id,
        request.expectedMainCommit,
      );
    await journal.append('saved-model-proof-verified', {
      applyReceiptSha256: pin.receipt_sha256,
      reconciliationSha256: pin.reconciliation_sha256,
      workspaceHash: pin.expected_workspace_hash,
      modelIds: proposalIds,
      modelWritesPerformed: false,
    });
    const mutationGate = async (allowedReleaseId?: string) => {
      requireManual(
        Date.now() < Date.parse((await verifyWindow()).expiresAt),
        'WINDOW_EXPIRED',
      );
      await verifyManualProvenance(request, repository);
      await assertOwnerAndModels(apply, pin.expected_workspace_hash);
      requireManual(
        evidenceHash(await verifiedPublicationBaseline()) ===
          evidenceHash(apply.publication),
        'PUBLISHED_BASELINE_CHANGED',
      );
      await journal.append(
        'live-exclusion-verified',
        await noCompetingManualWork(allowedReleaseId),
      );
    };
    // The receipt freshness is checked at command start. Expiry remains binding
    // throughout long builds; live conflicts are re-read before every operation.
    const verifyWindow = async () =>
      json(await readPinnedFile(request.exclusiveWindow, repository));
    await withCampusId('lasu', async () => {
      if (['inspect', 'audit'].includes(request.operation)) {
        const workspaceHash = await db(
          'rpc/gis_workspace_content_hash',
          'POST',
          {},
        );
        const reviews = await db(
          'gis_reviews?id=eq.' +
            pin.review_operation_id +
            '&select=id,campus_id,status,content_hash,submitted_by,reviewed_by,reason',
        );
        const releases = await db(
          'releases?review_id=eq.' +
            pin.review_operation_id +
            '&select=id,campus_id,status,version,deployment_id,preview_url,deployment_url,review_id&limit=20',
        );
        const result = await writeManualResult(journal, 'inspection', {
          operation: request.operation,
          noRemoteWrites: true,
          workspaceHash,
          matchesPinnedWorkspace: workspaceHash === pin.expected_workspace_hash,
          reviews,
          releases,
        });
        await journal.complete({ result });
        return;
      }
      await mutationGate();
      if (request.operation === 'resume-review') {
        const recovery = await resumeModelReview(apply, proof, pin, {
          db,
          publicationBaseline: verifiedPublicationBaseline,
          saveReceipt: (receipt) =>
            journal.append('review-state', receipt).then(() => {}),
          review: async (actor, action, payload) => {
            await mutationGate();
            await journal.intent('review-write-requested', {
              actor,
              action,
              payload,
            });
            return reviewAction(actor, action, payload);
          },
        });
        const result = await writeManualResult(
          journal,
          'review-receipt',
          recovery,
        );
        await journal.complete({ result });
        return;
      }
      if (request.operation === 'verify') {
        const initialPreview = await readPreview();
        const output = path.join(
          journal.directory,
          'campus-detail-verification',
        );
        needsCleanup = true;
        await journal.intent('preview-verification-requested', {
          release: request.release,
          sourceProvenance: initialPreview.sourceProvenance,
          scope: 'all',
          modelIds: proposalIds,
          engines: ['chromium', 'webkit'],
        });
        await runManualWorker(
          'scripts/verify-release-preview.mjs',
          repository,
          {
            ...environment,
            RELEASE_ID: request.release.id,
            VERIFY_SCOPE: 'all',
            VERIFY_EXPECTED_MODEL_IDS: JSON.stringify(proposalIds),
            VERIFY_OUTPUT: output,
          },
          journal,
          'preview-verification',
          45 * 60000,
          journal.directory,
        );
        const observedPreview = await readPreview();
        const reportPath = path.join(output, 'report.json');
        const report = {
          path: reportPath,
          sha256: sha256(await fs.readFile(reportPath)),
        };
        const comparison = await compareManualPreview(
          request,
          repository,
          report,
          proposalIds,
          observedPreview.sourceProvenance,
        );
        const result = await writeManualResult(
          journal,
          'preview-comparison',
          comparison,
        );
        await runManualWorker(
          'scripts/cleanup-preview-access.mjs',
          repository,
          environment,
          journal,
          'preview-cleanup',
          120000,
        );
        needsCleanup = false;
        await journal.complete({ report, comparison: result });
        return;
      }
      const review = json(
        await readPinnedFile(request.reviewReceipt, repository),
      );
      assertApprovedReview(review, request, apply, pin);
      if (request.operation === 'publish') {
        const observedPreview = await readPreview();
        const comparison = await assertManualComparison(
          request,
          repository,
          proposalIds,
          observedPreview.sourceProvenance,
        );
        await journal.append('preview-evidence-verified', {
          comparisonSha256: request.verification.comparison.sha256,
          reportSha256: comparison.reportSha256,
          counts: comparison.counts,
        });
      }
      const expected = request.operation === 'preview' ? 'preview' : 'publish';
      const workspace =
        expected === 'preview'
          ? await createManualWorkerWorkspace(
              request,
              repository,
              provenance.current,
            )
          : null;
      if (workspace)
        await journal.append('worker-workspace-verified', workspace);
      const scheduler = manualSchedule(expected, journal);
      const input = {
        operation: expected === 'preview' ? 'prepare' : 'publish',
        review_id: pin.review_operation_id,
        expected_review_hash: pin.expected_workspace_hash,
        ...(expected === 'preview'
          ? { summary: request.summary }
          : {
              release_id: request.release.id,
              expected_version: request.release.version,
              expected_deployment_id: request.release.deploymentId,
            }),
      };
      const receipt = await requestCampusPublication(input, {
        db,
        access: workspaceAccess,
        expectedModelIds: proposalIds,
        validReference: validModelReference,
        saveReceipt: (value) =>
          journal.append('publication-state', value).then(() => {}),
        publication: async (actor, action, payload) => {
          await mutationGate();
          if (expected === 'publish') await readPreview();
          await journal.intent('publication-write-requested', {
            actor,
            action,
            payload,
          });
          return publicationAction(actor, action, payload, scheduler.schedule);
        },
      });
      const intent = scheduler.take();
      requireManual(
        intent.release_id === receipt.releaseId,
        'SCHEDULED_RELEASE',
      );
      await mutationGate(intent.release_id);
      if (expected === 'publish') await readPreview();
      await journal.intent('worker-start-requested', intent);
      needsCleanup = true;
      await runManualWorker(
        'scripts/release.mts',
        workspace?.source || repository,
        {
          ...environment,
          RELEASE_ID: intent.release_id,
          RELEASE_OPERATION: intent.operation,
        },
        journal,
        'release-worker',
        45 * 60000,
      );
      const releases = await db<Record<string, string>[]>(
        'releases?id=eq.' +
          intent.release_id +
          '&select=id,campus_id,status,review_id,version,deployment_id,preview_url,deployment_url',
      );
      requireManual(
        releases.length === 1 &&
          releases[0].review_id === pin.review_operation_id &&
          releases[0].campus_id === 'lasu' &&
          releases[0].status ===
            (expected === 'preview' ? 'preview' : 'published'),
        'WORKER_RELEASE_READBACK',
      );
      await journal.append(
        'source-after-worker-verified',
        await verifyManualProvenance(request, repository),
      );
      const result = await writeManualResult(journal, 'release-receipt', {
        operation: expected,
        localRunId: request.localRunId,
        source: provenance.current,
        requestSha256: args.sha256,
        reviewId: pin.review_operation_id,
        release: releases[0],
        applyReceiptSha256: pin.receipt_sha256,
        reconciliationSha256: pin.reconciliation_sha256,
        modelWritesPerformed: false,
        githubDispatch: false,
      });
      await runManualWorker(
        'scripts/cleanup-preview-access.mjs',
        repository,
        environment,
        journal,
        'release-cleanup',
        120000,
      );
      needsCleanup = false;
      await journal.complete({ result });
    });
  } catch (error) {
    if (needsCleanup) {
      try {
        await runManualWorker(
          'scripts/cleanup-preview-access.mjs',
          repository,
          environment,
          journal,
          'failure-cleanup',
          120000,
        );
      } catch {
        /* Retained lock requires operator inspection. */
      }
    }
    const code =
      error instanceof Error &&
      /^(MANUAL_RELEASE|MANUAL_VALIDATION|RECOVERY|DIAGNOSTIC)_[A-Z_]+$/.test(
        error.message,
      )
        ? error.message
        : 'MANUAL_RELEASE_UNCERTAIN_INSPECT_REQUIRED';
    await journal.fail(code);
    console.error(
      code + '; inspect private journal before any further mutation.',
    );
    process.exitCode = 1;
  }
}
main().catch(() => {
  console.error('MANUAL_RELEASE_REQUEST_OR_LOCK_REJECTED');
  process.exitCode = 1;
});
