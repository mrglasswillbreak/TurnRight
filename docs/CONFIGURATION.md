# TurnRight account configuration

## Multi-campus configuration

The campus extension reuses the configured Supabase, GitHub Actions and Vercel projects, existing owner and existing secrets. Migrations 013–015 must be applied before the writing release. Compatible readers preserve LASU-only requests and `/packages/latest.json`. See [production rollout status](PRODUCTION.md) before assuming new tables are live.

Optional `OVERPASS_URL` is a GitHub repository variable. `OVERPASS_SCHEDULE_ALLOWED=true` must be present in both the Vercel server environment and GitHub repository variables to offer daily OSM checks; leave it unset for public endpoints without scheduled-use permission. `.github/workflows/map-source-check.yml` checks opted-in sources at 03:47 UTC. LASU's existing 02:17 UTC schedule is retained. Source settings, mappings and campus bounds live in private tables rather than environment variables.


## Model storage extension · 26 September 2026

Migration `012_editable_model_assets.sql` is applied to the existing project. Verification returned `model_assets`, `save_editor_model_batch(uuid,uuid,jsonb)`, a private `building-models` bucket and no direct authenticated metadata SELECT privilege. No credentials, environment variables, public access grants or paid services were added. Public readers deployed before the writing client. See [authoring](MODEL-AUTHORING.md) and [production](PRODUCTION.md).

Initially configured and verified on 8 September 2026. **Production is now live
at https://turnright.vercel.app/** following the owner's explicit publication
request on 9 September. See [PRODUCTION.md](PRODUCTION.md) for the current
deployment, corrected automatic-build setting, production OAuth redirect and
verification. The preview details below retain the initial setup history.

## Review this release

