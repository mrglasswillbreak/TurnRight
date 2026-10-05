import { db, HttpError } from './backend.js';
import { validUuid } from '../src/gis-contracts.js';
import type { QualityIssue } from '../src/gis-types.js';
import {
  publishedCampus,
  validateReleaseSnapshot,
} from './release-validation.js';
import { hydrateModelEdits } from './model-assets.js';
export async function reviewAction(
  actor: string,
  action: string,
  input: Record<string, unknown>,
) {
  if (action === 'gis-reviews')
    return db(
      'gis_reviews?select=id,summary,content_hash,contributors,submitted_by,status,reviewed_by,reason,created_at&order=created_at.desc&limit=50',
    );
  if (action === 'gis-review-details') {
    if (!validUuid(input.id)) throw new HttpError(400, 'Choose a submission.');
    return db('rpc/gis_review_details', 'POST', {
      actor,
      review_identity: input.id,
    });
  }
  if (action === 'gis-review-query') {
    if (
      !validUuid(input.id) ||
      typeof input.datasetId !== 'string' ||
      input.datasetId.length > 250 ||
      (input.afterKey !== undefined &&
        (typeof input.afterKey !== 'string' || input.afterKey.length > 500))
    )
      throw new HttpError(400, 'Invalid review page.');
    return db('rpc/gis_review_query', 'POST', {
      actor,
      review_identity: input.id,
      dataset: input.datasetId,
      after_key: input.afterKey || '',
    });
  }
  if (action === 'gis-review-restore') {
    if (!validUuid(input.id) || !validUuid(input.operationId))
      throw new HttpError(400, 'Choose a published release.');
    return db('rpc/gis_submit_restore', 'POST', {
      actor,
      operation_id: input.operationId,
      release_identity: input.id,
      summary: 'Restore previously published campus release',
    });
  }
  if (action === 'gis-review-submit') {
    if (
      !validUuid(input.operationId) ||
      typeof input.summary !== 'string' ||
      input.summary.trim().length < 5 ||
      input.summary.length > 500
    )
      throw new HttpError(400, 'Use a review summary of 5–500 characters.');
    return db('rpc/gis_submit_review', 'POST', {
      actor,
      operation_id: input.operationId,
      summary: input.summary,
    });
  }
  if (action === 'gis-review-decide') {
    if (
      !validUuid(input.id) ||
      typeof input.approve !== 'boolean' ||
      typeof input.reason !== 'string' ||
      input.reason.trim().length < 5 ||
      input.reason.length > 1000 ||
      (input.override !== undefined && typeof input.override !== 'boolean')
    )
      throw new HttpError(400, 'Record a review decision and reason.');
    if (input.approve) {
      const [review] = await db(
        'gis_reviews?id=eq.' + input.id + '&select=snapshot,restore_release_id',
      );
      if (!review) throw new HttpError(404, 'Submission not found.');
      validateReleaseSnapshot(
        {
          ...review.snapshot,
          edits: await hydrateModelEdits(review.snapshot.edits, actor),
        },
        await publishedCampus(),
        { restoring: !!review.restore_release_id },
      );
    }
    return db('rpc/gis_decide_review', 'POST', {
      actor,
      review_identity: input.id,
      approve: input.approve,
      reason: input.reason,
      owner_override: input.override || false,
    });
  }
  if (action === 'gis-issues')
    return db('gis_issues?order=severity,feature_key,id&limit=500');
  if (action === 'gis-issue-save') {
    const issue = input.issue as QualityIssue;
    if (
      !issue ||
      typeof issue.id !== 'string' ||
      !issue.id ||
      issue.id.length > 250 ||
      typeof issue.code !== 'string' ||
      issue.code.length > 100 ||
      (issue.feature_key !== undefined &&
        (typeof issue.feature_key !== 'string' ||
          issue.feature_key.length > 500)) ||
      (issue.coordinates !== undefined &&
        (!Array.isArray(issue.coordinates) ||
          issue.coordinates.length !== 2 ||
          issue.coordinates.some((n) => !Number.isFinite(n)) ||
          Math.abs(issue.coordinates[0]) > 180 ||
          Math.abs(issue.coordinates[1]) > 90)) ||
      !['open', 'resolved', 'accepted'].includes(issue.status) ||
      typeof issue.message !== 'string' ||
      issue.message.length > 2000 ||
      !['error', 'warning'].includes(issue.severity) ||
      !Array.isArray(issue.evidence) ||
      issue.evidence.length > 20 ||
      issue.evidence.some(
        (e) =>
          !e ||
          typeof e.label !== 'string' ||
          e.label.length > 160 ||
          typeof e.url !== 'string' ||
          e.url.length > 2000 ||
          !e.url.startsWith('https://'),
      ) ||
      !Array.isArray(issue.comments) ||
      issue.comments.length > 100 ||
      issue.comments.some(
        (c) => !c || typeof c.text !== 'string' || c.text.length > 2000,
      ) ||
      !Number.isSafeInteger(input.expectedRevision) ||
      (issue.assigned_to && !validUuid(issue.assigned_to))
    )
      throw new HttpError(400, 'Invalid quality issue.');
    return db('rpc/gis_save_issue', 'POST', {
      actor,
      issue,
      expected_revision: input.expectedRevision,
    });
  }
  throw new HttpError(400, 'Unknown review action.');
}
