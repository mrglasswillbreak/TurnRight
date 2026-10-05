# TurnRight account configuration

This is the current configuration guide. [Deployment](DEPLOYMENT.md) contains the setup sequence; [Production](PRODUCTION.md) records dated changes and live verification. Credentials belong in service secret stores, never in this repository or browser screenshots.

## Projects and team access

| Service | Existing project and responsibility |
| --- | --- |
| Public app | [turnright.vercel.app](https://turnright.vercel.app/); [team workspace](https://turnright.vercel.app/admin) |
| Vercel | `turnright`, frontend root `web`, Node 22, `npm ci`, `npm run build`, output `dist` |
| Supabase | `TurnRight`, reference `mrmdfvcztzhypmlfblwh`, existing MRGLASS project |
| GitHub | `mrglasswillbreak/TurnRight`; code deployment from `main`, private processing/release jobs through Actions |
| Authentication | GitHub authentication with campus memberships/capabilities; original owner retained for bootstrap and audited override |

Visitors do not need accounts. Signing in grants no campus access until an administrator assigns roles. Browser configuration uses only the public Supabase key; service-role credentials remain in Vercel/GitHub. OAuth uses the exact configured `/admin` callback. The requested campus/building survives sign-in separately from that callback; broad cross-project redirect wildcards are unnecessary.

## Database and private storage

The current application requires migrations **001–037**. Consult [Production](PRODUCTION.md) for the installed migration receipt. Compatible readers preceded model-asset and campus migrations; dependent writers followed verification. Migrations 016–017 repair large import review transactions; 018 adds land/overlay edit kinds, 019 adds guarded, additive source patching with complete revision checks and rollback receipts; 020 adds atomic layer membership saves and older-writer guards; 021 bounds reviewed release snapshot creation; 022 prevents draft revision timestamp collisions. Their application is recorded in [Production](PRODUCTION.md). For a new installation, apply the full sequence. For an existing installation, inspect its schema and apply only missing migrations.

| Migrations | Responsibility |
| --- | --- |
| 001–003 | Sources, edits, reports, releases, privileges, optimistic batches and receipts |
| 004 | Private survey revisions and chunks |
| 005–007 | Baseline reconciliation and field-level source review |
| 008–011 | Private photographs, guarded drafts and bounded reconciliation |
| 012 | Private authored-model assets and older-writer protection |
| 013 | Campus identity, LASU backfill, scoped keys/functions and media/survey/model isolation |
| 014 | Source configurations, cancellable import jobs and private uploads |
| 015 | Campus restore previews and catalogue revisions |
| 016–017 | Atomic bulk import-review application and bounded RPC execution time |
| 018 | Land and generic-overlay edit kinds |
| 019 | Service-only additive source updates, revision inventory and before/after receipts |
| 020 | Campus layer/group records and atomic feature membership, revision and compatibility guards |
| 021–022 | Bounded reviewed snapshots and monotonic editor revisions |
| 023 | Campus memberships, capabilities, RLS and audit |
| 024–025 | Typed/private datasets, effective spatial index and bounded queries |
| 026–028 | Immutable review, processing/CSV jobs, catalogue and issues |
| 029–031 | Integrated permissions/assets, consistency and publication leases |
| 032–034 | Saved views, unified quality checks and bounded geometry sessions |
| 035–037 | Historical geometry/asset integrity, source metadata and typed review guards |

| Private bucket | Purpose | Per-object limit |
| --- | --- | ---: |
| `building-media` | Owner photograph originals/derivatives | 10 MiB |
| `building-models` | Immutable model documents | 25 MiB |
| `campus-imports` | GIS uploads and private job artifacts | 50 MiB |
| `gis-private` | Private processing/export objects | 50 MiB |

Bucket limits do not replace operation limits: GIS upload batches total at most 50 MiB, and expanded/model/texture/publication limits are separate. Campus/import/model metadata and mutation RPCs are server-only. Campus membership policies and server-side capability checks protect shared records; unfinished media/model uploads and personal recovery stay user-scoped. Making a bucket public is not an upload repair.

## Environment and secret placement

Set application variables in both Vercel Preview and Production. Publication builds Production from the frozen reviewed source; it does not promote the preview deployment object.

| Name | Location and purpose |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Public Vercel client configuration |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Vercel server and GitHub Actions secrets |
| `ADMIN_USER_ID` | Vercel server; original-owner Auth UUID, bootstrap/override identity |
| `REPORT_RATE_SALT` | Vercel server secret for anonymous report rate buckets |
| `GITHUB_REPOSITORY`, `GITHUB_WORKFLOW_TOKEN` | Vercel workflow dispatch; repository-scoped Actions access |
| `SOURCE_REDISTRIBUTION_APPROVED` | Build setting after confirming LASU redistribution rights |
| `PUBLISHED_MAP_URL` | Stable production HTTPS origin in Vercel; same origin for the GitHub release variable |
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | GitHub Actions secrets for preview/publication |
| `OVERPASS_URL` | Optional GitHub repository variable for the authorized endpoint |
| `OVERPASS_SCHEDULE_ALLOWED` | Optional Vercel server environment **and** GitHub variable; enable only if the endpoint permits scheduled checks |

[`web/.env.example`](../web/.env.example) lists base application variables. Campus imports need no new secret. `CAMPUS_ID`, `IMPORT_ID`, `RUN_TOKEN`, `RELEASE_ID` and `RELEASE_OPERATION` are workflow/request context, not a global restriction to one campus. Requests without campus context remain LASU-only.

`PUBLISHED_MAP_URL` makes code builds verify the full public catalogue and all published packages. Unverifiable assets stop the build. Omit it only before a new installation's first public release. Code deployment never publishes model/source drafts.

## Source refresh and publication

| Workflow | Trigger and behavior |
| --- | --- |
| `source-update.yml` | LASU daily 02:17 UTC and manual checks |
| `map-import.yml` | Inspection/preview for one campus/import/run token |
| `map-source-check.yml` | Daily 03:47 UTC; opted-in sources and OSM endpoint permission gate |
| `map-import-tests.yml` | Full pinned Linux GIS regressions |
| `campus-layer-baselines.yml` | Preserve both campuses’ published, source and private draft baselines |
| `campus-layer-release.yml` | Prepare a reviewed enrichment snapshot; apply only the matching complete workspace hash |
| `campus-detail-verification.yml` | Actual package hashes, browser views, offline reopening and historical restore transport |
| `gis-processing.yml` | Campus-scoped analysis/export worker; immutable inputs and staged results |
| `gis-acceptance.yml` | Native PostGIS/engine and backup restoration gates |
| `regression-audit.yml` | Required application, browser and offline checks |
| `release.yml` | Gated approved `preview` or `publish`; explicit campus, legacy default LASU |
| `bootstrap.yml`, `preview.yml` | Initial baseline and seed preview for new installations |

Sources default to manual. File refresh uses a replacement upload; identities, accepted snapshots and mappings remain private. Daily checks queue candidates, never publish. LASU's original schedule remains independent.

Publication replaces one campus and preserves every other campus. **Publish → restoration** creates a new independently reviewed submission, then a fresh deployment with that campus's historical package and the others' current packages. Never promote an old whole-site deployment as a campus rollback. Retain immutable packages and snapshots; rebuild previews when the catalogue baseline changes.

## Operational verification

After deployment verify the source revision, team login/capabilities/Campuses list, public switcher and plain-home campus memory, unauthenticated admin rejection, catalogue, both campus manifests and asset hashes. Install waiting PWA updates through **Install update** so recovery guards remain active.

The September 26 migration preserved fingerprints for 4,777 source features, 133 edits, 32 releases, two surveys, 25 media records and one model asset. At that checkpoint LASU was the only published campus and all 84 assets were unchanged. UNILAG was published later; those dated counts are not the current catalogue. See [Production](PRODUCTION.md) for the exact receipt.

The initial September 9 preview was release `4c193c03-25da-4237-88c4-f4c41ca52217`, package `lasu-240581101c35`; its old counts and preview state are historical evidence in [Production](PRODUCTION.md). The original token record listed an expiry of 7 December 2026; check current secret-store expiry when maintaining credentials rather than assuming it has not changed.

Quotas, paused services and expired tokens can interrupt owner jobs while published/offline navigation keeps working. Inspect the exact failure before retrying; do not duplicate an uncertain job. Preserve required assets explicitly instead of assuming hosting retention settings. Both campus publications and historical restore-asset retrieval are verified in [Production](PRODUCTION.md). Physical Android/iPhone checks, campus walks, live non-owner login and an actual public rollback rehearsal remain separate [acceptance work](ACCEPTANCE.md).

## Source permissions

The owner confirmed permission to redistribute LASU ArcGIS data offline and separately confirmed permission to publish the imported UNILAG layers before its 30 September release. These are owner confirmations, not public licences or grants for other campuses. Keep the correspondence with project records. New sources need their own attribution/licence/redistribution record; OSM retains ODbL attribution in public and offline packages. See [Attribution](../data/ATTRIBUTION.md) and [imports](CAMPUS-IMPORTS.md).
