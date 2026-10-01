# Production deployments

Entries are dated receipts. Later entries supersede earlier deployment status,
package counts and interface labels; older evidence is retained for audit.

## Campus layers and publication · 30 September–1 October 2026

The layer explorer, original-path hit testing, road-property persistence, bounded polygon editing, reviewed geometry operations and desktop control row were deployed from `cd6b412ee7175351b42d4ed4a6524199787e7c23`. LASU package **`lasu-4895a363b403`**, release **`aee5cdc6-51dd-42a0-b2ae-1b5d1ad03b4a`**, [published successfully](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36771976263). It contains 609 map features, 393 buildings, 220 destinations, 44 photographs, 82 labelled illustrative road surfaces and 17 layers. The graph remains 1,331 nodes / 2,696 directed edges; SHA-256 `eed2ce1e874e4e77340050e3d26efc84a75aa9658076552e529f81867d352120`.

The [frozen-preview verification](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36769797340) passed all 32 campus/browser/viewport/theme/view combinations, all 180 asset hashes, four offline reopen cases and historical rollback transport. No public rollback was performed. The two new LASU README captures come from artifact `11124270250` and its associated reviewed preview (publication creates a production build from that frozen source).

Private campus backups were captured and read-back verified before migration. [Baseline audit](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36760377686) retained LASU’s 4,776 source rows / 137 corrections and UNILAG’s 10,574 source rows / 189 corrections. The LASU publication retained all 137 corrections privately and excluded its two unrelated unpublished building drafts. [Additive preparation](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36768012027) retained reconciliation `750ecc60-d1ff-4a79-819b-b211a0360cda` and private rollback assets. The preceding public LASU package is `lasu-2b70a39ca041`.

All 95 LASU source paths are accounted for: 82 surfaces, 12 with no area after exclusions and one unresolved geometry conflict. The 30 landscape records are reclassified using explicit source attributes. Three microscopic conversion repairs retain every part/ring/vertex and change projected area by less than 0.008%. Independent Shapely checks pass validity, non-overlap, identity and area accounting. [Coverage and reviewed sources](LASU-LAYERS.md).

Migration **020** was applied before layer writers; readback confirmed the scoped batch RPC and unchanged correction counts. Migration **021** subsequently adds only the service-role reviewed-snapshot RPC with a 60-second local bound. Live readback confirmed `search_path=public`, `statement_timeout=60s`, service execution enabled and anonymous/authenticated execution denied. The database regression covers administrator checks, invalid snapshots, campus isolation, active-release conflicts and idempotent retries.

UNILAG’s 426-parcel classification patch is accepted privately and retains all 179 surveyed road identities. Initial snapshot insertion hit the ordinary database timeout after the additive patch; no failed attempt was published. A stale-hash retry correctly stopped when owner layer drafts changed. [Fresh preparation](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36783458858) and [successful guarded application](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36783751654) now preserve **192 corrections**, exclude **four unpublished drafts** (one land, three layer), apply zero additional source patches and create release **`72e3a36e-5096-48d4-8a99-bc2bab2de458`**. Its complete workspace hash is `0e3b3958fff1edc43399a9637699f8d688684ba9474a87c2ad9d0f9d929ac3a5`; its 3,928 features, 10 reviewed layers and graph hash `326fa8e18e683283ef53ba0673b434e318f94f24ec645e338f4a11dd065dd5a3` retain the public routing graph. The corrected UNILAG package is `unilag-faa044ebdd24`. [Preview build](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36784178468) passed; [package verification](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36785517681) passed all 32 Chromium/WebKit desktop/mobile light/dark 2D/3D views and four offline reopen cases before the historical-deployment check found an expired UNILAG host. Restore now checks the exact historical version and hashes on the current project-owned host when Vercel returns deployment-not-found. [Publication succeeded](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36788055362): release `72e3a36e-5096-48d4-8a99-bc2bab2de458` now publishes `unilag-faa044ebdd24` through production deployment `dpl_D9tePNWBX3vBnRBoAAEQ2aJFTFDY`. Database readback confirms LASU remains `lasu-4895a363b403`. [Rollback acceptance](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36787872860) passed the preceding `unilag-a3779f9c3603` package through the actual retained-asset restore transport; its public immutable assets are included in the verification artifact. Transport regressions also pass.

[Regression audit at a457953](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36772849548) passed all eight jobs, including Chromium/WebKit polygon 96 property editing, an actual vertex drag, save/reload and preservation of all 6,094 vertices and 56 holes. The later plain-home campus memory change adds explicit-link, failed-load and storage-restriction checks. [Focused follow-up](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36787039665) passed all eight jobs, including campus memory, overlap selection, label rendering and the new layer workflows. The [full browser audit](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36787217749) passed seven of eight jobs; its remaining model-menu test exposed Escape dismissal while focus was still on the SVG canvas. The application now explicitly dismisses the active menu from either the canvas or popup, and the test waits for popup unmount between commands while retaining focus and undo assertions. [Final focused verification at 30174b1](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36793890465) passed all eight jobs: 680 unit tests, lint/typechecks, configured build, Python checks, Chromium/WebKit campus-memory and polygon-96 journeys, related model commands and offline workflows. The earlier isolated WebKit module-load error did not recur; geometry, hole counts, persistence and zero-page-error assertions all remain enabled. Existing limits remain public startup 435,200 bytes gzip, additional owner 189,440, photo 12,288 and lazy 3D 300 KiB; the [final application-code build](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36793890465/job/110152784085) measured 435,030 / 188,600 / 10,490 bytes and 238.4 KiB respectively.

[Production verification](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36788523640) passed all **180 served asset hashes** (133 LASU, 47 UNILAG), eight desktop/light 2D/3D views across Chromium and WebKit, and four offline campus/browser reopen cases covering destinations, photographs and models. These checks supplement the 32-view preview matrix above. Manual checks on the public origin confirmed UNILAG → plain `/` restores UNILAG and LASU → plain `/` restores LASU; explicit campus links remain authoritative. A subsequent private-state read showed 142 LASU and 192 UNILAG corrections; newer owner work remains private and was not overwritten.

The final code also keeps pending road-display workers alive across a persisted `pagehide` (browser Back/Forward cache), terminates them on a normal unload, and refuses a source apply before mutations when a queued/building release is already present. Snapshot creation retains its independent transactional guard. **680 unit tests across 96 files**, lint/typechecks and the configured build pass.

Physical phones, native Safari, live GPS and field access/entrance verification remain outstanding. Historical sections below retain their original packages and counts.

## UNILAG detail and vector compatibility · 30 September 2026

