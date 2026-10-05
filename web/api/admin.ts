import { publicationAction } from '../server/publication.js';
import { processStatus } from '../server/process-status.js';
import { workspaceAccess } from '../server/workspace-access.js';
import { gisAction } from '../server/gis.js';
import { mapImportAction } from '../server/map-imports.js';
import { withCampusId } from '../server/campus-scope.js';
import { resolveCampus, campusAction } from '../server/campuses.js';
import { randomUUID, createHash } from 'node:crypto';
import { selectSourceFields } from '../src/source-field-review.js';
import type { MapChange, MapEdit } from '../src/types.js';
import {
  allRows,
  bodyOf,
  db,
  dispatch,
  fail,
  HttpError,
  privateHeaders,
  requireIdentity,
  type RequestLike,
  type ResponseLike,
} from '../server/backend.js';
import { validateEdit } from '../src/editor-model.js';
import { catalogueErrors } from '../src/campus-layers.js';
import type { CampusLayer } from '../src/campus-layer-types.js';
import { surveyAction } from '../server/surveys.js';
import { mediaAction, validateMediaEdits } from '../server/building-media.js';
import {
  publishedCampus,
  publishedRecords,
  snapshotHash,
} from '../server/release-validation.js';
import { validateWorkspace } from '../src/editor-validation.js';
import { publishedWorkspace } from '../server/published-workspace.js';
import { modelAssetAction, hydrateModelEdits } from '../server/model-assets.js';
import {
  sourceReviewQuery,
  SOURCE_REVIEW_PAGE_SIZE,
} from '../server/source-review-query.js';
export default async function handler(req: RequestLike, res: ResponseLike) {
  privateHeaders(res);
  try {
    const user = await requireIdentity(req);
    const {
      action,
      payload = {},
      campus: reference = 'lasu',
    } = bodyOf(req, 3_000_000);
    if (action === 'campus-list') {
      res.status(200).json(await campusAction(action, payload, user.id));
      return;
    }
    const campus = await resolveCampus(reference);
    await withCampusId(campus.id, async () => {
      const capabilities = await workspaceAccess(user.id, action);
      if (action === 'workspace-capabilities') {
        res.status(200).json(capabilities);
        return;
      }
      if (typeof action === 'string' && action.startsWith('gis-')) {
        res.status(200).json(await gisAction(user.id, action, payload));
        return;
      }
      switch (action) {
        case 'import-list':
        case 'import-start':
        case 'import-get':
        case 'import-upload':
        case 'import-run':
        case 'import-cancel':
        case 'import-queue':
        case 'source-schedule':
          res.status(200).json(await mapImportAction(action, payload));
          break;
        case 'campus-list':
        case 'campus-create':
          res.status(200).json(await campusAction(action, payload, user.id));
          break;
        case 'model-asset-begin':
        case 'model-asset-confirm':
        case 'model-asset-read':
          res
            .status(200)
            .json(await modelAssetAction(user.id, action, payload));
          break;
        case 'media-begin':
        case 'media-list':
        case 'media-process':
        case 'media-approve':
        case 'media-revise':
        case 'media-library':
        case 'media-draft':
        case 'media-preview':
        case 'media-status':
        case 'media-upload-url':
          res.status(200).json(await mediaAction(user.id, action, payload));
          break;
        case 'survey-list':
        case 'survey-get':
        case 'survey-save':
          res.status(200).json(await surveyAction(user.id, action, payload));
          break;
        case 'state': {
          const [edits, changes, reports, jobs, releases, published] =
            await Promise.all([
              allRows('map_edits', '&gis_managed=eq.false'),
              db<unknown[]>(sourceReviewQuery()),
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
                  !edits.some(
                    (old: MapEdit) => old.kind === e.kind && old.id === e.id,
                  ),
              ),
            ],
            changes: changes.slice(0, SOURCE_REVIEW_PAGE_SIZE),
            hasMoreChanges: changes.length > SOURCE_REVIEW_PAGE_SIZE,
            reports,
            jobs,
            releases,
            published,
          });
          break;
        }
        case 'process-status': {
          res.status(200).json(await processStatus(payload?.watch));
          break;
        }
        case 'review-status': {
          let changesQuery: string;
          try {
            changesQuery = sourceReviewQuery(payload);
          } catch (error) {
            throw new HttpError(400, (error as Error).message);
          }
          const [jobs, releases, changes, published] = await Promise.all([
            db('jobs?order=created_at.desc&limit=20'),
            db(
              'releases?select=id,status,summary,created_at,preview_url,deployment_url,error,version,review_id&order=created_at.desc&limit=20',
            ),
            db<unknown[]>(changesQuery),
            publishedWorkspace(),
          ]);
          res.status(200).json({
            jobs,
            releases,
            changes: changes.slice(0, SOURCE_REVIEW_PAGE_SIZE),
            hasMoreChanges: changes.length > SOURCE_REVIEW_PAGE_SIZE,
            published,
          });
          break;
        }
        case 'sources': {
          const selected = await editorSelection(user.id, payload.gisKeys);
          const features = await allRows(
            'source_features',
            '&gis_managed=eq.false',
          );
          res.status(200).json({
            features: [
              ...features,
              ...selected.features.filter(
                (f: { id: string }) => !features.some((old) => old.id === f.id),
              ),
            ],
          });
          break;
        }
        case 'review-baseline':
        case 'reconcile-baseline': {
          const [published, features, edits] = await Promise.all([
            publishedCampus(),
            allRows('source_features'),
            allRows('map_edits'),
          ]);
          const expectedHash = snapshotHash(features);
          const validation = validateWorkspace(published, edits);
          if (action === 'review-baseline') {
            res.status(200).json({
              version: published.version,
              expectedHash,
              before: {
                places: features.filter((f) => f.entity === 'place').length,
                edges: features.filter((f) => f.entity === 'edge').length,
              },
              after: {
                places: published.places.length,
                edges: published.graph.edges.length,
              },
              drafts: edits.length,
              issues: validation.issues,
              accessReviews:
                published.accessPolicy?.connectionReviews?.map((r) => ({
                  id: r.id,
                  name: r.name,
                })) || [],
            });
          } else {
            if (
              payload.version !== published.version ||
              payload.expectedHash !== expectedHash
            )
              throw new HttpError(
                409,
                'The published package or source baseline changed. Review again.',
              );
            const receipt = await db(
              'rpc/reconcile_published_baseline',
              'POST',
              {
                actor: user.id,
                published_version: published.version,
                expected_sources: features,
                records: publishedRecords(published),
              },
            );
            res.status(200).json({ receipt, version: published.version });
          }
          break;
        }
        case 'save-edit':
        case 'save-edits': {
          const items =
            action === 'save-edit'
              ? [
                  {
                    edit: payload,
                    expectedUpdatedAt: payload.updated_at || null,
                  },
                ]
              : payload.edits;
          const operationId =
            action === 'save-edit' ? randomUUID() : payload.operationId;
          if (
            typeof operationId !== 'string' ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              operationId,
            ) ||
            !Array.isArray(items) ||
            !items.length ||
            items.length > 500
          )
            throw new HttpError(400, 'Invalid edit batch.');
          const keys = new Set<string>();
          const clean = items.map((item) => {
            const errors = validateEdit(item?.edit, campus);
            if (errors.length) throw new HttpError(400, errors.join(' '));
            if (
              item.expectedUpdatedAt !== null &&
              (typeof item.expectedUpdatedAt !== 'string' ||
                !Number.isFinite(Date.parse(item.expectedUpdatedAt)))
            )
              throw new HttpError(400, 'Invalid draft revision.');
            const { id, kind, geometry, properties, deleted } = item.edit;
            const key = `${kind}:${id}`;
            if (keys.has(key))
              throw new HttpError(400, 'Duplicate edit in batch.');
            keys.add(key);
            return {
              edit: { id, kind, geometry, properties, deleted: !!deleted },
              expectedUpdatedAt: item.expectedUpdatedAt,
            };
          });
          await validateMediaEdits(clean.map((item) => item.edit));
          if (clean.some((i) => i.edit.properties.modelDocument))
            throw new HttpError(
              400,
              'Upload the editable model as a verified private asset before saving.',
            );
          const currentModels = (await editorSelection(user.id, [...keys]))
            .edits as MapEdit[];
          if (clean.some((i) => i.edit.kind === 'layer')) {
            if (payload.layerManagementVersion !== 1)
              throw new HttpError(
                409,
                'Update the editor before saving layers.',
              );
            const layers = new Map(
              ((await allRows('map_edits', '&kind=eq.layer')) as MapEdit[])
                .filter((e) => e.kind === 'layer' && !e.deleted)
                .map((e) => [
                  e.id,
                  e.properties.layerDefinition as CampusLayer,
                ]),
            );
            for (const item of clean)
              if (item.edit.kind === 'layer') {
                if (item.edit.deleted) layers.delete(item.edit.id);
                else
                  layers.set(
                    item.edit.id,
                    item.edit.properties.layerDefinition as CampusLayer,
                  );
              }
            const errors = catalogueErrors([...layers.values()]);
            if (errors.length) throw new HttpError(400, errors.join(' '));
          }
          const authored = clean.some(
            (i) =>
              i.edit.properties.modelDocumentAsset ||
              currentModels.some(
                (old) =>
                  old.kind === i.edit.kind &&
                  old.id === i.edit.id &&
                  old.properties.modelDocumentAsset,
              ),
          );
          if (authored && payload.modelDocumentVersion !== 1)
            throw new HttpError(
              409,
              'Update the app before editing this authored model. Your local work is retained.',
            );
          if (authored) {
            const hydrated = await hydrateModelEdits(
              clean.map((i) => i.edit),
              user.id,
            );
            for (const edit of hydrated) {
              const errors = validateEdit(edit, campus);
              if (errors.length) throw new HttpError(400, errors.join(' '));
            }
          }
          if (
            payload.modelAuthoringVersion !== 1 &&
            clean.some((item) => item.edit.kind === 'building')
          ) {
            const current = currentModels;
            if (
              clean.some(
                (item) =>
                  item.edit.properties.modelAuthoring ||
                  current.some(
                    (old) =>
                      old.kind === 'building' &&
                      old.id === item.edit.id &&
                      old.properties.modelAuthoring,
                  ),
              )
            )
              throw new HttpError(
                409,
                'Update the app before editing this building. Its model uses newer authoring controls. Your changes are retained locally.',
              );
          }
          const result = await db(
            payload.layerManagementVersion === 1
              ? 'rpc/save_editor_layer_batch'
              : authored
                ? 'rpc/save_editor_model_batch'
                : 'rpc/save_editor_batch',
            'POST',
            {
              operation_id: operationId,
              actor_id: user.id,
              items: clean,
            },
          );
          res.status(200).json(action === 'save-edit' ? result[0] : result);
          break;
        }
        case 'review-change': {
          if (
            typeof payload.id !== 'string' ||
            typeof payload.accept !== 'boolean'
          )
            throw new HttpError(400, 'Invalid review decision');
          if (payload.fields !== undefined) {
            if (
              !payload.accept ||
              !Array.isArray(payload.fields) ||
              payload.fields.some((f: unknown) => typeof f !== 'string')
            )
              throw new HttpError(400, 'Invalid field selection');
            const [change] = await db<MapChange[]>(
              `map_changes?id=eq.${encodeURIComponent(payload.id)}&status=eq.pending`,
            );
            if (!change)
              throw new HttpError(409, 'Change is no longer pending');
            let next;
            try {
              next = selectSourceFields(change, payload.fields);
            } catch (e) {
              throw new HttpError(400, (e as Error).message);
            }
            const stable = (v: unknown): unknown =>
              Array.isArray(v)
                ? v.map(stable)
                : v && typeof v === 'object'
                  ? Object.fromEntries(
                      Object.entries(v)
                        .filter(
                          ([key]) =>
                            !['createdAt', 'retrievedAt', 'checkedAt'].includes(
                              key,
                            ),
                        )
                        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
                        .map(([k, value]) => [k, stable(value)]),
                    )
                  : v;
            next.hash = createHash('sha256')
              .update(JSON.stringify(stable(next.payload)))
              .digest('hex');
            await db('rpc/review_map_fields', 'POST', {
              change_id: payload.id,
              expected_before: change.before,
              expected_after: change.after,
              reviewed_record: next,
              selected_fields: payload.fields,
              actor_id: user.id,
            });
            res.status(200).json({ ok: true });
            break;
          }
          await db('rpc/team_review_source', 'POST', {
            actor: user.id,
            change_identity: payload.id,
            accept: payload.accept,
          });
          res.status(200).json({ ok: true });
          break;
        }
        case 'resolve-report': {
          if (
            !['resolved', 'dismissed'].includes(payload.status) ||
            typeof payload.id !== 'string'
          )
            throw new HttpError(400, 'Invalid report action');
          await db(`reports?id=eq.${encodeURIComponent(payload.id)}`, 'PATCH', {
            status: payload.status,
          });
          res.status(200).json({ ok: true });
          break;
        }
        case 'check-sources': {
          if (campus.id !== 'lasu') {
            const listed = (await mapImportAction('import-list', {})) as {
              sources: import('../src/map-import-types.js').CampusSource[];
            };
            const online = listed.sources.filter((s) => s.kind !== 'file');
            if (!online.length)
              throw new HttpError(
                400,
                'Add an online source in Campuses, or upload a replacement file.',
              );
            for (const source of online) {
              const result = (await mapImportAction('import-start', {
                sourceId: source.id,
              })) as { job: { id: string } };
              await mapImportAction('import-run', {
                importId: result.job.id,
                phase: source.configuration.layers.length
                  ? 'preview'
                  : 'inspect',
              });
            }
            res.status(202).json({ started: online.length });
            break;
          }
          const recent = await db(
            'jobs?kind=eq.import&status=in.(queued,running)&order=created_at.desc&limit=1',
          );
          if (
            recent[0] &&
            Date.now() - Date.parse(recent[0].created_at) < 15 * 60000
          )
            throw new HttpError(409, 'An import is already running.');
          const [job] = await db('jobs', 'POST', {
            kind: 'import',
            status: 'queued',
          });
          try {
            await dispatch('source-update.yml', { job_id: job.id });
          } catch (e) {
            await db(`jobs?id=eq.${job.id}`, 'PATCH', {
              status: 'failed',
              message: (e as Error).message,
            });
            throw e;
          }
          res.status(202).json({ id: job.id });
          break;
        }
        case 'prepare-release':
        case 'publish-release':
        case 'rollback':
          res
            .status(202)
            .json(await publicationAction(user.id, action, payload));
          break;
        case 'export':
          res.status(200).json({
            sources: await allRows('source_features'),
            edits: await allRows('map_edits'),
            history: await allRows('edit_history'),
          });
          break;
        default:
          throw new HttpError(400, 'Unknown action');
      }
    });
  } catch (error) {
    fail(res, error);
  }
}

async function editorSelection(actor: string, keys: unknown) {
  if (keys === undefined) return { features: [], edits: [] };
  if (
    !Array.isArray(keys) ||
    keys.length > 500 ||
    keys.some((key) => typeof key !== 'string' || key.length > 500)
  )
    throw new HttpError(400, 'Load at most 500 selected GIS features.');
  return db('rpc/gis_hydrate_editor', 'POST', { actor, keys });
}
