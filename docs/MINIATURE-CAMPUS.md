# Miniature campus implementation · 14 September 2026

## Current authored-model extension

[Expanded authoring](MODEL-AUTHORING.md) adds curves, editable topology and model files. Public compilation adds optional normals, PBR materials and hashed textures while preserving legacy fingerprints. The globe supports gentle rotation and decorative clouds through MapLibre projection helpers. The dated assessment below remains historical.

This historical assessment is supplemented by the [24 September photographic model and globe release](PHOTO-MODELS.md), covering the current 395-building map and all 19 photographed buildings. Its budgets, texture pipeline and coverage supersede the earlier figures below.

The application retains MapLibre, local campus data and Terra Draw. Architectural models use a lazy Three.js custom layer sharing MapLibre's WebGL context. Application deployment and campus-data publication remain separate operations.

**Deployment update:** the application and migrations 005/006 were deployed on 14 September. The editor baseline is now reconciled with public package `lasu-4e4c8008b38b`; all source graph endpoints are valid, and saved drafts and history were preserved. Four validation messages remain for two entrance drafts. See [production verification](PRODUCTION.md); the building catalogue and footprint corrections still await the separate campus-data review.

## Release-validation repair

The owner export captured on 14 September contained 1,172 approved source rows, 20 correction records (10 active), and 65 history entries. The complete export remains in the local backup; the committed compressed regression fixture retains source geometry and correction properties without database actors or private recovery history.

The actual exception came from `applyConnections` recomputing all edge lengths after a draft junction. Approved edge `osm:way:1534765716:2297333149:2297333129:1` referenced two missing sample nodes, ending in `:10` and `:9`. Empty edits did not take that branch. The saved private, stepped path `osm:way:1535732706` and all draft connection references are preserved.

Preflight validates endpoint existence, finite coordinates and geometry structure before spatial work. Diagnostics identify phase, revision, feature and references. Releases supplies Locate feature, Retry validation and Download diagnostics, distinguishes worker failures from mapping warnings, and keeps the last usable map on screen. Preview preparation and publication repeat checks on the server and release runner.

The captured editor baseline was `lasu-03bc96e56965` (299 directed edges); the verified public package is `lasu-4e4c8008b38b` (2,452). The live editor now uses that public baseline. Migration `005_baseline_reconciliation.sql` adds a transaction that archives before/after source snapshots and preserves corrections and history. Migration `006_reconciliation_safe_updates.sql` scopes replacement to reviewed source IDs for compatibility with Supabase's DELETE guard. The Releases baseline review verifies the current public download, shows counts, access reviews and replay issues, then accepts only the reviewed source revision. Draft edits after preview creation invalidate publication.

## Building coverage and evidence

All **379 building footprints** have an assessment. The catalogue contains **58 authored models: 5 detailed and 53 simplified**, in 24 sectors. **321 retain source extrusions**, including two competing model identities awaiting review. There is no fixed landmark limit or model-count cap.

Detailed treatments cover the International Library, Senate main block, Law Library, Mass Communication and MBA. The medical Clinic has a floor-derived simplified model. Law Clinic, Education and Transport use simplified massing where compound ridge layouts are unresolved. The Faculty of Law and main gate still lack sufficient matched dimensions/form evidence. Law Library and Law Clinic photographs were not misattributed to the main Faculty or medical Clinic.

- [Coverage queue](../data/visuals/coverage.md): every building and missing references.
- [Reference sheets](../data/visuals/reference-sheets.md): footprint bounds, area, orientation, parts/courtyards, dimension provenance, colours, roof forms, dated appearance sources and uncertainty.
- [Evidence inputs](../data/building-evidence.json): reusable reference metadata and unresolved photo-to-footprint associations.
- [Visual catalogue](../data/visuals/catalogue.json): model compatibility revisions, credits and sector hashes.

Thirty-seven Commons photographs were inspected; unambiguous references were associated with existing building identities. The 2026 Senate and International Library photographs support seven and four visible floor levels respectively. Horizontal dimensions come exclusively from georeferenced footprints. Floor-derived metre heights use 3 m per floor. Window spacing, trim and unphotographed elevations are illustrative, as recorded in each assessment. Photo-based floor counts apply only to the identified main block: the Senate's separate auxiliary part keeps a muted illustrative 6 m height.