Release `9f775622-a2aa-419c-a154-e9b584c7f465`, package
`unilag-a3779f9c3603`, [published successfully](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36687163769)
at **08:03:55 UTC** and serves the [public UNILAG map](https://turnright.vercel.app/?campus=unilag).
Its [frozen preview build](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36685569828)
contains 3,928 map features, 723 buildings, 116 destinations, 16 credited
photographs and all 179 road surfaces. The model build contains 4 detailed,
7 simplified and 712 illustrative extrusion records in nine sectors
(276,746 bytes; revision `1adc07ebe2ae5d83`).

Migrations **018–019** were applied and read back before dependent writers.
The [additive preparation](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36682149808)
retained all 188 UNILAG corrections and the Engineering model. It added 282
features and 45 destinations and changed mapped metadata without deleting
source rows. Receipt `6cd211e3-f025-47b2-9d24-2a69282db93a` retains complete
before/after source snapshots. The original road upload was verified in private
storage against its 748,261-byte original and SHA-256 checksum.

The prepared workspace graph is unchanged: 4,252 directed edges and canonical SHA-256
`12551b2a9daa618d4f6d9eb6db1713a70542e69c9879d09c0c409139e653fb26`.
Packaging retains the existing removal of unused nodes. The public graph has
2,114 nodes and 4,252 edges; its before/after SHA-256 is
`326fa8e18e683283ef53ba0673b434e318f94f24ec645e338f4a11dd065dd5a3`.
Direct comparison found zero changed nodes or edges.
The final snapshot has 188 edits and hash
`41d217b3b9b314cbefee1a25d4e633a5852307e26f12954a91a9f7273ed66b67`.
LASU's private source and draft hashes were unchanged across the additive
transaction. Unrelated owner activity changed LASU drafts earlier in the
session; that state was preserved rather than overwritten by the older capture.

[Regression audit](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36683508502)
passed all eight jobs: 641 unit tests, lint/typechecks, configured build,
Chromium/WebKit campus/import/photo checks and offline recovery. The final
restore transport adds two regression cases; **643 tests across 94 files pass**.
The [pinned GIS run](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36681596847)
passes all 29 GIS tests, covering every advertised vector format, plus the
private 0700 worker smoke test. The ordinary Python run contains 56 cases:
52 pass and four have driver-dependent skips; the pinned run covers those skips.

Configured gzip budgets remain unchanged: public startup **434,560 / 435,200
bytes**, additional owner code **186,593 / 189,440**, photo workspace
**10,430 / 12,288** and lazy 3D renderer/editor **235.8 / 300 KiB**.
Full-UNILAG road clipping measured approximately 0.87–2.74 seconds in the local
software benchmark; it now runs in a cancellable worker with cached results.
These timings are not phone frame-rate measurements. Browser verification uses
the full vegetation and building dataset, not a reduced fixture.

The restore check found that Vercel protects historical deployment URLs.
Restoration now verifies project ownership, obtains temporary authenticated
access, validates every historical asset and revokes that access. Redirects
cannot forward credentials to another origin. The restore operation still
builds a new campus-specific preview while preserving other campuses and drafts.

At **08:07:24 UTC**, direct production checks confirmed all 179 distinct road
identities are valid and nonempty: 80 paved roads, 24 unpaved roads and 75
sidewalks. UNILAG's manifest contains **47 assets / 14,209,103 bytes**, SHA-256
`6de05eddd311fa1d5a9d9069ad03f644d35f6e301b54d22a36347fbd23653cf4`.
LASU remains `lasu-2b70a39ca041`, **133 assets / 21,178,465 bytes**; its manifest
is byte-identical to the captured baseline, SHA-256
`4177f122756ec833c0915d4d195af3b3d709e5d913b1609977de942a59c70a53`.
Both campuses' public routing graphs match their preceding releases. An
unauthenticated request for private UNILAG state returns HTTP 401.

The [real-package matrix](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36686022563)
passed all 32 desktop/mobile, light/dark, 2D/3D views in Chromium and WebKit,
all 180 asset hashes, and all four campus/browser offline checks. The later
historical-asset check in that run failed on protected redirects. The
[focused restore follow-up](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36686978255)
then passed with every previous UNILAG asset verified and temporary credentials
removed. No public rollback was performed.

The [production follow-up](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36687623034)
completed successfully at **08:11 UTC** against `turnright.vercel.app`. It
rechecked all 180 published asset hashes, eight desktop 2D/3D campus/browser
views, and all four offline reopen cases. Every rendered view retained its
full feature coverage and had no horizontal overflow or JavaScript errors.

A live Chromium navigation check at **08:15 UTC** also passed LASU
Clinic–Senate route planning (three options), switching through the public
campus chooser, UNILAG Senate search, and Central Mosque–Senate route planning
(two options). It did not start GPS navigation or change owner drafts.

Chromium's disconnected-browser checks and WebKit's stopped-origin checks both
reopen actual campus maps, photographs and verified model packages. The latter
avoids a [Playwright 1.63 offline-navigation emulation defect](https://github.com/microsoft/playwright/issues/42775);
it is not a native Safari or physical-phone result. Campus access, real GPS,
precise dimensions and unresolved source associations remain field/evidence work.

[Coverage, repaired geometry and evidence gaps](UNILAG-DETAIL.md) ·
[Import formats and operation](CAMPUS-IMPORTS.md).

## Image editor release checks · 30 September 2026

Implementation `8ce0fd9` passed [the final regression audit](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36669158593):
634 unit tests across 92 files, lint/typechecks, configured production build and
budgets, focused Chromium/WebKit campus and photo workflows, the dedicated
15-case WebKit image suite, and both production offline suites. Python discovery
passed 40 tests with three GIS-driver-dependent skips. Eight existing lint
warnings remain. The preceding portrait run exposed test assumptions about an
always-open settings panel; the final tests wait for image recovery and use the
panel's expanded state before continuing.

The update adds retained-original automatic batch compression, local Squoosh
codecs, combined image/details editing and drag ordering. Portrait has a horizontal
comparison and expandable bottom bars; TurnRight's shared light/dark tokens style
the workspace. Actual desktop, landscape and both portrait themes are captured
in [the photo guide](PHOTO-EDITING.md). Four local comparison workflows also
passed, including divider dragging, rotation and recipe recovery. These are
browser checks, not physical-phone measurements.

Configured gzip budgets remain unchanged: public startup **434,890 / 435,200
bytes**, additional owner code **188,861 / 189,440**, lazy photo manager
**10,236 / 12,288**. Code deployment must preserve the current LASU and UNILAG
manifests and catalogue; it does not publish additional photo or map drafts.

## UNILAG publication · 30 September 2026

The owner-authorized UNILAG release was inspected in the in-app browser and
[published successfully](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36663072375).
Release `0a33726d-f417-4405-b459-97def6d52f46` serves
`unilag-eedb8166a67f` at [the public UNILAG map](https://turnright.vercel.app/?campus=unilag).
It contains 71 destinations and 4,252 directed path segments. Three road segments
intersecting a mapped building remain excluded; the main library's approach is
blocked. Routes and final entrances remain explicitly unverified in the field.

Verification at **2026-09-30T03:16:19Z** checked all **23 UNILAG assets / 9,498,906 bytes**
and all **133 LASU assets / 21,178,465 bytes** against their published hashes and
lengths. LASU remains `lasu-2b70a39ca041`; its manifest is byte-identical to the
pre-publication baseline (SHA-256 `4177f122756ec833c0915d4d195af3b3d709e5d913b1609977de942a59c70a53`).
The catalogue now contains both campuses. The earlier release-test failure was
an environment-scoping test assumption, fixed in `a3dd5e6`; neither campus's
feature IDs nor model fingerprints were changed by that repair.

## Import review repair and LASU publication · 27 September 2026

Application revision `dd671c7` is Ready in production. [PR #3](https://github.com/mrglasswillbreak/TurnRight/pull/3) fixes the disabled review button by comparing mapping values independently of database JSON key order, while retaining real-change and validation blockers. Migrations 016–017 replace row-by-row insertion with a bulk transaction and allow up to 60 seconds for this service-only RPC; its API transport waits up to 75 seconds. The source lock, campus identity, run token, validation and exact baseline checks remain enforced.

[Audit run 10](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36333082433) passed all eight jobs: 625 unit tests across 90 files, lint, configured production build/budgets, focused Chromium/WebKit campus-import workflows, offline workflows and Python checks. The new PostgreSQL regression covers 1,500 proposals, duplicate counting, stale/cancelled candidates, wrong campus/token, invalid batches and atomic rollback. [GIS run 16](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36331794114) passed the pinned GIS suite.

The owner-requested LASU draft was validated, previewed and [published by release run 52](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36331136542). The served package is `lasu-0b8025eb23b8`, with 127 assets / 21,238,475 bytes and 45 photographs, including the six previously approved building-photo drafts. PG School authored geometry was reviewed without changing its geometry. Release impact reported no newly disconnected destinations, retaining the Clinic–Senate, Clinic–Law and Clinic–Library routes. The public browser verified the C.P.S photograph and downloaded the updated offline package, including all 45 photographs. Subsequent code deployments retain this manifest.

[UNILAG import run 36](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36332555168) queued 10,175 additions and one metadata change. The five valid requested layers were accepted into the private UNILAG workspace through the existing review operation, with LASU source fingerprints checked unchanged. The resulting baseline contains 3,646 geographic features, 2,281 nodes, 4,248 directed edges and campus metadata. The editor shows the imported geography and no pending proposals from this batch. UNILAG remains unpublished, road access remains restricted for review, and redistribution permission remains unconfirmed. Road width is still excluded because polygon 96 self-intersects; [import guide](CAMPUS-IMPORTS.md#september-27-unilag-import-outcome) records its location and recovery.

All changes in this repair were committed and verified through GitHub Actions, Vercel and the in-app browser because the local command host could not start. The local checkout was not updated, and no new local screenshot artifacts were produced.

## Reliability and responsiveness audit · 27 September 2026

Runtime revision **`74be164`** is Ready in
[production](https://vercel.com/muhammed-abdulhadi-s-projects/turnright/FuTVDuJ86aV4JQM36QtCQpgbnHaG).
The [audit report](AUDIT-2026-09-27.md) records 16 fixes spanning campus-safe
retries, import consistency, offline recovery, local image storage, Activity,
search, model selection and responsive controls. Image recipe-write median fell
from **10.7 ms to 0.6 ms** in five controlled storage runs. Dense model selection
under 4× CPU throttling remains above the 200 ms target; the report preserves the
measurements and physical-device limitations.

[Final CI](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36309823050)
is green: **623 unit tests**, lint/typechecks, configured production budgets,
five focused Chromium repairs, four focused WebKit workflows, four WebKit image
workflows, nine production offline workflows and the separate offline-image
workflow pass. The preceding full run passed 152 Chromium and 51 WebKit cases;
all four Chromium failures subsequently passed their focused checks. Twelve
production-only/documentation cases are excluded from the development suite.
One WebKit browser termination passed on an unchanged job rerun; the audit keeps
that history. Python discovery has 40 passes and three driver-dependent skips;
the pinned GIS run separately passed all 18 import cases. Eight existing lint
warnings remain.

Verification at **2026-09-27T09:47:39.358Z** confirmed `/`, `/admin` and `/sw.js`
return 200, unauthenticated `/api/admin` returns 401, and the served model CSS
contains both photo-sheet positioning repairs. Its file is
`PhotoModelWorkspace-D0zf-ApE.css`, SHA-256
`88a530813e3ebd89215a9d46d136df4e61f24b0d3243448882baa9ae8df7f5f6`.
All **121 published assets / 19,986,835 bytes** passed length and SHA-256 checks.
The LASU-only catalogue and `lasu-49f832190110` manifest are unchanged. The
in-app browser installed the waiting update and verified the corrected Clinic
search and its retained gallery. Six newly approved photographs remain private
building drafts; unmatched candidates remain unassigned. No campus release or
database migration was performed.

Final budgets: public startup **434,433 / 435,200 gzip bytes**, additional owner
code **188,674 / 189,440**, photo workspace **8,494 / 12,288**, lazy 3D
**235.4 / 300 KiB**, world **5.30 / 8 MiB**, and voice **5.91 / 8 MiB**. Updated
guides include unaltered phone and landscape photo-alignment captures, with
**62 distinct README screenshots**. Local image storage migrates atomically to
IndexedDB version 2; this does not change Supabase or published model schemas.

## Offline photo editing and Activity · 27 September 2026

Runtime revision **`332c333`** is Ready as the current Production deployment in [Vercel](https://vercel.com/muhammed-abdulhadi-s-projects/turnright/5dAp7EyiibzFpfiAXCUDReThKMzR). The editor adds retained local originals, editable image recipes, crop/colour/privacy tools, comparison and batch compression. Activity exposes import, release, model, photo and offline-processing stages. No database migration is required. [Photo workflow](PHOTO-EDITING.md) · [Progress coverage](PROGRESS-MONITOR.md).

Verification at **2026-09-27T06:33:58.621Z** confirmed public/admin/service-worker routes, the unauthenticated admin boundary, served PhotoOptimizer/ProcessMonitor chunks and unchanged LASU catalogue/manifest. All **121 published assets / 19,986,835 bytes** passed hash and length verification. Campus content remains `lasu-49f832190110`; no photographs or second campus were published by this rollout. The production Activity interface was checked in the in-app browser after installing the waiting update.

The final checks pass: **26 focused unit tests, six Chromium workflows, four WebKit workflows, and a production PWA workflow** that disconnects, reloads originals/recipes, exports, queues a prepared copy and reloads that offline queue. Linux GIS drivers and the restricted private-worker smoke test pass in [Actions run 36300301280](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36300301280); the local Python suite has 14 passing checks. Lint retains the eight existing explicit-any warnings.

The configured build remains within all existing budgets: public startup **434,399 / 435,200 gzip bytes**, additional owner code **188,059 / 189,440**, photo workspace **8,495 / 12,288**, lazy 3D **235.3 / 300 KiB**, world **5.30 / 8 MiB**, and voice **5.91 / 8 MiB**. The updated guides pass local link/anchor/image checks across **46 Markdown files**, with **61 distinct README screenshots**. Screenshots are unaltered isolated application captures; physical-device storage pressure and native keyboards remain manual checks.

## Globe and import inspection repairs · 27 September 2026

Runtime revision **`c28da32`** is Ready in [production](https://vercel.com/muhammed-abdulhadi-s-projects/turnright/GgGLCJn8TRpJtc8337gnTFcfNXjQ). Portrait/landscape campus search now fits within the visible viewport and globe framing responds to dock/chooser size. Stars are brighter in both themes; Light retains the horizon glow. Production was checked in the in-app browser after installing the new service worker.

The earlier importer fixes select the actual ArcGIS JSON dialect and run the restricted converter with the host runner UID/GID. Live private inspections succeeded for the owner's ArcGIS service (14 layers / 10,516 features) and five complete supplied GeoJSON files (1,404 features). The supplied Greenland file is incomplete: 1,000 of the service's 2,425 records, so its rejection is retained. These inspections did not publish or apply source data. [Import receipts and recovery](CAMPUS-IMPORTS.md).

The production catalogue remains LASU-only, with **`lasu-49f832190110`**, 395 buildings, 220 places and 39 photographs. Its manifest and all **121 assets / 19,986,835 bytes** passed baseline hash/length verification after deployment. The UNILAG research download remains a separate local delivery; no second campus was published.

## Project documentation and public dock — 26 September 2026

Runtime revision **`e6106447c3066f`** is Ready in
[production](https://vercel.com/muhammed-abdulhadi-s-projects/turnright/8QLkbo35d1Hrtva2oYwWzp1rwrUV).
Reviewing the refreshed screenshots exposed the floating campus chooser covering
the expanded navigation. It now occupies a 44px globe button beside search,
reachable with the card collapsed or expanded. Chromium and WebKit checks pass
at desktop, tablet, landscape and 320px/390px phone widths. The deployed UI also
confirms a 44×44 control with no navigation overlap.

Live verification at **11:19:36 UTC** confirmed `/`, `/admin` and `/sw.js` return
200, unauthenticated `/api/admin` returns 401, and the LASU-only catalogue still
references the unchanged `lasu-7343cb96c9a5` package. All **84 assets /
20,228,832 bytes** retain their recorded lengths and SHA-256 hashes. Served
`CampusSwitcher--6rCefdm.js` has SHA-256
`08bfe8de1d60b6f2d1807b52bd86b8d8e4ff73d42d5cd593be6c13f32bad7355`.
No campus data or map release was changed.

Lint and the configured production build pass, with the existing eight
explicit-any warnings. Public startup remains **433,772 / 435,200** gzip bytes;
the additional owner bundle is **185,800 / 189,440**. The full production-build
documentation journey passes and refreshes public navigation and isolated owner
views. The README now covers the whole project with **55 distinct screenshots**,
an expanded module tree and a task-based documentation index. Related guides
cover campus scoping, current setup through migration 015 and scoped restore
previews; historical evidence retains its original date and package. Local
links, anchors, image paths and Unicode checks pass across all 43 Markdown files.

## Campus contrast and documentation follow-up — 26 September 2026

Runtime revision **`820351fa2018cf77240f1b2aa433b1e4749aa37f`** is Ready in
[production](https://vercel.com/muhammed-abdulhadi-s-projects/turnright/CDDwCUC1eyH7ecbZcmDh8XhxKR81).
Live screenshot review found an undefined card token making the Campuses header
and fields white against dark-theme text. The fix pairs those surfaces with the
active theme and uses semantic error text. Chromium and WebKit contrast checks
pass in both themes and preserve entered source text through switching.

Verification at **11:04:21 UTC** confirmed the served correction in
`CampusWorkspace-BtdEXSmy.css`, SHA-256
`5996d7a951eb5fb2edb5a450ce8d421d8a376a831e03a13d687a29fcffd2e599`.
Public/admin/shell routes return 200 and unauthenticated admin requests return
401. The catalogue still lists only LASU, and the manifest plus all **84 assets /
20,228,832 bytes** remain identical to the preserved baseline. No map release
was published by this code fix.

Lint, production and configured builds pass; the existing eight explicit-any
warnings remain. The configured build measures **433,772 / 435,200** public
startup gzip bytes and **185,804 / 189,440** additional owner bytes. The README
now describes the whole project, its current module tree and **55 screenshots**.
The documentation index separates workflow/setup guides from historical research.
Setup now consistently requires migrations 001–015, and campus restoration
consistently means preparing a new preview with other campuses' current packages.
All 43 Markdown files pass local link, anchor, screenshot-path and Unicode checks.

## Multi-campus imports — 26 September 2026

Initial campus revision **`262db1b302dbf1096b878fba57c59047abde6a51`** deployed through
the [production deployment](https://vercel.com/muhammed-abdulhadi-s-projects/turnright/8q8B17a6dvq26Shso2c4u6cFg7iJ).
[PR #2](https://github.com/mrglasswillbreak/TurnRight/pull/2) was merged with its
nine focused commits preserved. The Campuses workspace, GIS import controls,
public switcher and scoped publication/restore API are enabled.

Migrations **013–015** were applied together in one transaction through the
Supabase SQL editor before deploying the writing release. Post-migration checks
confirmed all four new tables have RLS and no anonymous/authenticated SELECT
grants; the five campus/import/release RPCs permit service-role execution only.
The `campus-imports` bucket is private with a **50 MiB** upload limit. LASU is the
only campus record. Before/after record counts and fingerprints match for:

| Preserved private data | Records |
| --- | ---: |
| Source features | 4,777 |
| Owner edits | 133 |
| Releases | 32 |
| Surveys | 2 |
| Building media | 25 |
| Model assets | 1 |

Live verification at **10:46:33 UTC** returned 200 for `/`, `/admin` and `/sw.js`
and the expected 401 for unauthenticated `/api/admin`. The new public catalogue
contains only LASU and points to the unchanged **`lasu-7343cb96c9a5`** manifest.
All **84 assets / 20,228,832 bytes** pass byte-length and SHA-256 checks.
Served `CampusWorkspace-QQ-MHxNw.js` has SHA-256
`9686424744a303637841c4997964720f239776405f6e57cc08cc0285df0f3c1e`;
`CampusSwitcher-DNB9se9i.js` has SHA-256
`85189196cc56c8ab1eca66d578fac3a29a6e441d2bcafa51fb9797ddf8700957`.
No second campus or demonstration data was published. Importing and publishing
another campus still requires the owner's source and map review.

### Compatible-reader stage

Reader revision **`f17f7b1`** deployed through the existing
[Vercel integration](https://vercel.com/muhammed-abdulhadi-s-projects/turnright/FZGvkES73dorL9GBF22Hjq66W7ra).
It understands campus identities and isolated offline package pointers while
retaining the original LASU defaults. Live verification at **07:04:19 UTC**
returned 200 for `/`, `/admin` and `/sw.js`, and the expected 401 for unauthenticated
`/api/admin`. The LASU manifest remains unchanged at **`lasu-7343cb96c9a5`**;
all **84 assets / 20,228,832 bytes** pass SHA-256 and byte-length verification.
Served workspace `PhotoModelWorkspace-Cr6rd58w.js` has SHA-256
`98852ee27fadc2032f73172aea0b7a0d406ab4d113afe5faaac1298df5ad3892`.

The reader deployment preceded database changes and the writing release above.
Follow [the staged rollout](DEPLOYMENT.md#multi-campus-rollout) for future
installations and retain the server-side protection when reverting clients.

Implementation verification passes **591 unit tests**, the focused Chromium and
WebKit import workflows, lint (eight existing warnings), production/configured
builds and all bundle/asset budgets. The pinned Linux GIS image passes all
**14 import tests**, including every supported file driver and the source
projection regression ([workflow evidence](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36225606793)).
The configured build measures **433,769 / 435,200** gzip bytes for public startup
and **185,802 / 189,440** additional owner-editor bytes. Frozen LASU model fixtures
are unchanged. Eight new unaltered fixture screenshots bring the root README to
**54 screenshots**; they demonstrate the implementation, not a second live map.
See [campus imports](CAMPUS-IMPORTS.md) and [acceptance](ACCEPTANCE.md).

## Reference editing and authored models — 26 September 2026

Application revision **`5407e3880abe864f428d3f3e7aaeaf5ca2b0614a`** deployed
successfully through the existing [Vercel workflow](https://vercel.com/muhammed-abdulhadi-s-projects/turnright/2v3B88ZTCt7Xdo876YFNuXttqEnu).
The rollout adds remembered model/photo reference panes, globe rotation/clouds,
exterior and curved boundary editing, stable mesh component tools and
GLB/glTF/OBJ/STL interchange. The private model document and publication path
remain behind owner authentication and explicit review.

Compatible readers were deployed at `25e2f1e` before migration
`012_editable_model_assets.sql` and the writing editor/API. Production checks
confirmed a private `building-models` bucket, no authenticated direct metadata
SELECT grant and the versioned `save_editor_model_batch` RPC. The migration
created no model assets or campus content. Older writers cannot silently drop
new document references.

Live verification at **04:33:26 UTC** returned 200 for `/`, `/admin` and `/sw.js`,
and the expected unauthenticated 401 from `/api/admin`. Served workspace
`PhotoModelWorkspace-B2tYHipm.js` has SHA-256
`02fb819161d49ab8d3f8b3b655e4136b33160871ece830afa7af7a9ee5f5111b`;
the Mesh, private-asset client and globe chunks were also fetched and checked.

The owner had published **`lasu-7343cb96c9a5`** at 02:14:29 UTC before this
application rollout. That release is the preservation baseline: its manifest
is unchanged and all **84 assets / 20,228,832 bytes** pass SHA-256 and byte-length
verification. A fresh compatibility audit of **395 models** finds zero rejected
fingerprints. No campus release was triggered by this deployment.

Validation passes **577 unit tests**, focused Chromium and WebKit workflows,
client/server TypeScript, lint (eight warnings), production/configured builds
and all existing budgets. The production screenshot workflow passes; the root
README now includes **46 unaltered screenshots**, including real reference-photo
editing and isolated mesh/curve/file examples. See [verification](MODEL-EDITOR-VERIFICATION.md),
[model authoring](MODEL-AUTHORING.md) and [screenshot provenance](assets/screenshots/README.md).

## Published model compatibility repair — 26 September 2026

Revision **`22478badad256a7d7b0f979151f6322d0d38d0a9`** deployed successfully
through the existing [Vercel workflow](https://vercel.com/muhammed-abdulhadi-s-projects/turnright/EPoUNCoX2H8K41uDHFh2skXDyNvA).
Roof-text support had added an empty slot to fingerprints even when a building
had no roof text. This incorrectly rejected **19** unchanged published models,
including Senate and Mass Communication, and displayed fallback blocks. The
repair preserves legacy fingerprints when the optional field is absent while
retaining validation for genuinely changed geometry, details and lettering.

All **395** models in `lasu-623791e1184e` now pass compatibility checks. After
installing the app update in the existing public browser tab, Senate and Mass
Communication visibly rendered their detailed architecture again, including
with the older downloaded campus package. No map-data update was needed.

Live verification at **01:13:15 UTC** confirmed 200 responses from `/`, `/admin`
and `/sw.js`, plus the expected unauthenticated 401 from `/api/admin`. The served
workspace is `PhotoModelWorkspace-B2S-UlIT.js`, SHA-256
`ce1ac8dac45d859588146753b566b4d944c42d19c045e5d92176e702c521e4dd`.
The published manifest remains byte-for-byte equivalent to the baseline; all
**84 assets / 20,098,125 bytes** pass byte-length and SHA-256 verification.

The repair passes **39 focused unit tests**, three Chromium cases and the new
phone WebKit rendering case. Frozen published fingerprints prevent tests from
regenerating both sides of the compatibility comparison. TypeScript, lint
(seven existing warnings), production/configured builds and all budgets pass.
The 38-image production documentation gallery was recaptured successfully and
the affected public-map and workspace screenshots now show restored models.
See [verification](MODEL-EDITOR-VERIFICATION.md) for details.

## Individual windows, public handoff and bulk review — 26 September 2026

Application revision **`1f1fac4327b47d4c165ebf0679d47b131329f26f`** deployed
successfully through the existing Git/Vercel production workflow. The
[deployment](https://vercel.com/muhammed-abdulhadi-s-projects/turnright/52gFfcN6Q6YFP5pYwhafXi93zwVu)
completed at **00:55:48 UTC**. Live verification at **00:56:22 UTC** confirmed
200 responses from `/`, `/admin` and `/sw.js`, and the expected 401 from an
unauthenticated `/api/admin` request.

The served workspace is `PhotoModelWorkspace-DFxe7hCS.js`, SHA-256
`d9631d7fe4c8df288e27e78c66f15e905494866aaac16a190b916862527f54a1`.
Offline-precache bundles contain the new **Mark all as reviewed** action,
surface/text tools and tree search; the separate **2D precision** label is absent.
Public bundles include the contextual building URL, sign-in handoff storage and
reordered place actions.

The release makes generated and repeated windows individually editable, retains
compact rows until a change, and preserves selection and individual lock/hide
actions through undo. It combines surface views, widens desktop properties,
uses an accessible icon-only structure toggle and starts normal editor opacity
at 100%. Public Editor opens the selected building's general editing card while
respecting recovery. Model Review can approve eligible recorded walls together
in one undoable command.

The published manifest is **identical to the pre-deployment baseline**:
**`lasu-623791e1184e`**, schema 2, 395 buildings, 220 places, and 39 photographs
covering 19 buildings. All **84 assets / 20,098,125 bytes** passed live byte-length
and SHA-256 checks. No database migration, endpoint addition or campus publication
was performed.

Verification includes **547 unit tests in 70 files**, focused Chromium workflows,
**three WebKit landscape/rotation workflows**, TypeScript, lint with seven existing
warnings, production and authentication-configured builds, and all bundle budgets.
The README and related guides include **38 current screenshots**; the final
production-build gallery run passed. See [model verification](MODEL-EDITOR-VERIFICATION.md)
and [capture provenance](assets/screenshots/README.md) for coverage and the limits
of simulated devices, keyboards and zoom.

## Shared model surfaces, lettering and refreshed documentation — 25 September 2026

Application revision **`50ef0e0`** deployed successfully through the existing
Git/Vercel production workflow. Verification at **22:44:44 UTC** confirmed the
public app, `/admin` and `/sw.js` return 200; an unauthenticated `/api/admin`
request returns 401. The served workspace is
`PhotoModelWorkspace-Cs-ANkiB.js`, SHA-256
`6e6937e030112acee4c5cb296539fe329d6f95a137bed60090646630b834da46`.
The workspace and appearance chunks are included in the offline precache and
contain the new surface controls, tree search, detachment and roof-text fields.

The update provides one Edit model entry, a searchable nested structure tree,
shared Orbit/surface/2D editing, selected-item Ungroup and Detach instance,
wall/roof lettering, and responsive desktop/portrait/landscape controls.
Draft previews display validated unreviewed details without approving them.
Wall views face outside for either ring winding, including courtyard walls.
Text follows roof planes and respects wall projection. No migration, new API
endpoint or map publication was performed.

The published manifest is **identical to the pre-deployment baseline**:
**`lasu-623791e1184e`**, schema 2, 395 buildings, 220 places and 39 photographs.
All **84 assets / 20,098,125 bytes** passed live byte-length and SHA-256 checks.
Architectural edits and labels remain subject to the owner's normal review and
publication workflow.

Verification passes **532 unit tests in 67 files**, **14 focused Chromium cases**,
**three WebKit rotation/landscape workflows**, client/server TypeScript, lint
(seven existing warnings), production and authentication-configured builds and
all existing budgets. The root README and related guides now include **34 current
screenshots**, with isolated owner responses and explicit capture provenance.
See [model verification](MODEL-EDITOR-VERIFICATION.md) and the
[screenshot inventory](assets/screenshots/README.md). Physical-phone, native
keyboard and screen-reader acceptance remain outstanding.


## Mobile controls, live globe location and baseline repair — 25 September 2026

The original × close control is restored beside Undo/Redo. Short landscape tools
remain beside the canvas, and holding a visible 3D detail opens its selection
actions. Foreground GPS position and available facing direction remain visible
on the globe, with stale-fix handling and manual camera control preserved.
The README retains its 26 production screenshots and adds three documented
mobile/editor/globe fixture captures.

Migration 011 was applied to the existing database. The reconciliation RPC now
materializes request inputs through a private implementation boundary, bounds
record comparison work and has a scoped 15-second execution budget. Ordinary
API/lock timeouts and owner authorization remain unchanged. The live owner
reconciliation completed to `lasu-57b640350853`, retaining drafts and their
history with a before/after rollback archive. The unfinished Makanjuola entrance
is retained for the owner to map its approach; no new campus content was published.

The deployed public package remains schema 2 with 395 buildings, 220 places and
39 photographs. All 84 assets (19,917,216 bytes) passed hash/size verification.
The close-control restoration passed five focused browser cases and production
budgets; the database repair passes 15 real PostgreSQL tests including 5,000
records through the RPC JSON request shape. See the [verification report](MODEL-EDITOR-VERIFICATION.md).

## Mobile canvas, height controls and selection actions — 25 September 2026

The application rollout adds a canvas-first model workspace on phones, tablets
and short touch-landscape screens. All five modes remain available through the
mode selector, with one focused sheet, explicit Move/Resize, pinch cancellation,
44 px plan/texture handles, directional nudges and keyboard-aware sizing. The
selected detail's ⋯ button and right-click menu replace the permanent action row;
keyboard shortcuts, focus restoration, lock/hide, copy previews and undo remain
available. Sheet reservation now uses viewport lengths consistently, preventing
sheets from covering the preview.

Height and floor changes can proportionally adjust inherited custom roofs;
recorded roof elevations and explicit wing overrides can instead be retained.
An incomplete floor count stays private until completed. Height/roof adjustments
use one history action and flag affected wall assignments for review.

Verification passes 501 unit tests, 23 Python importer tests, 28 distinct model
browser cases with focused follow-ups, all nine production PWA journeys, both
TypeScript projects, lint and the configured production budgets. The documentation
capture provides 26 public/editor screenshots. See [verification](MODEL-EDITOR-VERIFICATION.md)
and the separate [five-trial mobile comparison](MOBILE-MODEL-PERFORMANCE.md).
Physical mobile devices and native keyboard/screen-reader acceptance remain
unavailable; the reports distinguish simulated coverage.

No server API, database migration, public package schema or map publication is
part of this rollout. The reviewed campus remains **`lasu-313d8a168635`**, schema 2,
with **395 buildings, 220 places, 39 photographs** and **84 immutable assets**
totaling **18,880,327 bytes**. Application updates retain the existing verified
recovery guard. Model/content changes continue through owner preview, publication
and rollback.

## Model insertion and recovered-draft repairs — 25 September 2026

Application repairs through **`2051f02`** are served at
[TurnRight](https://turnright.vercel.app/admin). Add buttons insert their requested
detail in one undoable action while preserving generated windows and trim. Blocked
work remains recoverable, whole-building height can be repaired within Appearance,
and save errors name the feature blocking the shared batch. Conflict merging no
longer resurrects deleted wall records. Existing empty records have an explicit,
undoable repair instead of crashing the model workspace. Updates verify recovery
and permit reload only for its unchanged revision. Undo clears removed selections.

Verification includes **498 Vitest tests**, focused workspace regressions after the
reload guard, **22 distinct model/appearance browser cases**, the production PWA
building/roof/input recovery journey, both TypeScript projects, lint with seven
existing warnings, and all configured build budgets. See the updated
[verification report](MODEL-EDITOR-VERIFICATION.md). Live owner checks exercised
Add window, Add door and Add column on the reported wall, then undid every test
insertion. Reviewed draft repairs reached the server-confirmed Saved state.
After a manual refresh cleared a stale in-app browser page, a fresh owner session
loaded the current bundle and retained the saved repairs. The final live Add/Undo
check also cleared selection and disabled Duplicate when no detail remained.

At **23:33 UTC on 24 September** (00:33 on 25 September in London), all **84 assets**
passed byte-length and SHA-256 checks. The published manifest is unchanged:
**`lasu-313d8a168635`**, schema 2, **395 buildings, 220 places, 39 photographs** and
**18,880,327 bytes**. The public bundle is `index-YhkE0g8I.js`, the editor is
`Admin-DlLq0BHh.js`, and the precached workspace is
`PhotoModelWorkspace-BmPAn2fJ.js`. Unauthenticated media/status/save requests returned
401. No map release, database migration or package-schema change was made.

## Unified Photo & model editor — 24 September 2026

Application revision **`9414109`** deployed successfully through
[Vercel](https://vercel.com/muhammed-abdulhadi-s-projects/turnright/3SesGo9maFZTdd3psNagb6W9w3yM).
Additive model-authoring validation at `a195899` deployed before the dependent
client. No database migration or public package-schema change was required.

The building workspace integrates measured wall editing, selectable 3D, photographs,
appearance, roofs, geographic outlines and targeted review. Completed commands use
the existing 100-action history and draft saves; unfinished input recovers privately.
Copies, groups, patterns, presets and wall rematching retain compatible public
façade records. Private authoring metadata stays out of map downloads. See the
[owner guide](UNIFIED-MODEL-EDITOR.md) and [verification report](MODEL-EDITOR-VERIFICATION.md).

The first client deployment stopped at the existing visual bundle limit because
shared model controls imported the owner authentication entry. Entry-aware shared
chunks and lazy building inspector tools fixed that boundary without raising
budgets. The configured build passes all four budget scripts; guards now check
lazy loading, authentication separation and offline dependencies. All nine
production PWA journeys passed again after the fix, including building appearance,
unfinished roofs, private input recovery, corrupted-asset repair, walking/entrance
and driving behavior. The wider verification includes 494 Vitest tests, 23 Python
tests, client/server TypeScript, lint with seven existing warnings, model browser
journeys and five-trial performance groups. Physical-device coverage remains
unavailable and one dense throttled timing trial exceeds the target; the report
records those limits.

Live verification at **22:14 UTC** checked all **84 published assets** against
their lengths and SHA-256 hashes. The manifest exactly matches the pre-rollout
reference: **`lasu-313d8a168635`**, schema 2, **395 buildings, 220 places, 39
photographs** and **18,880,327 bytes**. Public/editor pages and the service worker
returned 200; the deployed unified model workspace is precached. Unauthenticated
`media-status`, `media-library` and `save` requests returned **401**. This application
rollout did not publish demonstration edits or replace the reviewed campus package.

The README and related owner, architecture, recovery, deployment and verification
guides have been refreshed. The [screenshot inventory](assets/screenshots/README.md)
documents **19 current public/editor captures**, including desktop/mobile building,
photo, roof, outline and model workflows. Historical screenshots and source/release
receipts are explicitly dated rather than presented as current instructions.

## Performance and upload recovery — 23 September 2026

Deployed application revision **`3d1badb`** through
[Vercel](https://vercel.com/muhammed-abdulhadi-s-projects/turnright/DPrK1daYpnsypjW2M3qmu5iZx57G).
Additive private-media API support at `2ff0691` was deployed successfully before
the dependent client. No database migration or public package schema change was
needed. The first client build stopped safely at its editor bundle budget;
configured-build measurements now include the Supabase authentication dependency.

Photo management now uses indexed building labels, bounded rendering and previews,
session-wide sequential uploads with pause, per-job IndexedDB recovery and tab
ownership. Editor validation, worker replies, map updates, search and offline
startup avoid repeated work. All approved photographs remain in offline downloads.
The [performance report](PERFORMANCE.md) records the design, reproduction commands,
five-run measurements and device-coverage limits. Caption typing pooled p95 was
**17.1 ms** on desktop and **44.1 ms** in the mobile viewport at 4× CPU throttling;
photo selection and workspace navigation also met the 100/200 ms lab targets.

Checks passed: **462 Vitest tests**, **23 Python tests**, **36 browser/PWA
journeys**, both TypeScript projects, lint (seven existing warnings), production
build and all four budget checks. Live owner verification loaded the Senate
building's four-photo gallery and the private library without modifying content.
The app update activated successfully; a transient workspace request timeout
recovered through Retry. Physical mobile devices and native screen-reader speech
were unavailable; emulated keyboard, reflow, accessibility and layout checks are
documented separately.

Post-deployment verification at **19:20 UTC** checked all **67 published assets**
against their lengths and SHA-256 hashes. The manifest remains unchanged at
**`lasu-286bae3c6016`**, schema 2, **420 buildings, 220 places, 22 photos** and
**9,977,021 bytes**. Public/editor pages and the service worker returned 200;
the lazy photo workspace is precached. Unauthenticated `media-status` and
`media-library` requests returned **401**. Production campus content was not
republished by this application rollout.

## Visual photo workspace — 23 September 2026

Deployed the photo workspace and schema-3 readers at application revision
`f443f23` through [Vercel](https://vercel.com/muhammed-abdulhadi-s-projects/turnright/C5nbfboZtxcSg8MtGkKNiYg9b1xD).
The owner editor shows thumbnail galleries, populated photo details, previously
reviewed rights and the searchable private-upload gallery against real campus
content. A follow-up labels legacy uploads without recorded targets as
**Building not selected**. The verification review was removed from the local
queue without editing or publishing campus content.

Migration **010** was applied before deployment. All seven added columns were
verified, alongside owner RLS, the enabled approved-record immutability trigger,
a private storage bucket and no anonymous table reads. An unauthenticated live
`media-library` request returned **401**. Original files, draft metadata, revision
links and authorship declarations remain private.

Checks passed: the complete 442-test Vitest suite plus subsequent focused photo
regressions, 23 Python import tests using the pinned data requirements,
TypeScript/lint (seven existing warnings), production build and all asset
budgets. Desktop/mobile photo journeys cover retries, interrupted batch approval,
local recovery, captions, cover ordering, undo/redo, keyboard focus restoration,
public previews and selection changes during uploads. Production service-worker
journeys passed offline reloads for both schema 1 and schema 3 photographs.

The app build preserved the owner's existing published **`lasu-286bae3c6016`**
release: schema 2, 420 buildings, 220 places, **22 photos**, **67 required assets**
and **9,977,021 bytes**. This comprises the corrected 21-image research collection
and an additional approved owner upload. No schema-3 content was published by
this rollout. Future author-provided photos without external source URLs use
schema 3 after the normal preview, publication and rollback review.

## Corrected photograph collection — 23 September 2026

The corrective preview **`lasu-874f9cd2158c`** passed the
[release workflow](https://github.com/mrglasswillbreak/TurnRight/actions/runs/35818195877)
at application revision `f2a506d`. It contains **21** licensed photographs for
the same **13 of 420** buildings, totaling **4,218,642 bytes**. Its complete map,
photos, models and voice download reached **Ready offline** in the deployed
preview. The library retains an exterior view and an atrium photograph.

Full original metadata review revealed that Commons image `199191750` declares
`trainedAlgorithmicMedia` and "Made with Google AI". It is withdrawn from the
research catalogue and excluded when repackaging an older baseline. Its source
audit remains reproducible, and every included source now requires an original
metadata check. The 7,976 research records now comprise 21 included, 167 duplicate,
7,725 rejected and 63 awaiting evidence/permission.

Migration **009** is applied and verified. Production logs located reconciliation
timeouts first in whole-snapshot comparison and then in replacing unchanged source
rows. The migration compares individual full records and writes only changed rows,
retaining the owner guard, exact stale-review checks, table lock, rollback records
and private execution grants. Reconciliation to `lasu-cb5e27351c8b` then succeeded,
retaining all 104 correction records. Database regression tests verify unchanged
timestamps, reordered snapshots, duplicate/missing IDs, changed access with an
unchanged hash, unauthorized callers, rollback, drafts and history preservation.

Publication completed through the owner workflow. Its public manifest
confirmed **`lasu-874f9cd2158c`**, with 21 photographs and 66 required assets
totaling **9,909,392 bytes**. The historical receipt below describes the preceding
22-image release.

## Entrance guides and photographs — 23 September 2026

Published **`lasu-cb5e27351c8b`** at [TurnRight](https://turnright.vercel.app/)
through the existing owner preview and publication workflow. The reviewed
[preview run](https://github.com/mrglasswillbreak/TurnRight/actions/runs/35808577194)
and [publication run](https://github.com/mrglasswillbreak/TurnRight/actions/runs/35809740891)
both completed successfully, using application revision `5b43c4d`.

- Added explicit destination entrances, recorded arrival/accessibility guides,
  building galleries, private owner photo processing/review and verified offline
  photo downloads. Migration 008 is applied; original uploads and owner records
  remain private.
- Reviewed all 420 published buildings against the documented photo sources.
  Included 22 distinct CC BY-SA 4.0 photographs for 13 buildings, totaling
  4,468,572 bytes. The other 407 buildings have no verified release photograph.
  All 7,976 research records are classified, including duplicates, irrelevant
  search results and 63 records awaiting identity/permission evidence.
- All **67 production manifest assets**, totaling **10,160,289 bytes**, passed
  byte-size and SHA-256 checks. Public photograph metadata exactly matches the
  reviewed catalogue, and associations pass arrival validation. See the
  [machine-readable publication receipt](../data/photos/research/publication-receipt.json).
- Retained 220 places, 1,329 graph nodes, 2,692 directed edges and 205 mapped
  approaches. Node IDs/coordinates and edge IDs/endpoints/geometries/distances/
  access rules are unchanged. Reconciliation only removes temporary crossing
  endpoint bookkeeping and extends parent-edge ancestry on 222 edges; these
  differences are recorded in the receipt. Three Clinic walking routes retain
  their previous distances. No confirmed doorway, vehicle approval or parking
  connection was invented from a photograph.
- 431 Vitest tests, 23 Python tests, TypeScript, lint and production build budgets
  passed. Lint retains seven existing warnings. Desktop/mobile public and owner
  browser journeys passed, including caption editing, undo/redo, saved recovery,
  explicit entrance links, driving/parking transitions and old-package behavior.
  Production-build PWA tests passed for photos, driving/voice and enrichment;
  interrupted download, corruption repair and rollback tests also passed.
- The deployed preview displayed the real galleries and required credits and
  reached **Ready offline** with every approved photograph. Review caught and
  fixed photo-credit contrast in dark mode before the final preview. Existing
  immutable assets remain available for rollback.
- The deployed owner API successfully listed private uploads and processed an
  uploaded copy of an already reviewed Senate photograph into a signed private
  preview. Attachment was cancelled; it remains an unreviewed private upload,
  with no draft or published-gallery change.

The first guarded baseline reconciliation attempt timed out without changing
the baseline; a status check and retry succeeded, retaining all 104 correction
records and the Law/Library access reviews. No security setting or review check
was disabled. [Collection scope and outstanding evidence](../data/photos/README.md).

## Reviewed campus enrichment — 22 September 2026

Published **`lasu-3fe75a6ac04b`** at
[turnright.vercel.app](https://turnright.vercel.app/) through the authenticated
owner review, preview and publication workflow. The
[publication run](https://github.com/mrglasswillbreak/TurnRight/actions/runs/35766442710)
completed successfully at 18:21:56 UTC, following the successful
[preview run](https://github.com/mrglasswillbreak/TurnRight/actions/runs/35765453789).

- Added 40 source-reviewed Overture footprints and seven recorded OSM gates;
  corrected the existing university category and included three saved owner
  corrections. No uncertain new businesses, street names or access permissions
  were published.
- The package contains 420 buildings, 220 places and 94 path features. All prior
  place IDs, walking edge geometry, endpoints, distances and access rules remain.
  The same 15 destinations lack a confirmed approach. Reviewer identities and
  private survey fields are absent from the public data.
- All 45 manifest assets passed byte-size and SHA-256 verification at 18:26 UTC:
  5,528,853 bytes, including 23 model sectors totaling 1,032,908 bytes. Campus
  SHA-256: `df13e3d8defd1a028ecc56bc3df1227d25e24cb627c28c785ddaa9155c9442e5`.
- Desktop and mobile preview checks covered place details, walking alternatives,
  driving-unavailable messages and offline models. Production downloaded the
  new package, showed **Ready offline**, and retained that state after reload
  with no browser console errors. Driving remains unavailable until separate
  vehicle permissions and mapped parking connections are reviewed.
- Preview and publication CI tests passed. Local targeted suites, TypeScript,
  lint and production asset budgets passed; lint retains seven existing
  `no-explicit-any` warnings.

Source review exposed two workflow defects fixed before publication: `60aae26`
adds source-ID filtering and pagination beyond the first 300 proposals;
`2d236a5` keeps the reconciled published-baseline version when accepting source
metadata. The metadata anchor repair used the existing guarded review RPC and
an auditable proposal; it did not bypass publication validation.

See the [complete review receipt](../data/enrichment/2026-09-22/publication-review.json)
and [coverage report](../data/enrichment/2026-09-22/README.md). All 16,908 original
ledger items remain accounted for: 88 accepted, 14,949 rejected and 1,871 awaiting
evidence. The imported excluded-segment narrative refers to the full candidate;
published graph and destination counts were verified independently.

## Source field review migration — 22 September 2026

Applied `supabase/migrations/007_source_field_reviews.sql` to the existing
TurnRight production database through its authenticated SQL editor. Preflight
confirmed the source-review prerequisites and that neither new object existed.
The migration ran in one transaction with lock and statement timeouts; the
PostgREST schema cache was notified after creation.

All seven live verification checks passed: row-level security is enabled on
`source_field_reviews`; anonymous reads and authenticated-browser writes are
denied; the server can write audit records; anonymous and authenticated-browser
execution of `review_map_fields` is denied; and the server can execute it.
This enables partial source-field approval without changing or publishing map
records itself.

## Editor publication repair — 14 September 2026

The owner reported that editor previews could not be published. The authenticated
editor showed a saved, valid draft and an enabled Publish button. The latest
`test new` preview built successfully, but its
[publication workflow](https://github.com/mrglasswillbreak/TurnRight/actions/runs/34806595392)
failed at 04:35 UTC with `Vercel 422: Resource cannot be processed.`

The release script sent a Preview deployment directly to Vercel's production
promotion endpoint without the required JSON body. Vercel's
[promotion implementation](https://github.com/vercel/vercel/blob/main/packages/cli/src/commands/promote/request-promote.ts)
rebuilds Preview deployments with production settings; direct promotion applies
to production deployments. The workflow fallback also replaced the specific
error with a generic message.

- `902bee9` rebuilds the exact reviewed deployment for production, records the new
  deployment ID before waiting, checks for a previous build after a lost receipt,
  verifies the current production assignment, and uses the rollback endpoint
  when restoring a release.
- `4beb61d` preserves the specific release error in the editor.
- All 238 tests passed, including 12 new publication/recovery/error tests. The
  production build and lint of the changed files passed.
- Vercel reported a successful **Production** deployment for
  `4beb61deba2f106d30f3b2d9520c833cf32e6694` at 04:44:50 UTC:
  [deployment details](https://vercel.com/muhammed-abdulhadi-s-projects/turnright/Atop9BNMgwzGLBT7atAJdMZrNYar),
  [immutable application](https://turnright-mlbjivljt-muhammed-abdulhadi-s-projects.vercel.app/).
- The public application and editor returned 200; all 22 assets for
  `lasu-4e4c8008b38b` matched their declared sizes and checksums.

This deploy repairs the publishing code. The owner's campus preview remains
unpublished; a real publication through the corrected workflow still requires
the owner's next Publish action. No database migration was needed.

## Editor reliability and review update — 14 September 2026

The owner requested focused commits and production deployment. Fifteen
implementation, test and documentation commits were fast-forwarded to `main`.
Vercel reported a successful **Production** deployment for application revision
`641b2e9fc83a80c961513ce9076b7ce4a8f42575`.

- Public application: [turnright.vercel.app](https://turnright.vercel.app/).
- [Production deployment](https://vercel.com/muhammed-abdulhadi-s-projects/turnright/DzmNhygdBpkGuscH93EUsy7xjf4e).
- Immutable URL: [turnright-9u431nae9](https://turnright-9u431nae9-muhammed-abdulhadi-s-projects.vercel.app/).
- At 04:23 UTC, `/`, `/admin` and `/sw.js` returned 200. The service worker
  retains `no-cache, no-store, must-revalidate`; unauthenticated `review-status`
  returned 401 with `no-store`.
- The served application entry is `index-DVdRW6ir.js`; the editor is
  `Admin-BzKmpZNX.js`. The live editor bundle contains local recovery export,
  operation-specific retries, conflict review, repair/duplicate previews,
  release impact and status polling.
- A fresh Chromium session opened the Faculty of Law through its stable place
  link, copied that same ID, calculated Clinic–Law and displayed recorded steps
  information. A phone-sized unknown destination offered focused search, and
  `/admin` opened the configured GitHub sign-in screen. No page errors occurred.
- All 22 published assets retained their exact byte counts and SHA-256 hashes.
  Package `lasu-4e4c8008b38b` remains 3,159,499 bytes. No map drafts were
  published and no database migration was needed.

The final local suite passed 226 tests, the production build and lint with no
errors. Chromium and production PWA acceptance are recorded in
[the reliability verification notes](EDITOR-RELIABILITY.md). Physical
Android/iPhone and authenticated owner acceptance remain pending; Windows
WebKit verification was incomplete because of WebGL context loss. The preceding
production deployment `Cn5F2f8D6MxmFg4ngEXxHnVrncSL`
(`turnright-55oag4lgl`) remains the recorded rollback target.

## Editor baseline repair — 14 September 2026

The owner reported the missing endpoints on path
`osm:way:1534765716:2297333149:2297333129:1`. The live editor has now
reconciled its approved sources with published package `lasu-4e4c8008b38b`,
retaining the reviewed Law driveway and International Library gate access.

- The first reconciliation rolled back because Supabase requires a WHERE
  clause on DELETE. Migration `006_reconciliation_safe_updates.sql` limits
  replacement to the source IDs in the validated review. It was applied
  transactionally; the database's safe-update protection remains enabled.
- All 11 database tests passed on Node 22, including nonempty baseline
  replacement, complete source archival, draft/history preservation, stale
  review rejection and rollback on invalid replacement records. The successful
  live retry additionally verified compatibility with Supabase's DELETE guard.
- The approved baseline now contains 4,372 source rows and has zero missing
  graph endpoints. Its reconciliation archive retains all 1,172 prior source
  rows. All 23 pre-repair correction records and 77 history entries were
  verified intact; one additional edit and history entry arrived during repair.
- Releases displays matching editor/public versions and the replayed draft
  map (220 places, 2,486 directed path segments). The missing-source-node
  warning is gone. Four separate validation messages remain for two entrance
  drafts requiring place or path connections.
- Public package `lasu-4e4c8008b38b` remains 3,159,499 bytes. This repair did
  not publish editor drafts, footprint corrections or the visual catalogue.

## Miniature styling and release-validation repair — 14 September 2026

The owner requested deployment of the completed implementation. Application
revision `3e7e747910478f078ddc49958749cf9b0164cee0` was fast-forwarded to
`main` and Vercel reported **Ready / Production** with the public domain assigned.

- Public application: [turnright.vercel.app](https://turnright.vercel.app/).
- [Production deployment](https://vercel.com/muhammed-abdulhadi-s-projects/turnright/Cn5F2f8D6MxmFg4ngEXxHnVrncSL).
- Immutable URL: [turnright-55oag4lgl](https://turnright-55oag4lgl-muhammed-abdulhadi-s-projects.vercel.app/).
- At 00:57 UTC, all 22 published assets retained their exact lengths and SHA-256
  hashes. Package `lasu-4e4c8008b38b` remains 3,159,499 bytes. The preceding
  `lasu-44f8af5654f1` manifest remains available.
- The served entry, editor and lazy renderer are `index-BabM2uMe.js`,
  `Admin-DMOiYZfw.js` and `campus-model-layer-DfibhRi2.js`. Public `/`, `/admin`
  and `/sw.js` returned 200; the service worker precaches the new application
  and retains its no-cache/no-store policy. Unauthenticated admin access
  returned 401.
- Migration `005_baseline_reconciliation.sql` was applied transactionally.
  Its archive has RLS; anonymous and authenticated clients cannot execute the
  reconciliation function, while the existing server role can. Before/after
  fingerprints matched for all 1,172 source records, 20 correction records and
  65 history entries. No reconciliation was applied during that deployment;
  the subsequent repair is recorded above.
- The existing installed browser offered **Install update** and reopened the
  authenticated editor with its saved workspace. Releases identified the
  missing source endpoints, retained the usable 2,452-segment map, exposed
  Locate/Retry/Download diagnostics and blocked the old preview.
- The live server prepared a baseline review successfully. It retains all
  20 corrections and the Law driveway/Library gate access reviews; four draft
  issues remain after replay. The review was left unapplied at deployment time.

This application deployment enables the rendering and editor workflows and
updates campus styling. The 58 authored models await the separate reviewed
campus-data release; the published package has not gained a visual catalogue.
The nine proposed wing corrections and remaining entrance issues still need
review. See [implementation and evidence coverage](MINIATURE-CAMPUS.md).
The preceding ready deployment, `7mougdEggCDfykCRKR9BiPyhqpbD`
(`turnright-avbq3e2xh`), remains available for rollback.

## Map, editor and 3D update — 13 September 2026

The owner requested deployment of the implemented map/editor improvements.
The 25 implementation commits were fast-forwarded to `main`, and the existing
Vercel Git integration deployed application revision
`932a216e93126a967b897e8a22b769dd6bbf2a2a` successfully.

- Public application: [turnright.vercel.app](https://turnright.vercel.app/).
- [Successful Vercel deployment](https://vercel.com/muhammed-abdulhadi-s-projects/turnright/BARRwm8ZT1HKpmo6cuuzNgiMwNDF).
- Immutable deployment: [turnright-69xf6nluu](https://turnright-69xf6nluu-muhammed-abdulhadi-s-projects.vercel.app/).
- GitHub recorded a successful `Production` deployment for that exact commit.
- At 22:04 UTC, `/`, `/admin` and `/sw.js` returned HTTP 200. The public
  application bundle was `/assets/index-BPiU5JBC.js`, and the editor bundle was
  `/assets/Admin-DgO3BZsD.js`. The served code includes shared building heights,
  the persisted map-view preference and duplicate review. The service worker
  precaches the new application bundle and retains its no-cache response policy.
- An unauthenticated `/api/admin` request returned 401 with `no-store`.
- All 22 published assets matched their pre-deployment byte counts and SHA-256
  hashes. Package `lasu-4e4c8008b38b`, schema 1, remains 3,159,499 bytes. The
  preceding `lasu-44f8af5654f1` manifest remains available.
- An existing installed browser session offered **Settings → Install update**.
  Installation retained its downloaded map and opened the new 3D presentation.
  Faculty of Law details showed the rendering-only illustrative 6 m height and
  retained the existing mapped-approach information.

The application and service worker were validated on Node 22 before deployment;
see [implementation and test results](MAP-IMPROVEMENTS.md). This deployment did
not publish editor drafts, consolidate ambiguous campus records or replace the
reviewed Law/Library access corrections. Reconciliation of the older approved
editor baseline is still required before a campus-data release. Physical-device
checks and the original authenticated desktop drawing reproduction remain open.

## Initial public launch — 9 September 2026

TurnRight is public at **https://turnright.vercel.app/**. The owner explicitly
requested publishing the latest GitHub revision to production on this date.
This replaces the earlier preview-only hosting state; it does not establish
physical-campus or phone verification.

## Law and Library connection update

On 9 September 2026 at 22:07 UTC, the public map was verified as
**`lasu-4e4c8008b38b`** (3,159,499 bytes, 22 required assets). The individually
confirmed Law driveway and International Library gate connect 201 of the 206
mapped approaches to the largest network component. Physical walks and final
building entrances remain unverified.

- Application revision: `1cbdb5db2fa54eff9b71bfd166575ec83ec61f7a`.
- [Successful preview workflow](https://github.com/mrglasswillbreak/TurnRight/actions/runs/34410023855): seven Python and 61 Vitest tests passed.
- Preview deployment: `dpl_Jmzi1AGuTVtUqjYnmpNzChX4kk3E`; hosted Law and Library
  routes and a download to **Ready offline** passed.
- [Production promotion deployment](https://vercel.com/muhammed-abdulhadi-s-projects/turnright/5DBCHCf9WLfUYbZoxnjrGiR8N89w):
  `dpl_5DBCHCf9WLfUYbZoxnjrGiR8N89w`, **Ready / Production**, with
  `turnright.vercel.app` assigned.
- Immutable production URL:
  https://turnright-98n7m4mds-muhammed-abdulhadi-s-projects.vercel.app/.
- All 22 public assets matched their manifest sizes and SHA-256 hashes. `/`,
  `/admin`, `/sw.js`, and the preceding map manifest returned HTTP 200 without
  Vercel authentication.
- A fresh public-browser installation downloaded `lasu-4e4c8008b38b` and
  reached **Ready offline**.
- Preceding deployment `dpl_BHn8UFmU8kTbRtmVwRrf4oz6u3GG` and package
  `lasu-44f8af5654f1` remain available. `PUBLISHED_MAP_URL` remains enabled for
  subsequent code builds.

This publication used a reviewed, frozen Git package. Vercel rebuilt the
preview with production environment settings on promotion. Supabase's older
approved baseline and outstanding source proposals remain separate and must be
reconciled before an editor-led release. See [CONNECTION-REVIEW.md](CONNECTION-REVIEW.md)
and the [public asset verification record](../data/connection-release-verification.json).

## Initial deployment and configuration

- Application revision: `0ee315d2e43f5e09c63ca6ebff33fc6e3cf9e538`, branch `main`.
- Initial Vercel deployment: `dpl_CERT4AGSpjC8vQ1wd18Cdq6wNZJw`.
- Immutable URL: https://turnright-9tm3sd614-muhammed-abdulhadi-s-projects.vercel.app/.
- [Vercel deployment details](https://vercel.com/muhammed-abdulhadi-s-projects/turnright/CERT4AGSpjC8vQ1wd18Cdq6wNZJw).
- Public map package: `lasu-44f8af5654f1`, 3,148,440 bytes, 22 required assets.
- Preceding successful production deployment retained:
  `dpl_GCaLdr2NWhWNL8hk7swguLDzEAti` (same revision/map, before setting
  `PUBLISHED_MAP_URL`). The previous immutable reviewed preview is also retained.

The failure was configuration, not a rejected Git push: **Build and Deployment
→ Ignored Build Step → Only build pre-production** canceled `main` builds.
The setting is now **Automatic**, and the Git connection remains
`mrglasswillbreak/TurnRight`. Root directory `web`, Node.js 22, `npm ci`, Vite,
the Hobby plan and Basic build machine are unchanged. Builds for commits that
do not affect the root directory or its dependencies can still be skipped.

`PUBLISHED_MAP_URL=https://turnright.vercel.app` is set as a Config variable in
both Production and Preview. A second successful production build applied this
setting. Code builds preserve and verify the public map; future map changes use
the reviewed map-release workflow. Publishing code does not automatically
approve imported source changes or editor drafts.

Supabase's Site URL is now `https://turnright.vercel.app/admin`, and that exact
address is in the redirect allowlist alongside the existing preview addresses.
GitHub OAuth, the single-owner allowlist and private-table policies remain in
place. No secret values were changed or committed for this deployment.

This first production publication used the latest checked-in map, as requested.
It was a Vercel Git deployment, not a promotion of the older Supabase release
snapshot. The older snapshot remains a preview in the editor. Before a future
map release, review the source import containing the student-access correction
and preview its assembled map; publishing the older snapshot would serve the
older map. `PUBLISHED_MAP_URL` protects code builds, not intentional map releases.

## Initial deployment verification

- Vercel shows **Ready**, **Production**, the exact revision above, and the
  `turnright.vercel.app` domain assigned to the current deployment.
- Public `/`, `/admin`, `/sw.js` and the package manifest return HTTP 200 without
  Vercel authentication. The service worker has a no-cache/no-store policy.
- All 22 published assets matched the manifest's sizes and SHA-256 hashes.
  The map contains 219 source places, 206 mapped approaches and 62 roads with
  the owner-confirmed student walking permission.
- A fresh public-browser installation downloaded the map to **Ready offline**.
  Search and Clinic-to-Senate routing displayed the 1.0 km / 14 minute route,
  two alternatives, turn instructions and the student-access notice.
- Production GitHub login returned to the public `/admin` URL and opened the
  owner's private editor. One initial map-loading timeout recovered with Retry.
- An unauthenticated admin request returned 401; an empty report submission
  returned 400 before inserting any report.

The 42 TypeScript and five Python tests and local production build had already
passed for this implementation. This deployment required dashboard settings,
not application code changes. Physical-phone airplane mode, live GPS/campus
walks, and an actual production rollback remain unverified; see
[ACCEPTANCE.md](ACCEPTANCE.md).
