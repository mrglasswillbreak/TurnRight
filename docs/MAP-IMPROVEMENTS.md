# Map and editor improvements — September 2026

> Historical implementation and verification record. Current guides are [Editor](EDITOR.md), [Campuses](CAMPUS-IMPORTS.md) and [Model authoring](MODEL-AUTHORING.md); later deployments supersede the rollout statements below.

Implemented on `codex/map-editor-improvements`, starting from `35afe0f`, in small commits. This is an application change. No campus package, source baseline, access correction or production deployment was changed.

The owner subsequently requested deployment. Application revision `932a216` reached production on 13 September 2026, preserving the published campus package; see the [deployment verification](PRODUCTION.md).

## Drawing

A drawing session starts when its tool is activated, including before the first vertex. The explorer and route panel collapse; selection, comparison and tool changes cannot silently replace the session. Finish/Cancel restore the panel layout. The prompt, distinct-point count, live Terra Draw segment and mouse/touch snap hint explain what happens next. Paths need two distinct vertices; buildings need three. View changes, autosave and reload recovery preserve unfinished geometry and empty sessions. Ground drawing reduces building opacity.

The existing Terra Draw adapter remains in use. Local mouse and touch probes exercise delivered input, saved drawing state and rendered point geometry separately. The initial mobile obstruction was reproduced and fixed. The deployed `/admin` page showed the GitHub sign-in screen in the available browser session. The original desktop report has not been reproduced in an authenticated production editor; that remains an explicit release check.

## Public and editor map

- Shared rendering-only building heights: recorded metres, documented floors at 3 m per floor, then a muted illustrative 6 m block. Building details explain the provenance. Illustrative values are never exported as measurements.
- Public 3D by default at 45° desktop / 40° mobile, with a persistent 2D/3D toggle. Dataset bounds and panel padding frame the full campus. Theme changes and resizing preserve the camera.
- Directional lighting, clearer building outlines, subdued overview markers, stronger route contrast and progressive labels. Selected places and route endpoints receive priority.
- Linked building surfaces open place details. Unlinked footprints show building information and a reporting action. Explicit building/place links take precedence over legacy same-ID associations.
- Local GeoJSON, glyphs, MapLibre, Terra Draw and offline packages remain supported. No terrain, satellite or external building models were added.

## Duplicate review and identity

The Duplicates queue includes repeated names, nearby similar places and overlapping footprints. Opening the queue consolidates only exact matches with equivalent attributes, connections and associations. The full-campus fixture contains no such exact matches, so its ambiguous records remain for review.

Reviewers can inspect both records, choose a survivor, keep them separate and undo a decision. The survivor retains its geometry/direct path connection; names and source references are combined. Entrances and building associations are retargeted. Optional schema-1 place/building ID aliases preserve public saved/recent references and routing destinations. Decisions use the existing transactional `save-edits` API. Keep-separate records do not freeze refreshed source geometry; undone automatic merges are not reapplied on source refresh.

Editor issue rows combine reasons by feature identity. Forward/reverse network overlays render once while both directed routing edges and their access/closure semantics remain intact. No repeated-name campus records were merged or published as part of this code change.

## Performance and loading

Obstacle and snapping indexes replace full geometry scans. Equivalent reverse segments reuse obstruction results; metadata/height changes reuse those results. Topology validation and duplicate discovery run in a worker, with stale results discarded. Routing initializes its worker once per dataset revision and subsequently sends small endpoint requests. Stable map sources retain their identities so unchanged sources avoid `setData`. Identical recovery snapshots are coalesced while committed edits retain immediate recovery.

Campus downloads have bounded waits and retry feedback. The interface font audit removed 74,936 bytes of unused Greek/Cyrillic subsets while retaining Latin, Latin Extended and Vietnamese combining-mark coverage. Unused interface scaffolding and its dependencies remain available for rollback; Tailwind scans the active Button/Dialog components. The main CSS bundle fell from 194.85 kB to 53.27 kB (gzip 31.74 kB to 11.37 kB). The production application precache is approximately 2,453 KiB. The large MapLibre chunk warning remains.

### Reproducible model benchmark

Run with supported Node 22 from `web/`:

```sh
node --import tsx scripts/benchmark-map.ts
```

Optionally pass an absolute path to `web/src/editor-model.ts` from a separate checkout of `35afe0f` to compare the baseline in the same process. Both implementations receive the same checked-in `lasu-4e4c8008b38b` fixture: 379 buildings and 2,452 directed edges. Each case runs seven times; the report gives the first call separately and the median of six subsequent calls. Cache state carries between cases. The benchmark also compares edge IDs, endpoints, accessibility and obstruction results for both empty and metadata edits.

Final local run on Node 22.23.2, with the browser suites stopped:

| Operation | Baseline warm median | Updated warm median |
|---|---:|---:|
| Apply empty edits | 453.69 ms | 34.43 ms |
| Apply a building-name edit | 515.79 ms | 30.72 ms |
| Scan duplicate candidates | — | 25.79 ms |
| 100 snap queries | — | 2.67 ms |

The initial empty-edit call was 574.86 ms in the baseline and 128.08 ms with indexing. Directed connectivity and obstruction comparisons passed for both edit cases. Warm edit validation was approximately 13–17 times faster in this run; timings varied with host load during development.

This measures local model work, not browser frame rate, worker transfer time or physical-phone responsiveness. Run browsers and benchmarks separately when comparing timings.

## Validation and release

- Supported runtime: Node 22.23.2.
- 157 unit/database tests passed across 21 files. Frontend and server-function TypeScript checks passed; lint has zero errors and the seven pre-existing `any` warnings.
- Final Chromium run: 18 passed; the two production-offline-only tests were intentionally skipped in this development-server configuration. Coverage includes mouse/touch drawing, first-point visibility, snap connections, empty and populated draft recovery, 2D/3D switching, entrance routing, undo/redo, duplicate decisions and public building selection/framing/preferences. Full-campus light/dark screenshots were visually inspected.
- Production service-worker checks passed for survey cold-start/recovery/sync and public 3D offline reopening with preference persistence.
- Seven WebKit flows passed across the initial and isolated reruns: touch drawing and snapping, public phone framing, survey recording/recovery/entrances and motion assistance. Windows software rendering required longer cold-start timeouts; individual failures were isolated and rerun.
- Final production bundle and service worker built successfully with Node 22.23.2. The existing large-chunk and service-worker bundler deprecation warnings remain. `git diff --check` passed.

Before release, verify physical Android and iPhone interaction responsiveness, outdoor visibility and offline reopening, and reproduce the original desktop drawing report against the authenticated deployed editor and its actual source baseline. Automated mobile/WebKit tests do not establish physical-device performance.

Review application deployment and campus-data publication separately. Before any editor-led map release, reconcile the approved editor baseline with the published package and retain the reviewed Law driveway and International Library gate/access corrections. The older baseline predates those corrections; see [production history](PRODUCTION.md) and [connection review](CONNECTION-REVIEW.md). Existing published packages and rollback assets remain unchanged.