- [Campus map](https://turnright-gj0bbezgi-muhammed-abdulhadi-s-projects.vercel.app/)
- [Protected editor](https://turnright-gj0bbezgi-muhammed-abdulhadi-s-projects.vercel.app/admin)
- [Successful release workflow](https://github.com/mrglasswillbreak/TurnRight/actions/runs/34286932800)
- Release: `4c193c03-25da-4237-88c4-f4c41ca52217`; status: `preview`.
- Package: `lasu-240581101c35`.
- Application revision: `568f4687967a0b947dcd387c9830859243b928b3`.

The Vercel preview retains deployment protection, so open it while signed into
the owner's Vercel account. Editor access additionally requires the allowlisted
GitHub account `mrglasswillbreak`. Later documentation commits do not change this
immutable application/map preview.

## Accounts and access

Supabase: `TurnRight`, project reference `mrmdfvcztzhypmlfblwh`, London
(`eu-west-2`), in the existing MRGLASS Free organization. Automatic table exposure
is disabled and automatic row level security is enabled. Both numbered SQL
migrations were applied successfully in one transaction.

Live SQL checks returned all nine application tables with RLS enabled, no
anonymous SELECT privileges, no authenticated INSERT privileges, and server
INSERT privileges. Direct requests with the public browser key could not read
`reports`, `map_edits`, or `admin_users` (401 / permission denied).

GitHub OAuth is enabled through **TurnRight LASU Editor** (app `3845767`). Other
providers and anonymous sign-ins are disabled. After the owner's initial login,
further signups were disabled. The owner's UUID
`a1ba436b-bcd3-4e03-8293-f864633bd288` was verified against GitHub identity
`mrglasswillbreak`, added to the singleton database allowlist, and saved as
`ADMIN_USER_ID` in both Vercel environments. Existing-owner login was retested.
Supabase's Site URL and an exact allowed redirect point to this preview's
`/admin` page. OAuth client secrets remain in Supabase.

Vercel: `turnright`, in the existing personal Hobby account, GitHub repository
`mrglasswillbreak/TurnRight`, frontend root `web`. Project identifier:
`prj_C4HRU1Wis8DQSfhHVq2hPqrMCwDe`; team: `team_rlnBERg7tMCZMP9rl2QYsCAN`.
Build settings are Vite, Node.js 22, `npm ci`, and the free Basic build machine.
Files outside the root are included; on-demand concurrent builds are disabled.
No paid upgrades or paid runners were enabled.

## Saved configuration

Preview and Production both have:

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public publishable key)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `REPORT_RATE_SALT`, `ADMIN_USER_ID`
- `GITHUB_REPOSITORY`, `GITHUB_WORKFLOW_TOKEN`
- `SOURCE_REDISTRIBUTION_APPROVED=true`

GitHub Actions has `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VERCEL_TOKEN`,
`VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` saved as secrets. Credentials are not
included in this repository. The daily source-import workflow runs at 02:17 UTC;
the editor's **Check now** uses the same workflow.

The deployment token is scoped to TurnRight. The GitHub workflow token is scoped
to this repository with Actions read/write and mandatory Metadata read-only.
**Both expire on 7 December 2026.** Rotate them in the relevant service secret
stores before then. Free-tier quota interruptions still require owner attention;
no account-wide GitHub spending-budget change was made.

## Live verification

- The source baseline workflow succeeded and initialized 1,171 accepted source
  features. A subsequent editor **Check now** completed successfully in
  [run 34286518370](https://github.com/mrglasswillbreak/TurnRight/actions/runs/34286518370).
- Owner GitHub login, private editor loading, and editor refresh worked. The
  editor map visibly rendered campus geometry and labels after refresh.
- A clearly labelled setup-test report was submitted through the public form,
  appeared in the owner's private inbox, and was dismissed. It did not modify
  map data or routes. No test map correction was saved.
- The final immutable release workflow passed validation, tests, package build,
  and Vercel deployment. The editor exposes its exact preview and a separate
  publish action. No publish action was taken.
- The final package `lasu-240581101c35` completed download and hash verification
  in hosted Chrome, reaching **Ready offline** and retaining readiness after a
  reload (approximately 2.15 MiB of map and voice assets, plus the separately
  cached application shell). This is not
  a physical-phone airplane-mode test.
- Local checks passed all 40 tests, frontend and NodeNext server compilation,
  and the Vite/PWA production build. Lint had no errors (eight existing
  explicit-any warnings). The dependency audit reported zero known
  vulnerabilities at this check.

Live verification found and fixed Vercel build-helper packaging, Node ESM import
extensions, editor drawing-tool disposal and map framing, and the release job's
ESM entry point. The earlier release attempt is correctly recorded as failed;
the successful retry is a new immutable snapshot. Direct compiled-function
checks returned 401 for unauthenticated admin access and 400 for invalid reports.

## Before public launch

The initial **Only build pre-production** rule was changed to **Automatic** on
9 September at the owner's request. Production now serves the latest requested
revision, and `PUBLISHED_MAP_URL` points to `https://turnright.vercel.app` in both
environments. The production `/admin` OAuth redirect is configured and tested.
See [PRODUCTION.md](PRODUCTION.md) for the current state and the distinction
between this first Git publication and future reviewed map releases.

Physical Android/iPhone checks, campus field walks, a live non-owner login test,
and an actual production promotion/rollback rehearsal remain outstanding. See
[ACCEPTANCE.md](ACCEPTANCE.md); automated tests do not establish campus accuracy.
The dataset contains 219 places, 54 mapped approaches, zero confirmed connected
entrances, seven disconnected path components, and 28 excluded directed segments.

Vercel Hobby's default retention is 30 days, with exceptions for the most recent
ready deployments. Preserve the preceding release and confirm it is retained
before relying on rollback; do not delete it manually. See
[Vercel's retention policy](https://vercel.com/docs/deployment-retention).

## Source permission record

The project owner confirmed in this task that permission for the LASU ArcGIS data
covers offline redistribution. The source item itself has no public license;
this records the owner's confirmation, not an independent review of the agreement.
Keep the actual permission correspondence with the project records.
