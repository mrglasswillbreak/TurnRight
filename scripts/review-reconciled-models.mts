/** Explicit main-only review continuation; never saves models or requests publication. */
import fs from 'node:fs/promises';
import { db, HttpError } from '../web/server/backend';
import { withCampusId } from '../web/server/campus-scope';
import { reviewAction } from '../web/server/gis-review';
import { verifiedPublicationBaseline } from './model-proposal-baseline.mts';
import { verifyAppliedReceipt } from './model-proposal-reconciliation-input.mts';
import {
  reviewRecoveryPin,
  verifyReconciliationProof,
  resumeModelReview,
} from './model-proposal-review-recovery.mts';
let lastReceipt: Record<string, unknown> = {
  operation: 'resume-review',
  noRemoteWrites: true,
  modelWritesPerformed: false,
  publicationRequested: false,
};
const saveReceipt = async (receipt: Record<string, unknown>) => {
  lastReceipt = {
    ...receipt,
    githubRun: process.env.GITHUB_RUN_ID || null,
    checkedAt: new Date().toISOString(),
  };
  await fs.mkdir('work', { recursive: true });
  await fs.writeFile(
    'work/lasu-model-review-recovery.json',
    JSON.stringify(lastReceipt, null, 2),
  );
};
try {
  if (process.env.CAMPUS_ID !== 'lasu' || process.argv.length !== 3)
    throw Error('RECOVERY_EXPLICIT_LASU_SCOPE');
  const eventBytes = await fs.readFile(process.argv[2]);
  if (eventBytes.length > 1024 * 1024) throw Error('RECOVERY_EVENT_SIZE');
  const pin = reviewRecoveryPin(
    JSON.parse(eventBytes.toString()).inputs,
    process.env.GITHUB_REF || '',
  );
  const apply = verifyAppliedReceipt(
    await fs.readFile('work/model-apply-input/lasu-model-receipt.json'),
    pin.apply_run_id,
    pin.receipt_sha256,
  );
  const proof = verifyReconciliationProof(
    apply,
    await fs.readFile(
      'work/model-reconciliation-input/lasu-model-reconciliation.json',
    ),
    pin,
  );
  await withCampusId('lasu', () =>
    resumeModelReview(apply, proof, pin, {
      db,
      publicationBaseline: verifiedPublicationBaseline,
      review: reviewAction,
      saveReceipt,
    }),
  );
} catch (error) {
  await saveReceipt({
    ...lastReceipt,
    failed: true,
    error:
      error instanceof Error &&
      /^(RECOVERY|DIAGNOSTIC)_[A-Z_]+$/.test(error.message)
        ? error.message
        : 'RECOVERY_DEPENDENCY_FAILURE_INSPECT_BEFORE_RETRY',
    ...(error instanceof HttpError &&
    Number.isInteger(error.status) &&
    error.status >= 400 &&
    error.status <= 599
      ? { httpStatus: error.status }
      : {}),
  });
  process.exitCode = 1;
} finally {
  console.log(
    JSON.stringify({
      status: lastReceipt.status || 'failed-preflight',
      failed: !!lastReceipt.failed,
      review: lastReceipt.review || null,
      modelWritesPerformed: false,
      publicationRequested: false,
    }),
  );
}
