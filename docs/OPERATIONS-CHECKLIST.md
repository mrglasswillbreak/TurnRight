# Operations checklist

This is the canonical operations runbook for release, import, source sync, and migration sequencing.

## 1) Release path (preview → publish)

1. Confirm migrations and dependent readers/writers are aligned (see `/docs/DEPLOYMENT.md`).
2. Verify pending editor/import work is resolved before release preview.
3. Run `release.yml` with `operation=preview` and explicit `campus_id`.
4. Validate generated preview, package hashes, and published-workspace expectations.
5. Run `release.yml` with `operation=publish` from the reviewed preview.
6. Verify `/packages/campuses.json`, campus package manifests, and preserved unaffected campus packages.

Failure-mode expectations:

- Timeout/failure must retain previous public release.
- Retry only after checking recorded workflow/database state.
- Stale previews must be rebuilt after baseline/catalogue changes.
- Never roll back one campus by promoting an old whole-site deployment.

Audit expectations:

- Keep workflow logs and release receipts as trace evidence.
- Preserve immutable package IDs and reviewed snapshot IDs in verification records.

## 2) Import path (inspect/preview/apply)

1. Start import through owner workflow with campus and run token context.
2. Execute `map-import.yml` for inspection/preview.
3. Review validation diagnostics, source comparisons, and candidate queue outcomes.
4. Apply reviewed import only after expected baseline checks pass.

Failure-mode expectations:

- Cancelled/failed jobs must record interruption state.
- Run-token mismatch or stale source baseline must block apply.
- Retries require new valid run-token context.

Audit expectations:

- Retain per-run import artifacts/receipts.
- Record accepted/rejected counts and source identity references.

## 3) Source sync path (manual/scheduled checks)

1. Keep manual source refresh as default unless explicitly opted into scheduling.
2. Run scheduled checks only for authorized endpoints and documented permissions.
3. Treat source checks as proposal generation; do not auto-publish.

Failure-mode expectations:

- Incomplete/invalid source responses must fail safely without deleting accepted baselines.
- Large removals/conflicts require explicit human review.

Audit expectations:

- Keep source check artifacts and outcome logs.
- Record source-rights decisions in attribution/configuration docs.

## 4) Migration and rollout sequencing

1. Apply additive migrations in numeric order.
2. For existing installations, apply only missing migrations before enabling dependent writers.
3. Deploy compatible readers before enabling new write paths where required.
4. Validate rollback guards and compatibility checks before and after deploy.

Failure-mode expectations:

- Do not rerun initialized schema creation migrations on existing installations.
- Reject writes that could discard newer private metadata.

Audit expectations:

- Record migration receipts and verification snapshots in `/docs/PRODUCTION.md`.
- Document sequencing exceptions and rationale in `/docs/DEPLOYMENT.md`.

## 5) Workflow retention and traceability policy

- Core quality/security gate workflows run on `main` push and PRs to `main`.
- Heavy regression workflows stay tiered (manual/scheduled/path-focused) to control cost and duration.
- Keep retention windows on operational artifacts long enough for rollback and audit trails.
- Any workflow behavior change must update:
  - this checklist,
  - the matching guide in `/docs`, and
  - a verification note describing impact.
