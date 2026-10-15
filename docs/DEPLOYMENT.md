# Deploying TurnRight

TurnRight deploys a public campus PWA, a private team GIS API and isolated processing/release workers. Application deployment preserves the already published campus packages. Publishing changed campus data is a separate, independently approved operation. [Current account settings](CONFIGURATION.md) · [Actual production receipts](PRODUCTION.md) · [Team workflow](GIS-PLATFORM.md).

## Existing-installation upgrade

1. Read the current production receipt and inspect the database. Do not infer installed migrations from filenames or rerun initialized schema migrations. The current source requires **001–052**; the original GIS milestone was 023–037. Follow the feature-specific backfills and staged rollout below for later migrations.
2. Preserve source records, corrections, source configurations, release snapshots and referenced private assets. Verify backup read-back and retain recovery receipts outside public application assets. Run the native database restoration exercise against a disposable database.
3. Pass unit/database tests, both TypeScript projects, lint, configured build/budgets, Chromium/WebKit, offline, native PostGIS and isolated GIS/importer checks. Resolve failures before production migration.
4. Stop source imports/reconciliation, editing and content publication during the database update. Apply missing migrations in order in a transaction where the deployment transport permits. Backfill memberships and effective spatial indexes; verify source/correction counts, original content fingerprints, owner membership, campus isolation and index rebuild equivalence.
5. Deploy matching API/UI and workers together. Production dispatch uses main, so a preview branch alone does not update workers. Keep PUBLISHED_MAP_URL enabled and verify public manifests/assets retain the pre-deployment hashes.
6. Check authenticated team capabilities, bounded dataset reads, denied anonymous requests, both campus maps and offline reopening. Pilot import/CSV join/edit/analysis/independent review/preview/publication with separate accounts before broad team adoption. Reload older editing clients after migration.

