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

## Current reassessment evidence

The [21 October readiness update](READINESS-UPDATE.md) supersedes the original whole-project coverage floors below. The current gate requires 80% statements, lines and functions and 70% branches across all application sources, combining passing unit/component results with all 204 primary Chromium journeys from the same snapshot. The verified code revision reaches 80.30% statements, 81.51% lines, 80.47% functions and 74.12% branches. The ledger also records native processing coverage, expanded domain boundaries, security scans, reproducible setup and the review/deployment handoff. Use its exact-revision links and the pull request's current checks for reassessment.

## Historical coverage policy and evidence · 18 October 2026

The pristine `17f758277bda9d4c2e85658aa6858a2d24dc9b24` baseline measured 38.18% statements, 38.21% lines, 32.58% functions and 35.82% branches after [remeasurement with the complete include scope](https://github.com/mrglasswillbreak/TurnRight/actions/runs/39163482913). The original whole-project thresholds were 38/38/32/35 respectively. Explicit thresholds for each new dispatcher, envelope, diagnostic and health module were at least 80% statements/lines/functions and 70% branches. Coverage included unimported first-party application, component, utility, hook, server and API files; only declaration/generated/vendor/test code fell outside that boundary.

The [post-refactor measurement](assets/licensing-coverage-2026-10-18.json) at `59b21e59` passed 121 test files and 887 tests, with one optional private-export test skipped. It measured 38.17% statements, 38.24% lines, 32.42% functions and 36.05% branches. Each of the four new domain modules achieved 100% across all four metrics. These figures pass the agreed rounded-down whole-project floors; they do not imply 80% unit coverage of the whole UI.

Browser journeys establish observable UI behavior separately from unit coverage. Moving existing stateful UI logic into hooks does not by itself establish unit coverage of those interactions. Linux CI installs from committed locks and exercises native containers; no Docker or Windows system change was made on the development PC.

Expanded [coverage and local-stack acceptance](https://github.com/mrglasswillbreak/TurnRight/actions/runs/39163482779) passed at `59b21e59`, including private photo/model storage, analysis, file-import proposals, source acceptance, contributor self-approval denial, restart persistence and explicit reset. The [protected foundation preview](https://github.com/mrglasswillbreak/TurnRight/actions/runs/39162686738) verified revision `ffea4723`, anonymous administration denial, both campus maps, offline reopening and all 236 retained asset hashes without publishing campus content.

[Foundation/release PR #30](https://github.com/mrglasswillbreak/TurnRight/pull/30), [component PR #31](https://github.com/mrglasswillbreak/TurnRight/pull/31) and [acceptance/evidence PR #32](https://github.com/mrglasswillbreak/TurnRight/pull/32) retain the implementation history. Coverage and local-stack acceptance join the eleven existing mandatory checks; strict branch protection remains enabled. The [0.2.0 release record](https://github.com/mrglasswillbreak/TurnRight/releases/tag/v0.2.0) identifies the final exact commit, complete CI matrix, production deployment and package-preservation receipt. The dated measurements above remain tied to their actual tested revisions.

## Operational boundaries

External downloads and cloud publication are disabled in the local environment; configuration requirements are explained in the UI and [local guide](LOCAL_DEVELOPMENT.md). Local reset is explicit, targets only the local stack and replaces synthetic identities. Local credentials stay in ignored runtime files; production builds verify that local login controls and seeded identities are absent. Health returns status and release revision only. Structured logs exclude tokens, payloads, private geometry and raw dependency errors.

This release requires no production schema migration. App deployment must retain the current LASU and UNILAG manifest identities and every declared asset hash. Workers must reach `main` with matching API changes. Production testing must not accept real proposals or publish drafts. Rollback restores compatible application code while retaining current database state and campus packages.

The [pre-deployment receipt](assets/licensing-production-before-2026-10-18.json) identifies production `17f7582`, the [installed-schema readback](assets/licensing-installed-schema-2026-10-18.json) and the [236 verified public asset hashes](assets/licensing-public-baseline-2026-10-18.json). Reproduce the package comparison with `node scripts/audit-public-packages.mjs output.json docs/assets/licensing-public-baseline-2026-10-18.json`. The existing campus verification workflow also accepts an application deployment ID for protected preview verification without creating a campus release.

Physical Android/iPhone, native Safari, live multi-user pilot, GPS/field routing and full Supabase-platform restoration retain their existing documented limitations. CI browser emulation and the native application-database restore exercise do not establish those results. A higher score, licensing acceptance or income remains DataFactor's decision.

## Prepared reassessment note

TurnRight now provides a reproducible local editor, independently discoverable checks and coverage, smaller application boundaries, stronger request validation and redacted diagnostics. The attached evidence identifies exact revisions, automated checks and remaining operational limits. Original software is offered only under a separate proprietary licensing agreement; third-party dependencies, source data and assets retain their own terms. Please reassess the engineering evidence against the original criteria.

Use the current [readiness ledger](READINESS-UPDATE.md), reviewed revision and its verification/deployment receipts for the next reassessment. Retain the [0.2.0 release record](https://github.com/mrglasswillbreak/TurnRight/releases/tag/v0.2.0) as historical evidence. This document prepares the submission; it does not send anything to DataFactor or authorize transferring private source data or credentials.
