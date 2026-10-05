# Responsiveness and recovery

## Unified editor integration · 5 October 2026

The shared shell retains one map and loads the catalogue, attribute table, command search and specialist tasks on demand. Dataset overlays query the viewport separately from the 100-row table, with at most five overlays and 100 features per query. A partial-results notice identifies bounded map results.

The configured integration build measures **433,765 / 435,200** public startup bytes, **173,684 / 189,440** additional editor bytes and **10,287 / 12,288** lazy photo bytes (gzip). GIS data/analysis/review/publication increments measure **6,699 / 5,467 / 4,715 / 6,306 bytes**, each within its existing 20 KiB budget. Lazy 3D remains **246.6 / 300 KiB**. No budget was increased.

These measure compressed code, not latency or frame rate. Browser regression tests cover map continuity, bounded requests, table paging and dock interaction; the native 100,000-feature database gate remains separate from a physical-device interaction benchmark.

## Campus GIS scope · 5 October 2026

GIS feature reads use a GiST-indexed, rebuildable effective representation and revision-consistent cursors. The shared attribute table renders 100 rows per page; server responses cap at 500 features/2 MB. Geometry sessions load at most 500 GIS features and unload on completion. Dataset filtering, statistics, spatial selection and processing input capture run server-side. Explicit baseline maintenance remains separate from routine interactive reads.

The target is 100,000 features per campus workspace dataset. Native PostGIS acceptance inserts 100,000 features, checks bounded spatial queries and immutable job inputs, and tests cancellation, review/publication locks and restoration. This is not a complete 100,000-feature live mobile benchmark. Public navigation remains bounded to 20,000 map features/25 MB; draft layouts cap five layers at 500 visible features each.

