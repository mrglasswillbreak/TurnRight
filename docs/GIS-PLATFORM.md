# Campus GIS team workflow

This implementation connects the existing campus importer, geometry editor, model/photo assets and immutable release pipeline to team permissions, typed datasets, indexed feature queries and repeatable analysis. It retains React, MapLibre, Supabase/PostGIS, Vercel and GitHub Actions. The changes are additive after migration 022. They have not been applied to a live database or deployed as part of this implementation.

The milestone is a small-team campus workflow, with a 100,000-feature dataset target and separately bounded public navigation packages. Enterprise tenancy/SSO, editing branches, a visual workflow designer, raster georeferencing, OGC service endpoints, atlases and desktop GIS parity remain outside this release. No OGC conformance is claimed.

## Use the connected workflow

1. **Set up the team.** The existing owner is backfilled as an administrator for existing campuses. In **Review → Campus memberships**, an administrator adds an existing Supabase Auth user by UUID and assigns one or more roles. Invitation/email delivery is not included. Removing all roles revokes campus access; the final administrator cannot be removed.
2. **Import.** Use **Campuses** for spatial files, public ArcGIS and OSM imports. Inspect the mapping, CRS, diagnostics and preview, then accept source proposals into the shared draft. Source acceptance is an editing operation and records its contributor; it does not approve a public release. Reopening an import fetches its current validation results. In **Data**, import an asset CSV as a private non-spatial table. Quoted CSV cells, leading-zero identifiers, booleans and nulls are preserved.
3. **Inspect and edit.** Select a dataset in **Data**. Choose columns, filter, sort, calculate field statistics, restrict to the map extent and page through 100 rows at a time. Attribute cells validate against typed fields, required values and coded domains. **Edit geometry** loads the chosen feature into the existing map editor with its normal undo, revision guards and recovery. **Save and end geometry session** saves and unloads these GIS features, clearing only their geometry-session history. A session holds at most 500 GIS features. Large changes use processing jobs.
4. **Join and analyze.** In **Analyze**, select the source and optional overlay/table, a tool, parameters and an output name. For an attribute join, select matching keys and the fields to copy. Table keys must be unique; null keys do not match. Inspect the staged result and diagnostics before applying it as a new private dataset. Applying never replaces source geometry or grants routing permissions. Rerun settings retains prior filters/selections and parameters but uses current input revisions; the UI identifies retained selections. A source refresh makes an old result inapplicable until rerun.
5. **Style.** Configure field aliases, units, required values, domains and public-field selection in **Data → Schema, styling and publication fields**. Styles support categorical classes, graduated numeric classes, proportional point symbols and field labels. Save named filters and shared map views. Arbitrary attributes are private by default; public labels/styles must explicitly use selected public fields.
6. **Resolve quality issues.** **Review** combines existing map validation with indexed geometry, attribute and source-conflict checks. Reviewers can track issues, assign a campus member, add comments/evidence links and record dispositions. Blocking errors must be resolved. Evidence uses HTTPS links; attached survey, photo and model evidence continues through the existing asset workflows.
7. **Submit and independently approve.** An editor submits a validated immutable snapshot. Its content hash covers source data, corrections, schemas, attribute overlays, tables, quality issues and saved views. Geometry/data/source/view contributors cannot approve their own submission. The original owner may record an explicit override with a reason. Administrative membership alone does not permit that override. Review triage is recorded separately from data authorship. Subsequent content changes require a fresh submission.
8. **Preview and publish.** A publisher selects the approved snapshot in **Publish**, builds the preview, inspects it and publishes it. Both server and database check the approval and current roles. A short publication lease prevents draft changes during promotion. Restoring a historical release creates a new independent review submission while retaining the shared current draft. Other campuses and legacy public package readers remain isolated and compatible.
9. **Export and reopen offline.** Export selected or filtered data from **Data**, then download the completed job from **Analyze**. GeoJSON, CSV and GeoPackage exports include a metadata receipt with input revisions, CRS, processing versions and provenance. GeoPackage preserves stable IDs in the receipt's `identityField`; CSV includes `feature_id` and WGS84 WKT, with spreadsheet formula escaping. In **Publish**, A4/A3 templates export PNG or use the browser print dialog's **Save as PDF**. **Export released map layout** opens the immutable deployment and checks its package version before exporting. Download the resulting published campus through the public **Offline** panel before disconnecting.

