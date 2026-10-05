import { db, HttpError } from './backend.js';
import { validUuid } from '../src/gis-contracts.js';
import { datasetAction } from './gis-datasets.js';
import { processingAction } from './gis-processing.js';
import { reviewAction } from './gis-review.js';
export async function gisAction(
  actor: string,
  action: string,
  payload: unknown,
) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new HttpError(400, 'Invalid GIS request.');
  const input = payload as Record<string, unknown>;
  if (action === 'gis-quality') return db('rpc/gis_quality', 'POST', { actor });
  if (action === 'gis-members')
    return db('campus_memberships?select=user_id,roles&order=user_id');
  if (action === 'gis-member-save') {
    if (
      !validUuid(input.userId) ||
      !validUuid(input.operationId) ||
      !Array.isArray(input.roles) ||
      input.roles.length > 4 ||
      input.roles.some(
        (r) =>
          !['administrator', 'editor', 'reviewer', 'publisher'].includes(r),
      )
    )
      throw new HttpError(
        400,
        'Choose an existing account UUID and valid roles.',
      );
    return db('rpc/save_campus_member', 'POST', {
      actor,
      member: input.userId,
      member_roles: input.roles,
      operation_id: input.operationId,
    });
  }
  if (action.startsWith('gis-job'))
    return processingAction(actor, action, input);
  if (action.startsWith('gis-review') || action.startsWith('gis-issue'))
    return reviewAction(actor, action, input);
  return datasetAction(actor, action, input);
}
