# Unified model editor verification · updated 26 September 2026

The unified workspace retains the owner draft and publication pipeline. This rollout
changes the application/editor, not published architectural content. The current
verified reference is **`lasu-623791e1184e`**, schema 2: **395 buildings, 220 places,
39 photographs covering 19 buildings**, and **84 assets / 20,098,125 bytes**.

## Individual windows, public handoff and bulk review · 26 September 2026

Compact window rows now expose individual instances in 3D, surface handles,
properties and the tree. Selection does not change stored geometry. The first
individual command splits only the affected instance; stable identities preserve
neighbours, group references and selection through undo and reopening. Locks and
visibility can target one instance. Explicit row/group/pattern operations and
Ungroup remain available. Generated windows use the same editing path.

Orbit, Edit surface and Photo are the visible viewport choices. Edit surface also
provides the existing 2D fallback when WebGL cannot start. The structure toggle is
icon-only with an accessible name. Desktop properties have a separate header and
scrolling body, 360 px wide or 320 px below 1200 px; mobile arrangements retain
their width cap. Normal owner opacity starts at 100%.

The public Editor link carries the canonical building into its general editing
card, including sign-in return and unlinked footprints. Recovery continues to
protect pending drawing work; unavailable targets produce a notice. Public
actions follow the photograph and gallery navigation, before credits and arrival
options. Model Review offers Mark all as reviewed for valid, recorded walls in
the current building, with one undo command and explicit reasons for skipped walls.

The unit suite passes **547 tests in 70 files**. Focused Chromium workflows cover
instance edits, locks/visibility, deletion/undo, saving/reopening, surface tools,
bulk review, property scrolling, public action order, linked/unlinked building
handoff, sign-in return and recovery. **Three WebKit rotation/landscape workflows
pass**. Client/server TypeScript and lint pass with seven pre-existing warnings.

Responsive checks use 1280×720, 1440×900, 1920×1080 and effective CSS viewport sizes
for 125%/150% zoom, phone portrait and landscape, and tablet landscape. Rotation
and keyboard checks simulate viewport events; they do not operate physical
devices, native keyboards or browser zoom chrome. Earlier importer, PWA and
performance runs below retain their original dates.

Production and authentication-configured builds pass all existing budgets. The
configured build measures public startup at **426,237 / 435,200 gzip bytes**,
additional owner code at **183,754 / 189,440 bytes**, the lazy photo workspace at
**7,635 / 12,288 bytes**, and lazy 3D/editor code at **219.5 / 300 KiB**. Offline
world assets remain 5.30 MiB and voice 5.91 MiB with 362 clips (8 MiB limits).
The production-build gallery contains **38 current screenshots**, all embedded
in the root README, with dedicated individual-window, bulk-review and public
handoff examples. Owner edits in those captures are isolated illustrative drafts.

Reproduce the focused additions from `web/` with Node 22:

```sh
npm test
npm run lint
npm run build
npm run check:configured-build
npx playwright test --grep "individual generated windows|mark all as reviewed|properties header|public Editor|public editor|surface workspace|model workspace touch layouts"
npx playwright test --config playwright.webkit.config.ts --grep "model workspace touch layouts|landscape model has reachable"
npx playwright test --config playwright.docs.config.ts
```

Run GPU browser projects sequentially. Screenshot provenance is in the
[capture inventory](assets/screenshots/README.md); deployment verification is in
[Production](PRODUCTION.md).

## Surface editing, nested structure and lettering · 25 September 2026

One Edit model entry opens a dedicated three-column workspace. The expandable,
searchable ARIA tree shares selection with the viewport and properties. Wall,
roof and footprint gestures reuse the precision controllers over the same mounted
3D renderer. Orbit restores its camera; aligned editing uses orthographic
projection and inverse pointer mapping. Mobile retains one focused panel; short
landscape keeps it beside the model. Selected grouped/repeated details expose
Ungroup/Detach instance. Walls and roofs support editable plain-text lettering.

Visual review found that the preview inherited the public renderer's exclusion
of unreviewed façades. The owner preview now renders those validated candidates
without clearing review flags; release generation retains its review gate. Front
elevations also account for outer/courtyard ring orientation, preserving stored
positions and repeated-instance identities while facing outside. Roof lettering
is clipped to actual roof triangles so ridges and valleys retain their elevations.

The final unit suite passes **532 tests in 67 files**. Focused cases cover text
validation, save-compatible meshes, draft/public review separation, courtyard
winding, roof constraints, camera/pointer coordinates and tree references. Client
and server TypeScript and lint pass with **seven pre-existing warnings**.

