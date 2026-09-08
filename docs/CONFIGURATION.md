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

Server secret saves have not yet been verified. Complete
`SUPABASE_SERVICE_ROLE_KEY`, `REPORT_RATE_SALT`, `GITHUB_WORKFLOW_TOKEN`, GitHub OAuth,
the administrator allowlist and `ADMIN_USER_ID`, Actions secrets, source baseline
initialization, and a successful preview. Keep production Git builds held during
acceptance, then restore normal build behavior after acceptance.

The browser automation connection detached during secret configuration. Inspect
the current environment-variable list before adding anything again.

Vercel Hobby's default retention is 30 days, with exceptions that retain the most
recent ready deployments. The preceding release should remain covered by those
exceptions; do not delete it manually. See [Vercel's retention policy](https://vercel.com/docs/deployment-retention).

No deployment acceptance or campus field verification is implied.
