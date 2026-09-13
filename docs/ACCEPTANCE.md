# TurnRight verification and release checklist

## Evidence from implementation

Production was published on 9 September 2026 at the owner's explicit request.
[PRODUCTION.md](PRODUCTION.md) records the public deployment, package checksum
checks, offline download, route preview and owner login. Outstanding physical
device/campus checks below remain outstanding; publication does not mark them
complete.

- TypeScript, lint (no errors; eight existing explicit-any warnings), all 61 Vitest tests across nine files, seven Python campus-access/importer tests, and production Vite/PWA builds pass as of 9 September 2026. MapLibre's worker and the routing worker are bundled and included in the application precache. Regression tests validate frozen releases from an isolated frontend directory and preserve restricted gate gaps during path metadata edits. New real-campus cases check Law and Library routes and ensure closures still block their reviewed connections after an expected reopening date. NodeNext compilation also checks the server import graph.
- Appearance adds 14 automated cases covering default/live device changes, manual overrides and reopening, both legacy boolean migrations, delayed hydration, unavailable storage/matchMedia, cross-tab updates, ordered writes, and the pre-paint startup script. Browser checks verified persisted Light mode after reload, return to Device/Dark, cross-tab recoloring of an open Clinic-to-Senate route without losing the route, and the settings layout at 390 × 844 without horizontal overflow. Screenshots are in [assets/screenshots](assets/screenshots/README.md). Actual physical OS appearance changes remain part of device acceptance.
- Automated tests cover A*, inaccessible/directed/disconnected edges, alternative diversity, closures, turns, sustained deviation, stale/inaccurate GPS, distinct arrival fixes, explicit editor connections, preserved junctions/corrections, footprint/fence crossings, interrupted/corrupt downloads, hash reuse, cache eviction, storage exhaustion, source diffs/incomplete imports, administrator authorization, private report validation/rate limits, and Vercel readiness/promotion failure gates.
- Production browser testing completed an app update, a 2.15 MiB map download and “Ready offline” state. With the local origin server stopped, a fresh reload rendered the map, local search and saved places worked, a connected route was calculated in the worker, disconnected routes were rejected, and a prerecorded maneuver completed Web Audio playback. This tests loss of access to all same-origin resources; it is not an airplane-mode test on a physical phone.
- On 9 September, the student-access package `lasu-44f8af5654f1` (3.00 MiB) updated an existing offline installation to **Ready offline**. After installing its application update and stopping the local preview server, a fresh reload, Senate search, and Clinic-to-Senate directions with two alternatives succeeded. The preview showed the student-access notice. This new check did not exercise real GPS or physical-campus accuracy; details are in [CAMPUS-ACCESS.md](CAMPUS-ACCESS.md).
- Later on 9 September, `lasu-4e4c8008b38b` (3.01 MiB) updated the local installation to **Ready offline**. With the preview server stopped, a fresh reload, local search, Clinic-to-Law directions (430 m / 6 min) and Clinic-to-Library directions (875 m / 12 min) succeeded with alternatives and instructions. Audio files passed download verification; playback and real GPS were not re-exercised. See [CONNECTION-REVIEW.md](CONNECTION-REVIEW.md).
- A visual route check revealed an OSM-path/ArcGIS-footprint conflict. Spatial checks exclude those segments. The preceding dataset recorded 28 excluded directed segments; the student-access correction evaluates more roads and records 166. Do not use the earlier unchecked sample route as a field verification.
- Optional WebMCP search and place-detail tools registered in the supported browser, returned public data, opened the corresponding visible place, and rejected an unknown place ID. These tools never expose device location or start navigation.
- Browser checks at 390 × 844 and 1440 × 900 covered light/dark appearance, 2D/3D, manual route selection without requesting GPS, and keeping the route visible after resizing. A private report draft survived a reload and resumed from Settings. The unconfigured editor showed its Supabase setup gate.
- Dependency audit reported zero known vulnerabilities at the implementation check. Repeat before public release; an audit is not a substitute for review.

Live configuration evidence is recorded in [CONFIGURATION.md](CONFIGURATION.md): Supabase RLS/grants, denied anonymous reads of private tables, source baseline initialization, owner GitHub login, private report submission/dismissal, an editor-triggered source check, and an immutable Vercel release preview have been exercised. The release is `4c193c03-25da-4237-88c4-f4c41ca52217`, package `lasu-240581101c35`, application revision `568f468`. Editor refresh and campus rendering were checked on that preview, and its package downloaded and verified to **Ready offline** in hosted Chrome. No test map correction was saved and no production promotion was performed. Physical-phone performance, campus walks, live non-owner sign-in, and production rollback remain unverified. Treat the following checklist as acceptance work unless completion is explicitly recorded.

## Local and desktop browser checks

