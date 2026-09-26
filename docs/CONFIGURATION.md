# TurnRight account configuration

This is the current configuration guide. [Deployment](DEPLOYMENT.md) contains the setup sequence; [Production](PRODUCTION.md) records dated changes and live verification. Credentials belong in service secret stores, never in this repository or browser screenshots.

## Projects and owner access

| Service | Existing project and responsibility |
| --- | --- |
| Public app | [turnright.vercel.app](https://turnright.vercel.app/); [owner editor](https://turnright.vercel.app/admin) |
| Vercel | `turnright`, frontend root `web`, Node 22, `npm ci`, `npm run build`, output `dist` |
| Supabase | `TurnRight`, reference `mrmdfvcztzhypmlfblwh`, existing MRGLASS project |
| GitHub | `mrglasswillbreak/TurnRight`; code deployment from `main`, private processing/release jobs through Actions |
| Authentication | Existing GitHub owner, checked by `ADMIN_USER_ID` and the singleton database allowlist |

Visitors do not need accounts. Other GitHub users cannot gain editor access by signing in. Browser configuration uses only the public Supabase key; service-role credentials remain in Vercel/GitHub. OAuth uses the exact configured `/admin` callback. The requested campus/building survives sign-in separately from that callback; broad cross-project redirect wildcards are unnecessary.

## Database and private storage

Production has migrations **001–015**. Compatible readers preceded model-asset and campus migrations; dependent writers followed verification. For a new installation, apply the full sequence. For an existing installation, inspect its schema and apply only missing migrations.

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

| Private bucket | Purpose | Per-object limit |
| --- | --- | ---: |
| `building-media` | Owner photograph originals/derivatives | 10 MiB |
| `building-models` | Immutable model documents | 25 MiB |
| `campus-imports` | GIS uploads and private job artifacts | 50 MiB |

Bucket limits do not replace operation limits: GIS upload batches total at most 50 MiB, and expanded/model/texture/publication limits are separate. Campus/import/model metadata and mutation RPCs are server-only. Existing owner-readable tables retain their policies; private writes pass authenticated server validation. Making a bucket public is not an upload repair.

## Environment and secret placement

Set application variables in Vercel Preview and Production when previews can be promoted without rebuilding.

| Name | Location and purpose |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Public Vercel client configuration |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Vercel server and GitHub Actions secrets |
| `ADMIN_USER_ID` | Vercel server; allowlisted Auth user UUID |
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
| `release.yml` | Serialized `preview` or `publish`; explicit campus, legacy default LASU |
| `bootstrap.yml`, `preview.yml` | Initial baseline and seed preview for new installations |

Sources default to manual. File refresh uses a replacement upload; identities, accepted snapshots and mappings remain private. Daily checks queue candidates, never publish. LASU's original schedule remains independent.

Publication replaces one campus and preserves every other campus. **Prepare restore preview** creates a fresh deployment with that campus's historical package and the others' current packages. Never promote an old whole-site deployment as a campus rollback. Retain immutable packages and snapshots; rebuild previews when the catalogue baseline changes.

## Operational verification

After deployment verify the source revision, owner login/Campuses list, public switcher, unauthenticated admin rejection, catalogue, LASU manifest and asset hashes. Install waiting PWA updates through **Install update** so recovery guards remain active.

The September 26 migration preserved fingerprints for 4,777 source features, 133 edits, 32 releases, two surveys, 25 media records and one model asset. LASU remained the only campus and all 84 published assets were unchanged. No second campus or test import was published. See [Production](PRODUCTION.md) for the exact receipt.

The initial September 9 preview was release `4c193c03-25da-4237-88c4-f4c41ca52217`, package `lasu-240581101c35`; its old counts and preview state are historical evidence in [Production](PRODUCTION.md). The original token record listed an expiry of 7 December 2026; check current secret-store expiry when maintaining credentials rather than assuming it has not changed.

Quotas, paused services and expired tokens can interrupt owner jobs while published/offline navigation keeps working. Inspect the exact failure before retrying; do not duplicate an uncertain job. Preserve required assets explicitly instead of assuming hosting retention settings. Physical Android/iPhone checks, campus walks, live non-owner login and a second-campus publish/restore rehearsal remain separate [acceptance work](ACCEPTANCE.md).

## Source permissions

The owner previously confirmed permission to redistribute LASU ArcGIS data offline. That is an owner confirmation, not a public licence or a grant for other campuses. Keep the correspondence with project records. New sources need their own attribution/licence/redistribution record; OSM retains ODbL attribution in public and offline packages. See [Attribution](../data/ATTRIBUTION.md) and [imports](CAMPUS-IMPORTS.md).
