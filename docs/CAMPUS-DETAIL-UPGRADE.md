# Campus detail upgrade — 17 October 2026

The local implementation adds an ArcGIS Pro exchange toolbox, precision drawing and geometry operations, building palette previews, illustrative instanced greenery, campus-specific visitor layers and curated landmark exploration. LASU Ojo and UNILAG Akoka each have an independent private review candidate. **These candidates are not published or applied to the live private workspace.**

## Baselines and review results

The run preserved the existing dirty working tree in ignored `web/work/campus-upgrade-20261017/baseline/`. Source, REA and preview evidence is under `web/work/campus-upgrade-20261017/`; this is reproducible local research output, not application source or an approved dataset.

| Snapshot | LASU Ojo | UNILAG Akoka |
| --- | --- | --- |
| Published version used | `lasu-6796771f6052` | `unilag-bd659bbd6df2` |
| Buildings accounted for | 614 | 723 |
| Illustrative detail candidates | 466 | 694 |
| Source-height detail candidates | 0 | 1 |
| Existing appearance/authored models preserved | 60 | 9 |
| Held for geometry/duplicate review | 88 | 19 |
| Accepted vegetation areas used for candidate scenery | 8 | 2,429 |
| Illustrative tree/shrub instances | 1,500 | 1,500 |
| Geometry, texture and recipe bytes | 10,844,005 | 2,174,608 |
| Inspected vector layers / source features | 8 / 586 | 44 / 6,083 |

Every building has a treatment and an evidence-needs list in `campuses/<slug>/detail-preview/coverage.json`. Every discovered item has an inspection disposition; every downloaded feature has a comparison disposition. LASU comparison: 262 addition candidates and 324 probable duplicates. UNILAG comparison: 2,072 additions, 3,667 exact duplicates, 340 conflicts and four null/invalid geometries. These are candidate counts, not accepted additions.

The public portal search returned 1,502 LASU and 1,509 UNILAG items, mostly global references held outside campus-detail import. Broad searches reached their five-page limit, recorded as `complete: false`; this is **not an exhaustive portal inventory**. A second search used the existing signed-in Pro session, including the accessible organization collection and group enumeration. It found 69 additional LASU and 37 additional UNILAG item identities; all were held as broad/global references, with no additional campus vector candidates. No new sign-in was performed. Unavailable/dead services remain in the ledger. Modification timestamps are not survey dates. No new source redistribution permission was inferred from public access. The old UNILAG orthophoto described as 2008 imagery remains historical reference only.

## ArcGIS Pro workstation

### Native source review before licence expiry

The October 17 continuation ran Pro 3.7 **Check Geometry** on copied datasets for all 52 archived layers. LASU's 586 geometries produced 26 short-segment reports across two overlapping source layers. UNILAG checked 6,082 non-null geometries and retained one null source record; reports include one short segment and one bad copied-dataset extent. These are native validation findings, not automatic repairs or proof of current ground conditions. [Per-layer identities, dates, rights and findings](assets/measurements/campus-source-review-2026-10-17.json).

The full private disposition ledger and native geodatabase are preserved alongside the portable archives under `Documents/ArcGIS/Projects/TurnRightDetail/PortableEvidence/2026-10-17/native-source-review-final/`. Reproduce in a new directory with `scripts/arcgis/review_candidates.py CAMPUSES_DIRECTORY NEW_OUTPUT_DIRECTORY`. Generic-geometry GeoPackage tables were unsuitable for direct Pro copying, so the checker uses each hash-verified GeoJSON with an explicit native geometry type. No source or editor geometry is repaired in place.

New source use remains held: source metadata did not establish an explicit licence, and current survey dates are absent. Existing LASU/UNILAG permission records must be matched to exact source identities before extending their use. Presentation plans can proceed independently using already accepted geometry; missing roof/façade measurements remain explicit evidence needs. Prioritize any further native analysis, eligible model export and controlled desktop workflow observations during the remaining Pro window. All captured GeoJSON/GeoPackage/GLB evidence remains readable without Pro.

