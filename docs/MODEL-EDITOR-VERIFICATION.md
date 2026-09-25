# Unified model editor verification · updated 25 September 2026

The unified workspace uses the existing owner draft and publication pipeline. This rollout changes application/editor behavior, not the published architectural content. The verified reference snapshot is **`lasu-313d8a168635`**, SHA-256 `b2927184603beeeefdbb96bc42d4460e46f05ec3a8f58f8238a70b383201954c`: **395 buildings, 220 places, 39 photographs covering 19 buildings**, and 84 package assets totaling 18,880,327 bytes.

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

The current unit run passes **501 tests in 64 files**. Both TypeScript projects and lint pass with seven pre-existing warnings. **23 Python importer tests** pass using the repository's pinned data dependencies. **28 model browser cases** pass across 320/390/768/1440-pixel layouts and both themes, plus 740×390, 320×450 and touch-enabled 1024×390 layouts. Follow-up checks verify 44 px plan/texture handles, unclipped mobile 3D controls and deliberate touch gestures. Context-menu tests exercise keyboard focus, lock/hide, duplication, copy preview, delete and undo. All **nine production PWA journeys** pass again: old/new photo packages and entrances, driving voice, survey recovery/sync, saved 3D preferences, corrupt-asset repair, backend-failure cache fallback, building/roof recovery and enriched business details. The documentation project also passes with 26 public/editor captures. The mobile production comparison is documented separately in [Mobile model performance](MOBILE-MODEL-PERFORMANCE.md); the older desktop comparison below retains its original date and baseline.

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

Physical Android/iPhone devices, native mobile keyboards, browser-level 200% zoom, thermal/memory pressure and a human screen-reader session were unavailable. Automated narrow/short viewport reflow, semantic labels, keyboard input, focus restoration and touch gestures do not replace those checks. Photographs still do not establish exact dimensions or unseen elevations.

Additive server validation deployed first at `a195899`; older clients cannot silently drop newer authoring metadata. No database migration or public package-schema change is required. Application deployment preserves the reviewed campus through `PUBLISHED_MAP_URL`. Architectural content continues through owner preview, publication and immutable rollback; demonstration edits and screenshots are never published as campus corrections.
