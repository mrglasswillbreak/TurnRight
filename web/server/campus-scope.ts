import { AsyncLocalStorage } from 'node:async_hooks';
const context = new AsyncLocalStorage<string>();
export const currentCampusId = () =>
  context.getStore() || process.env.CAMPUS_ID || 'lasu';
export const withCampusId = <T>(id: string, run: () => T): T =>
  context.run(id, run);
export const scopedTables = new Set([
  'source_features',
  'map_edits',
  'map_changes',
  'edit_history',
  'reports',
  'jobs',
  'releases',
  'editor_operations',
  'surveys',
  'survey_revisions',
  'survey_chunks',
  'baseline_reconciliations',
  'source_field_reviews',
  'building_media',
  'model_assets',
  'campus_sources',
  'campus_imports',
  'campus_import_assets',
]);
export function scopeDatabaseRequest(
  path: string,
  method: string,
  body: unknown,
  id = currentCampusId(),
) {
  const table = path.split('?')[0];
  if (!scopedTables.has(table)) return { path, body };
  // Caller-supplied scope never overrides the request's resolved campus.
  const query = new URLSearchParams(path.split('?')[1] || '');
  query.set('campus_id', `eq.${id}`);
  if (method === 'POST') {
    const add = (row: unknown) => ({
      ...(row as Record<string, unknown>),
      campus_id: id,
    });
    body = Array.isArray(body) ? body.map(add) : add(body);
  } else if (body && typeof body === 'object' && !Array.isArray(body)) {
    const { campus_id: _ignored, ...rest } = body as Record<string, unknown>;
    body = rest;
  }
  return { path: `${table}?${query}`, body };
}