Roles compose; the server does not trust controls merely being hidden:

| Role | Allowed work |
| --- | --- |
| Administrator | Membership/campus settings and all workflow capabilities |
| Editor | Import, accept draft sources, edit, analyze, export, submit |
| Reviewer | Read, manage QA issues, inspect submissions, approve/request changes |
| Publisher | Read, prepare/publish approved snapshots, submit restorations |

Recovery records and unfinished uploads remain personal. Ready models and approved photographs attached to current or immutable campus work can be reused by authorized teammates. Original upload paths, private photo drafts and unattached assets are not shared. Completed attached survey evidence is readable; unfinished surveys remain personal.

## Data and processing boundaries

`source_features` and `map_edits` remain authoritative for geometry. Original primitive attributes live in `source_features.private_attributes`; correction values live in `gis_attributes`. Non-spatial originals live in `gis_table_rows`. `gis_datasets` stores versioned schemas, CRS, provenance, style and publication choices. Stable campus/dataset/feature keys join these records. Source field metadata is retained separately in `gis_metadata`; existing source file artifacts remain the complete import record.

`gis_feature_index` is a rebuildable representation of effective geometry and attributes, with a PostGIS GiST spatial index and dataset revision tracking. Queries carry a revision and opaque cursor. Changes invalidate cursors; they do not silently mix pages from different revisions. Immutable review features have their own frozen, paged representation, including historical correction geometry and table rows.

The searchable catalogue contains buffer, clip, intersect, difference, dissolve, select by location, spatial join, nearest, summarize within, area/length, attribute join, restricted calculation and export. PostGIS handles bounded queries; `scripts/gis/process.py` handles processing inside the isolated GDAL/GEOS/PROJ container. Each job records its actor, immutable inputs, revisions, parameters, engine, CRS, diagnostics, progress and outputs. Leases and run tokens reject cancelled/expired completion; application rechecks input revisions and permissions.

Coordinates are stored as WGS84 longitude/latitude. Metric tools require an EPSG WGS84 UTM zone (32601–32660 or 32701–32760), use metres, validate input extents against the zone and record the transformation. Broader projected CRS support is not implemented. Invalid input geometry produces an explicit diagnostic. Geometry collections produced by operations are split into stable editable parts; multipart geometries and holes are retained.

Spatial joins are one-to-many with null values for unmatched inputs. Nearest ties resolve by stable feature identity. Summarize-within counts wholly contained features; measure returns square metres/metres. The field calculator interprets a restricted expression tree with fields, constants, arithmetic, `abs`, `round`, `min`, `max`, `coalesce`, `concat`, `lower` and `upper`. It has no Python execution, file access, imports or attribute access.

| Boundary | Limit/behavior |
| --- | --- |
| Interactive feature query | 1–500 rows, at most 2 MB; Data renders 100 rows/geometries |
| Interactive geometry/attribute batch | At most 500; revision guarded and idempotent |
| Dataset fields | 100, with up to 200 coded values per field |
| CSV upload | 2.5 MB and 100,000 rows |
| Processing | 100,000 features and 50 MiB per input/output; three active jobs per campus |
| Worker | No network, read-only root, unprivileged UID, 2 GB RAM, 2 CPUs, 18-minute processing deadline |
| Staged result preview | First 100 features; full output is retained by the job |
| Public navigation | 20,000 map features and 25 MB; large/private analysis layers stay outside it |
| Draft map layout | Five selected layers, at most 500 visible features each; zoom in if truncated |
| Released map layout | The verified bounded public package, with its exact version/date/hashes |

