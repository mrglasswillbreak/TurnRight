# TurnRight

Explore **LASU Ojo and UNILAG Akoka**, search campus places, and navigate with independently downloadable offline maps.

[Open LASU](https://turnright.vercel.app/) · [Open UNILAG](https://turnright.vercel.app/?campus=unilag) · [Owner workspace](https://turnright.vercel.app/admin) · [Documentation](docs/README.md)

TurnRight combines a public navigation PWA, a private GIS workspace and a building model editor. Search, route calculation, GPS processing and spoken guidance run on the device. Each campus has its own sources, corrections, photographs, models and reviewed releases. LASU remains the default for older links.

> An independent personal project, not an official university service. Campus routes have not been field-verified. A mapped approach is not a confirmed entrance. Unknown heights remain labelled illustrative estimates; visual detail does not establish walking, driving or accessibility permission.

## Campus status

The September 30 detail upgrade retains LASU's published package and private drafts. UNILAG receives distinct landscape classes, road surfaces, additional footprints and destinations, credited photographs and evidence-backed architectural treatments. [Coverage and unresolved evidence](docs/UNILAG-DETAIL.md) · [Release versions, checks and rollback](docs/PRODUCTION.md).

| Published map content | LASU Ojo | UNILAG Akoka |
| --- | ---: | ---: |
| Building footprints | 393 | 723 |
| Destinations | 220 | 116 |
| Photographs | 44 | 16 |
| New UNILAG road surfaces | — | 179 |

UNILAG's upgrade starts from 629 buildings, 71 destinations and no photographs. It retains every existing destination identity and the existing routing graph. The 179 road polygons comprise 80 paved roads, 24 unpaved roads and 75 sidewalks. The documented self-intersection in source feature 96 is repaired with a retained diagnostic receipt. Senate floor totals and several residence-hall assignments remain explicitly disputed.

## Screenshots

The September 30 campus captures show the real upgraded map. Historical editor examples below use isolated owner/API fixtures; phone images are browser simulations. [Capture provenance](docs/assets/screenshots/README.md).

| UNILAG · light, 3D | UNILAG · dark, 2D |
| --- | --- |
| ![UNILAG campus and Senate in 3D](docs/assets/screenshots/unilag-desktop-light-3d-2026-09-30.png) | ![UNILAG classified roads and landscape in dark 2D](docs/assets/screenshots/unilag-desktop-dark-2d-2026-09-30.png) |

| UNILAG · mobile | LASU · unchanged campus data |
| --- | --- |
| <img src="docs/assets/screenshots/unilag-mobile-light-3d-2026-09-30.png" width="280" alt="UNILAG Senate destination and photograph on mobile"> | ![LASU map using the shared visual language](docs/assets/screenshots/lasu-desktop-light-3d-2026-09-30.png) |

| Private GIS workspace | Building authoring |
| --- | --- |
| ![Campus field mapping and projection controls](docs/assets/screenshots/campus-mapping-2026-09-26.png) | ![Building authoring and model controls](docs/assets/screenshots/unified-model-desktop-2026-09-26.png) |

## Features

- **Campus navigation:** searchable names, aliases, categories and streets; walking and driving routes; destination/entrance guides; mapped restrictions, closures, parking and walking handoffs; foreground GPS and offline spoken instructions.
- **Consistent maps:** light, dark and system themes; 2D and 3D; shared building colours, place icons and labels; separate trees, hedges, shrubs, greenspaces, water, sports areas, parking and subtle parcels. Polygon road surfaces cover matching centreline display segments while leaving uncovered segments visible.
- **Independent campuses:** searchable globe chooser, campus-specific links, recents, saved places, report drafts and offline packages. Changing campuses during navigation requires confirmation. A map can publish before its routes are ready.
- **Vector imports:** file batches, public ArcGIS and complete OSM extracts; format/projection detection, editable field mappings, aliases/coded values, repair receipts, per-layer sampling and styled previews over the current campus.
- **Owner editing:** select and edit places, paths, buildings, barriers, land and generic overlays; undo/redo, transactional autosave, recovery and review. Overlays have editable labels, colours, opacity, visibility and order.
- **Building detail:** footprint-bound architectural evidence, roof plans, wall materials, windows, surface text, curves, components, meshes and reference-photo split views. GLB/glTF/OBJ/STL exchange uses the separate model workspace.
- **Photographs:** credited galleries, automatic compression, offline image editing, crop/rotate/exposure controls, ordered galleries, recovery and model references. Photo dates and historical views remain visible.
- **Reviewed publication:** immutable campus snapshots, validated models and hashed assets, preview before publication, preserved other-campus packages, and a campus-specific restore workflow.

## Quick start

Use **Node 22.13+ in the 22.x line**.

```sh
cd web
npm ci
npm run dev
```

The local public map needs no credentials. Vite does not emulate Vercel's private APIs. Owner login, import jobs, submitted reports and publication require [the deployment setup](docs/DEPLOYMENT.md). Keep service credentials out of `VITE_*` variables and Git.

```sh
npm test
npm run lint
npm run build
npm run check:configured-build
```

The configured build exercises the real authentication/dependency boundary using placeholder public configuration; it is a verification build, not a deployable account configuration.

## Using the public map

1. Open a campus directly or use **Choose a campus** beside search.
2. Search a destination or street. Open its details to inspect photographs, model evidence and arrival information.
3. Choose directions and an origin. Select walking or driving where the campus supports it, then review restrictions and the final approach before starting.
4. Use settings for theme, 2D/3D and navigation preferences. GPS guidance runs while the app is foregrounded.
5. Open **Offline** and download that campus. Wait for completion before disconnecting. Removing one campus download retains other campuses and shared assets.

Links use `?campus=unilag` and can include existing place/building identifiers. Legacy links without a campus parameter continue to resolve to LASU. Search and route calculation work with the downloaded package; online source imports and owner publication require a connection.

## Supported map imports

The [shared capability registry](scripts/map_import/capabilities.json) drives upload controls, API checks and worker dispatch. Conversion stays in the pinned server-side GIS worker.

| Input | Requirements and supported content |
| --- | --- |
| GeoJSON / ArcGIS JSON | `.geojson`, `.json`, including `.geojson.json`; features, collections, bare geometry, multipart and GeometryCollections |
| TopoJSON | `.topojson` or detected JSON topology |
| GeoJSON sequences / NDJSON | `.geojsonl`, `.geojsons`, `.jsonl`, `.ndjson`; one feature per record |
| Shapefile | ZIP or matching `.shp`, `.shx`, `.dbf`; include `.prj` or select the source CRS |
| GeoPackage | `.gpkg`; select vector layers |
| KML / KMZ | Local vector content; external network links are rejected |
| GPX | Waypoints, tracks and routes; tracks confer no access permission |
| CSV | Coordinate columns or WKT geometry; map fields and CRS |
| OSM | Complete XML/PBF extracts, or boundary-based Overpass source |
| FlatGeobuf | `.fgb` |
| File Geodatabase | ZIP containing a complete `.gdb` directory |
| GML | `.gml`, with local schema companions where needed |
| MapInfo | Grouped TAB companions or MIF/MID, directly or in a ZIP |
| GeoParquet | `.parquet` / `.geoparquet` with GeoParquet metadata and WKB geometry |
| Georeferenced DXF | `.dxf` coordinates already tied to a known CRS; select that CRS |
| Mixed vector ZIP | Multiple supported datasets, with companion files kept together |
| Public ArcGIS | Web Maps, embedded collections and queryable FeatureServer/MapServer layers |

Raster imagery, scanned-map alignment, tile archives, proprietary DWG conversion and private ArcGIS authentication are deferred. Importing a CAD drawing does not automatically georeference a local engineering coordinate system. [Full guide, limits and fixtures](docs/CAMPUS-IMPORTS.md).

## Import and edit a campus

Open **Editor → Campuses**, select the target campus and choose **Import data**. Original uploads stay private. Inspect the layers, confirm the source projection, choose a role and stable identifier, then build the preview. Unknown points, lines and polygons can use the **overlay** role. Use **road-surface** for roads represented by polygons; it adds no routing connections.

The importer retains meaningful names, categories, road/surface/width fields, land use, vegetation, heights and floors. Width/height units can be metres or feet. GeometryCollections receive stable component suffixes. Null geometry, invalid coordinates, duplicate identities, incomplete exports and ambiguous repairs are explicit errors or review diagnostics.

Routine winding, repairable ring closure and consecutive duplicate fixes are automatic. Polygon repair is accepted only when valid, nonempty, component-preserving and within 1% projected area change. Original geometry hashes and before/after diagnostics remain in the private review record.

Repeat imports default to **add/update selected layers**. Removing missing records requires explicit complete-layer or complete-source replacement. Select the accepted layer identity when a filename/layer name changes to reuse its mappings. Owner corrections and authored models survive source refreshes. Preview sampling spreads across each layer; validation covers the full dataset.

Queue a valid preview, review the proposed changes, then build a campus release preview. Existing drafts and public packages remain separate. A changed baseline or public catalogue invalidates a stale release. [Editor guide](docs/EDITOR.md) · [Import guide](docs/CAMPUS-IMPORTS.md) · [Publication](docs/DEPLOYMENT.md).

## Building models and photographs

Open a building in the owner editor to manage references, appearance and its model. Native authoring covers roofs, wall surfaces, openings, surface text, curves and object/component meshes. Undo history and authored models remain private until reviewed publication. Imported standard model files retain supported static geometry and appearance; native editing history is not a standard model-file feature.

Photographs retain author, licence, source URL, capture date where known and derivative notices. The UNILAG review assessed 115 candidates and accepted 16 images for 11 buildings. Ten footprint-bound architecture references feed the existing model pipeline; the pre-existing Engineering model remains authoritative. Four buildings gain source/photo-supported floor estimates. Unknown metre heights, rear elevations and materials remain labelled gaps.

[Model authoring](docs/MODEL-AUTHORING.md) · [Unified editor](docs/UNIFIED-MODEL-EDITOR.md) · [Photo editing](docs/PHOTO-EDITING.md) · [Arrival photos](docs/ARRIVAL-GUIDES.md) · [UNILAG evidence](docs/UNILAG-DETAIL.md).

## Offline operation and recovery

Campus packages include map/routing data, models, credited photos, glyphs and audio with verified hashes. Offline downloads are scoped by campus. Application updates preserve the active navigation package. Editor recovery is scoped to owner and campus; pending saves, drawings, roof edits and survey recordings require resolution before switching.

Interrupted file uploads can resume by selecting the same files. Import jobs expose progress, cancellation and retry; cancellation invalidates their run token. Daily source checks prepare review proposals and cannot publish automatically. [Offline and field verification](docs/ACCEPTANCE.md) · [Survey guide](docs/SURVEY.md).

## Architecture

React/TypeScript and MapLibre render the application. Web workers handle routing, road-display clipping, image work, model files and validation; optional authoring surfaces load on demand. Vercel serves the PWA and owner APIs, Supabase stores private campus records/assets, and GitHub Actions runs isolated GIS conversion and reviewed releases.

The GIS worker pins GDAL 3.11.4 by image digest, Shapely 2.1.2, Pyproj 3.7.2, PyArrow 19.0.1 and Pyosmium 4.1.1. It runs with no network, a read-only root, bounded scratch space and explicit driver selection. Public packages contain mapped application properties rather than arbitrary source attributes.

Resource limits remain 50 MiB uploaded per batch, 250 MiB expanded archives, 100,000 normalized features, 100 layers and 20 minutes per import job. Gzip budgets remain 425 KiB for public startup, 185 KiB additional owner startup, 12 KiB for the photo workspace and 300 KiB for the lazy 3D renderer/editor. [Architecture](docs/ARCHITECTURE.md) · [Performance](docs/PERFORMANCE.md).

## Configuration and hosting

Apply migrations in order through **019_additive_source_patch.sql** before enabling land/overlay writers. Existing production migrations are recorded in [Production](docs/PRODUCTION.md); do not rerun initialized schema migrations.

Set up the owner allowlist, GitHub OAuth, private storage and repository/Vercel secrets using [Deployment](docs/DEPLOYMENT.md) and [Configuration](docs/CONFIGURATION.md). `PUBLISHED_MAP_URL` makes application builds preserve current campus packages. Worker workflows run from `main`, so release the shared registry/API/worker changes together. Restore one campus through a fresh release preview, preserving other campuses' current packages.

## Development and verification

Unit tests cover source identities, geometry/classification, overlays, routing, private drafts, packages, photos and model publication. PostgreSQL-compatible migration tests exercise transactional land/overlay saves and history. GIS integration fixtures cover every advertised format inside the pinned Linux runtime, including projections, grouped files, incomplete sources and recovery.

```sh
cd web
npx playwright test campus-imports.spec.ts
npx playwright test --config playwright.webkit.config.ts campus-imports.spec.ts
npm run test:survey-pwa
```

The [verification record](docs/PRODUCTION.md) distinguishes full regression runs, focused follow-ups, real-campus checks and remaining physical-device/field checks. Windows runs without GDAL skip the Linux integration fixtures; those skips do not establish format support.

## Repository structure

| Path | Purpose |
| --- | --- |
| `web/src`, `web/api`, `web/server` | Public app, owner editor, APIs and validation |
| `web/tests` | Unit, database, browser and offline workflows |
| `scripts/map_import` | Shared format registry and pinned GIS conversion |
| `scripts/tests` | Import, source-completeness and UNILAG geometry acceptance |
| `supabase/migrations` | Additive schema/RPC upgrades |
| `data/unilag-enrichment` | Mapped release patch, candidate dispositions and credited photo inventory |
| `data/building-evidence.json`, `data/photos` | Architecture references and licensed photo derivatives |
| `docs` | Current guides, evidence, screenshots and dated verification |

Raw downloads and private source/draft snapshots are excluded from Git and public deployments.

## Limitations and troubleshooting

- **Unknown projection:** select the actual source CRS. Changing a label to WGS84 does not convert local drawing coordinates.
- **Incomplete export:** retrieve all source records; the importer rejects truncated ArcGIS responses and incomplete OSM dependencies.
- **Preview disabled:** resolve its stated errors or rebuild after changing mappings. Inspect automatic repair receipts before queueing.
- **Changed source filename:** select the existing accepted layer identity. Do not infer identity from a repeated label or nearby location.
- **Missing route:** no new access is inferred from a road polygon, photograph or model. Check reviewed paths, entrance connections and restrictions.
- **3D unavailable:** use the 2D map. Mesh editing requires WebGL; full physical-device coverage remains a separate acceptance task.
- **Stale release:** create a fresh preview after source/draft/catalogue changes. Do not promote an old whole-site deployment to roll back one campus.

No cross-campus routing, indoor room navigation or verified step-free campus guarantee is provided. Research does not fill unknown values merely to equal another campus's counts.

## Documentation and licensing

[Documentation index](docs/README.md) links current usage, deployment and engineering guides. [UNILAG coverage](docs/UNILAG-DETAIL.md) records included candidates, source conflicts and remaining evidence gaps. Historical research reports retain their original dates and counts.

Map data and photographs have separate terms: [source attribution](data/ATTRIBUTION.md), [photo catalogue](data/photos/README.md), and the per-asset author/licence records. OpenStreetMap-derived data retains ODbL attribution. Owner-authorised ArcGIS publication does not imply a broader public reuse licence. Contributions should preserve campus identities, source provenance, private draft isolation and existing resource budgets.