**Three WebKit rotation/landscape workflows pass**, repeated after the final surface fixes. **14 focused Chromium cases pass** across the final run and corrected camera-startup follow-up. Browser coverage checks creation, saving/reopening, selection/focus, ungrouping,
detachment, text properties and invalid placement, shared roof/footprint edits,
undo, camera restoration, renderer identity and WebGL startup fallback. Responsive
checks include 1280×720, 1440×900, 1920×1080 and effective CSS viewport sizes for
125%/150% zoom; 667×375, 844×390, 1024×768, short 740×390/844×320 and portrait.
Rotation and keyboard tests simulate browser viewport events and preserve an
unfinished field. They do not operate physical keyboards or browser zoom chrome.

The configured production build retains all budgets: lazy 3D/editor 217.6 KiB
gzip (300 KiB limit), public startup 425,879 gzip bytes (435,200-byte limit), owner
additional 183,533 bytes (189,440-byte limit), photo manager 7,635 bytes (12,288-byte
limit), world 5.30 MiB and voice 5.91 MiB / 362 clips (each 8 MiB limit).
Shared icons remain outside the owner entry; auth-configured checks verify this
boundary and offline precache inclusion.

The production-build documentation workflow produces **34 current screenshots**,
with isolated owner responses and the verified public campus. Actual image review
covers the entry/card, structure/actions, surface text, Orbit, aligned and precision
views, mobile panels, photos, review, sources, releases, surveys, public map,
settings, offline controls, globe and walking previews. See the
[capture inventory](assets/screenshots/README.md).

Reproduce from `web/` with Node 22:

```sh
npm test
npm run lint
npm run build
npm run check:configured-build
npx playwright test --grep "surface workspace|model workspace touch layouts|landscape model has reachable|model workspace creation|desktop.*docks|selected detail menu supports|unified.*roof.*outline"
npx playwright test --config playwright.webkit.config.ts --grep "model workspace touch layouts|landscape model has reachable"
```

Run GPU browser projects sequentially. Existing importer, PWA and performance
reports below retain their original run dates; they are not new timing claims.
Physical phones, native keyboards, screen readers and campus accuracy remain
manual acceptance work. Deployment verification is recorded in [Production](PRODUCTION.md).

## Earlier verification records

The following counts, captures, package versions and performance measurements
refer to preceding rollouts; current results are recorded above.

## Implemented behavior

- Details, Appearance, Roof, Outline and Review share selection, commands and the existing 100-action history. The measured canvas, hierarchy and batched 3D picking carry wall, element and repeated-instance identities.
- Metre controls, boundary/detail/floor snapping, movement/resizing, multi-selection, alignment, distribution, mirroring, duplication, copy previews, patterns, detachment and independent presets retain compatible façade records. Generated windows and trim can be converted without disappearing when a custom detail is added.
- Copies receive fresh IDs and lose reviewed status. Cross-building copies do not transfer source photographic evidence or textures. Footprint and height changes flag affected assignments; explicit rematching preserves physical dimensions.
- Completed actions autosave; incomplete numeric text, invalid placements with their authoring metadata, roof work and texture alignment recover privately. Undo/redo excludes temporary roof previews. Modal shortcuts no longer clear the underlying selected building.
- Review is explicit and wall-specific. Illustrative work may omit photographs; observed details and documented dimensions retain their evidence requirements. Metadata and visual edits never create an entrance or grant routing access.
- Model generation retains one active and the newest pending request. Selection and evidence notes do not regenerate meshes. Closing disposes workers and GPU resources; failed previews offer an in-place retry without discarding the draft.

## Automated verification

### Mobile canvas and selected-item actions · 25 September 2026

The compact workspace applies at widths up to 900 px and on coarse-pointer screens at most 600 px high. It retains all five modes, Wall/Plan/3D/Photo views, one detented sheet, deliberate Move/Resize, pinch cancellation, continuous-press nudges and reachable precision fields. Desktop panels remain available. The selected-detail menu replaces the permanent properties-button row and supports right-click, Shift+F10, focus restoration, shortcuts, lock/hide, copies and undo.

Whole-building height and floor controls adjust inherited custom roof eaves/points proportionally by default. Owners may retain recorded elevations or explicitly remove a wing override. Choosing floor-count mode without a count remains private unfinished input until a valid count completes the command. Unit coverage verifies scaling, immutability and affected review flags; browser coverage exercises metres, floors, the worker preview and single-action undo.