1. Run `npm ci`, `npm test`, `npm run build`, then `npm run preview` from `web/`.
2. Explore, filter and search places. Confirm ambiguous source records remain distinguishable using their coordinates/provenance. Save a place, reload and recover it.
3. Choose a place with a mapped approach, open Directions, and select a manual origin. Confirm only connected routes appear. A useful connected source pair can be found in `data/seed/campus.json`; coverage will change as edits are approved.
4. Check the selected route against buildings, gates, fences and each maneuver. Test another origin in a disconnected component; it must show a missing/closed-path message. Select an unsupported destination; it must not draw a shortcut.
5. The public map starts in 3D. Toggle 2D/3D and reopen to check the remembered preference. Unknown heights appear as muted illustrative 6 m blocks; recorded and floor-derived heights retain their provenance. Use Settings → Appearance to select Device, Light and Dark. In Device mode change the OS appearance while the app is open, then reopen it; the interface and map should follow. Explicit overrides should survive reload and ignore OS changes until Device is selected again. Confirm the current route and map view survive recoloring. Check keyboard focus, dialogs, labels, map controls and scrollable route instructions at desktop and narrow widths.
6. Download the map and wait for Ready offline. Stop the origin server, reload and repeat search/routes/audio. Restart it before checking updates. For a true network outage use browser devtools Offline or airplane mode on a test device.
7. On an isolated test browser/profile, interrupt an update halfway and reload. The old package must remain active. Delete a cached package asset and reopen; readiness must be lost and repair offered. Test storage rejection/eviction. Never clear an actual user's unrelated browser data.
8. Download an update during a test walk: the active version must stay fixed. End the walk, activate the pending version, then verify it. Try a waiting application update during navigation; its reload button must be disabled.
9. Save a report draft for a place or dropped pin. Reopen Settings → Saved report drafts and recover it. It must not submit automatically on reconnect.

## Android Chrome and iPhone Safari — physical devices

Record model, OS, browser version, package version and date. Test on at least one modest Android phone and one iPhone.

- Install using Chrome's Install app or Safari's Share → Add to Home Screen. Start from the installed icon, including after the browser is closed.
- Check Device appearance against both OS modes on launch and while visible, including offline. Test saved Light/Dark overrides, return to Device, browser/status-bar contrast, and no disruptive theme flash on reopening.
- Verify the initial download online, then enable airplane mode while leaving device location enabled. Cold-start the installed app and repeat map/search/routes/recorded audio/rerouting.
- Deny location, then grant it. Check helpful recovery and manual preview. Test weak accuracy beside buildings and indoors; progression should pause. GPS can take longer to acquire without a network.
- Start outdoors on a permitted mapped path. Check next turn, instruction list, remaining distance/ETA, voice, repeat, mute, north-up and recenter. The map does not route across the gap from an arbitrary GPS point to its nearest path.
- Walk a wrong turn far enough to sustain deviation for at least eight seconds. Confirm recalculation uses permitted downloaded edges and spoken rerouting. Try brief GPS jitter; it must not repeatedly reroute.
- Confirm arrival only after multiple good fixes near the mapped endpoint. Distinguish an approach endpoint from a verified entrance.
- Lock the screen or background the app. Tracking pauses; foreground navigation must recover. Wake lock is optional and does not imply background navigation.
- Check audio with the phone's actual volume/silent-mode behavior. Recorded phrases must work without a local speech-synthesis voice; place names are optional. Check headphone output.
- Measure map interaction and 2D/3D frame responsiveness, startup, download progress and battery impact. Reduce complexity if the modest device is not usable.

## Connected administration

- Complete `DEPLOYMENT.md`. Sign in as the allowlisted GitHub owner and as a separate non-owner test account. Only the owner may open drafts/reports/source data or call admin mutations. Use the anonymous key to query private tables directly: no private rows should be returned.
- Submit a test report through the public endpoint. Verify it is private, rate limited, bounded to campus, and cannot change routes. Mark it resolved in the editor.
- Edit a name; import a conflicting source name. The correction must remain. Review additions, geometry changes and removals. Force an incomplete import; no baseline records may be deleted.
- Draw a new path crossing another without an explicit connection: no junction should appear. Add an explicit endpoint connection within five metres and verify routing. Check dragging vertices, undo/redo, draft saving, existing junction preservation and building conflicts.
- Connect an entrance only to the correct place and path. Confirm private/no-access paths and both directions of selected closures are excluded. Set an overdue reopening date: closure must remain until explicitly reopened and republished.
- Build a reviewed snapshot and verify its Vercel preview. Make a subsequent draft change: it must not alter the immutable preview. Simulate a failed build/promotion in a staging setup; the old production release must remain. Publish, inspect the production domain and metadata, then roll back to the preceding retained deployment.
- Export approved records and edit history. Rehearse a restore to a separate test project and compare stable IDs and routes.

## LASU field survey

The local baseline after the [Law and Library connection review](CONNECTION-REVIEW.md) is 219 source place records, 206 mapped approaches, 0 connected entrances, 5 path components, and 166 excluded directed segments. Of those approaches, 201 connect to the largest component; 13 places have no approach. Full metrics are in `data/coverage-report.json` and `data/connection-review-summary.json`. The ArcGIS item's June 2023 modification date is not a survey date. Some names, construction labels, land outlines and access restrictions may be stale.

Prioritize connecting the campus gates to the permitted pedestrian network; then survey representative walks to faculties, libraries, clinic, administration and student services. Record the actual gate/door, timestamps, permission to use each path, barriers, steps and GPS behavior. Reconcile duplicate pins and resolve every route/footprint overlap before permitting the segment. Repeat routes in both directions and include deliberate wrong turns.

Use a log such as:

| Date / package | Origin → destination / entrance | Path and barrier checks | Wrong-turn / audio / arrival result | Device | Reviewer | Status |
|---|---|---|---|---|---|---|
| Pending | Representative gate → building | Pending survey | Pending | — | — | Unverified |

Publish only after the user accepts the preview and the relevant checks pass. Keep untested destinations and sections explicitly unverified.