Map templates support the **current draft viewport** and **immutable released packages**. Drafts are visibly dated as drafts. A released layout opens the exact deployment, checks the requested package version and retains the release version, package date and immutable asset hashes; it never queries private drafts. Public cartography metadata includes only selected dataset identities, revisions and styles. PNGs embed a `TurnRightLayout` UTF-8 receipt with the viewport, available dataset metadata and SHA-256 of the PNG before receipt insertion. Keep that artifact for reproducible raster output. Templates reject an incomplete draft extent, unloaded tiles, pitched map or overflowing legend. The scale is approximate at the map centre. PDF uses browser printing; vector PDF and a layout designer remain future work.

## Module boundaries and compatibility

`web/server/workspace-access.ts`, `gis-datasets.ts`, `gis-processing.ts`, `gis-review.ts`, `gis-publication.ts` and `publication.ts` separate authorization, data access, jobs, review and publication from `/api/admin`. The compatibility dispatcher remains available. `web/src/gis-types.ts` defines `DatasetSchema`, `FeatureQuery`, `ProcessingJob`, `ReviewSubmission`, `WorkspaceCapabilities` and the shared action contracts. Boundary validators reject unsupported requests; SQL also enforces permissions, revisions and data invariants.

`GisWorkspace` loads Data, Analyze, Review and Publish on demand. Editing retains one map and the existing command/recovery system. Read-only members receive the team workspace without geometry-editing controls. GIS table geometry loads are bounded and do not create edit commands merely by inspection. The original layer table now calculates its checked state against the same bounded 500 rows it selects, including an indeterminate state.

Public startup and editor-entry budgets have not been increased. Each new GIS workspace has a separate 20 KiB compressed incremental dependency budget. Offline precache checks include the new lazy dependencies; private database queries and analysis still need a connection.

## Reproducible development and acceptance

Use **Node 22.23.3**, pinned by `.node-version` and `.nvmrc`, then run inside `web`:

```sh
npm ci
npm test -- --maxWorkers=2
npm run lint
npm run check:configured-build
npx playwright test tests/browser/gis-workflow.spec.ts
npx playwright test --config playwright.webkit.config.ts tests/browser/gis-workflow.spec.ts
npx playwright test --config playwright.pwa.config.ts
```

From the repository root, use the pinned processing image for native geometry/GeoPackage verification:

```sh
docker build -t turnright-gis scripts/gis
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp:rw,size=512m -v "$PWD/scripts:/app:ro" --entrypoint python3 turnright-gis -m unittest discover -s /app/tests -p 'test_gis_processing.py' -v
```

The Dockerfile pins GDAL 3.11.4 by image digest, Shapely 2.1.2 and pyproj 3.7.2. `gis-acceptance.yml` also uses a disposable native PostgreSQL 17/PostGIS 3.5 service, applies every migration, checks 100,000-feature processing/query/review behavior and exercises `pg_dump`/`pg_restore`. `scripts/gis/check_database.py` refuses an existing/non-test database. Routine unit tests additionally apply all migrations with actual PostGIS compiled for PGlite; that is useful local coverage, not a substitute for the native service gate.

Pull requests run the quality, browser, offline, importer and native GIS workflows. Both preview and publication call the comprehensive regression and GIS gates. Gate failure records a failed release instead of leaving it queued. Repository administrators must configure branch protection to require the `quality`, `browsers`, `offline`, `native-postgis`, `isolated-engine` and importer jobs after their check names appear; workflow files cannot set GitHub branch protection by themselves.

## Additive rollout and recovery