The complete [GIS rollout checklist](GIS-PLATFORM.md#additive-rollout-and-recovery) includes the index comparison SQL and concurrency/asset cases. The production receipt records which checks actually ran. A successful application deployment alone is not a field/device or live multi-user acceptance result.

## Fresh installation

### Sources and rights

Resolve redistribution permission for every source before packaging it for public/offline use. The existing LASU and UNILAG confirmations apply to their recorded sources, not arbitrary new campuses. Keep attribution and photo licences intact. SOURCE_REDISTRIBUTION_APPROVED=true is required for hosted builds after that check. [Attribution](../data/ATTRIBUTION.md).

### Supabase and authentication

Create the project, retain the database credentials privately, and apply **all migrations 001–052 in numeric order**. PostGIS, private tables, explicit grants/RLS, transactional saves, personal surveys/media, campus imports, datasets, spatial indexes, jobs and review guards are part of the schema. [Migration responsibilities](CONFIGURATION.md#database-and-private-storage).

Enable GitHub sign-in with the exact Supabase callback and exact application /admin redirect URLs. Keep anonymous sign-in disabled. Register the original owner in admin_users and set ADMIN_USER_ID to that Auth UUID. The original-owner row bootstraps campus administrators; ordinary access then comes from campus_memberships. Signing in alone grants no campus access. An administrator can assign existing Auth users by UUID in Settings → Campus memberships. Invitation email and SSO are not included.

Use the existing bootstrap workflow only on an empty source baseline; it refuses to overwrite existing records. Never reinitialize an established project.

### Vercel

| Setting | Value |
| --- | --- |
| Framework / root | Vite / web |
| Include source outside root | Enabled for repository tooling |
| Node | 22.x; development and CI pin 22.23.3 |
| Install / build / output | npm ci / npm run build / dist |
| Production branch | main |
| Ignored Build Step | Automatic |

Keep preview protection and existing project cost limits. Review a compatible preview before switching production. Do not promote an old whole-site deployment to restore only one campus.

Set these in **both Preview and Production**:

| Variable | Purpose and exposure |
| --- | --- |
| VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY | Public client configuration; RLS still applies |
| SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY | Server-only API configuration; use the supported service-role JWT |
| ADMIN_USER_ID | Original-owner Auth UUID; bootstrap and explicit override identity |
| GITHUB_REPOSITORY | Worker repository |
| GITHUB_WORKFLOW_TOKEN | Repository-scoped Actions dispatch credential, server-only |
| REPORT_RATE_SALT | Server-only unique random report-rate salt |
| SOURCE_REDISTRIBUTION_APPROVED | Build confirmation for source rights |
| PUBLISHED_MAP_URL | Stable production origin; enable after the first public release |

Never store service credentials in browser variables, Git, screenshots or public artifacts. PUBLISHED_MAP_URL makes ordinary code builds fetch and verify the current catalogue, campus packages and retained assets. If verification fails, the build stops. Initially omit it only when no public release exists.

Complete required backfills and the per-source reliability rollout before enabling proposal generation.

### GitHub Actions

Configure existing secrets SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VERCEL_TOKEN, VERCEL_ORG_ID and VERCEL_PROJECT_ID. Service credentials remain on the runner; isolated parsing containers receive files and no network. Keep an included-usage spending limit and do not enable paid upgrades as part of ordinary deployment.

| Workflow | Responsibility |
| --- | --- |
| regression-audit.yml | Unit/types/lint/configured build, Chromium/WebKit and prepared offline checks |
| gis-acceptance.yml | Native PostGIS migrations, 100,000-feature queries/jobs, approval locks, pg_dump/pg_restore and isolated engine/GeoPackage tests |
| map-import-tests.yml | Native import-format and private worker-mount regressions |
| gis-processing.yml | One campus-scoped analysis/export job with cancellation, leases and staged output |
| map-import.yml / map-source-check.yml | Private source inspection/preview and opted-in refresh candidates |
| source-review.yml / source-review-maintenance.yml | Bounded source decisions, index backfill and receipt housekeeping |
| import-retention.yml | Bounded cleanup of eligible import artifacts; referenced evidence remains protected |
| release.yml | Gated preview or publication of an approved immutable submission |
| campus-detail-verification.yml | Served package hashes, real-campus browser views, offline reopening and retained restore assets |

Protect main with an up-to-date branch requirement and these GitHub Actions checks: `quality`, `offline`, `browsers (chromium, 1, 4)` through `browsers (chromium, 4, 4)`, `browsers (webkit, 1, 2)`, `browsers (webkit, 2, 2)`, `native-postgis`, `isolated-engine` and `gis`. Bind them to the GitHub Actions app and enforce them for administrators too. All three workflows run on every pull request, including documentation changes, so a required check cannot remain pending because of a path filter. Workflow files cannot configure branch protection by themselves. Preserve artifacts containing useful receipts; private record data must stay in private storage or encrypted backups.

## Team publication

Editors accept source proposals into the shared draft, edit attributes/geometry and apply inspected analysis results. New arbitrary attributes and result layers stay private. Model/photograph approval and source acceptance do not replace independent campus snapshot approval.

In **Review**, resolve blocking issues and submit a validated immutable snapshot. A reviewer who did not contribute approves the exact hash, or the original owner records an explicit override reason. New content invalidates approval. Publishers use **Publish** to build the approved preview, inspect it, then publish the same source. Both API and SQL recheck current roles; a short publication lease prevents concurrent draft changes during promotion.

The worker validates schemas, selected public fields, styles, lineage and assets, creates immutable packages, waits for Vercel READY and verifies production assignment. A failed job leaves the preceding public release active. **Activity** reports stages; an uncertain request should be inspected before retrying.

Restoring one campus creates a new review submission from historical content. It leaves the shared current draft intact and preserves every other campus's current package. Retain immutable hashes, snapshots and referenced assets. Older clients remain on their downloaded version until a verified replacement is selected.

## Recovery and operational limits

Retain additive database tables/guards when rolling application code back. Do not discard dataset attributes, approvals or operation receipts. Recover one campus's public content through a reviewed restore, not a whole-site rollback. Restoring a private database backup requires an explicit controlled restoration procedure; there is no public browser restore endpoint.

For the dated 5 October upgrade, the encrypted application backup contains public application tables and private storage objects; Supabase Auth and platform configuration are outside its scope. Keep the RSA private key separately from the Actions artifact. After extracting the artifact into a private directory containing `backup-private.pem`, run `node scripts/gis/verify-deployment-backup.mjs <private-backup-directory>`. It checks authentication, row identities/counts and object hashes without writing plaintext records. Rehearse record/object restoration in an isolated project before any production restore; integrity verification alone is not a full platform restoration test.

A gateway timeout does not prove a database transaction rolled back. Inspect database activity and the committed migration receipt before retrying an uncertain upgrade. The dated 5 October helper is single-use and has been removed after verified completion; its SQL file is historical transport evidence, not a routine installation command. Apply future migrations through the normal reviewed migration process.

The GIS host worker creates and owns its writable output directory before starting the unprivileged container. Keep that ownership boundary when changing runner UIDs or mount paths: container-created directories can prevent ordinary host cleanup after an otherwise successful export. The native actual-worker acceptance exercises upload, completion and removal of all scratch output.

Supabase/project pauses, quota exhaustion, expired credentials and unavailable Actions can interrupt team work while published/offline navigation remains usable. Diagnose the exact job/transport failure and preserve an uncertain operation's identity before retrying. The shared draft uses conflicts rather than editing branches.

The GIS target is 100,000 features per workspace dataset, with bounded interactive reads; public navigation is limited independently. Metric analysis currently supports validated WGS84 UTM zones. PNG templates include provenance receipts; PDF uses browser printing. No SSO, arbitrary code, raster alignment or OGC service conformance is implied.

## Historical rollout records

Earlier reader → migration → writer upgrades, migration timestamps, Vercel deployments and package identities remain in [Production](PRODUCTION.md). Feature-specific history remains in [imports](CAMPUS-IMPORTS.md), [model authoring](MODEL-AUTHORING.md), [editor reliability](EDITOR-RELIABILITY.md) and the dated audit reports. Those older single-owner and migration-free statements describe their original release, not the current installation requirements.

## Source updates deployment (migration 041)

Apply 041 after 040, then run **Maintain source review index and receipts** to backfill existing proposals in transactions of at most 100 rows. Deploy the `source-review.yml` worker and new UI after the schema is present; the UI explains when indexing is incomplete. No new credentials are required: reuse the existing workflow dispatch token and Supabase service secrets. Manual/daily source checks now share `queue_source_check`, so deploy migration 041 before the updated scheduler.

Verify the 10,000-change fixture, both TypeScript projects, browser source-update tests in Chromium/WebKit, and production read-only inbox/login checks. Do not accept real pending proposals as a deployment test. Keep migrations 039–041 when rolling back the UI; never restore the unbounded import RPC. Details: [Source updates](SOURCE-UPDATES.md).

## Editor availability upgrade (042)

Apply the additive migration and complete the bounded published-correction backfill before deploying its readers. Follow [the rollout instructions](EDITOR-AVAILABILITY.md#migration-042-rollout). Existing proposals, accepted sources, correction records, review approvals and public packages remain untouched.

## Source map preview upgrade (043)

Apply `043_source_map_preview.sql` before deploying the map preview reader. It adds read-only functions and requires no backfill. Verify the inbox and **Preview all matching changes on map** for each campus without making source decisions. The isolated 10,000-proposal fixture checks complete pagination, bounded responses, permissions and retained corrections; Chromium/WebKit journeys check actual map layers and the adjustable phone panel. Mobile panel height is a local layout preference and does not require database storage.

Apply `044_source_preview_routing.sql` after 043 to include graph links stored as node references. It adds a partial pending-identity index and campus-scoped endpoint readers, while retaining the existing read-only API. Verify a routing-link preview and unchanged proposal/correction counts. No graph-wide backfill or materialized geometry is required.

## Source reliability upgrade (045–048)

Apply 045–048 in order before deploying the matching workers. These migrations add evidence-backed source checks, private undo, accepted provenance, and retry guards. New proposal generation defaults to disabled. Run shadow comparisons, inspect receipts, recover legacy provenance only where retained evidence proves an exact match, and complete the provider/database/native acceptance gates before enabling an individual source.

Follow [the staged reliability rollout](SOURCE-UPDATES.md#staged-reliability-rollout), including the per-source policy and rollback instructions. A new UI build is not sufficient. Do not accept real proposals as a smoke test or remove database guards when rolling back application code. The [13 October record](assets/source-reliability-2026-10-13.json) reports local verification with these migrations undeployed at that checkpoint; obtain a new installed-schema receipt for an actual rollout.

Migration **049** repairs the source decision-history reader by qualifying the receipt actor. It preserves existing function grants and does not alter data. Source finalization waits up to 75 seconds for its existing 60-second database budget; other request and transaction limits remain unchanged.

Apply **050** before deploying the matching workers. It stores bounded raw check batches in campus-private, compressed, content-deduplicated pages. Only proposal dependencies are expanded into individual observation/record rows. Checks and the existing daily review-maintenance job run bounded compaction; the last two successful raw snapshots per source are retained. Permanent check receipts, accepted observations, proposal dependencies and decision/undo evidence remain independent of raw-snapshot retention.

For an existing 045–049 installation, run `source_check_maintain()` repeatedly until `work` is zero for each affected campus. It verifies identical archived content before reclaiming old staging and unreferenced observation copies. Inspect database size and the preserved accepted-data/decision hashes. Deletion makes pages reusable but does not reduce the physical database quota immediately: during this one-time upgrade, an operator may run `VACUUM (FULL, ANALYZE)` separately on `source_check_staging`, `source_observations` and `source_observation_records` after compaction, using a short lock timeout and with no source check running. Do not rebuild the accepted map tables. Thereafter ordinary autovacuum reuses bounded staging space; unchanged checks share existing payloads. Verify two successive shadow runs and quota headroom before calling the rollout complete.

## Typed imports and review requests (051–052)

Migration 051 retains inferred numeric/boolean types when an import supplies field names without type declarations; explicitly configured team schemas remain authoritative. Existing affected datasets require a reviewed schema correction; the migration does not rewrite values or publish data. Migration 052 gives review inspection, decisions and publication hash checks the same 60-second bound used by submission, without changing permissions or approval requirements. It also avoids serializing the entire stored snapshot merely to construct a review header. Preserve the existing function definitions, apply both additive migrations, then verify current/stale snapshot checks and authenticated review loading.
