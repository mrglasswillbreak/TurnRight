# Editor reliability and review update

This application update implements operation-specific recovery, private local recovery downloads, grouped field undo, three-way conflict review, prepared-workspace fallback, guided repairs, explicit duplicate cleanup, release impact review, source comparisons, destination sharing and recorded steps information.

## Interfaces and compatibility

- `save-edits` retains its transactional, idempotent operation receipts and optimistic revisions. Network retries reuse the original payload. Publication/job submissions are not automatically replayed.
- The authenticated read-only `review-status` action returns jobs, releases and pending source changes. It does not return or replace the current editor workspace.
- Recovery JSON has `format: turnright-editor-recovery`, `schemaVersion: 1`, export time, baseline version and a complete owner-local workspace snapshot. Optional `conflictBase` and `featureBases` retain the original comparison across reloads, including first corrections to published features. Older recovery snapshots remain readable; when no original field values are available, conflict review conservatively requires a whole-feature choice.
- Validation issues carry feature identity/kind, severity, affected field and a supported repair action. Existing error/warning strings remain available to server release validation and older callers.
- Place sharing uses `/?place=<encoded stable ID>` and existing public place aliases. No account or device location is included.
- Public map schema remains 1. Steps remain optional booleans in routing edges; missing information remains unknown. A private edit can explicitly reset steps knowledge to unknown, which omits the public edge flag.
- No database migration is required. This work does not publish campus corrections or change the approved source baseline.

## Validation

Automated coverage includes timeout/authentication failures, lost save acknowledgements, offline fallback, storage failure, recovery export contents, grouped undo across autosave, independent property merges, conflicting geometry/connection choices, and reloaded conflicts. Product checks cover alias sharing, unknown destinations, recorded steps, source property diffs, repair identities and route impact.

Real-renderer browser cases exercise grouped undo, retrying the actual failed export/route operation, local recovery downloads while offline, explicit duplicate cleanup, conflict choices, expired sessions, phone-sized repair previews, source comparisons and release status. Production-service-worker checks cover prepared recovery when the backend fails while the browser remains online.

Verification on Windows with Node 22, 14 September 2026:

| Check | Result |
| --- | --- |
| Vitest | 226 tests passed across 27 files |
| Client/API type checks, production build, service worker and visual bundle budget | Passed |
| Lint | No errors; seven existing `no-explicit-any` warnings remain |
| Chromium | 32 full-suite cases passed; all 11 final reliability scenarios passed across focused runs |
| Production PWA | All four scenarios passed across runs, including an offline survey rerun after correcting banner overlap and backend-failure cache recovery |
| Windows WebKit | Both field-conflict scenarios passed. Field-undo and export scenarios could not reach map readiness after WebGL context loss; remaining checks were stopped. Cross-browser acceptance is incomplete. |

Run browser projects sequentially on this workstation. Concurrent software-rendered browser runs produced map/worker readiness timeouts; the affected Chromium scenarios passed in isolation. Failure traces and screenshots are retained under `web/work/verification/webkit`, with successful focused runs under `chromium-final` and `pwa-final` in the same local verification directory.

Physical Android/iPhone checks, actual outdoor GPS behavior and authenticated hosted acceptance remain release work. Browser emulation and WebKit on Windows do not establish physical-device acceptance. Verify those devices and a configured preview before deployment; campus-data publication remains a separate reviewed action.
