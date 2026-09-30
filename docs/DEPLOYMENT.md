# TurnRight setup: Vercel Hobby + Supabase Free

## Import review queue repair (27 September 2026)

On an existing installation through migration 015, apply `016_bulk_import_review_queue.sql` followed by `017_import_queue_deadline.sql`. Both are applied and verified in production. They retain campus scoping, the advisory lock, exact source comparison, run-token validation and service-only execution. The queue RPC has a 60-second database allowance; its server transport waits up to 75 seconds. Ordinary API and lock deadlines remain unchanged. Deploy the matching backend before retrying large batches.

The live UNILAG job queued 10,176 proposals successfully. The PostgreSQL regression covers a 1,500-record batch, duplicate counts, rejected candidates, atomic rollback and cross-campus isolation. See [import status](CAMPUS-IMPORTS.md#september-27-unilag-import-outcome) and [production evidence](PRODUCTION.md).

## Multi-campus rollout

1. Deploy compatible readers before enabling campus writes. Keep `PUBLISHED_MAP_URL` set so code builds preserve reviewed public assets.
2. Back up/verify the current private record counts and apply migrations **013_campus_isolation.sql**, **014_map_import_jobs.sql**, then **015_campus_release_restores.sql** in order. Run the database isolation tests first. They are additive backfills and scoped-function replacements, not a reset of LASU drafts.
3. Deploy the writing API and Campuses controls only after verifying the new tables, private storage bucket, scoped RPCs and LASU record counts. The existing owner remains the only administrator. No new secrets are required.
4. Verify `.github/workflows/map-import-tests.yml` on Linux. The worker image pins GDAL/PROJ by digest and Pyosmium/Shapely by version. The host performs authorized downloads; the parser container has no network and no credentials.
5. Optionally set `OVERPASS_URL`. Enable `OVERPASS_SCHEDULE_ALLOWED=true` in both Vercel and GitHub variables only for an endpoint permitting scheduled use. Manual is the default; LASU's original schedule is unchanged.
6. Verify the served revision, `/packages/latest.json`, all LASU asset hashes and `/packages/campuses.json`. Publish a second campus only after its own source/geometry/access/attribution review.

The release workflow takes `campus_id` (legacy default `lasu`). Its operations are `preview` and `publish`; restore requests create a new scoped preview. Never promote an old whole-site deployment to roll back one campus. Catalogue changes invalidate stale previews. `/packages/campuses.json` and mutable compatibility manifests use revalidation headers; versioned packages remain immutable.

[Owner guide](CAMPUS-IMPORTS.md) · [Exact production status](PRODUCTION.md). Production completed this sequence on 26 September 2026: migrations 013–015 were applied in one transaction and verified before the writing release. Use the sequence above for another installation; do not rerun table-creation migrations on an initialized database.


## Expanded model authoring rollout

Deploy compatible public readers first, apply `supabase/migrations/012_editable_model_assets.sql`, then deploy the writing editor/API. Migration 012 creates private immutable model assets and a server-only versioned save wrapper; older clients cannot erase authored references. Keep `PUBLISHED_MAP_URL` enabled. Model uploads use owner-authorized signed URLs; no new environment secret is required. The publication workflow hydrates reviewed immutable documents and packages authored textures. Application deployment does not publish model drafts.

Production migration 012 was applied and verified on 26 September 2026: the `building-models` bucket is private, authenticated clients have no direct metadata SELECT grant, and `save_editor_model_batch` is present. Retain the guard when rolling back application code. [Authoring limits and formats](MODEL-AUTHORING.md) and [deployment verification](PRODUCTION.md) describe the rollout. The migration-free statements below refer to the earlier surface-text release only.

## Model workspace refinement and surface text

Deploy this application through the existing Git/Vercel workflow with `PUBLISHED_MAP_URL` enabled. The refinement has no database migration or new API endpoint. Text records are optional appearance JSON and validated by the shared model pipeline. Application deployment preserves the published manifest and assets; labels and other architectural edits publish only through the owner's reviewed map release workflow.

Use Node 22, run lint/unit and focused Chromium/WebKit workflows, the production build and `npm run check:configured-build`. Keep the shared-icon/authentication boundary and existing bundle limits intact. See [current verification](MODEL-EDITOR-VERIFICATION.md), [owner controls](UNIFIED-MODEL-EDITOR.md) and [screenshot provenance](assets/screenshots/README.md).

## Unified model editor rollout

The separate baseline reconciliation timeout repair uses
`supabase/migrations/011_linear_baseline_reconciliation.sql` after the existing
migrations. It materializes parsed JSON inputs through a small RPC wrapper before
calling a private implementation, keeping
the owner guard, exclusive source lock, exact stale-review checks, incremental
writes and immutable rollback snapshots. Its 15-second statement budget applies only to this owner-only RPC; ordinary API and lock timeouts remain unchanged. It does not
change map edits, package schemas or public content. Apply it before retrying
**Use this reviewed baseline**; then review current draft errors before building.

The unified model editor itself requires no migration or public package-schema change. Deploy additive model-authoring validation and the older-writer guard before dependent clients. The guard rejects edits to buildings whose newer private authoring metadata would be dropped, while unaffected older-editor changes remain supported. Private metadata stays in owner draft JSON and is excluded from public packages. Keep `PUBLISHED_MAP_URL` enabled for application builds; reviewed architectural changes publish only through the existing immutable release workflow.


Campus enrichment adds migration `007_source_field_reviews.sql`. Apply it before
using “Accept selected details” in the owner editor. Daily source checks now use
the bounded enrichment pipeline and retain a review artifact; they still cannot
publish a map. See [enrichment setup and source licenses](ENRICHMENT.md).
Migration 007 was applied and verified on the existing TurnRight production
database on 22 September 2026; do not rerun it there. See the
[production record](PRODUCTION.md).

See [the configuration record](CONFIGURATION.md) for the current projects and completed steps. The public map runs locally without Supabase; editor login, submitted reports, daily source checks, and release publication need the setup below. Never put service keys in `VITE_*` variables or commit `.env` files.

## 1. Resolve the campus source rights

The seed combines OpenStreetMap with the public LASU ArcGIS item `ffd68667b1464eeb999c0050897a82a0` owned by MangroveandpartnersLimited. The item supplies no explicit redistribution license. Public viewing alone does not establish permission to redistribute the layers. Obtain permission covering the packaged geometry, places, offline downloads, and OSM-derived combination, or replace the ArcGIS layers with independently surveyed or suitably licensed data. Record the decision in `data/ATTRIBUTION.md` and update each source's license description.

Vercel builds intentionally require `SOURCE_REDISTRIBUTION_APPROVED=true`. Set it only after that check is complete. Local development and tests do not require this variable. Also resolve source conflicts and complete the campus/device checks in `docs/ACCEPTANCE.md` before calling routes verified.

## 2. Create Supabase Free and configure GitHub login

Create a Free organization/project, for example `turnright`, and keep its database password in your password manager. Disable automatic table exposure and enable automatic RLS. For a new database, apply every checked-in SQL migration in numeric order from `001_campus.sql` through `019_additive_source_patch.sql`. The initial 001–003 migrations establish the base schema and editor batches; 004–011 add surveys, source review, media and reconciliation; 012 adds model assets; 013–015 add campus isolation, imports and scoped restores; 016–017 bulk-insert review proposals and bound large queue transactions; 018 adds land/overlay edit kinds; 019 adds an atomic, additive campus patch with scoped row-revision guards and rollback receipts. They create PostGIS, private source/draft/report tables, explicit role grants, auditing, the singleton administrator allowlist, transactional editor saves, and server-only publication/import functions. Do not rerun the first migration on an initialized database. For existing installations, first check which migrations are present and apply only the missing migrations before enabling their dependent writers; see [the editor upgrade guide](EDITOR.md).

Enable GitHub under Authentication → Sign In / Providers. Create a GitHub OAuth App with the callback URL shown by Supabase (`https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`), then store its client ID and client secret in the Supabase GitHub provider settings. The OAuth client secret belongs there, not in the PWA. Use the real Supabase callback URL, not the PWA `/admin` URL. [Supabase GitHub login instructions](https://supabase.com/docs/guides/auth/social-login/auth-github).

Keep other login providers and anonymous sign-ins disabled. The map has no visitor account flow. GitHub users outside the allowlist still receive no draft, report, or administration access.

## 3. Create an empty Vercel Hobby project

Use Node.js 22. From the repository root run `npx vercel link`, sign in to your personal Hobby account, and create/link a project named `turnright` (or another available name). Linking creates the project association without deploying the site. Do not run a production deploy yet. [Vercel link command](https://vercel.com/docs/cli/link).

In the project settings set:

| Setting | Value |
|---|---|
| Framework | Vite |
| Root directory | `web` |
| Include source files outside root directory | Enabled for repository tooling; the frontend build is self-contained in `web/` |
| Node.js | 22.x |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |

Keep the default standard build machine; do not enable paid upgrades, paid add-ons, or usage purchases. Retain the preceding production deployment when configuring deployment retention. Keep preview deployment protection enabled while reviewing the map.

For public launch, set **Build and Deployment → Ignored Build Step → Automatic**.
The earlier **Only build pre-production** setting deliberately cancels `main`
production builds, even when GitHub receives the push successfully. The current
project uses Automatic; see [PRODUCTION.md](PRODUCTION.md). Changes limited to
files outside `web` may still be skipped by Vercel's unaffected-project check.

Set these environment variables in **both Preview and Production**. The same backend configuration is needed when promoting a preview without rebuilding it.

| Variable | Value / source | Exposure |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL | Public |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable key or legacy anon key | Public; RLS applies |
| `SUPABASE_URL` | Same project URL | Server |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase legacy service-role JWT | Secret, server only |
| `ADMIN_USER_ID` | Your Supabase Auth user UUID; filled after first login | Server |
| `GITHUB_REPOSITORY` | `mrglasswillbreak/TurnRight` | Server |
| `GITHUB_WORKFLOW_TOKEN` | Fine-grained GitHub token scoped to this repository, Actions read/write | Secret, server only |
| `REPORT_RATE_SALT` | Random, unique value of at least 32 characters | Secret, server only |
| `SOURCE_REDISTRIBUTION_APPROVED` | `true`, after step 1 | Build |

Use the legacy service-role JWT here: the REST helpers currently place this value in both `apikey` and Bearer headers. Do not substitute the project database password or a browser key. Generate the report salt in a password manager. Restrict GitHub token access to this repository and set an expiry/reminder you can maintain. GitHub OAuth and the workflow token are separate credentials.

After the first public release, also set `PUBLISHED_MAP_URL` in both environments to the stable production origin, such as `https://YOUR_PROJECT.vercel.app`. Code-only Git deployments then copy and verify the published map instead of accidentally reverting to the seed. If that origin cannot be fetched, the build stops; the existing production deployment remains intact. Controlled map releases use a frozen manifest and retain the preceding package. Initially omit this variable because no public map exists yet.

## 4. Configure GitHub Actions secrets

Commit the implementation and push it to the repository's `main` branch yourself. The server currently dispatches workflows on `main`. Add these under repository Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Same server-only service-role JWT |
| `VERCEL_TOKEN` | Vercel access token authorized for the Hobby project |
| `VERCEL_ORG_ID` | `orgId` from the local `.vercel/project.json` created by linking |
| `VERCEL_PROJECT_ID` | `projectId` from that file |

Tokens remain in the services' secret stores. Deployment uploads use an explicit file allowlist and exclude `.env`, raw imports, Git history, and dependencies.

Run **Initialize reviewed source baseline once** from Actions. This imports the checked-in seed as the initial accepted baseline in one database transaction. It refuses to overwrite an existing baseline. Then run **Deploy initial Vercel preview**. Its run summary supplies the preview URL; it does not promote production traffic.

Add the exact preview `/admin` URL to Supabase Authentication → URL Configuration → Redirect URLs. Add the future production `/admin` URL too. Add further preview URLs individually as needed. Keep broad cross-project wildcards out of the allowlist.

Visit the preview `/admin` and sign in with your GitHub account once. Until allowlisting, the app denies editor access. Find that account in Supabase Authentication → Users, copy its UUID, and run:

```sql
insert into public.admin_users(id) values ('YOUR_AUTH_USER_UUID');
```

Set `ADMIN_USER_ID` to that same UUID in Vercel Preview and Production. Run **Deploy initial Vercel preview** again so the server receives the updated environment. Sign in on the new preview. The database permits only one allowlisted administrator, and the API checks both the authenticated UUID and the allowlist row.

## 5. Review → validate → preview → publish

Use the editor on desktop. Select places, paths or building outlines, or draw new features. Drag vertices/midpoints, use undo/redo, set walking access, and explicitly connect path endpoints and entrances. Crossing paths on the same level connect automatically while retaining access restrictions and mapped obstacles. Turn off **Connect crossings automatically** for a path that should stay separate, or choose its **Crossing level** for a bridge or tunnel. Deliberate manual joins remain connected. Completed commands autosave; wait for Saved before building a release preview.

The **Sources** tab compares imported records before/after and retains corrections separately. LASU’s original **Check now** uses the 02:17 UTC workflow. **Campuses** configures additional file, OSM and ArcGIS sources per campus; `map-import.yml` runs private inspection/preview jobs and `map-source-check.yml` checks opted-in sources at 03:47 UTC. Review source removals and conflicts carefully. Incomplete downloads and unusually large removal sets fail without deleting the accepted baseline. Source modification dates are not survey dates.

In Releases, review validation errors/warnings and use draft route previews. Write a summary and create a preview. The workflow freezes approved records and corrections, validates them, builds hashed packages, uploads an immutable Vercel preview, and records success only when Vercel reports READY. Open and accept that preview before choosing Publish. Publication promotes that exact deployment and verifies readiness and production domain assignment. Failed jobs retain the old public release. Open **Activity** to follow named build/publication stages; visible online sessions refresh automatically every five seconds. [Progress monitor](PROGRESS-MONITOR.md). Ordinary Git code deployments retain their GitHub Actions/Vercel logs.

To restore one campus, use **Prepare restore preview** on its historical release. The worker copies that campus’s immutable package into a fresh preview alongside every other campus’s current package. Review and publish that new preview; never promote an old whole-site deployment for a campus rollback. Retain historical immutable packages and snapshots. Clients still choose whether to download a different version, and an active navigation session remains on its current package. A date on a closure never reopens a path: explicitly confirm reopening, save, preview and publish it.

## 6. Cost controls, pauses and recovery

Stay on Vercel **Hobby** and Supabase **Free**, and do not upgrade or enable paid extras. Vercel Hobby is for personal, non-commercial use; quota exhaustion can interrupt service. Supabase Free can pause inactive projects. These are operational constraints rather than an uptime guarantee. [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Supabase Free billing](https://supabase.com/docs/guides/platform/billing-on-supabase).

Use GitHub's included Actions allowance with a zero spending budget for paid Actions usage, and inspect the account's current billing settings. Daily source checks do not rebuild/deploy the website. The editor shows dispatch/database errors and recent job failures; a paused Supabase project may prevent the editor itself opening. Resume it from Supabase. Already published files and downloaded navigation remain independent of Supabase. If Actions are disabled or exhausted, check the Actions run log and resume them; no failed job auto-publishes data.

Export backups from the editor after substantial changes. Exports contain accepted source records, corrections and edit history; release snapshots also remain in Supabase. Keep an encrypted copy outside the project. To recover a fresh database, apply the migration and restore these tables using a trusted server-side process, preserving feature IDs. No browser restore endpoint is exposed. Never import untrusted backup files into a privileged database.

Record live verification in `docs/CONFIGURATION.md`; do not infer rollback or campus accuracy from a successful build alone.

## September 30 vector/detail release

Apply migration 018 before land/overlay writers. Migration 019 supports large additive source preparation without sending two complete maps through the HTTP gateway; it is service-only, compares the complete scoped row-revision inventory, never deletes absent records, and stores immutable before/after receipts. The UNILAG preparation keeps all private corrections and validates routing before and after.

Release the shared capability registry, API and pinned GIS worker together. Server-dispatched GitHub workflows use `main`; a preview branch alone does not upgrade the production worker. The deployment source allowlist includes `scripts/map_import/capabilities.json`. Run the GIS integration fixtures inside the pinned image before enabling the additional advertised formats.

The UNILAG workflow first captures private baselines, verifies the original road upload hash, builds a public preview and accepts only an exact reviewed baseline hash. Reconcile the additive patch, create an immutable release snapshot, build its deployment preview, inspect desktop/mobile and offline behavior, then publish that exact release. Verify all served asset bytes/hashes and LASU's unchanged manifest. A failed or timed-out write must be audited before retrying. Roll back one campus through a new restore preview, retaining the other campus's current package. See [coverage](UNILAG-DETAIL.md) and [production receipts](PRODUCTION.md).

Historical Vercel deployment URLs can require authentication even when the
production domain is public. The restore worker checks that the deployment
belongs to the configured project and uses temporary automation access for
verified asset retrieval. It revokes that credential on completion; the workflow
also cleans up after failures or interruption. Deployment protection stays enabled.

The **Verify released campus detail** workflow accepts a ready preview release
ID, or checks production when that field is empty. It verifies all package
hashes, captures both browsers and tests downloaded photos/models. Chromium
uses browser offline mode. WebKit uses unchanged deployed bytes through a local
origin, then stops that origin and verifies cached navigation: Playwright 1.63
has an [upstream offline-navigation emulation issue](https://github.com/microsoft/playwright/issues/42775).
This does not replace native Safari/physical-device acceptance.