Appearance references include [the Senate in August 2026](https://commons.wikimedia.org/wiki/File:Lagos_State_University_Senate_building_aug_2026_IMG_5989b.jpg), [the 2026 Library exterior](https://commons.wikimedia.org/wiki/File:Lagos_State_University_Babajide_Olusola_Sanwo-Olu_Library_Complex_aug_2026_IMG_5994b.jpg), and [Law Library](https://commons.wikimedia.org/wiki/File:Law_library,_LASU.jpg). Author, date, licence and reference links are retained in the catalogue and building details. Photographs, satellite imagery and photographic textures are not bundled. Existing campus-source attribution and rights requirements still apply.

## Separate building wings

Nine ArcGIS features encoded independent exterior rings as GeoJSON holes: Law offices 1, Senate Chambers, New Science Block, C.P.S, Staff School, Law Clinic, Works Department, Senate and Education Extension. The importer now emits separate Polygon parts, consistent with [Esri's ring semantics](https://developers.arcgis.com/rest/services-reference/enterprise/geometry-objects/).

The catalogue contains proposed regroupings using the exact original coordinates. Five authored models depend on accepting these corrections, including Senate. Until then, they retain fallback extrusions; the other 53 models can display on compatible current footprints. No source feature, routing edge or entrance was silently merged or moved. Inspection of the corrected footprints found no overlapping pair among authored model identities. Remaining source overlaps stay in duplicate review.

In the editor, select an affected building and choose **Review corrected wings**. Inspect the result, edit individual parts as necessary, and save through the existing transactional workflow. Undo restores the previous geometry. Model detail is suppressed during geometry editing. A changed footprint or height invalidates the corresponding model until rebuilt.

## Rendering and offline operation

The palette uses ivory ground, sage mapped vegetation, cream roads, sandy paths and blue mapped water. Wall and roof colours are separate. Native contact shading and simple facade treatments provide depth while routes and destination labels remain prominent. Landscaping uses the mapped vegetation polygons; there are no invented surveyed tree positions or new routing obstacles.

Below zoom 15.4, MapLibre extrusions remain. At intermediate zooms, visible sectors load simple model geometry; facade detail appears from zoom 16.5. At most three sector requests run concurrently. Materials are shared, meshes are validated, offscreen resources are disposed, and stale or unavailable models retain extrusions. Picking resolves to existing building/place identities in public and editor views. Slow interaction first removes facade detail and can fall back to extrusions. The saved **Simple 3D** choice disables models.

Model geometry is approximately 0.22 MB uncompressed for the full catalogue, below the 12 MB budget. The lazy renderer is approximately 122 KB gzip; the build enforces 300 KB. These figures exclude the existing MapLibre runtime and base campus package.

Schema version 1 remains compatible with older packages. The optional catalogue lives in campus data; sector URLs, lengths and SHA-256 checksums enter the ordinary package manifest. Installation verifies the complete selected visual catalogue before committing the active package pointer. Interrupted downloads keep the prior map and reuse verified assets on retry. Staged activation rechecks bytes; cached model corruption clears offline readiness while leaving the basic map available. “Enhanced 3D ready offline” requires a complete verified download and a ready application service worker.

## Rebuilding and reviewing a release

Use Node 22. From `web`, build against an explicitly reviewed campus snapshot:

```sh
node --import tsx scripts/build-campus-visuals.ts ../data/candidates/reviewed-campus.json ../data/visuals
npm test -- --maxWorkers=2
npm run lint
npm run build
```

Review evidence and generated diffs before committing a new catalogue. Packaging copies only catalogue-listed sector files and verifies their hashes. Stale sector files are never included merely because they exist in the directory. Geometry/appearance edits use fallback rendering until the catalogue has been rebuilt against those edits.

Apply migrations 005 and 006 and configure `PUBLISHED_MAP_URL` on the API before baseline reconciliation. These steps and the reviewed baseline reconciliation are complete in production. Deploy the application while preserving the current published campus package. In Releases, resolve the remaining draft issues, accept the relevant geometry corrections, then build a separate campus-data preview. Review Law/Library access, directed routes, closures and model compatibility before publishing. Retain the preceding immutable deployment/package for rollback. No new campus package has been published by the application deployment or baseline repair.

## Verification limits

Release checks used Node 22.23.2: **186 unit/database tests passed**, both frontend and server TypeScript checks passed, and lint reported only the seven existing warnings. All nine Python importer tests passed; a full import from the captured source files retained 219 places and 2,452 directed edges. The candidate import remains local and unpublished.

Eleven selected browser flows passed across development and production service-worker builds: release diagnostics, separate-wing correction/edit/save/undo, desktop and phone model presentation, unavailable sectors and editor picking, mouse and touch drawing, connected entrances, unfinished-draft recovery, basic offline reopening, and enhanced offline repair/reopening. These checks use isolated fixtures, including explicitly accepted wing corrections where testing compatible models; they do not modify live drafts or approve those corrections in production.

Node 22 unit/database tests cover captured missing endpoints, malformed geometry, stale references, revision workers, draft preservation, source reconciliation, height/footprint compatibility, courtyard triangulation, auxiliary heights, sector integrity, interrupted installation, corruption and atomic activation. Browser checks exercise actual MapLibre/Three rendering, desktop/phone viewports, model picking, simple preference reload, light/dark themes, drawing suppression, separate-wing editing/undo, and production offline reopening.

Software-rendered browser tests are not physical-device performance measurements. Representative Android and iPhone interaction at the 30 fps target, current field dimensions, and acceptance of the nine geometry corrections remain release-review work. No surveyed height, roof ridge, entrance or auxiliary-wing dimension is claimed where the reference sheet says it is inferred or missing.
