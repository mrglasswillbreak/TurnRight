# Responsiveness and recovery

## Current building workspace

The unified model editor extends this work with a measured canvas, commit-on-completion numeric fields, shared history and private input recovery. Appearance-only changes reuse routing results; wall selection and façade evidence notes do not rebuild models. Preview generation is bounded to one active and one newest pending request, with explicit resource disposal and retry. The [current model-editor report](MODEL-EDITOR-VERIFICATION.md) records five-run production comparisons at published campus scale and a 100-detail wall, including 4× CPU throttling. The photo-upload measurements below retain their original scope and dates.


The September 2026 update targets photo management, repeated editor work and
offline startup. It leaves public package schemas 1–3 and the database schema
unchanged. Published campus content and routing approvals are unchanged.

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
budgets also run. Local-only browser Performance entries named
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
