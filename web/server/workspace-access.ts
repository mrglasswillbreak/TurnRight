import { db, HttpError } from './backend.js';
import { currentCampusId } from './campus-scope.js';
import { capabilitiesFor } from '../src/gis-contracts.js';
import type {
  WorkspaceCapabilities,
  WorkspaceCapability,
  WorkspaceRole,
} from '../src/gis-types.js';
const readActions = new Set([
  'state',
  'sources',
  'review-baseline',
  'review-status',
  'process-status',
  'campus-list',
  'import-list',
  'import-get',
  'survey-list',
  'survey-get',
  'media-list',
  'media-library',
  'media-preview',
  'media-status',
  'model-asset-read',
  'workspace-capabilities',
  'gis-datasets',
  'gis-query',
  'gis-statistics',
  'gis-jobs',
  'gis-reviews',
  'gis-issues',
  'gis-members',
  'gis-feature',
  'gis-review-details',
  'gis-review-query',
  'gis-job-preview',
  'gis-job-artifact',
  'gis-views',
  'gis-quality',
]);
export function capabilityForAction(action: string): WorkspaceCapability {
  if (readActions.has(action)) return 'read';
  if (
    [
      'gis-member-save',
      'campus-create',
      'reconcile-baseline',
      'source-schedule',
    ].includes(action)
  )
    return 'manage';
  if (
    ['gis-review-decide', 'gis-issue-save', 'resolve-report'].includes(action)
  )
    return 'review';
  if (
    [
      'gis-review-restore',
      'prepare-release',
      'publish-release',
      'rollback',
    ].includes(action)
  )
    return 'publish';
  return 'edit';
}
export async function workspaceAccess(
  userId: string,
  action: string,
): Promise<WorkspaceCapabilities> {
  const rows = await db<{ roles: WorkspaceRole[] }[]>(
    'campus_memberships?user_id=eq.' +
      encodeURIComponent(userId) +
      '&select=roles',
  );
  const roles = rows[0]?.roles || [],
    capabilities = capabilitiesFor(roles);
  if (!capabilities.includes(capabilityForAction(action)))
    throw new HttpError(403, 'Your campus role does not allow this action.');
  return { userId, campusId: currentCampusId(), roles, capabilities };
}
