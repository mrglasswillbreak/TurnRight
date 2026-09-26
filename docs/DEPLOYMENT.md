# TurnRight setup: Vercel Hobby + Supabase Free

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

Create a Free organization/project, for example `turnright`, and keep its database password in your password manager. Disable automatic table exposure and enable automatic RLS. In the SQL editor run `supabase/migrations/001_campus.sql` once, then `002_explicit_api_grants.sql` and `003_editor_batches.sql`. They create PostGIS, private source/draft/report tables, explicit role grants, auditing, the singleton administrator allowlist, transactional editor saves, and server-only publication/import functions. Do not rerun the first migration on an initialized database. Existing installations must apply migration 003 before deploying the new editor/API; see [the editor upgrade guide](EDITOR.md).

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

Use the editor on desktop. Select places, paths or building outlines, or draw new features. Drag vertices/midpoints, use undo/redo, set walking access, and explicitly connect path endpoints and entrances. Crossing paths on the same level connect automatically while retaining access restrictions and mapped obstacles. Turn off **Connect crossings automatically** for a path that should stay separate, or choose its **Crossing level** for a bridge or tunnel. Deliberate manual joins remain connected. Save each draft.

The Changes tab compares imported source records before/after and retains your corrections separately. **Check sources** starts the same bounded importer as the daily 02:17 UTC Actions schedule. Review source removals and conflicts carefully. Incomplete downloads and unusually large removal sets fail without deleting the accepted baseline. Source modification dates are not survey dates.

In Releases, review validation errors/warnings and use draft route previews. Write a summary and create a preview. The workflow freezes approved records and corrections, validates them, builds hashed packages, uploads an immutable Vercel preview, and records success only when Vercel reports READY. Open and accept that preview before choosing Publish. Publication promotes that exact deployment and verifies readiness and production domain assignment. Failed jobs retain the old public release. Refresh the editor to see progress.

Restore a previous published release from Releases to roll back. This promotes its existing immutable deployment, so retain it in Vercel. Clients see a different published version but still decide whether to download it; a running navigation session remains on its current package. A date on a closure never reopens a path: explicitly confirm reopening, save, preview and publish it.

## 6. Cost controls, pauses and recovery

Stay on Vercel **Hobby** and Supabase **Free**, and do not upgrade or enable paid extras. Vercel Hobby is for personal, non-commercial use; quota exhaustion can interrupt service. Supabase Free can pause inactive projects. These are operational constraints rather than an uptime guarantee. [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Supabase Free billing](https://supabase.com/docs/guides/platform/billing-on-supabase).

Use GitHub's included Actions allowance with a zero spending budget for paid Actions usage, and inspect the account's current billing settings. Daily source checks do not rebuild/deploy the website. The editor shows dispatch/database errors and recent job failures; a paused Supabase project may prevent the editor itself opening. Resume it from Supabase. Already published files and downloaded navigation remain independent of Supabase. If Actions are disabled or exhausted, check the Actions run log and resume them; no failed job auto-publishes data.

Export backups from the editor after substantial changes. Exports contain accepted source records, corrections and edit history; release snapshots also remain in Supabase. Keep an encrypted copy outside the project. To recover a fresh database, apply the migration and restore these tables using a trusted server-side process, preserving feature IDs. No browser restore endpoint is exposed. Never import untrusted backup files into a privileged database.

Record live verification in `docs/CONFIGURATION.md`; do not infer rollback or campus accuracy from a successful build alone.
