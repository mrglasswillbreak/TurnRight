# Editor reliability and review update

The editor provides operation-specific recovery, private local recovery downloads, grouped field undo, three-way conflict review, prepared-workspace fallback, guided repairs, explicit duplicate cleanup, release impact review, source comparisons, destination sharing and recorded steps information.

## Building workspace integration

The unified model editor uses this same history and save path. A completed numeric edit or pointer gesture is one command; a temporary roof preview is excluded from the history snapshot so Undo does not trap Redo behind an unfinished roof. Selection and cameras do not consume history. Server acknowledgements retain save-operation identities and cannot replace newer local commands.

Optional private `modelInputs` recovery records retain blank/incomplete numeric text, invalid placement work and texture alignment by building and field. Pending layouts retain their pattern/group metadata too. Discarding unfinished input clears mounted fields as well as storage. Private authoring metadata is versioned, excluded from public downloads and guarded against older editors dropping it. No database or public package migration is required. See [current workflow](UNIFIED-MODEL-EDITOR.md) and [current verification](MODEL-EDITOR-VERIFICATION.md); the earlier check counts below are historical.

Shared-save validation names the blocking feature and retains the atomic batch locally.
Nested wall removals remain removed during conflict merging; removal versus edited
content requires a complete-wall choice. Old empty recovered wall records have an
undoable repair action. Explicit application updates verify complete local recovery
even when a draft needs validation repair. The unload exemption is bound to that
revision, so later edits restore the usual leave protection.

## Interfaces and compatibility

- `save-edits` retains its transactional, idempotent operation receipts and optimistic revisions. Network retries reuse the original payload. Publication/job submissions are not automatically replayed.
- The authenticated read-only `review-status` action returns jobs, releases and pending source changes. It does not return or replace the current editor workspace.
- Recovery JSON has `format: turnright-editor-recovery`, `schemaVersion: 1`, export time, baseline version and a complete owner-local workspace snapshot. Optional `conflictBase` and `featureBases` retain the original comparison across reloads, including first corrections to published features. Older recovery snapshots remain readable; when no original field values are available, conflict review conservatively requires a whole-feature choice.
- Validation issues carry feature identity/kind, severity, affected field and a supported repair action. Existing error/warning strings remain available to server release validation and older callers.
- Place sharing uses `/?place=<encoded stable ID>` and existing public place aliases. No account or device location is included.
- Public package readers support schemas 1–3; these reliability repairs do not change the schema. Steps remain optional booleans in routing edges; missing information remains unknown. A private edit can explicitly reset steps knowledge to unknown, which omits the public edge flag.
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

The owner subsequently requested application deployment, completed on 14 September 2026; see [the production record](PRODUCTION.md). Hosted public sharing, Clinic–Law routing, phone-sized search fallback and the configured editor sign-in screen passed. Physical Android/iPhone checks, actual outdoor GPS behavior and authenticated owner acceptance remain pending. Browser emulation and WebKit on Windows do not establish physical-device acceptance; campus-data publication remains a separate reviewed action.
