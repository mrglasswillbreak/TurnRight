# Private operational error monitoring

TurnRight stores redacted API and host-worker failure groups in its existing private Supabase backend. No new third-party monitoring account or telemetry destination is required. Python worker logs use the standard `logging` library; Node/API events retain the structured JSON envelope described in [diagnostics](DIAGNOSTICS.md).

## Setup and access

Apply `supabase/migrations/057_operational_error_monitoring.sql` before deploying the updated API/workers. Existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` configure delivery. `ERROR_MONITORING_ENABLED=false` disables capture; otherwise configured server/worker processes capture failures. This setting is server-only. Never expose the service-role key in a `VITE_*` setting.

Sign in as the user configured by `ADMIN_USER_ID`, open the editor's **Workspace → System health**. The API checks the owner identity independently of the visible button and campus roles. Ordinary campus administrators cannot read this global operational view. Database tables and RPCs grant no anonymous/authenticated access; only the existing service role can use them.

## What is retained

The collector accepts only known failure categories, component/dependency enums, HTTP status, a validated deployment commit and an optional UUID request/job reference. The database generates timestamps and fingerprints. It rejects additional fields. No exception messages/stacks, request/response bodies, URLs, user identities, claim tokens, photographs, coordinates or location histories are accepted.

Matching component/category/dependency/status/revision events share a group and occurrence count. Five failures in a current five-minute window display a repeated-failure alert. This is an alert in the private dashboard, not email/SMS delivery. Marking a group resolved uses its exact observed timestamp; if it changes concurrently, refresh is required. A later occurrence reopens it. Delivery probes are explicitly labeled and excluded from unresolved-failure counts.

Storage retains at most 1,000 groups and 30 days of activity. The dashboard shows the latest 100, prioritizing unresolved groups, and refreshes every 30 seconds while open. Daily `monitoring-retention.yml` removes expired groups; incoming events also prune old groups. Counts saturate at one million. These bounded operational records are disposable; they are not publication, security-audit or source-review evidence.

## Failure handling and privacy limits

Node delivery allows at most 16 concurrent requests, refuses redirects and has a two-second timeout. API failure responses wait for bounded delivery before sending their body, so serverless response completion cannot interrupt capture; this can add up to two seconds to a failed request. Worker entry points flush before exiting. Python host workers use a two-second timeout and refuse redirects. Monitoring errors do not replace the original application error or print private upstream details. Provider logs retain the original redacted event and a bounded delivery-failure indication.

Monitoring shares the application's database, so a complete backend outage can prevent durable capture. Consult deployment/worker logs in that case; the dashboard displays refresh failures rather than claiming healthy operation. Raw browser diagnostics remain in memory and are shared only through the existing explicit download; public visitor errors are not automatically transmitted.

## Verification and rollback

Unit tests exercise allowlists, disabled/invalid configuration, redirect refusal, queue limits and storage outages. Component tests cover grouping, alerts, resolution conflicts, stale-data warnings, dialog interaction and cancellation on close. Native PostgreSQL acceptance checks grants, rejected payloads, concurrent grouping, recurrence and retention.

For a deployment check, use the private service-role RPC `record_operational_error` with event `monitoring-probe`, component `api`, dependency `unknown`, status `200` and the deployed 40-character revision. Read back `operational_error_summary`, confirm that revision, then resolve the synthetic group using `resolve_operational_error` and its exact `last_seen`. Keep only sanitized receipts. Never induce a real failed import or publish a campus to test monitoring.

Rollback can disable capture with `ERROR_MONITORING_ENABLED=false` and redeploy the previous application revision. The additive private schema can remain for retention; no campus table, map package or published snapshot is changed by migration 057.
