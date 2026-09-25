# Mobile model editing: production comparison

This study compares the previous mobile model form at `0fc9dca` with the canvas-and-sheet workspace. Both builds use the same published `lasu-313d8a168635` campus (395 buildings, 220 places, 39 photographs), real `EditorWorkspace` commands and owner-scoped IndexedDB recovery. A second fixture adds 100 details to one wall. No production owner data is changed.

## Method

Chromium headless runs at 390 × 844 on Windows with SwiftShader, at normal CPU speed and 4× CPU throttling. Each fixture/rate/build combination has five trials. The input measurement runs from the capture-phase input event to a task after the next animation frame; it approximates time to the next paint and excludes network completion. Click timings cover detail selection, opening/closing sheets and switching Wall/3D. The interaction sequences differ between the old form and new sheets, so they are not a strict selection-speed comparison.

The report records individual samples, long tasks, requests, worker payload bytes, peak worker activity and live buffer/texture/worker counts before and after closure. Draw-call submission time is not GPU frame completion time. The underlying fixture keeps its own preview, so one remaining worker/canvas is expected after closing the workspace. Object counts do not measure process or GPU memory. This published snapshot contains no approved wall textures.

## Results · 25 September 2026

All 40 trials completed without browser errors; each group below pools five trials.

| Fixture / CPU | Previous input p95 | Canvas workspace input p95 | Canvas selection/view p95 |
| --- | ---: | ---: | ---: |
| Published campus / normal | 9.8 ms | 9.1 ms | 17.8 ms |
| Published campus / 4× | 35.3 ms | 48.3 ms | 62.0 ms |
| 100-detail wall / normal | 10.7 ms | 8.9 ms | 19.7 ms |
| 100-detail wall / 4× | 34.1 ms | 47.4 ms | 65.2 ms |

Every group and individual final trial met the 100 ms normal / 200 ms throttled targets. The highest individual final trial had input p95 67.7 ms and click p95 85.5 ms. Throttled typing is slower than the previous form in this comparison, while staying within the target; this release does not establish a universal speedup.

Every final trial recorded **zero typing-triggered model requests**, a maximum of **one active measured worker job**, and **16 resource requests**. Closure retained only the fixture's underlying preview: one worker, one canvas, eight texture objects and 28–35 buffers, depending on the fixture. No dialog preview worker/canvas remained. Hidden preview rendering resumes when 3D is selected. The longest measured final long task was 166 ms under throttling; the application is not free of long tasks.

Final configured budgets pass: **198.2 KiB gzip** for the lazy renderer/editor (300 KiB limit), **421,095 bytes** public startup (435,200), **183,632 bytes** additional owner code (189,440) and **7,617 bytes** lazy photo management (12,288). World and voice allocations remain 5.30 MiB and 5.91 MiB respectively. The campus and resident-texture allowances are unchanged.

## Reproduction

Use Node 22 and installed `web/` dependencies. Build `vite.performance.config.ts` at baseline commit `0fc9dca` in an isolated worktree, then place that immutable output in the current checkout's `web/work/mobile-model-baseline`. Do not change the baseline source to adapt it to the current UI.

From the current `web` directory:

```sh
npx vite build --config vite.performance.config.ts
node scripts/benchmark-mobile-model.mjs
```

Run this study without other browser suites, builds or CPU-heavy tests. `--smoke` checks one published-data trial per version and writes only `work/mobile-model-smoke.json`. `--final` retains a matching recorded baseline and repeats the final groups. `--prepare` only retrieves and verifies the public package for documentation captures. The full run writes [raw measurements](mobile-model-performance.json).

## Coverage limits

These are simulated mobile-browser measurements. Physical Android/iPhone devices, native software keyboards, browser-level 200% zoom, thermal throttling, operating-system suspension and a human screen-reader session were unavailable. Automated touch, short-viewport, semantic-label, keyboard and focus tests do not replace them. The 100 ms normal / 200 ms throttled targets are evaluated per pooled group, not promised for every interaction on every device.
