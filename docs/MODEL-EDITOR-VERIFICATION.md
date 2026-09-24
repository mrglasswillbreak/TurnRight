# Unified model editor verification · 24 September 2026

The unified workspace uses the existing owner draft and publication pipeline. This rollout changes application/editor behavior, not the published architectural content. The verified reference snapshot is **`lasu-313d8a168635`**, SHA-256 `b2927184603beeeefdbb96bc42d4460e46f05ec3a8f58f8238a70b383201954c`: **395 buildings, 220 places, 39 photographs covering 19 buildings**, and 84 package assets totaling 18,880,327 bytes.

## Implemented behavior

- Details, Appearance, Roof, Outline and Review share selection, commands and the existing 100-action history. The measured canvas, hierarchy and batched 3D picking carry wall, element and repeated-instance identities.
- Metre controls, boundary/detail/floor snapping, movement/resizing, multi-selection, alignment, distribution, mirroring, duplication, copy previews, patterns, detachment and independent presets retain compatible façade records. Generated windows and trim can be converted without disappearing when a custom detail is added.
- Copies receive fresh IDs and lose reviewed status. Cross-building copies do not transfer source photographic evidence or textures. Footprint and height changes flag affected assignments; explicit rematching preserves physical dimensions.
- Completed actions autosave; incomplete numeric text, invalid placements with their authoring metadata, roof work and texture alignment recover privately. Undo/redo excludes temporary roof previews. Modal shortcuts no longer clear the underlying selected building.
- Review is explicit and wall-specific. Illustrative work may omit photographs; observed details and documented dimensions retain their evidence requirements. Metadata and visual edits never create an entrance or grant routing access.
- Model generation retains one active and the newest pending request. Selection and evidence notes do not regenerate meshes. Closing disposes workers and GPU resources; failed previews offer an in-place retry without discarding the draft.

## Automated verification

### Interaction repairs · 25 September 2026

Add buttons now preserve generated details and insert the requested primitive in
one undoable command. Failed placements or building validation retain the proposed
wall privately, with an explicit retry after repair. Whole-building height and
floor controls are available inside Appearance. Appearance wall selection stays
aligned with Details; rejected numeric values keep their recovery record and
remain bound to the original field. Validation descriptions no longer change an
input's accessible name. Shared-save errors identify the feature that blocks the
batch rather than appearing to belong to whichever building is open.

The repair checks include the complete 494-test unit suite and a final 27-test
workspace/model run containing the new shared-save regression. Browser regressions
exercise all seven Add tools, generated layout preservation, undo/redo, rejected
insertions, close/reopen recovery, height repair, unknown-height reset, field
identity, selection, patterns, worker retry and roof/outline history. The original
five-trial performance measurements below predate these interaction repairs.

All **20 distinct browser cases** passed across the focused and appearance/layout
runs, including 320/390/768/1440-pixel light/dark views and short-screen controls.
The production PWA building-recovery journey passed again. TypeScript, lint
(seven existing warnings) and the authentication-configured build budgets pass.

Client and server TypeScript and lint pass; lint retains seven existing `no-explicit-any` warnings. **494 Vitest tests in 63 files** and **23 Python importer tests** pass. Python tests use the pinned data dependencies from `scripts/requirements-data.txt`.

The new tests cover metre conversion, placement bounds, reversed walls and courtyards, generated façade conversion, copies, patterns and detached slots, authoring validation, private metadata exclusion, routing-result reuse and input recovery. **17 distinct model/appearance browser cases passed**, including focused reruns after correcting the narrow test setup. They exercise actual React, MapLibre and Three.js rendering with isolated owner responses: numeric editing, keyboard movement, locking, copying, targeted review, pattern repair after reopening, roof/outline history, worker failure/retry and focus restoration. Layout checks include 320, 390, 768 and 1440 pixels in both themes, plus 740 × 390 and 320 × 450. The narrow setup selects buildings through the feature list to avoid clicking a drawing toolbar over a mapped coordinate. Another **five entrance/driving browser journeys** pass on desktop/mobile, including the old-package walking fallback. The production documentation capture also passes.

**All nine production PWA journeys pass:** schema-1/schema-3 photo galleries and entrance choices, driving voice, survey cold start/recovery/sync, saved 3D preferences, enhanced-asset corruption/repair, backend-failure recovery, building/roof/input recovery and enriched place details. Existing immutable update/rollback, authorization and walking/driving regressions remain covered by the unit/PWA suites.

The authentication-configured production build passes all four budget scripts. An initial deployment failed because shared model controls pulled the owner authentication entry into the workspace. Entry-aware shared chunks and lazy building inspector tools correct that dependency boundary without raising budgets. Checks now reject a model workspace that imports `Admin`, require building tools to remain lazy, and verify their complete offline dependency set.

| Allocation | Measured | Limit |
| --- | ---: | ---: |
| Lazy renderer + guided editor, including shared non-startup dependencies | 167.3 KiB gzip | 300 KiB |
| Public startup JavaScript | 418,678 bytes gzip | 435,200 bytes |
| Additional owner editor JavaScript | 183,457 bytes gzip | 189,440 bytes |
| Lazy photo manager | 7,618 bytes gzip | 12,288 bytes |
| Offline world | 5.30 MiB | 8 MiB |
| Natural voice | 5.91 MiB / 362 clips | 8 MiB |

World/voice hashes and precache inclusion pass. The campus geometry/texture budget remains 12 MiB and resident building textures remain limited to 64 MiB. The published snapshot has no approved wall textures; synthetic pool/asset tests cover malformed textures, bounded residency and release.

## Production-build measurements

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

For correctness, run `npm test`, `npm run lint`, `npm run build`, `npm run check:configured-build`, relevant editor browser journeys and `npm run test:survey-pwa`. The configured build uses nonfunctional auth placeholders and must not be deployed. The [screenshot inventory](assets/screenshots/README.md) records all 19 README views and their sources.

## Coverage limits and rollout

Physical Android/iPhone devices, native mobile keyboards, browser-level 200% zoom, thermal/memory pressure and a human screen-reader session were unavailable. Automated narrow/short viewport reflow, semantic labels, keyboard input, focus restoration and touch gestures do not replace those checks. Photographs still do not establish exact dimensions or unseen elevations.

Additive server validation deployed first at `a195899`; older clients cannot silently drop newer authoring metadata. No database migration or public package-schema change is required. Application deployment preserves the reviewed campus through `PUBLISHED_MAP_URL`. Architectural content continues through owner preview, publication and immutable rollback; demonstration edits and screenshots are never published as campus corrections.