New workspaces load on demand under separate 20 KiB incremental gzip budgets. The final implementation build measured 433,681/435,200 public startup bytes and 167,384/189,440 additional editor bytes; existing budgets were not increased. These are compressed dependency bytes, not startup latency measurements. [GIS verification](GIS-PLATFORM.md#verification-status) and [production receipts](PRODUCTION.md) identify subsequent checks.

The analysis container limits inputs/outputs to 100,000 features/50 MiB each, permits three active jobs per campus and applies an 18-minute processing deadline, 2 GB RAM and two CPUs. Cancellation/run tokens reject late results. Public map, personal offline recovery and server-dependent GIS capabilities have distinct availability boundaries.

## 3 October application audit

The [whole-application audit](AUDIT-2026-10-03.md) uses the current LASU and UNILAG packages. Initial road-source payload is reduced by 89.8% / 97.1%, building associations are indexed per campus snapshot, and layer scrolling reuses its search/count/regeneration data. Only changed filters regain zoom limits after selection or model updates; those updates no longer repaint every optional GIS layer. Routing data and public package contents are unchanged.

The final configured build, including the map-credit layout correction, measures 434,489 public, 188,613 additional owner and 10,497 lazy photo gzip bytes against unchanged 435,200 / 189,440 / 12,288 budgets. Bundle size passing is not a claim about frame rate. The audit distinguishes processing microbenchmarks from whole-map startup and records remaining device and rendering gaps.

Current [model-workspace measurements](MODEL-EDITOR-VERIFICATION.md#current-audit--3-october-2026) preserve twenty trials, no generation while typing and consistent per-trial worker/GPU retention. At 4× CPU, published input/click p95 is 84.4/199.9 ms; the synthetic 100-detail wall reaches 244.7/228.2 ms and remains over the 200 ms target. This is a separate current measurement, not an improvement claim against older fixtures.

## 3 October campus discovery

Discovery loads only bounded directory outlines. Campus packages load on selection, preferring verified downloaded data; the MapLibre instance survives switches. Aborted requests and generation guards prevent stale work from committing. The transition controller and world-geography installer are lazy modules. One shared overview replaces duplicate active/catalogue markers, and the selected silhouette fades out before detailed place selection.

That release’s configured build measured 434,246 public, 188,608 additional owner and 10,499 lazy photo gzip bytes, within the unchanged 435,200 / 189,440 / 12,288 limits. Lazy 3D remains 238.4 / 300 KiB. World and voice assets retain their independent 8 MiB limits. Flights last 1.1–2.2 seconds, are interruptible, and use an immediate transition with reduced motion. [Globe behavior](CAMPUS-GLOBE.md) · [Verification receipts](PRODUCTION.md).

## 30 September layers and public startup

The layer explorer uses a virtualized attribute table and bounded selection. Land/overlay editing supports 20,000 vertices, while rendering vertex handles progressively in windows of 100. Projected split/merge and derived-surface generation run in a cancellable worker loaded on demand; page exit terminates pending work. Full GIS format conversion remains server-side. Polygon 96 is edited without simplifying its 6,094 vertices or 56 holes.

Campus restoration reads one small browser preference before React mounts and adds no network request. Public/editor/photo budgets remain 425/185/12 KiB gzip, with independent 3D, world and voice checks. [Production receipts](PRODUCTION.md) contain the measured released sizes; historical timings below are not new whole-campus measurements.

## 30 September image workspace

New photos compress automatically in a sequential, cancellable worker batch.
Settings changes debounce previews by 450 ms; obsolete work is cancelled, and
identical prepared output is reused for upload. Target-size search runs at most
five encodes and respects a quality floor. Preview persistence updates output
bytes without cloning the retained original. Four pinned Squoosh encoders are
loaded only when needed; explicit offline preparation caches about 3.6 MB outside
the public startup budget. [Current UI, codec measurements and tests](PHOTO-EDITING.md).

The historical interaction timings below predate this comparison UI. They should
not be interpreted as new measurements of the full-screen editor or AVIF encoding.

## 27 September audit

The [dated reliability and performance audit](AUDIT-2026-09-27.md) records
reproduced issues, fixes, measurements and verification limits. Image recipe
updates now write metadata separately from retained image bytes, Activity polls
batch their notifications, and synchronous asset failures cannot exhaust the
offline download pool. Historical measurements below retain their original date
and fixture; they are not measurements of every subsequent release.

The sequential five-run image-storage comparison measured recipe-write p95 at
21.7 ms before and 1.4 ms after. The current production photo harness measured
caption/selection/tab p95 at 15.9/15.3/18.2 ms on desktop and 38.6/42.3/66.1 ms
with a mobile viewport and 4× CPU throttling. All three interactions meet the
existing 100/200 ms lab targets. [Storage samples](image-storage-performance-2026-09-27.json)
and [photo interaction samples](photo-performance-audit-2026-09-27.json) preserve
each trial. These are controlled lab timings, not field INP.

The [20-run model audit](model-editor-audit-2026-09-27.json) recorded no model
generation during typing, no extra preview workers after closing, and consistent
retained GPU counts within each fixture.
At 4× CPU throttling, published-fixture input/click p95 was 104.3/197.5 ms;
the 100-detail fixture reached 185.4/309.4 ms. Dense selection and property
rendering remain a performance follow-up, especially on physical low-end phones.
Use `node scripts/benchmark-model-editor.mjs --audit` for the current workspace
without overwriting the historical before/after report.

## Multi-campus processing

Campus/import controls are lazy-loaded. GDAL/PROJ and Pyosmium run in isolated Linux jobs, never in the browser. Imports enforce 50 MiB per upload batch, 250 MiB expanded input, 100,000 normalized features and a 20-minute processing limit; public package/model budgets remain independent. Catalogue builds preserve and verify every published campus. [Import limits](CAMPUS-IMPORTS.md#implementation-and-limits) and [current release evidence](PRODUCTION.md).

## Expanded authoring bounds

Reference split retains one renderer and camera. Mesh gestures coalesce previews and commit one undo entry. Cancellable file workers are lazy-loaded outside public startup. Sources are capped at 100 objects, 100,000 vertices, 200,000 faces and 25 MiB; textures have a 16-megapixel document limit. Verified authored textures use a reference-counted 32-megapixel renderer pool. Cloud redraws run at approximately 30 fps at globe scale; hidden pages stop animation and reduced-motion clouds are static. Existing bundle budgets remain enforced. See [verification](MODEL-EDITOR-VERIFICATION.md).

## Current building workspace

The mobile workspace now uses a full-screen canvas and focused sheets. Wall gestures update lightweight selection geometry; completed actions alone request model generation. Hidden mobile 3D previews pause drawing and defer work until shown, retaining their camera. Opening a sheet, selecting a detail, or typing an unfinished value does not rebuild the model. [Mobile production measurements](MOBILE-MODEL-PERFORMANCE.md) compare the previous long form with the canvas workflow separately from the earlier desktop and upload studies.

The unified model editor extends this work with a measured canvas, commit-on-completion numeric fields, shared history and private input recovery. Appearance-only changes reuse routing results; wall selection and façade evidence notes do not rebuild models. Preview generation is bounded to one active and one newest pending request, with explicit resource disposal and retry. The [current model-editor report](MODEL-EDITOR-VERIFICATION.md) records five-run production comparisons at published campus scale and a 100-detail wall, including 4× CPU throttling. The photo-upload measurements below retain their original scope and dates.


The historical photo-management update below targeted repeated editor work and
offline startup without changing package schemas or the database. The later
campus-layer release adds migrations 020–021 and optional reviewed layer metadata;
it retains routing approvals.

## Implementation

- Building labels, occupants, entrances and galleries share an index for each
  immutable campus snapshot. Typing reuses the index and option elements.
  Selected form content and unchanged cards retain their rendered subtrees.
  The photo dialog avoids an expensive backdrop blur; other dialogs keep their
  existing appearance. Galleries, queues and private-library results use 20-item
  pages, with focus restoration and a viewport-aware mobile sheet.
- An owner-session queue uploads and processes one photograph at a time.
  Closing the dialog or selecting another building does not change its target.
  Pause finishes the current file. Original upload requests can be cancelled on
  sign-out and time out after two minutes; uncertain responses reconcile against
  the stable upload ID before retrying. A failed photo does not stop the rest.
- Local metadata recovery writes changed jobs to IndexedDB instead of repeatedly
  serializing the whole queue into localStorage. Migration retains legacy data
  until its transaction succeeds. Web Locks grant one tab ownership. Private
  metadata saves debounce separately and allow at most two simultaneous saves;
  revision acknowledgements never overwrite newer local details.
- Private-library metadata appears before previews. Visible preview readers share
  at most three signing requests and a 100-entry expiry-aware LRU. Obsolete
  readers cancel their interest; another reader of the same photo can continue.
  Local thumbnails decode sequentially in a worker, at a maximum 640-pixel side.
  Large or unsupported headers omit the temporary thumbnail without blocking the
  server upload. File references, bitmap resources and object URLs are released.
- Preview validation keeps one active request and the newest pending request.
  Known photo/arrival changes to existing edits reuse topology; new, removed,
  geometry, access, restriction and unknown changes receive full validation.
  Changed data sections carry an ordered revision instead of a full campus reply.
  Publication and explicit checks always use authoritative full validation.
  Undo snapshots share unchanged entities, and recovery coalesces pending writes
  while retaining 100 undo entries and existing save-operation identities.
- Photo-only changes retain map geometry and models. GPS marker painting is
  coalesced to animation frames; navigation evaluation and rerouting retain every
  fix. The destination list retains its rendered subtree across GPS updates.
  Search caches normalized fields, defers result presentation and initially
  renders 50 places, with an explicit Show more action.
- Active offline startup verifies campus bytes before showing the map, then
  audits the remaining assets with an explicit checking state. Concurrent audits
  share work. Downloads and audits use one maximum-three asset pool. New packages
  still verify every asset before activation; repair and rollback retain their
  transaction safeguards. Lazy photo code is precached with the app shell.

## Measurement method

The fixture is the hash-verified published `lasu-286bae3c6016` campus snapshot:
420 buildings, 220 places. `work/performance-campus.json` pins the snapshot for
repeatability. The isolated photo harness uses production React/Vite, 20 restored
photo jobs and real workspace components. Browser correctness tests additionally
exercise 20 original-file uploads and a 200-item private library.

Timing uses an input/click listener followed by requestAnimationFrame and a timer
to approximate input-to-next-paint. It is a lab measurement, not field INP.
Five independent runs use a 1440×900 desktop viewport at normal CPU speed and
five use 390×900 at 4× CPU throttling. Network completion is separate. Results
record individual samples, long tasks, rendered image/card counts and requests.
The benchmark serves failed public thumbnails consistently rather than including
uncontrolled image-download latency; real-image correctness tests cover decoding.

The original desktop caption p95 was 3,160–3,540 ms across five runs. Its first
4× throttled run exceeded 180 seconds, so a complete throttled baseline is not
available. The final five-run pooled p95 measurements are:

| Interaction | Desktop, normal CPU | Mobile viewport, 4× CPU | Target |
| --- | ---: | ---: | --- |
| Caption typing | **17.1 ms** | **44.1 ms** | <100 / <200 ms |
| Previous/next photograph | **14.4 ms** | **100.5 ms** | <100 / <200 ms |
| Gallery/review tab switching | **16.5 ms** | **141.6 ms** | <100 / <200 ms |

All three pooled targets pass. Final per-run caption p95 ranges are 15.7–18.1 ms
and 30.2–58.4 ms. No desktop caption long tasks were recorded; one mobile run
recorded a 77 ms long task. Earlier intermediate builds had substantial mobile
outliers; retaining the review DOM, containing off-screen queue layout and
isolating the building selector addressed those measured costs. This is still a
lab result, not a guarantee on every device.

Harness navigation through opening the review form took 548–683 ms on desktop
and 1,558–2,091 ms at 4× CPU, including Playwright actions and fixture loading.
That is not a measurement of the public map's startup time. The public startup
contract is tested separately by delaying asset verification until after the
verified campus data is returned. Rendered queue cards stay at 20; only visible
images are decoded. Removed local previews release their object URLs and files.
The [measurement record](performance-measurements.json) retains the five-run
baseline and final samples, requests, long tasks and core measurements.

The final five-run core benchmark measured 420 label lookups at 0.10–0.47 ms
after 3.15 ms index construction, compared with 605–1,237 ms rebuilding lookups.
Full validation took 138–921 ms, including cold/JIT effects; cached metadata
validation plus delta encoding took 0.68–3.09 ms. The UTF-8 serialized worker
reply fell from 2,821,381 to 74,633 bytes for a caption change. These timings
depend on this Windows machine and should be remeasured on supported hardware.

## Reproduction and budgets

From `web`, using Node 22:

```sh
npm run benchmark:photos -- baseline
npm run benchmark:core
npm run test:performance
npm run build
npm run check:configured-build
```

The photo benchmark exits nonzero if a pooled interaction target is exceeded.
Use `--profile` after its label for a single throttled Chrome CPU profile.
The photo benchmark requires the production harness on port 5195. First run
`vite build --config vite.performance.config.ts`, then
`vite preview --config vite.performance.config.ts --port 5195`. The first benchmark
fetches and verifies the campus snapshot; retain that file for subsequent runs.
The performance browser suite reads the same pinned fixture. Ignored `work`
reports contain raw samples. Checked-in reports contain measurements only.

Build checks independently budget public startup JavaScript, additional owner
editor JavaScript and the lazy photo workspace at 425, 185 and 12 KiB gzip.
The configured-build check uses nonfunctional public placeholders to retain the
Supabase authentication client during tree-shaking. Its output is a measurement
fixture and must not be deployed; normal builds use the deployment environment.
The initial unconfigured local check understated the editor by about 55 KiB; the
first client deployment correctly failed its budget before activation. The
corrected budget includes that existing production dependency.
Static shared dependencies are counted once; the photo workspace must remain
lazy and appear in the service-worker precache. Existing 3D, world and voice
budgets also run. The unified-model rollout also checks that shared controls do
not import the entire authentication entry. Building inspector tools load on
selection, and entry-aware shared chunks keep their dependencies out of public
startup. All building-tool dependencies must be precached. The current configured
sizes are recorded in [model verification](MODEL-EDITOR-VERIFICATION.md).
Local-only browser Performance entries named
`turnright:photo:upload`, `processing`, `signing`, `private-save` and `upload-begin`
measure each phase separately, including its network round trip where applicable.
They retain bounded samples and contain no filenames, owners or photo metadata.

## Coverage and limits

The 23 September 23:11 UTC preview run exposed a race in the offline-audit
test fixture before release packaging began. Starting a second package read did
not guarantee its IndexedDB work had reached the shared audit before the test
released the first audit. The test now awaits both core loads before opening
one shared gate, checks both verification results and always releases the gate
during cleanup. The full 462-test suite and 20 isolated repetitions passed on
24 September. Production audit behavior and test timeouts are unchanged.

Verification completed on 23 September 2026: **462 Vitest tests**, **23 Python
import tests**, **36 browser/PWA journeys** (15 photo layout/workflow, seven
public navigation/details, five owner photo, nine offline), both TypeScript
projects, lint with seven pre-existing warnings, production build and all four
budget checks. Configured public/editor/photo JavaScript measured 413,919 / 177,767 / 7,574
gzip bytes respectively using the nonfunctional placeholders. Live configuration
adds a few bytes for the actual public URL and key. The photo-specific fixture avoids sharing Playwright
artifact directories with the main browser suite.

Deterministic checks cover index reuse, validation equivalence, delta ordering,
latest-preview coalescing, owner-isolated migration, cross-tab handover, storage
failures, stale private saves, sequential processing, pause, original targets,
bounded signing, cancellation, expiry, thumbnail bounds and asset concurrency.
Offline tests hold media auditing open to verify early campus display and shared
audits, and cover corrupted media, interrupted downloads, repair and rollback.

Browser checks cover 320, 390, 768 and 1440-pixel widths, 640×360 landscape,
both themes, 200% equivalent desktop reflow, keyboard form navigation, Escape/focus return and a simulated mobile
keyboard viewport that keeps the primary action reachable. Walking, driving,
entrance selection, owner photo undo/reload and production PWA cold reloads
retain their regression suites. Layout emulation is not a physical-device test:
real mobile keyboards, OS suspension, native screen-reader speech, native browser
zoom controls and field GPS still require device checks. Browser closure does not promise
background uploads. No production photographs are created by these test fixtures.
