# Changelog

## Unreleased

- Consolidate installation into a private root npm workspace with one dependency lock, root configuration checks, a pinned runtime doctor and a shared Docker/development-container entry.
- Split large map, survey, import, layer, photo and model components into domain modules. Split the browser and database suites while preserving test assertions and shared setup. Add bounded, cancellable import polling and regression tests.
- Check authored source, tests and tools with lint, types and formatting; enforce the 500-line boundary and immutable external CI action revisions.
- Add combined unit/browser application coverage gates and native Python processing coverage, with receipts tied to source and dependency snapshots. Preserve complete application includes, native-driver acceptance, published fixtures and download budgets.
- Add browser diagnostic downloads and API/worker correlation using validated request and job identifiers. Keep payloads, locations and claim tokens out of structured logs.
- Preserve comment and evidence drafts after failed GIS saves. Add component and API regression coverage for bulk edits, publication, survey recovery, model assets and verified image codecs.
- Remove hidden backdrop blurring from the full-screen photo editor to prevent desktop rendering stalls. Avoid transferring complete map instances from browser test camera commands, retaining all camera assertions and time limits.
- Wait for the real map layout before projecting a polygon-editing test gesture after panel changes. Refresh workspace, coverage, deployment, screenshot and importer documentation while retaining dated evidence.
- Use the bounded, same-origin asset request helper for application-preview package audits, allowing temporary protection propagation without forwarding credentials to sign-in redirects.
- Reject XML entity expansion across source readers and require complete authentication tags when verifying encrypted backups. Add snapshot-preservation and truncated-tag regression tests.
- Enforce cached download limits and add importer integrity, cancellation, scheduling, redirect and source-receipt tests. Update Vite, certificate data and the native PyArrow dependency for reported vulnerabilities; retain locked GDAL compatibility.
- Consolidate CI entry points and add dependency, historical secret and pinned Semgrep security checks that work with the private repository. Track verification and remaining release steps in [repository readiness](docs/READINESS-UPDATE.md).

## 0.2.0

- Add a pinned Linux/WSL2 development container and an official local Supabase stack with synthetic campuses, real role-based sessions, persistent private storage and isolated import/GIS/review workers.
- Expose root installation, type checking, zero-warning lint, formatting, coverage and build commands. Add Linux local-stack acceptance, V8 coverage floors, scheduled dependency updates and reproducible Python hash locks.
- Split public navigation, campus editing and model authoring into typed state/command hooks and bounded presentation components. Preserve existing stores, recovery, focus, undo and lazy-renderer boundaries.
- Add redacted structured request/worker diagnostics, request-envelope validation, safe application recovery, a minimal release health endpoint and production-asset checks excluding local authentication controls.
- Record unfinished-work reconciliation, baseline coverage, proprietary licensing intent and separate third-party rights. Preserve migrations 001–056 and published campus packages.

See [licensing readiness evidence](docs/LICENSING-READINESS.md) for implementation measurements and the [0.2.0 release record](https://github.com/mrglasswillbreak/TurnRight/releases/tag/v0.2.0) for the exact released commit, protected CI runs and production verification. The changelog describes the software changes; no DataFactor reassessment or licensing payment is asserted.

## 0.1.0 and earlier development

The existing Git history and dated [production receipts](docs/PRODUCTION.md) record campus editing, imports, approvals, publication and earlier deployments. This changelog does not replace or rewrite those records.