That unit run passed **501 tests in 64 files**. Both TypeScript projects and lint pass with seven pre-existing warnings. **23 Python importer tests** pass using the repository's pinned data dependencies. **28 model browser cases** pass across 320/390/768/1440-pixel layouts and both themes, plus 740×390, 320×450 and touch-enabled 1024×390 layouts. Follow-up checks verify 44 px plan/texture handles, unclipped mobile 3D controls and deliberate touch gestures. Context-menu tests exercise keyboard focus, lock/hide, duplication, copy preview, delete and undo. All **nine production PWA journeys** pass again: old/new photo packages and entrances, driving voice, survey recovery/sync, saved 3D preferences, corrupt-asset repair, backend-failure cache fallback, building/roof recovery and enriched business details. The documentation project also passes with 26 public/editor captures. The mobile production comparison is documented separately in [Mobile model performance](MOBILE-MODEL-PERFORMANCE.md); the older desktop comparison below retains its original date and baseline.

### Earlier interaction repairs · 25 September 2026

Add buttons now preserve generated details and insert the requested primitive in
one undoable command. Failed placements or building validation retain the proposed
wall privately, with an explicit retry after repair. Whole-building height and
floor controls are available inside Appearance. Appearance wall selection stays
aligned with Details; rejected numeric values keep their recovery record and
remain bound to the original field. Validation descriptions no longer change an
input's accessible name. Shared-save errors identify the feature that blocks the
batch rather than appearing to belong to whichever building is open.

App updates allow invalid drafts to remain for repair only after durable local
recovery is verified. The browser leave guard permits the explicit update only
for that verified revision; subsequent edits invalidate the exemption. Storage
failure still blocks the update. Undo clears selection when its element disappears.

Conflict merging preserves nested removals and requires a whole-wall choice when
removal conflicts with edits. Recovered empty assignments previously crashed the
workspace; a guarded repair view now removes only an explicitly selected empty
entry. Incomplete nonempty records retain their observations and other data.

The earlier repair run passed **498 Vitest tests in 63 files**. Focused workspace
tests pass after the final reload-guard change. **22 distinct model/appearance
browser cases** pass across the repair runs, including all seven Add tools,
generated-layout preservation, blocked additions, height repair, field identity,
patterns, worker retry, empty-record repair/undo and roof/outline history. Layout
coverage includes 320/390/768/1440-pixel light/dark views and short screens. The
production PWA building/roof/private-input recovery journey passes again. Client
and server TypeScript, lint (seven existing warnings), and the final configured
build budgets pass. The five-trial timing study below predates these repairs.

The initial 24 September rollout also passed **23 Python importer tests**, **five
entrance/driving browser journeys**, and the production documentation capture.
Those suites were not repeated in that earlier repair pass; current verification is recorded above. Browser cases
use actual React, MapLibre and Three.js with isolated owner responses; the narrow
setup selects buildings through the feature list to avoid toolbar overlap.

**All nine production PWA journeys passed for the initial rollout:** schema-1/schema-3 photo galleries and entrance choices, driving voice, survey cold start/recovery/sync, saved 3D preferences, enhanced-asset corruption/repair, backend-failure recovery, building/roof/input recovery and enriched place details. Existing immutable update/rollback, authorization and walking/driving regressions remain covered by the unit/PWA suites.

The authentication-configured production build passes all four budget scripts. An initial deployment failed because shared model controls pulled the owner authentication entry into the workspace. Entry-aware shared chunks and lazy building inspector tools correct that dependency boundary without raising budgets. Checks now reject a model workspace that imports `Admin`, require building tools to remain lazy, and verify their complete offline dependency set.

| Allocation | Measured | Limit |
| --- | ---: | ---: |
| Lazy renderer + guided editor, including shared non-startup dependencies | 198.2 KiB gzip | 300 KiB |
| Public startup JavaScript | 421,095 bytes gzip | 435,200 bytes |
| Additional owner editor JavaScript | 183,632 bytes gzip | 189,440 bytes |
| Lazy photo manager | 7,617 bytes gzip | 12,288 bytes |
| Offline world | 5.30 MiB | 8 MiB |
| Natural voice | 5.91 MiB / 362 clips | 8 MiB |

World/voice hashes and precache inclusion pass. The campus geometry/texture budget remains 12 MiB and resident building textures remain limited to 64 MiB. The published snapshot has no approved wall textures; synthetic pool/asset tests cover malformed textures, bounded residency and release.

## Earlier desktop production-build measurements · 24 September 2026

Each group has five trials on Windows, Chromium headless and SwiftShader, at a 1440 × 1000 viewport. Both versions use the same verified campus; the dense fixture adds 100 details to one wall. The baseline is commit `9bb1ef7`. The final fixture includes real `EditorWorkspace` commands and IndexedDB recovery; the baseline uses the former staged form. No other browser suite ran concurrently with these trials.