The verified local environment is ArcGIS Pro 3.7, Advanced/ArcInfo, with ArcPy and available 3D Analyst, Spatial Analyst and Image Analyst extensions. The dedicated project is `Documents/ArcGIS/Projects/TurnRightDetail/TurnRightDetail.aprx`, separate from the original `MyProject.aprx`. It has LASU and UNILAG source-review maps and 3D-review scenes. Candidate layers start hidden and labelled for rights/date review. Some empty or incompatible candidate datasets do not produce Pro feature layers; their exported evidence remains in the inspection ledger.

### Time-limited Pro access

The user has **21 days of ArcGIS Pro access remaining**, reported on 17 October 2026. Treat this as a limited analysis window, with a working end date around 7 November; confirm the account's actual expiry before relying on that date. No renewal or paid service is assumed.

1. **Days 1–7:** finish discovery and coverage inspection for both campuses, preserve source responses and rights/date evidence, and capture portable GeoJSON/GeoPackage snapshots. The initial public and existing-session discovery, 52 vector-layer inspections and baseline comparisons are saved locally.
2. **Days 8–14:** prioritize the Pro-dependent gap review, suitable height/roof attributes, historical-imagery comparison and the six controlled editing observations. Export any genuinely useful authored 3D objects as GLB with units and placement. No eligible 3D source has yet been established; an illustrative extrusion is not a measured model.
3. **Days 15–18:** complete candidate dispositions, verify portable exports outside Pro, and preserve the project, toolbox, provenance, transformations and coverage reports. Keep the final days as a buffer for failed exports or missing evidence.
4. **After the access window:** continue TurnRight editor/rendering work, rights review, device validation and independent campus release approval using the portable evidence. The application, standard file importer and exported GeoJSON/GeoPackage/GLB assets must not depend on an active Pro licence, portal session or hosted scene subscription.

Source permissions still apply after export. Keeping a local research copy does not grant redistribution rights. The portable evidence is a review archive; only approved content enters the existing publication workflow.

