# Redesign verification · 7 October 2026

This record covers the redesign code through `6dba299`. It is not a deployment receipt. The final source digest and screenshot hashes are recorded in the [capture manifest](assets/screenshots/redesign-2026-10-07.json).

## Environment and results

Local verification uses Windows, Node **22.23.3**, Playwright Chromium **153.0.8010.12**, and the installed Playwright WebKit runtime. Browser runs use one worker; Chromium uses the repository's software WebGL configuration. Authentication, private APIs and GPS are isolated fixtures. Linux CI also runs the complete regression matrix and native GIS gates; [PR #10 checks](https://github.com/mrglasswillbreak/TurnRight/pull/10/checks) are the authoritative results for the final merge revision.

| Gate | Result |
| --- | --- |
| Unit and database suite | **719 passed**, 100 test files |
| App/functions TypeScript and lint | **Passed**; eight existing `no-explicit-any` warnings remain in unchanged files |
| Standard production build | **Passed** |
| Auth-configured production build | **Passed** |
| Default Chromium suite | **189 runnable tests passed** across sequential regression runs; 14 opt-in offline/gallery cases are outside this default gate |
| WebKit suite | Required Linux CI matrix; local Windows coverage is partial (see limits below) |
| Production service-worker and image recovery suites | **9 service-worker tests and 1 image recovery test passed** in [CI](https://github.com/mrglasswillbreak/TurnRight/actions/runs/37665250695) |
| Native PostGIS and isolated processing engine | **Passed** in [GIS acceptance](https://github.com/mrglasswillbreak/TurnRight/actions/runs/37665250668) |
| Final screenshot capture and documentation assets | **18 captures inspected**; all seven capture scenarios passed; 315 relative links/assets validated across 18 guides |

The Chromium suite was resumed after fixing failures, retaining each passing result and rerunning the affected cases. This is aggregate coverage, not a claim that an earlier failing run was green. The full inventory contains 203 tests. Opt-in service-worker and documentation cases are run with their dedicated configurations.

## Resource budgets

The final auth-configured build passes the existing budget scripts without increasing their limits.

| Resource | Measured | Limit |
| --- | ---: | ---: |
| Public startup JavaScript, including static dependencies | 433,993 bytes gzip | 435,200 bytes |
| Additional owner editor JavaScript | 180,608 bytes gzip | 189,440 bytes |
| Lazy photo workspace JavaScript | 10,292 bytes gzip | 12,288 bytes |
| GIS workspace increments | 6,191–9,039 bytes gzip | 20,480 bytes each |
| Lazy 3D renderer/editor, shared dependencies included | 258.6 KiB gzip | 300 KiB |
| Offline world | 5.30 MiB | 8 MiB |
| Offline voice | 5.91 MiB | 8 MiB |

## Behavioral coverage

- Workspace defaults and restoration, role restrictions, malformed/unavailable preference storage, account/campus isolation, explicit building links and recovered drawings.
- Persistent map/model canvases, keyboard resizing, collapse, maximize, focus and reset; desktop, compact, portrait and short landscape layouts.
- Legend dismissal and reopening after reload, reset visibility, and unchanged map highlighting.
- Collapsed Activity with private drafts, active/paused uploads, other-tab ownership, failures, recovery problems, offline transitions, accessible status, Escape/outside dismissal and focus restoration.
- Model geometry, invalid numeric input, undo, photographic reference splits, import/export, meshes, curves and recovery; photo orientation, redaction, codecs, comparison and private recipes.
- Virtualized layer-table scrolling, typed GIS data, analysis, independent review, immutable releases, map exports, public navigation and unobstructed map controls.

The [layout contract](EDITOR-LAYOUT.md), [contributor checks](../CONTRIBUTING.md), and [screenshot maintenance guide](SCREENSHOTS.md) document the implementation boundaries and reproduction commands.

## Limits

The first cross-browser CI pass exposed clipped pane controls in WebKit and closed-menu contrast candidates. Collapsed panes now use `display: none` while keeping their React content mounted; compact/maximized panes can extend beyond collapsed resizer containers. The three affected WebKit input/route cases passed after this correction. A further focused Chromium run passed all nine survey, pane restoration and light/dark contrast cases. The protected merge requires the full Linux WebKit matrix, in addition to all Chromium, offline, quality and GIS gates.

Phone and tablet cases are simulated browser viewports. Keyboard and accessibility assertions check focus, names, states and live regions; they do not establish usability with a physical screen reader. Physical-device, field-navigation and real upload/network acceptance are not claimed here. No server API or database migration is introduced, and production has not been changed by this verification. Historical deployment and field evidence remain in [Production](PRODUCTION.md) and [Acceptance](ACCEPTANCE.md).