These interaction trials precede the final deployment chunk-boundary correction. That correction changes loading, not the measured command/canvas logic; configured-build budgets and production offline journeys are checked again afterward.

| Fixture / CPU | Baseline input p95 | Final input p95 | Final selection/view-switch p95 |
| --- | ---: | ---: | ---: |
| Published / normal | 17.0 ms | 7.5 ms | 26.3 ms |
| Published / 4× throttle | 29.1 ms | 36.8 ms | 94.2 ms |
| 100-detail wall / normal | 126.7 ms | 13.3 ms | 25.7 ms |
| 100-detail wall / 4× throttle | 1,153.0 ms | 95.1 ms | 149.8 ms |

These are pooled p95 values across each five-trial group. All groups meet the 100 ms normal / 200 ms throttled targets. **One dense throttled trial had input p95 234.8 ms**, so the measurements do not establish a per-run guarantee. Baseline dense trials varied substantially; the numbers should not be presented as a universal speedup. Published-data throttled typing is slightly slower with the new recovery/history path while remaining within the target. Baseline selection tasks differ from the new workflow, so no comparable selection speedup is claimed.

Input timing measures capture-event to a post-animation-frame task, a next-paint approximation, excluding network completion. Selection timings include hierarchy selection and Details/Review switches. Every final trial recorded **zero typing-triggered model requests**. Each closure retained exactly the fixture's one underlying worker and canvas. Underlying renderer buffers/textures remained; dialog resources were released. These are object counts, not a measurement of process or GPU memory. There are no approved photographic textures to measure in this snapshot.

