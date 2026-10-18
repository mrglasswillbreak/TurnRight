# Licensing readiness and reassessment evidence

This document maps the agreed engineering criticisms to implementation and checks. It is a reassessment preparation document, not a claimed DataFactor score or licensing offer. No code, credentials or message has been submitted to DataFactor as part of this work. Original software remains proprietary; licensing terms and any payment require a separate agreement.

## Implementation map

| Concern | Change | Verification |
| --- | --- | --- |
| Reproducible authenticated editor | Pinned `.devcontainer`, official Supabase CLI, canonical migrations, two synthetic campuses and four separate roles; root `local:up`, `local:down`, explicit `local:reset` | `Licensing readiness / local-stack`: clean install, real Auth, permission and campus denial, persistent editing, upload/import, GIS export/analysis, source and independent snapshot review, browser sign-in, restart and reset |
| Discoverable checks and coverage | Root wrappers; separate typecheck/lint/format/coverage; V8 includes unimported first-party application, components, server and API files | `coverage`, `quality` and the existing browser/offline/native gates; [pre-refactor baseline](assets/coverage-baseline-2026-10-18.json) |
| Oversized components | `Admin`, `App` and `PhotoModelWorkspace` delegate to typed hooks and bounded panels | [Architecture boundaries](ARCHITECTURE.md#application-entry-boundaries); focused browser journeys plus the full Chromium/WebKit matrix and unchanged startup/editor/lazy budgets |
| Failure diagnostics and recovery | Whitelisted structured server/worker events, request references, validated envelopes, application recovery boundary and `/api/health` | Unit tests cover redaction, response completion, malformed envelopes and health method/revision handling; browser recovery and native worker tests |
| Dependency maintenance | Weekly Dependabot for npm, Actions and supported Python manifests; committed Python 3.12/Linux hash locks | Normal protected CI and dependency audit; [lock regeneration commands](../CONTRIBUTING.md#checks) |
| Rights and provenance | Proprietary [LICENSE](../LICENSE), [third-party notices](../THIRD_PARTY.md), existing source/asset attribution retained | Package metadata remains private/UNLICENSED; no public reuse licence added; dated history and authorship retained |
| Unfinished checkout and release traceability | Verified recoverable snapshot, per-path reconciliation, separate functional/formatting/refactor commits | [Reconciliation record](LICENSING-RECONCILIATION.md), [path classifications](assets/licensing-reconciliation-2026-10-18.json), [changelog](../CHANGELOG.md) and final release receipt |

## Coverage policy and current evidence

The pristine `17f758277bda9d4c2e85658aa6858a2d24dc9b24` baseline measured 38.19% statements, 38.23% lines, 32.59% functions and 35.82% branches. Whole-project thresholds are 38/38/32/35 respectively, as agreed. Explicit thresholds for new dispatcher, envelope, diagnostic and health logic are at least 80% statements/lines/functions and 70% branches. Coverage excludes only declaration/generated/vendor/test code through the configured first-party include boundary. It does not hide unimported application modules.

Browser journeys establish observable UI behavior separately from unit coverage. Moving existing stateful UI logic into hooks does not by itself establish unit coverage of those interactions. Linux CI installs from committed locks and exercises native containers; no Docker or Windows system change was made on the development PC.

The foundation passes [coverage and local-stack acceptance](https://github.com/mrglasswillbreak/TurnRight/actions/runs/39152687553), [native database/engine acceptance](https://github.com/mrglasswillbreak/TurnRight/actions/runs/39152687533) and [isolated import checks](https://github.com/mrglasswillbreak/TurnRight/actions/runs/39152687529) at `cfd064c4`. [Foundation PR #30](https://github.com/mrglasswillbreak/TurnRight/pull/30) and [component PR #31](https://github.com/mrglasswillbreak/TurnRight/pull/31) retain their review history. Final revision, expanded acceptance, complete regression matrix and deployment evidence must be recorded before marking version 0.2.0 released.

## Operational boundaries

External downloads and cloud publication are disabled in the local environment; configuration requirements are explained in the UI and [local guide](LOCAL_DEVELOPMENT.md). Local reset is explicit, targets only the local stack and replaces synthetic identities. Local credentials stay in ignored runtime files; production builds verify that local login controls and seeded identities are absent. Health returns status and release revision only. Structured logs exclude tokens, payloads, private geometry and raw dependency errors.

This release requires no production schema migration. App deployment must retain the current LASU and UNILAG manifest identities and every declared asset hash. Workers must reach `main` with matching API changes. Production testing must not accept real proposals or publish drafts. Rollback restores compatible application code while retaining current database state and campus packages.

Physical Android/iPhone, native Safari, live multi-user pilot, GPS/field routing and full Supabase-platform restoration retain their existing documented limitations. CI browser emulation and the native application-database restore exercise do not establish those results. A higher score, licensing acceptance or income remains DataFactor's decision.

## Prepared reassessment note

TurnRight now provides a reproducible local editor, independently discoverable checks and coverage, smaller application boundaries, stronger request validation and redacted diagnostics. The attached evidence identifies exact revisions, automated checks and remaining operational limits. Original software is offered only under a separate proprietary licensing agreement; third-party dependencies, source data and assets retain their own terms. Please reassess the engineering evidence against the original criteria.

Before sending this note, replace candidate evidence with the verified release commit, tag, CI links and production receipt. This repository document does not authorize transferring private source data or credentials.
