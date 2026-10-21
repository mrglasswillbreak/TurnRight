import { workspaceAccess } from './workspace-access.js';
import { resolveCampus } from './campuses.js';
import type { MapEdit } from '../src/types.js';
import { allRows, db, type ResponseLike } from './backend.js';
import { publishedCampus } from './release-validation.js';
import { publishedWorkspace } from './published-workspace.js';
import {
  sourceReviewQuery,
  SOURCE_REVIEW_PAGE_SIZE,
} from './source-review-query.js';
import { editorSelection } from './admin-selection.js';
export async function sendWorkspaceState(
  user: { id: string },
  payload: Record<string, unknown>,
  campus: Awaited<ReturnType<typeof resolveCampus>>,
  capabilities: Awaited<ReturnType<typeof workspaceAccess>>,
  res: ResponseLike,
): Promise<void> {
  const [edits, changes, reports, jobs, releases, published] =
    await Promise.all([
      allRows<MapEdit>('map_edits', '&gis_managed=eq.false'),
      payload.sourceReviewVersion === 2
        ? Promise.resolve([])
        : db<unknown[]>(sourceReviewQuery()),
      db('reports?status=eq.pending&order=created_at.desc&limit=200'),
      db('jobs?order=created_at.desc&limit=20'),
      db(
        'releases?select=id,status,summary,created_at,preview_url,deployment_url,error,version,review_id&order=created_at.desc&limit=20',
      ),
      publishedWorkspace(),
    ]);
  const selected = await editorSelection(user.id, payload.gisKeys);
  res.status(200).json({
    campus,
    capabilities,
    base: campus.id === 'lasu' ? undefined : await publishedCampus(),
    edits: [
      ...edits,
      ...selected.edits.filter(
        (e: MapEdit) =>
          !edits.some((old: MapEdit) => old.kind === e.kind && old.id === e.id),
      ),
    ],
    changes: changes.slice(0, SOURCE_REVIEW_PAGE_SIZE),
    hasMoreChanges: changes.length > SOURCE_REVIEW_PAGE_SIZE,
    reports,
    jobs,
    releases,
    published,
  });
}
