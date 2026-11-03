/** Local browser evidence remains separate from hosted workflow evidence. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { requireManual, sha256 } from './manual-release-request.mjs';
import { readPinnedFile } from './manual-release-journal.mjs';
import { assertObservedPreviewSource } from './manual-release-deployment.mjs';
export const frozenControlSha =
  '80418b87c882fb31a43d517c0b005ad0aaf66953b5a76613d723293d485413c7';
export const frozenComparatorSha =
  'aeb44dc333428749b421c77b9f1b20d9f41c93520d9b5f0372542d4f8d1d785d';
const json = (bytes) => JSON.parse(Buffer.from(bytes).toString('utf8'));
const sorted = (values) => [...values].sort().join('\n');
export async function compareManualPreview(
  request,
  repository,
  reportPin,
  expectedIds,
  observedSource,
) {
  const sourceProvenance = assertObservedPreviewSource(request, observedSource);
  requireManual(
    request.control.data.sha256 === frozenControlSha &&
      request.control.comparator.sha256 === frozenComparatorSha,
    'FROZEN_CONTROL',
  );
  const [dataBytes, comparatorBytes, reportBytes] = await Promise.all([
    readPinnedFile(request.control.data, repository),
    readPinnedFile(request.control.comparator, repository),
    readPinnedFile(reportPin, repository, 8 * 1024 * 1024),
  ]);
  const controls = json(dataBytes),
    report = json(reportBytes);
  requireManual(
    expectedIds.length === 20 &&
      new Set(expectedIds).size === 20 &&
      sorted(controls.expectedModelIds) === sorted(expectedIds),
    'CONTROL_MODEL_IDS',
  );
  // Execute only this fixed digest's pure comparator, from the bytes just checked.
  const { compareReport } = await import(
    'data:text/javascript;base64,' + comparatorBytes.toString('base64')
  );
  const result = compareReport(report, controls, {
    origin: request.release.origin,
    version: request.release.version,
  });
  requireManual(
    result.comparisonPassed === true &&
      result.mismatches.length === 0 &&
      result.counts.views === 32 &&
      result.counts.offline === 4 &&
      result.counts.models === 20 &&
      result.counts.offlineModelVisits === 40,
    'PREVIEW_COMPARISON',
  );
  const screenshots = [];
  for (const name of result.screenshots) {
    requireManual(
      path.basename(name) === name && name.endsWith('.png'),
      'SCREENSHOT_PATH',
    );
    const bytes = await fs.readFile(
      path.join(path.dirname(reportPin.path), name),
    );
    requireManual(
      bytes.length > 24 &&
        bytes.length < 32 * 1024 * 1024 &&
        bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
        bytes.readUInt32BE(16) > 0 &&
        bytes.readUInt32BE(20) > 0,
      'SCREENSHOT_PNG',
    );
    screenshots.push({
      name,
      bytes: bytes.length,
      sha256: sha256(bytes),
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    });
  }
  return {
    schemaVersion: 1,
    kind: 'turnright-manual-preview-comparison',
    status: 'passed',
    localRunId: request.localRunId,
    hostedCi: false,
    release: request.release,
    sourceCommit: sourceProvenance.commit,
    sourceProvenance,
    reportSha256: reportPin.sha256,
    controlSha256: frozenControlSha,
    comparatorSha256: frozenComparatorSha,
    expectedModelIds: [...expectedIds].sort(),
    applyReceiptSha256: request.applyReceipt.sha256,
    reconciliationSha256: request.reconciliation.sha256,
    counts: result.counts,
    mismatches: [],
    screenshots,
  };
}
export async function assertManualComparison(
  request,
  repository,
  expectedIds,
  observedSource,
) {
  const comparison = json(
    await readPinnedFile(request.verification.comparison, repository),
  );
  const current = await compareManualPreview(
    request,
    repository,
    request.verification.report,
    expectedIds,
    observedSource,
  );
  assertManualComparisonReceipt(comparison, current, request);
  return comparison;
}
export function assertManualComparisonReceipt(comparison, current, request) {
  // The verification command has its own unique local run identity, not the publish identity.
  requireManual(
    comparison.localRunId !== request.localRunId &&
      /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(
        comparison.localRunId,
      ),
    'DISTINCT_VERIFY_RUN',
  );
  for (const key of Object.keys(current).filter(
    (name) => name !== 'localRunId',
  ))
    requireManual(
      JSON.stringify(comparison[key]) === JSON.stringify(current[key]),
      'COMPARISON_BINDING',
    );
  return comparison;
}
