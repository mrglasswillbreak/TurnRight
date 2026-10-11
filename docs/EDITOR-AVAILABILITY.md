# Editor availability and source publication

Accepted source updates are already part of the working baseline. Resolve validation issues, submit the workspace in **Review**, obtain independent approval, and build a preview in **Publish**. Inspect that preview before publishing. An older source metadata version is an origin label, not a reason to replace reviewed geometry.

The former **Use this reviewed baseline** action restored the public package over the working sources. It is retired in the UI, API and database. Existing browser tabs receive a clear conflict response. Use **Submit restoration for review** in Publish when intentionally restoring a historical release. Existing recovery receipts remain available.

## Availability fixes

- Authentication gateway failures, rate limits, broken responses and transport timeouts return service-unavailable errors. Only an actual identity rejection asks for sign-in again.
- Session refresh errors are checked before API calls. Read-only startup and status actions retry once with the same campus and credentials. Uncertain publication, import and decision writes are not automatically replayed.
- Published corrections are materialized separately as `releases.editor_edits`. Polling no longer extracts fields from the compressed full-map snapshot. An index selects the latest published release; Publish omits correction data it does not use.
- Server errors include a request reference and a structured log entry containing the action, status and dependency. Tokens, request payloads, raw upstream errors and geometry are excluded.
- Workspace hashes, independent approval, campus permissions, source conflict checks, correction overlays, validation and catalogue revision checks still govern publication.

## Migration 042 rollout

Apply `supabase/migrations/042_editor_availability.sql` before deploying dependent readers. It adds the summary column, maintenance trigger and latest-release index, and makes legacy replacement calls fail without source-table writes or locks. It does not accept proposals or publish a map.

Run this service-only maintenance call repeatedly, one call per transaction, until it returns `complete: true`:

```sql
select public.backfill_release_editor_edits();
```

Each call expands at most one current published release. Historical snapshots remain unchanged. New releases capture their correction summary automatically. A missing summary returns a temporary availability error rather than guessing that no corrections were published.

Verify source/correction counts and accepted decision receipts before and after rollout. Check editor loading, source status and login read-only. Do not re-run the retired replacement against production to reproduce the failure.

## 11 October 2026 investigation

The two completed UNILAG review operations recorded **3,645 applied, one skipped and zero failed** decisions. No baseline reconciliation committed during the incident. UNILAG retained 201 correction records; LASU retained 150.

Vercel recorded a failing `reconcile_published_baseline` request at 10:37:42 UTC, lasting about 29 seconds. PostgreSQL logs show crash recovery at 10:32:59 UTC; database uptime later began at 10:39:28 UTC. Ordinary published-correction reads and GIS hydration also timed out. These facts establish a database availability incident and an unsafe, unnecessary full-map request. The available logs do **not** identify a host out-of-memory kill, so that specific mechanism is unconfirmed. The earlier transient browser connection failure likewise has no proven identical cause.

These fixes remove the observed expensive replacement path and repeated snapshot expansion, and correct recovery behavior. They cannot guarantee availability during an upstream service outage. Deployment and validation receipts belong in [Production](PRODUCTION.md).
