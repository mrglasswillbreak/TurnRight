/** Strict private request contract; no environment credentials may appear here. */
import path from 'node:path';
import { createHash } from 'node:crypto';
export const sha256 = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');
export const isSha = (value) =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const isUuid = (value) =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value);
export const operations = [
  'inspect',
  'resume-review',
  'preview',
  'verify',
  'publish',
  'audit',
];
export function requireManual(condition, code) {
  if (!condition) throw Error('MANUAL_RELEASE_' + code);
}
const fields = (value, allowed) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).every((key) => allowed.includes(key));
export function outsideRepository(filename, repository) {
  requireManual(
    typeof filename === 'string' && path.isAbsolute(filename),
    'ABSOLUTE_PRIVATE_PATH',
  );
  const relative = path.relative(repository, filename);
  requireManual(
    relative.startsWith('..' + path.sep) || path.isAbsolute(relative),
    'PRIVATE_PATH_OUTSIDE_REPOSITORY',
  );
  return path.resolve(filename);
}
export function filePin(value, repository) {
  requireManual(
    fields(value, ['path', 'sha256']) && isSha(value.sha256),
    'FILE_PIN',
  );
  outsideRepository(value.path, repository);
  return value;
}
export function manualArguments(args) {
  requireManual(
    args.length === 5 &&
      operations.includes(args[0]) &&
      args[1] === '--request' &&
      path.isAbsolute(args[2]) &&
      args[3] === '--request-sha256' &&
      isSha(args[4]),
    'ARGUMENTS',
  );
  return { operation: args[0], filename: args[2], sha256: args[4] };
}
export function parseManualRequest(bytes, expectedSha, operation, repository) {
  requireManual(
    bytes.length <= 65536 && sha256(bytes) === expectedSha,
    'REQUEST_SHA',
  );
  const request = JSON.parse(Buffer.from(bytes).toString('utf8'));
  requireManual(
    fields(request, [
      'schemaVersion',
      'kind',
      'campus',
      'operation',
      'localRunId',
      'expectedMainCommit',
      'journalDirectory',
      'validation',
      'recoveryPin',
      'applyReceipt',
      'reconciliation',
      'exclusiveWindow',
      'reviewReceipt',
      'release',
      'verification',
      'control',
      'summary',
    ]) &&
      request.schemaVersion === 1 &&
      request.kind === 'turnright-manual-release' &&
      request.campus === 'lasu' &&
      request.operation === operation &&
      operations.includes(operation) &&
      isUuid(request.localRunId) &&
      /^[a-f0-9]{40}$/.test(request.expectedMainCommit),
    'REQUEST_SCOPE',
  );
  outsideRepository(request.journalDirectory, repository);
  for (const key of [
    'validation',
    'recoveryPin',
    'applyReceipt',
    'reconciliation',
    'exclusiveWindow',
  ])
    filePin(request[key], repository);
  if (request.reviewReceipt) filePin(request.reviewReceipt, repository);
  if (['preview', 'publish'].includes(operation))
    requireManual(!!request.reviewReceipt, 'REVIEW_RECEIPT_REQUIRED');
  if (['verify', 'publish'].includes(operation) || request.release) {
    const release = request.release;
    requireManual(
      fields(release, ['id', 'version', 'deploymentId', 'origin']) &&
        isUuid(release.id) &&
        /^lasu-[a-f0-9]{12}$/.test(release.version) &&
        /^dpl_[A-Za-z0-9]{1,100}$/.test(release.deploymentId) &&
        /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(release.origin),
      'RELEASE_PIN',
    );
  }
  if (['verify', 'publish'].includes(operation)) {
    requireManual(
      fields(request.control, ['data', 'comparator']),
      'CONTROL_PIN',
    );
    filePin(request.control.data, repository);
    filePin(request.control.comparator, repository);
  }
  if (operation === 'publish') {
    requireManual(
      fields(request.verification, ['report', 'comparison']),
      'VERIFICATION_PIN',
    );
    filePin(request.verification.report, repository);
    filePin(request.verification.comparison, repository);
  } else requireManual(!request.verification, 'UNEXPECTED_VERIFICATION');
  if (operation === 'preview')
    requireManual(
      typeof request.summary === 'string' &&
        request.summary.trim() === request.summary &&
        request.summary.length >= 5 &&
        request.summary.length <= 500 &&
        !request.release,
      'PREVIEW_SUMMARY',
    );
  else requireManual(request.summary === undefined, 'UNEXPECTED_SUMMARY');
  return request;
}
export function assertExclusiveWindow(receipt, request, now = Date.now()) {
  requireManual(
    receipt?.schemaVersion === 1 &&
      receipt.kind === 'turnright-exclusive-release-window' &&
      receipt.localRunId === request.localRunId &&
      receipt.commit === request.expectedMainCommit &&
      receipt.campus === 'lasu' &&
      receipt.noConflictingJobs === true &&
      receipt.noConflictingDeployments === true,
    'EXCLUSIVE_WINDOW',
  );
  const checked = Date.parse(receipt.checkedAt),
    expires = Date.parse(receipt.expiresAt);
  requireManual(
    Number.isFinite(checked) &&
      checked <= now &&
      now - checked <= 5 * 60000 &&
      Number.isFinite(expires) &&
      expires > now &&
      expires - checked <= 4 * 3600000,
    'EXCLUSIVE_WINDOW_TIME',
  );
  requireManual(
    Array.isArray(receipt.workflows) &&
      receipt.workflows.length === 1 &&
      receipt.workflows[0].path === '.github/workflows/release.yml' &&
      receipt.workflows.every(
        (entry) =>
          typeof entry.path === 'string' &&
          /^\.github\/workflows\/[\w-]+\.ya?ml$/.test(entry.path) &&
          Number.isSafeInteger(entry.id) &&
          entry.id > 0 &&
          ['active', 'disabled_manually'].includes(entry.stateBefore) &&
          entry.state === 'disabled_manually' &&
          entry.capturedAt === receipt.checkedAt &&
          isSha(entry.evidence?.sha256) &&
          typeof entry.evidence.path === 'string',
      ),
    'EXCLUSIVE_WORKFLOWS',
  );
  requireManual(
    isSha(receipt.jobsEvidence?.sha256) &&
      isSha(receipt.deploymentsEvidence?.sha256),
    'EXCLUSIVE_EVIDENCE',
  );
}
export function assertEquivalentSource(validated, current, provenance) {
  requireManual(
    current.commit === provenance.expectedMainCommit &&
      current.commit === provenance.remoteMain &&
      current.commit === provenance.localMain &&
      provenance.clean === true &&
      provenance.ancestor === true,
    'CURRENT_MAIN',
  );
  requireManual(
    ['tree', 'sourceSnapshot', 'dependencySnapshot', 'coverageSnapshot'].every(
      (key) => validated[key] === current[key],
    ),
    'VALIDATED_SOURCE_CHANGED',
  );
}
export function assertApprovedReview(value, request, apply, pin) {
  requireManual(
    value?.operation === 'resume-review' &&
      value.status === 'approved' &&
      value.approvalConfirmed === true &&
      value.review?.id === pin.review_operation_id &&
      value.review.status === 'approved' &&
      value.review.contentHash === pin.expected_workspace_hash &&
      value.workspaceHash === pin.expected_workspace_hash &&
      value.modelWritesPerformed === false &&
      value.publicationRequested === false &&
      value.originalOwnerVerified === true &&
      value.applyReceiptSha256 === request.applyReceipt.sha256 &&
      value.reconciliationSha256 === request.reconciliation.sha256 &&
      value.planHash === apply.planHash &&
      value.reason === apply.overrideReason,
    'APPROVED_REVIEW',
  );
}

export function assertNoConflictingReleases(rows, campusId, allowedReleaseId) {
  requireManual(
    Array.isArray(rows) &&
      rows.length < 100 &&
      rows.every(
        (row) =>
          row.campus_id === campusId &&
          ['queued', 'building'].includes(row.status),
      ),
    'ACTIVE_RELEASE_RESPONSE',
  );
  requireManual(
    rows.length === 0 ||
      (rows.length === 1 &&
        campusId === 'lasu' &&
        rows[0].id === allowedReleaseId &&
        rows[0].status === 'queued'),
    'ACTIVE_RELEASES',
  );
}