Add [TurnRight.pyt](../scripts/arcgis/TurnRight.pyt) to another Pro project to reuse its four tools: **Discover campus sources**, **Inspect layers and coverage**, **Compare with TurnRight**, and **Export candidate bundle**. [Esri portal search](https://doc.esri.com/en/arcgis-pro/latest/help/projects/search-portal-items.html) supports extent and collection discovery. The toolbox searches public items and can use the active Pro portal session; credentials stay in Pro and are never part of the exchange bundle.

From the repository root, using PowerShell:

```powershell
$proPython = 'C:\Program Files\ArcGIS\Pro\bin\Python\envs\arcgispro-py3\python.exe'
& $proPython scripts/arcgis/setup.py
& $proPython scripts/arcgis/capture_baselines.py NEW_BASELINES_DIRECTORY
& $proPython scripts/arcgis/bridge.py discover --baseline BASELINE.json --campus-id CAMPUS_UUID --campus-name 'UNILAG Akoka' --output NEW_DIRECTORY/discovery.json
& $proPython scripts/arcgis/bridge.py inspect --input NEW_DIRECTORY/discovery.json --output NEW_DIRECTORY/inspection.json
& $proPython scripts/arcgis/bridge.py compare --baseline BASELINE.json --input NEW_DIRECTORY/inspection.json --output NEW_DIRECTORY/comparison.json
& $proPython scripts/arcgis/bridge.py export --input NEW_DIRECTORY/inspection.json --output NEW_DIRECTORY/candidates.zip
& $proPython scripts/arcgis/export_portable.py CAMPUS_STUDY_DIRECTORY NEW_PORTABLE_ARCHIVE_DIRECTORY
& $proPython scripts/arcgis/create_project.py --template TEMPLATE.aprx --evidence web/work/campus-upgrade-20261017/campuses --output NEW_PROJECT/TurnRightDetail.aprx
```

Use the actual campus UUID, not its URL slug. `setup.py` installs pinned Shapely/PyProj into ignored `scripts/arcgis/.deps/cp313/`, leaving the Pro environment unchanged. `--signed-in` opts discovery/inspection into the active Pro session. Use new output directories for a new source snapshot. Project creation refuses to overwrite unless `--resume` explicitly resumes its own interrupted project.

Signed-in requests are restricted to the active portal and Esri-hosted ArcGIS services and do not follow redirects. Third-party web-map service links use the unauthenticated, bounded public importer. Protected federated services outside those hosts need a permitted local Pro export; their links do not receive the active portal's credentials. A project-creation receipt permits resuming only an interrupted run, never clearing a finished or unrelated project.

Both campus studies now have `portable-archive/` directories containing `campus-review.gpkg`, original GeoJSON and raw responses, baseline/discovery/comparison receipts, a possible-detail-field inventory and an `archive.json` SHA-256 manifest. LASU preserves eight layers/586 features; UNILAG preserves 44 layers/6,083 features. [The portable exporter](../scripts/arcgis/export_portable.py) needs GDAL but does not import ArcPy or authenticate. It verifies baseline/source hashes and reopens each saved GeoPackage layer to check counts and stable IDs. Original GeoJSON/JSON remains authoritative. The archive is research evidence; use the separate exchange ZIP for TurnRight imports. Native regression coverage verifies holes, null geometry, string source IDs, CRS, unresolved rights and tamper/overwrite rejection.

Verified copies also live outside the repository's temporary work folder at `Documents/ArcGIS/Projects/TurnRightDetail/PortableEvidence/2026-10-17/lasu/` and `unilag/`, alongside portable synthetic-workflow evidence. All 26 LASU and 97 UNILAG manifest-listed files passed their copy checksums. Keep these local research archives with the dedicated Pro project when cleaning development outputs.

The named UNILAG candidates [campus layers](https://www.arcgis.com/home/item.html?id=ec1287b4297940edbb7d1230f9563e18) and [pavement/sports](https://www.arcgis.com/home/item.html?id=5eb6f9b7d1e2473d9670cc3101f2afb5) are seeded alongside the previously used LASU/UNILAG sources. Web maps resolve through the existing importer; service identity deduplicates reused layers. Feature retrieval uses bounded, complete object-ID retrieval rather than trusting one service response page.

## Exchange contract and import

Each ZIP contains `turnright-exchange.json` and one GeoJSON or GeoPackage dataset per layer. Schema version 1 records:

- Campus identity, baseline version/hash and generator identity.
- Stable layer/source identity, original object-ID field, item/service URL, intended import role, feature count and SHA-256.
- Export CRS, original CRS, horizontal/height units, vertical datum, transformations and retrieval time.
- Survey date separately from item modification time; unknown values stay unknown.
- Attribution, licence text and an explicit redistribution-rights declaration.

The reader rejects wrong campuses, unsupported versions, path escapes, undeclared files, changed hashes/counts, missing IDs and duplicate source identities. Comparison refuses changed baselines or source files. The importer retains provenance in private attributes and uses the declared native ID. Unconfirmed redistribution rights block normalization; changing a declaration requires checking the source's terms and retaining that evidence. A declaration is not release approval.

Import the ZIP through **Import data → file**, inspect the layer roles and fields, then use the existing candidate/source review. Existing edit precedence, stale-workspace checks, conflict handling and independent release review remain applicable. The public-baseline candidate cannot establish that a later private correction is safe to replace. Re-export the accepted/current private baseline and compare before applying it.

Suitable ArcGIS-authored objects can use the existing GLB import with explicit units, rotation and placement. [Esri's Export 3D Objects](https://doc.esri.com/en/arcgis-pro/latest/tool-reference/data-management/export-3d-objects.html) supports GLB; the toolbox does not automatically turn raster imagery into geometry or publish a scene service.

## REA studies and interaction specification

[REA](https://github.com/morluto/rea#quick-start) is pinned to released `rea-agents@6.5.0` in ignored `web/work/rea/`. The iD checkout is pinned to `32c05ed6f78c83c7f551f27bfc8bb13076613ebf`. Static analysis covered iD's draw/orthogonalize/straighten code and TurnRight's editor-map, editor-features, appearance and roof review code. Evidence identifiers:

| Evidence | ID |
| --- | --- |
| iD JavaScript | `ev_6cee152870326ab1eed5c97174f6ae88020254dfc5fb9f621592cf713176b666` |
| TurnRight JavaScript | `ev_c8a57c776c597ee9cfa290cd0d9ae0f56800f2824221319302f4c81d9849d86c` |
| iD local tutorial browser capture | `ev_973fdcb11780828d9f94609fd9e4be9dc6da7e50e27d5c96a3c79fa19fadd28f` |
| TurnRight layers browser capture | `ev_50f99071380edf19aeae11a9100e7a08071ced71f060438c32442d23c3d35176` |

The browser captures verify the local tutorial entry and visitor-layer interaction; they do **not** demonstrate all six completed editing tasks in iD or ArcGIS Pro. Static source analysis is design evidence, not runtime proof. No OSM account/upload was used. [REA browser observation](https://github.com/morluto/rea/blob/main/docs/browser-observation.md) does not control the ArcGIS desktop.

| Task | Useful evidence and previous limitation | Implemented behavior | Regression scenario |
| --- | --- | --- | --- |
| Draw a precise footprint | iD draw behavior and [ArcGIS direction constraints](https://doc.esri.com/en/arcgis-pro/latest/help/editing/constrain-direction-for-a-segment.html); TurnRight relied on pointer placement | Metre length and north-based bearing, first-point rectangle, right-angle/parallel/perpendicular constraints | 12 × 8 m rectangle with mouse and touch, save, undo/redo and reload; reject non-finite/zero values |
| Snap to an edge | iD draw target behavior; TurnRight route snapping did not cover every visible reference geometry | Vertex/endpoint/midpoint/edge modes, 4–30 px tolerance, 20 m hard cap, visible zoom ranges, labelled reference snaps, Alt bypass | Hidden/out-of-zoom references ignored; reference snaps never imply a routing connection |
| Trace a boundary | iD source boundary reuse; TurnRight lacked a repeatable reference-ring selection | Capture a reference geometry, choose part/ring and vertex range, reverse and append to the drawing | Multipart/hole boundary, cancellation and recovery; geometry copied without routing metadata |
| Square a building | iD `actions/orthogonalize.ts` and `straighten_way.ts`; existing TurnRight repair preview lacked these operations | Preview square/straighten/align/offset in projected metres; preserve rings/parts and use topology-aware geometry edits | Multipart plus hole, collapsed-shape rejection, offset that would remove a hole rejected, connected entrance/path endpoints retained |
| Edit roof/façade details | Existing TurnRight surface/roof/model source and iD's separation of selection from commit | Long/across-axis standard roof orientation, shared roof width calculation and validation; existing roof handles, structure/surface/photo workspace retained | Long/short gable axis changes mesh and revision; excessive pitch rejected; authored models preserved |
| Apply appearance across selection | TurnRight layer pending-batch and undo machinery | Three reusable illustrative palettes, up to 500 generated buildings, swatches plus live map preview, explicit apply/cancel, one undo transaction | Preview writes nothing, cancel restores map, stale workspace prevents apply, preserve per-wall/roof styles and dimensions |

In the editor, open **Precision drawing** during a footprint/path sketch. Geometry refinement is under **Parts, holes and geometry tools** or layer selection. For palettes, open **Layers → Features**, select building rows and choose **Preview appearance**. Authored meshes must be edited in their existing model workspace; palette tools do not flatten them.

Batch review, Apply and Cancel remain inside the feature-table pane on phones. Opening a preview brings its review controls into view, and the pane scrolls when its controls exceed the available height. Collapse the table to inspect the map and use the existing undo/redo toolbar.

To reproduce the browser research from `web/`, install `npm install --prefix work/rea --save-exact --ignore-scripts rea-agents@6.5.0`, build/serve the pinned local iD at port 5186, run the preview below, then `node scripts/research-editor-workflows.mjs`. On this Windows host REA's direct browser launch fails with `spawn UNKNOWN`; the runner attaches its unmodified browser provider to its own loopback Playwright browser. Evidence remains separate from import/application data. ArcGIS interactive editing observations still need a controlled desktop review; ArcPy project/toolbox loading was verified.

[The repeatable ArcPy exercise](../scripts/arcgis/study_workflows.py) runs against a new synthetic geodatabase, never campus data: `& $proPython scripts/arcgis/study_workflows.py NEW_STUDY_DIRECTORY`. The validated run in `pro-workflows-validated/` passed a 12 × 8 m footprint, endpoint/vertex/edge snaps with a 0.5 m tolerance, an outer/inner courtyard boundary, and [3D Analyst regularization](https://doc.esri.com/en/arcgis-pro/latest/tool-reference/3d-analyst/regularize-building-footprint.html) with successful `STATUS = 0`. A synthetic roof/façade OBJ also survived Pro import and GLB export with two meshes, two materials and the expected axis conversion. The exported 1,660-byte GLB then passed TurnRight's existing model importer and explicit Y-up/metre placement validation: 12 × 8 × 8 m, 16 faces, two materials, no missing assets or import warnings. That check used Node without ArcPy. The GLB and GeoJSON fixtures remain usable without Pro. These are API/format checks, not completed desktop interaction studies or measured campus models. Batch appearance interaction still needs the planned desktop observation.

## Visuals, visitor controls and local preview

The broad pass preserves existing geometry, courtyards, wings, authored models, height/floor evidence, routing and individual styles. Eligible unstyled buildings receive restrained illustrative palettes and simple models. No new measured dimensions, roof evidence, windows, entrance positions or accessibility claims are fabricated. Detailed evidence-driven roof/façade work remains in the held/evidence-needs ledger.

Scenery uses a versioned, optional recipe in the visual catalogue. Each region names an accepted vegetation polygon, its geometry revision and review time. Placement is deterministic and excludes holes, buildings, paths, graph edges, roads, parking, sports surfaces and water with clearance. Trees/shrubs use shared instanced geometry/materials and inexpensive contact-shading discs in the existing MapLibre/Three context. Existing sun/ambient lighting, sector loading and building shading remain in use. Zoom fades and the existing slow-frame fallback reduce decorations. A stale region hash suppresses its scenery rather than relocating it silently.

**Map layers** controls Buildings, Greenery, Surfaces, Amenities and Landmarks. Preferences persist independently for each campus. Route geometry, gate markers, entrances and the selected destination remain available. Curated place metadata enables the **Landmarks** filter and **View in 3D**, which fits building bounds and respects reduced motion. Existing photographs/source information stay in place details. Older packages default to all existing content visible and no generated scenery.

From `web/`, with Node 22.23.3:

```powershell
node --import tsx scripts/prepare-campus-detail.ts work/campus-upgrade-20261017/campuses/lasu/baseline.json NEW_LASU_PREVIEW_DIRECTORY
node --import tsx scripts/prepare-campus-detail.ts work/campus-upgrade-20261017/campuses/unilag/baseline.json NEW_UNILAG_PREVIEW_DIRECTORY
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5185 --strictPort
# A separate terminal, using the prepared detail-preview directories:
node scripts/serve-campus-detail.mjs
node scripts/review-campus-detail.mjs
```

Review the candidates at `http://127.0.0.1:5187/?campus=lasu` and `http://127.0.0.1:5187/?campus=unilag`; baseline packages use port 5188. Both use the current local renderer, so this isolates package-content changes, not an old-application/new-application comparison. The proxy accepts GET/HEAD only and binds to loopback. It verifies/serves local package assets and fetches unchanged public assets; it does not expose private backend APIs. The fixed-view script writes screenshots and `visual-review.json` under the ignored evidence folder.

Representative captures: [LASU 3D candidate](assets/screenshots/campus-detail-lasu-2026-10-17.png) · [UNILAG 3D candidate](assets/screenshots/campus-detail-unilag-2026-10-17.png). The capture runner waits for map loading and camera motion to settle before recording a theme/mode change.

## Verification and release gates

The continuation integrates only this task's changes onto the newer October 15 production code, retaining migrations and review fixes through 055. The previous working tree remains preserved. Production visual generation now retains reviewed scenery recipes and counts them in the same 12 MiB budget; local preview generation alone did not exercise this path. [Preparation and independent release procedure](DEPLOYMENT.md#campus-detail-preparation) documents exact-baseline checks, protection of saved corrections and separately reviewed campus promotion.

The [verification record](assets/measurements/campus-detail-2026-10-17.json) records 810 passing unit tests across 113 files, 106 passing Python tests with one Linux-only OSM integration skip, four targeted browser journeys and 12 fixed views with no page errors. The Python run used task-local Overture/orjson dependencies; the Pro installation was not modified. An existing GeoPackage test now closes its native OGR handles before Windows temporary-file cleanup. Lint passes with existing repository warnings. The palette journey checks the displayed map before saving, cancellation, apply, undo and redo. Desktop and phone drawing journeys use simulated input, not physical phones.

All nine production-service-worker browser journeys passed, including offline arrival photos, driving/voice, survey recovery, saved 3D preference, corrupt architecture-asset repair, saved building appearance/unfinished roofs and business details. Offline fixtures now restore network emulation before closing their browser context; an initial full run failed after an earlier offline journey, while the same driving case passed alone. This cleanup also allowed the complete nine-test run to pass.

All three new campus-detail journeys also passed on WebKit: phone palette preview/cancel/apply/undo, mouse rectangle construction/recovery and touch rectangle construction/recovery. These checks found and fixed a preview hidden in the phone explorer and unreachable review buttons at the bottom of the table. The new journeys are included in the standard WebKit configuration.

The broader Chromium and WebKit suites are **not fully verified**. Chromium stopped after 25 passes/three skips at a 60-second sensor-journey timeout, and its first isolated retry timed out. A final run with a 120-second limit passed both that sensor journey (56.9 seconds) and the desktop palette journey (15.4 seconds). WebKit stopped after three passes at a 120-second map-attachment timeout during globe gesture setup. These runs used Windows software rendering on an 8 GiB host with low free memory; that is observed context, not proof of the cause. Keep the full suites as open acceptance gates rather than treating the targeted journeys as a full pass.

The production build passes the existing 300 KiB lazy-3D budget and 12 MiB campus geometry/texture limit. The measured lazy-3D closure is 264.2 KiB gzip; public startup is 428,746 bytes under its 435,200-byte budget. The configured-auth build also passes, with 428,740 public-startup bytes and 186,062 owner-extra bytes against its 189,440-byte owner budget. Route/detail UI loads lazily and remains in the service-worker precache. No budget was raised.

Automated verification covers deterministic scenery/exclusions, old packages, stale recipe geometry, independent campus preferences, snapping/constraints, multipart refinement, roof orientation, palette preservation, undo/recovery and importer integrity. Both real exported campus bundles passed native ArcPy/GDAL file inspection. Pro reloaded all four maps/scenes and listed all four toolbox operations. Browser mouse/touch rectangle tests and 12 fixed map captures ran locally. These software-rendered checks are not physical Android/iPhone performance evidence.

Before release:

1. Deploy compatible optional-field readers/import workers first; no database replacement or destructive migration is required. Then enable use of the new writers in a controlled private workspace.
2. Refresh accepted/private baselines, preserve later corrections, resolve candidate source rights, review geometry holds and dated evidence needs. Do not bulk accept this public-baseline study.
3. Complete the six interactive ArcGIS/iD editing observations and private editor review, including live batch preview, route connectivity, active-route visual comparisons and selected-surface/photo interaction.
4. Verify complete offline installs, interrupted/corrupt asset fallback, campus switching and old/new package rollback on the actual release packages. Existing offline unit tests do not substitute for this release-package exercise.
5. Measure representative interaction on physical Android and iPhone, targeting 30 fps with reduced-detail fallback. No physical device was available in this run.
6. Build each campus's private preview, obtain its existing independent release approval and publish it separately. Keep the previous approved package for each campus's rollback. This run has no live private-workspace credentials or recorded independent approval.

See [source review](SOURCE-UPDATES.md), [editor recovery](EDITOR-RELIABILITY.md), [publication](GIS-PLATFORM.md), and [acceptance](ACCEPTANCE.md) for the established processes.