1. Verify an encrypted backup and restoration of the database, private buckets and retained release/model/photo assets. Record public package hashes and private per-campus source/edit counts. Pause source import/reconciliation, editing and publication while applying migrations; existing browsers must reload afterward.
2. Apply **023 through 037 in order** to a staging clone first. They backfill campus memberships, typed datasets and effective spatial indexes, then add processing, independent review, bounded editor reads and integrity guards. Apply each migration once using the normal migration ledger. No 001–022 file is changed. Large existing campuses may need a maintenance window for backfill/index construction.
3. Compare authoritative source/correction counts and geometry against the index; check CRS inference and source attributes on representative features. Check owner memberships in every existing campus and test cross-campus denial. In a disposable staging transaction, verify that rebuilding changes neither data nor dataset revisions:

   ```sql
   begin;
   select set_config('request.headers', '{"x-turnright-campus":"lasu"}', true);
   create temporary table before_gis as
     select dataset_id, feature_key, geometry, properties
     from gis_feature_index where campus_id='lasu';
   create temporary table before_revisions as
     select id, revision from gis_datasets where campus_id='lasu';
   select gis_rebuild_index('lasu');
   select count(*) as differences from (
     (select * from before_gis except select dataset_id,feature_key,geometry,properties from gis_feature_index where campus_id='lasu')
     union all
     (select dataset_id,feature_key,geometry,properties from gis_feature_index where campus_id='lasu' except select * from before_gis)
   ) differences;
   select count(*) as changed_revisions from before_revisions b
     join gis_datasets d on d.id=b.id and d.campus_id='lasu'
     where b.revision<>d.revision;
   rollback;
   ```

4. Deploy the matching API/UI and GitHub worker workflows together. Keep the existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, GitHub dispatch configuration, Vercel release credentials and `PUBLISHED_MAP_URL` configured as in [Deployment](DEPLOYMENT.md). `gis-processing.yml` needs the Supabase secrets and Docker runner; it accepts `campus_id`/`job_id`. Migration 027 creates the private `gis-private` export bucket. Service credentials stay on the host; the parsing container receives only job files.
5. Pilot one campus with separate editor and reviewer accounts, plus a publisher role. Import a spatial dataset and asset CSV, join, edit, buffer/spatial-join, style, triage, submit, independently approve, preview, publish, export GeoPackage/PNG/PDF and reopen the published campus offline. Revoke roles during edits/jobs; refresh sources during analysis; verify stale approvals, cancellation, shared ready assets, personal drafts and original-owner override audit. Verify retained hashes and offline operation for the other campus. There is no per-campus feature flag: use staging and controlled membership/access for the pilot, and defer other-campus writes/publication until acceptance.
6. Expand after the native service/container gates, browser/offline journeys and backup-restoration exercise pass. Application rollback must retain the additive database data/guards. Restoring public content uses the reviewed campus restoration flow; it does not overwrite drafts or promote an old whole-site deployment. Do not delete new tables or discard private dataset attributes during rollback.

## Verification status

The final local verification used Node 22.23.3:

| Check | Result |
| --- | --- |
| Unit and database suites | **714 tests across 99 files passed**, including migrations 023–037 with PGlite/PostGIS |
| TypeScript | Both application and server projects passed |
| Lint | Passed with eight pre-existing warnings and no errors |
| Configured production build | Passed all existing asset, offline precache and bundle budgets |
| Public startup JavaScript | 433,679 / 435,200 gzip bytes |
| Additional editor JavaScript | 167,389 / 189,440 gzip bytes |
| Lazy GIS workspaces and released layout | Each below its separate 20,480-byte gzip budget |
| New GIS browser journeys | All four passed in Chromium and WebKit, including paged editing/review, role restrictions, CSV joins/styling, PNG receipts and exact released-package identity |
| Prepared offline journeys | All nine passed, covering navigation, surveys, models, photos, enrichment and recovery |
| Python suites | 66 passed; five native GDAL-dependent tests skipped |
| Repository whitespace | `git diff --check` passed |

Database coverage includes migration application, role revocation, cross-campus denial, independent and stale approval, audited overrides, typed values, private CSV round trips, index rebuilds, 100,000-feature paging, cancelled jobs, effective historical geometry, shared approved photographs and source contributor attribution. Browser GIS journeys use isolated API/auth fixtures with the real React/MapLibre UI; they do not claim a live Supabase/Vercel end-to-end release or a complete 100,000-feature device benchmark. Existing campus-import and bounded-selection browser regressions also passed. The full browser matrix remains a release CI requirement.

Native Docker/PostgreSQL service execution, full release CI, live deployment, physical devices and field verification remain rollout gates. The Windows development environment has no Docker/GDAL; five native GIS tests are therefore skipped locally and required in the pinned Linux workflows. Existing production receipts in [Production](PRODUCTION.md) are unchanged by this work.
