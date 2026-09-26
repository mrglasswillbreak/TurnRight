import { readPublishedCatalogue } from '../scripts/published-campus-catalogue.mjs';
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
  requireAdmin,
  type RequestLike,
  type ResponseLike,
} from '../server/backend.js';
import { validateEdit } from '../src/editor-model.js';
import { surveyAction } from '../server/surveys.js';
import { mediaAction, validateMediaEdits } from '../server/building-media.js';
import {
  publishedCampus,
  publishedRecords,
  snapshotHash,
  validateReleaseSnapshot,
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
    const user = await requireAdmin(req);
    const {
      action,
      payload = {},
      campus: reference = 'lasu',
    } = bodyOf(req, 3_000_000);
    const campus = await resolveCampus(reference);
    await withCampusId(campus.id, async () => {
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
          res.status(200).json(await campusAction(action, payload));
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
              allRows('map_edits'),
              db<unknown[]>(sourceReviewQuery()),
              db('reports?status=eq.pending&order=created_at.desc&limit=200'),
              db('jobs?order=created_at.desc&limit=20'),
              db(
                'releases?select=id,status,summary,created_at,preview_url,deployment_url,error,version&order=created_at.desc&limit=20',
              ),
              publishedWorkspace(),
            ]);
          res.status(200).json({
            campus,
            base: campus.id === 'lasu' ? undefined : await publishedCampus(),
            edits,
            changes: changes.slice(0, SOURCE_REVIEW_PAGE_SIZE),
            hasMoreChanges: changes.length > SOURCE_REVIEW_PAGE_SIZE,
            reports,
            jobs,
            releases,
            published,
          });
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
              'releases?select=id,status,summary,created_at,preview_url,deployment_url,error,version&order=created_at.desc&limit=20',
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
        case 'sources':
          res.status(200).json({ features: await allRows('source_features') });
          break;
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
            const errors = validateEdit(item?.edit);
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
          const currentModels = (await allRows('map_edits')) as MapEdit[];
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
              const errors = validateEdit(edit);
              if (errors.length) throw new HttpError(400, errors.join(' '));
            }
          }
          if (
            payload.modelAuthoringVersion !== 1 &&
            clean.some((item) => item.edit.kind === 'building')
          ) {
            const current = (await allRows('map_edits')) as MapEdit[];
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
            authored ? 'rpc/save_editor_model_batch' : 'rpc/save_editor_batch',
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
          await db('rpc/review_map_change', 'POST', {
            change_id: payload.id,
            accept_change: payload.accept,
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
        case 'prepare-release': {
          if (
            typeof payload.summary !== 'string' ||
            payload.summary.trim().length < 5 ||
            payload.summary.length > 500
          )
            throw new HttpError(
              400,
              'Provide a release summary between 5 and 500 characters.',
            );
          const { revision: catalogueHash } = await readPublishedCatalogue(
            process.env.PUBLISHED_MAP_URL!,
          );
          const id = await db<string>('rpc/snapshot_release', 'POST', {
            catalogue_hash: catalogueHash,
            release_summary: payload.summary.trim(),
          });
          try {
            const [release] = await db(
              `releases?id=eq.${encodeURIComponent(id)}&select=snapshot`,
            );
            validateReleaseSnapshot(
              {
                ...release.snapshot,
                edits: await hydrateModelEdits(release.snapshot.edits, user.id),
              },
              await publishedCampus(),
            );
            await dispatch('release.yml', {
              release_id: id,
              operation: 'preview',
              campus_id: campus.id,
            });
          } catch (e) {
            await db(`releases?id=eq.${id}`, 'PATCH', {
              status: 'failed',
              error: (e as Error).message,
            });
            throw e;
          }
          res.status(202).json({ id });
          break;
        }
        case 'publish-release':
        case 'rollback': {
          if (typeof payload.id !== 'string')
            throw new HttpError(400, 'Choose a release');
          const [release] = await db(
            `releases?id=eq.${encodeURIComponent(payload.id)}&select=id,status,deployment_id,snapshot,catalogue_revision,restored_from`,
          );
          if (
            !release?.deployment_id ||
            (action === 'publish-release' && release.status !== 'preview') ||
            (action === 'rollback' && release.status !== 'published')
          )
            throw new HttpError(
              400,
              'This release is not ready for that action.',
            );
          const { revision: catalogueHash } = await readPublishedCatalogue(
            process.env.PUBLISHED_MAP_URL!,
          );
          if (action === 'rollback') {
            const id = await db<string>('rpc/restore_campus_release', 'POST', {
              previous_id: release.id,
              catalogue_hash: catalogueHash,
            });
            try {
              await dispatch('release.yml', {
                release_id: id,
                operation: 'preview',
                campus_id: campus.id,
              });
            } catch (error) {
              await db(`releases?id=eq.${id}`, 'PATCH', {
                status: 'failed',
                error: (error as Error).message,
              });
              throw error;
            }
            res.status(202).json({ id, previewRequired: true });
            break;
          }
          if (release.catalogue_revision !== catalogueHash)
            throw new HttpError(
              409,
              'Another campus was published after this preview. Build a fresh preview.',
            );
          if (action === 'publish-release') {
            const [published, features, edits] = await Promise.all([
              publishedCampus(),
              allRows('source_features'),
              allRows('map_edits'),
            ]);
            validateReleaseSnapshot(
              {
                ...release.snapshot,
                edits: await hydrateModelEdits(release.snapshot.edits, user.id),
              },
              published,
              { restoring: !!release.restored_from },
            );
            if (
              !release.restored_from &&
              snapshotHash(
                release.snapshot.features,
                release.snapshot.edits,
              ) !== snapshotHash(features, edits)
            )
              throw new HttpError(
                409,
                'This preview is stale. Build a new preview from the current sources and drafts.',
              );
          }
          await dispatch('release.yml', {
            release_id: release.id,
            operation: 'publish',
            campus_id: campus.id,
          });
          res.status(202).json({ id: release.id });
          break;
        }
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
