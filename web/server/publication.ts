import { db, dispatch, HttpError } from './backend.js';
import { currentCampusId } from './campus-scope.js';
import { readPublishedCatalogue } from '../scripts/published-campus-catalogue.mjs';
import { validUuid } from '../src/gis-contracts.js';
import {
  publishedCampus,
  validateReleaseSnapshot,
} from './release-validation.js';
import { hydrateModelEdits } from './model-assets.js';

export async function publicationAction(
  actor: string,
  action: string,
  payload: Record<string, unknown>,
) {
  const { revision: catalogueHash } = await readPublishedCatalogue(
    process.env.PUBLISHED_MAP_URL!,
  );
  if (action === 'rollback') {
    if (!validUuid(payload.id))
      throw new HttpError(400, 'Choose a published release.');
    // The compatibility action now creates a restoration submission for independent approval.
    const review = await db('rpc/gis_submit_restore', 'POST', {
      actor,
      operation_id: crypto.randomUUID(),
      release_identity: payload.id,
      summary: 'Restore previously published campus release',
    });
    return { id: review.id, reviewRequired: true };
  }
  if (action === 'prepare-release') {
    if (
      typeof payload.summary !== 'string' ||
      payload.summary.trim().length < 5 ||
      payload.summary.length > 500
    )
      throw new HttpError(
        400,
        'Provide a release summary between 5 and 500 characters.',
      );
    let reviewId = payload.reviewId;
    if (!reviewId) {
      const [latest] = await db(
        'gis_reviews?status=eq.approved&order=reviewed_at.desc&select=id&limit=1',
      );
      reviewId = latest?.id;
    }
    if (!validUuid(reviewId))
      throw new HttpError(
        409,
        'Submit the workspace in Review and obtain independent approval first.',
      );
    const id = await db<string>('rpc/gis_prepare_release', 'POST', {
      actor,
      review_identity: reviewId,
      catalogue_hash: catalogueHash,
      release_summary: payload.summary.trim(),
    });
    try {
      const [release] = await db(
        `releases?id=eq.${id}&select=snapshot,restored_from`,
      );
      validateReleaseSnapshot(
        {
          ...release.snapshot,
          edits: await hydrateModelEdits(release.snapshot.edits, actor),
        },
        await publishedCampus(),
        { restoring: !!release.restored_from },
      );
      await dispatch('release.yml', {
        release_id: id,
        operation: 'preview',
        campus_id: currentCampusId(),
      });
    } catch (error) {
      await db(`releases?id=eq.${id}`, 'PATCH', {
        status: 'failed',
        error: (error as Error).message,
      });
      throw error;
    }
    return { id };
  }
  if (action !== 'publish-release' || !validUuid(payload.id))
    throw new HttpError(400, 'Choose a release.');
  const [release] = await db(
    `releases?id=eq.${payload.id}&select=id,status,deployment_id,catalogue_revision`,
  );
  if (!release?.deployment_id || release.status !== 'preview')
    throw new HttpError(409, 'Review a ready preview first.');
  if (release.catalogue_revision !== catalogueHash)
    throw new HttpError(
      409,
      'Another campus was published after this preview. Build a fresh preview.',
    );
  await db('rpc/gis_assert_release_approval', 'POST', {
    release_identity: release.id,
  });
  await db('workspace_audit', 'POST', {
    actor,
    action: 'publication-request',
    subject: release.id,
  });
  await dispatch('release.yml', {
    release_id: release.id,
    operation: 'publish',
    campus_id: currentCampusId(),
  });
  return { id: release.id };
}