The raw [40-trial report](model-editor-performance.json) includes individual samples, long tasks, requests, worker payload sizes, draw submissions and retained resources. Long tasks still occur during committed operations and throttled presentation. JavaScript draw-submission timings are not GPU completion/frame timings. This editor benchmark does not supersede the earlier [software-GPU globe/campus movement results](PHOTO-MODEL-VERIFICATION.md#production-measurements), which remain slow and require real-device validation.

## Reproduction

Use Node 22 and installed `web/` dependencies. The baseline fixture is an isolated worktree at `9bb1ef7`; install dependencies there, or use a local dependency junction without changing the baseline source. Build `vite.performance.config.ts` in its `web` directory so the result is at `web/work/model-baseline/web/work/performance-dist` relative to the current repository root. The current harness expects that location.

```sh
# From the repository root, before installing/building the baseline:
git worktree add --detach web/work/model-baseline 9bb1ef7
# In web/work/model-baseline/web: npm ci, then:
npx vite build --config vite.performance.config.ts

# From the current web directory:
npx vite build --config vite.performance.config.ts
node scripts/benchmark-model-editor.mjs
npx playwright test --config playwright.docs.config.ts
```

`--smoke` runs one published-data trial per version. `--final` keeps the recorded baseline and repeats the final groups after a change. `--capture` captures current desktop/mobile model views without replacing the performance report. All versions fetch and hash-check public assets into `web/work/model-benchmark/public`; no owner authentication or production write is performed. Run these measurements separately from browser/PWA suites on software-GPU machines.

For correctness, run `npm test`, `npm run lint`, `npm run build`, `npm run check:configured-build`, relevant editor browser journeys and `npm run test:survey-pwa`. The configured build uses nonfunctional auth placeholders and must not be deployed. The [screenshot inventory](assets/screenshots/README.md) records all 26 current README views and their sources.

## Coverage limits and rollout

### Preview review regression · 2026-09-25

The Releases panel previously reported a passing draft while the server rejected height-invalidated façade assignments with an unnamed error. The browser, model Review panel and authoritative release validator now share named wall review diagnostics. The preview action checks them again after flushing saved edits. Draft saving remains available; model approval remains targeted and undoable. Height-only invalidation no longer asks for an unnecessary wall rematch.

Verification: 503 Vitest tests passed, TypeScript application/functions checks passed, lint retained seven existing warnings, and four focused browser journeys passed (390/1440-pixel release blockers, targeted review with undo/redo, keyboard model review, and height/floor/custom-roof regression). The two release journeys also passed after the final review-label refinements and captured isolated fixture screenshots. The configured production build passed all budgets: public startup 421,381/435,200 gzip bytes; additional owner editor 183,951/189,440; lazy photo workspace 7,618/12,288; renderer/editor 198.3/300 KiB; world 5.30/8 MiB; voice 5.91/8 MiB.

The follow-up per-building restore action passed 21 focused unit tests and a browser journey covering repair preview, explicit application, persistence, Undo and preservation of another draft correction. It restores only the selected building's matching published correction and retains current save identity. TypeScript/lint and configured production budgets passed again (421,383 public startup and 184,116 owner-editor gzip bytes).

The repaired owner draft subsequently completed the [release workflow](https://github.com/mrglasswillbreak/TurnRight/actions/runs/36087596340), including its full automated test suite, and produced preview `lasu-57b640350853`. The authenticated preview loaded successfully; its offline download completed integrity verification for the 18.99 MB package, including all 39 photographs and 9.65 MB of building models. The restored building showed its published height/model evidence in the public card. Production remained at `lasu-313d8a168635`; its 84 assets passed independent byte/hash verification after application deployment. The new campus preview was not published.

### Mobile exit, landscape tools and globe location · 2026-09-25

The original **×** close control remains beside Undo/Redo, as requested. Short landscape layouts put scrollable tools beside the canvas and retain a usable preview, mode selector and undo controls. Touch-holding a visible 3D detail for 550 ms opens the shared selection menu; the synthetic mouse events emitted on touch release are consumed on that canvas so they cannot immediately dismiss it. Orbiting, a second pointer, cancellation, hidden previews and unmount cancel pending holds. Review links expand the selected wall's evidence controls and explain why a visually valid edit still requires renewed review.

Restoring the original close control passed five focused browser checks, TypeScript and the configured production build. Both mobile editor screenshots were recaptured. A separate baseline-reconciliation failure was reproduced through PostgREST-style `json_to_record` inputs: the eight-second statement budget expired during comparison, while direct SQL arguments completed in about one second. Passing parsed arrays through a small PL/pgSQL wrapper before the private implementation reduced the rollback-only production probe to **1.06 seconds**; assigning them within the original function alone was insufficient. Migration 011 also materializes current records once, uses a full join, and reuses the exactly verified snapshot for rollback. All **15 database tests** pass, including a 5,000-record generic-plan fixture using the actual JSON request shape, stale/malformed review rejection, unchanged timestamps, authorization and archived recovery data. The private implementation cannot be called by API roles. Rollback probes varied between 1.06 and 5.78 seconds. The live API still exceeded eight seconds, so this owner-only RPC has a bounded 15-second statement budget; global, ordinary API and lock timeout settings remain unchanged. See [PostgREST function settings](https://postgrest.org/en/latest/references/transactions.html#hoisted-function-settings).

GPS layers are no longer limited to campus zoom, and the world-view CSS no longer hides motion markers. Exploring with foreground GPS tracking enables the existing optional compass service. The globe uses projected local headings, retains manual camera control, labels stale fixes and removes stale direction readings. No map geometry, permissions, database schema or package schema changes are involved.

Final checks: **515 Vitest tests across 66 files**, application/functions TypeScript, and lint passed (seven existing warnings). **13 targeted Chromium browser journeys** passed: long press/release and orbit cancellation; keyboard selection actions; landscape at 740 × 390 and 844 × 320; controls at 320 × 450; touch move/resize/pinch/recovery; all modes at 320 × 720, 768 × 900 and 1024 × 390; existing navigation compass behavior; and live globe position, heading, manual-camera preservation, antimeridian movement, stale data and foreground suspension. Some software-rendered navigation/globe journeys required a 120-second test deadline on this host; this is not an interaction-latency measurement.

The configured production build passes every budget: public startup **421,887 / 435,200 gzip bytes**, additional editor **184,118 / 189,440**, lazy photo manager **7,620 / 12,288**, renderer/editor **198.9 / 300 KiB**, world **5.30 / 8 MiB**, voice **5.91 / 8 MiB**. Offline assets pass hash and precache checks. **Three production PWA journeys passed:** public 3D view preference after offline reload, corrupt architecture asset repair and offline reopening, and editor appearance/unfinished-roof recovery offline. Three additional fixture screenshots supplement the retained 26 production screenshots; [the inventory](assets/screenshots/README.md) identifies simulated sensor data and capture provenance. Earlier timing studies remain historical measurements; no new physical-device or frame-time performance claim is made for this repair.

Physical Android/iPhone devices, native mobile keyboards, browser-level 200% zoom, thermal/memory pressure and a human screen-reader session were unavailable. Automated narrow/short viewport reflow, semantic labels, keyboard input, focus restoration and touch gestures do not replace those checks. Photographs still do not establish exact dimensions or unseen elevations.

Additive server validation deployed first at `a195899`; older clients cannot silently drop newer authoring metadata. No database migration or public package-schema change is required. Application deployment preserves the reviewed campus through `PUBLISHED_MAP_URL`. Architectural content continues through owner preview, publication and immutable rollback; demonstration edits and screenshots are never published as campus corrections.
