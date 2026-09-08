# TurnRight account configuration

Configuration started on 8 September 2026.

The project owner confirmed in this task that permission for the LASU ArcGIS data
covers offline redistribution. The source item itself has no public license;
this records the owner's confirmation, not an independent review of the agreement.
Keep the actual permission correspondence with the project records.

Supabase: `TurnRight`, project reference `mrmdfvcztzhypmlfblwh`, in the existing
MRGLASS Free organization. Automatic table exposure is disabled; automatic row
level security is enabled. Apply both numbered SQL migrations in order.

Vercel: `turnright`, in the existing personal Hobby account, repository
`mrglasswillbreak/TurnRight`, frontend root `web`.

## Verified so far

- Supabase is active in London (`eu-west-2`) on Free.
- Both SQL migrations were applied in one transaction. A live SQL check returned
  all nine application tables with RLS enabled, no anonymous SELECT privileges,
  no authenticated INSERT privileges, and server INSERT privileges enabled.
- Vercel uses the Vite preset, root `web`, includes files outside that root,
  Node.js 22, `npm ci`, and the free Basic build machine. On-demand concurrent
  builds are disabled.
- Vercel configuration values were saved for Preview and Production:
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable key), `SUPABASE_URL`,
  `GITHUB_REPOSITORY`, and `SOURCE_REDISTRIBUTION_APPROVED=true`.
- The initial import build stopped at the source-rights environment check before
  those variables were set. No production deployment is serving traffic.

## Remaining setup

GitHub OAuth is enabled with the TurnRight LASU Editor app; other providers and
anonymous sign-ins are disabled. Server secrets `SUPABASE_SERVICE_ROLE_KEY`,
`REPORT_RATE_SALT`, and `GITHUB_WORKFLOW_TOKEN` are saved in both Vercel environments.
All five Actions secrets are saved. The source baseline workflow succeeded.
Git builds are set to **Only build pre-production** during acceptance.

The deployment token is scoped to TurnRight and the GitHub workflow token to this
repository with Actions read/write and mandatory Metadata read-only. Both expire
on **7 December 2026**; rotate them in the relevant service secret stores before
then. OAuth client secrets are stored only in Supabase.

Project identifiers (not credentials): Vercel `prj_C4HRU1Wis8DQSfhHVq2hPqrMCwDe`,
team `team_rlnBERg7tMCZMP9rl2QYsCAN`; GitHub OAuth app `3845767`.

The first preview passed 39 tests but failed because Vercel omitted a sibling
build script. Build helpers now live inside `web/scripts` and Node is pinned to
22.x. A regression check covers a standalone frontend deployment directory.

The corrected preview built successfully and GitHub login completed. The
administrator UUID `a1ba436b-bcd3-4e03-8293-f864633bd288` was verified against GitHub
login `mrglasswillbreak`, inserted into the singleton allowlist, and saved as
`ADMIN_USER_ID` in Preview and Production. Further signups are now disabled.
The accepted baseline contains 1,171 source features.

Live API testing exposed extensionless Node ESM imports. Those are corrected;
`tsconfig.functions.json` now checks server imports using NodeNext resolution.
Compiled functions were exercised directly: unauthenticated admin requests
returned 401, invalid reports returned 400. A fresh hosted preview is being
verified with these fixes and the owner environment. Restore normal production
build behavior only after acceptance.

Vercel Hobby's default retention is 30 days, with exceptions that retain the most
recent ready deployments. The preceding release should remain covered by those
exceptions; do not delete it manually. See [Vercel's retention policy](https://vercel.com/docs/deployment-retention).

No deployment acceptance or campus field verification is implied.
