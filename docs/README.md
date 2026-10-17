# TurnRight documentation

TurnRight combines a public campus map/globe with a private GIS editing and publication platform. Start with the [project overview](../README.md), [public map guide](PUBLIC-MAP.md), or [team workflow](GIS-PLATFORM.md). [Production readiness](PRODUCTION.md) distinguishes the current source, local verification, deployed revisions, and remaining release gates.

## Use TurnRight

| Task | Guide |
| --- | --- |
| Explore places, plan journeys, download maps, and report a problem | [Public map and globe](PUBLIC-MAP.md) |
| Work as a campus team: typed datasets, analysis, independent review, publication and exports | [Campus GIS platform and rollout](GIS-PLATFORM.md) |
| Select campus silhouettes, switch smoothly and use downloaded campuses offline | [Campus globe](CAMPUS-GLOBE.md) |
| Organize campus layers and edit road surfaces | [Layer workflow](CAMPUS-LAYERS.md) |
| Inspect published LASU road estimates, reviewed sources and landscape classes | [LASU layer coverage](LASU-LAYERS.md) |
| Create a campus, import GIS files/OSM/public ArcGIS, map fields and review | [Campuses and map imports](CAMPUS-IMPORTS.md) |
| Review the UNILAG road, building, destination and photograph evidence | [UNILAG detail coverage](UNILAG-DETAIL.md) |
| Use the ArcGIS toolbox, precision tools, campus detail candidates and visitor layers | [Campus detail upgrade](CAMPUS-DETAIL-UPGRADE.md) |
| Download UNILAG ArcGIS/OSM files and reproduce the source comparison | [UNILAG downloads](UNILAG-DOWNLOADS.md) |
| Edit places, paths, entrances, access and source changes | [Team editor](EDITOR.md) |
| Check connected sources, compare evidence, review bulk changes and preview private undo | [Source updates](SOURCE-UPDATES.md) |
| Recover availability failures and understand the accepted-source baseline | [Editor availability](EDITOR-AVAILABILITY.md) |
| Edit windows, walls, roofs, footprints, text and model review | [Unified model editor](UNIFIED-MODEL-EDITOR.md) and [building editing](BUILDING-EDITOR.md) |
| Use photo reference split, curves, mesh components and GLB/glTF/OBJ/STL | [Model authoring](MODEL-AUTHORING.md) |
| Edit standard and custom roof plans | [Building roofs](BUILDING-ROOFS.md) |
| Upload, credit, recover and approve photographs; edit arrival guides | [Arrival guides and photos](ARRIVAL-GUIDES.md) |
| Automatically compress added photos, compare and edit offline; drag gallery order | [Photo editing and compression](PHOTO-EDITING.md) |
| Follow import inspection, builds, uploads and local processing | [Build and process progress](PROGRESS-MONITOR.md) |
| Record and review private path/entrance evidence | [Walking surveys](SURVEY.md) |
| Use vehicle routes, parking and the walking handoff | [Driving](DRIVING.md) |
| Understand offline spoken guidance | [Voice](VOICE.md) |
| Use compass/location assistance and decorative globe animation | [Motion](MOTION.md) |
| Recover incomplete edits, resolve conflicts and inspect release changes | [Editor reliability](EDITOR-RELIABILITY.md) |

Native surface editing can fall back to 2D when WebGL is unavailable; mesh editing requires WebGL. Standard model files preserve supported static geometry and appearance, while native parameters, review state and history remain in TurnRight. GIS imports do not include imagery/PDF alignment or private ArcGIS authentication. No cross-campus routing or interior room workflow is provided.

## Develop

Start with [contributing](../CONTRIBUTING.md), [B2 brand assets and usage](BRAND.md), and [the current gallery and screenshot maintenance](SCREENSHOTS.md). The [workspace shell contract](EDITOR-LAYOUT.md) explains pane identity and preferences.

| Area | Reference |
| --- | --- |
| Module ownership, data flow, workers, persistence and compatibility | [Architecture](ARCHITECTURE.md) |
| Latest documentation, screenshot, cleanup and dependency verification | [15 October repository review](AUDIT-2026-10-15.md) |
| File ownership, generated output, naming and documentation maintenance | [Repository structure](REPOSITORY.md) |
| Vulnerability reporting and operational security boundaries | [Security](../SECURITY.md) |
| Dated workspace redesign and its automated results | [7 October redesign verification](REDESIGN-VERIFICATION.md) |
| Automated acceptance and uncompleted physical-device/field checks | [Acceptance](ACCEPTANCE.md) |
| Model commands, renderer identity, regression and budget evidence | [Model editor verification](MODEL-EDITOR-VERIFICATION.md) |
| Worker bounds, upload behavior and measurements | [Performance](PERFORMANCE.md) and [mobile model performance](MOBILE-MODEL-PERFORMANCE.md) |
| Dated bug reproductions, fixes, measurements and verification limits | [3 October audit](AUDIT-2026-10-03.md) |
| Theme tokens and text contrast | [Dark-mode readability](DARK-MODE-READABILITY.md) and [map styling](DARK-MAP-STYLING.md) |
| Screenshot files, fixture provenance and reproduction | [Screenshot inventory](assets/screenshots/README.md) |
| Source/data reuse and public credits | [Attribution](../data/ATTRIBUTION.md) and [photo source records](../data/photos/README.md) |

Start with Node 22.23.3 from `.node-version` and `npm ci` inside `web/`. `npm run dev` serves the public seed with no credentials; it does not serve the Vercel APIs. Browser workflows isolate authentication and private data. `npm test`, `npm run lint`, `npm run build` and `npm run check:configured-build` cover the app and budgets. Full GIS driver checks run in the pinned Linux container; [import verification](CAMPUS-IMPORTS.md#verification) provides the commands. App code deployment preserves published packages; map/model publication is a separate approved team action.

## Operate

| Task | Guide |
| --- | --- |
| Install, migrate, configure credentials and run release jobs | [Deployment](DEPLOYMENT.md) and [GIS rollout](GIS-PLATFORM.md#additive-rollout-and-recovery) |
| Maintain operational settings | [Configuration](CONFIGURATION.md) |
| Check deployed revisions and dated release receipts | [Production](PRODUCTION.md) |
| Recover private work and handle conflicts | [Editor reliability](EDITOR-RELIABILITY.md) |
| Verify offline and release readiness | [Acceptance](ACCEPTANCE.md) and [15 October manual handover](RELEASE-ACCEPTANCE-2026-10-15.md) |

## Reference and history

These records retain the package, date and measurements they assessed. Their counts and older interface labels are not the current application specification. Do not rewrite source observations to match a newer UI; consult the current guides above for operating instructions.

- [LASU enrichment](ENRICHMENT.md) and its [September 22 candidate ledger](../data/enrichment/2026-09-22/README.md).
- [Campus access](CAMPUS-ACCESS.md), [Law/Library connection review](CONNECTION-REVIEW.md) and [Overture comparison](OVERTURE-COMPARISON.md). Their access exceptions apply only to LASU and the recorded source identities.
- [Building reference research](BUILDING-REFERENCE-RESEARCH.md), [appearance coverage](BUILDING-APPEARANCE-COVERAGE.md), [roof coverage](BUILDING-ROOF-COVERAGE.md), [miniature-campus assessment](MINIATURE-CAMPUS.md) and [visual reference sheets](../data/visuals/reference-sheets.md).
- [Photographic models](PHOTO-MODELS.md), [all-building/photo coverage](PHOTO-MODEL-COVERAGE.md) and [September 24 verification](PHOTO-MODEL-VERIFICATION.md).
- [27 September audit](AUDIT-2026-09-27.md).
- [Earlier map/editor improvements](MAP-IMPROVEMENTS.md), dated sections of [Production](PRODUCTION.md), and the archived captures in the [screenshot inventory](assets/screenshots/README.md).

When changing a workflow, update its guide and the README entry, recapture affected screens from the actual application, validate relative links and heading anchors, and record measured results with their date/package. Keep example campuses and illustrative model changes labelled. Software-rendered phone screenshots and automated GPS fixtures do not establish physical-device behavior or campus safety.

## Source updates and bulk decisions

Use [Source updates](SOURCE-UPDATES.md) for connected-source status, schedules, comparisons, bulk selection, background decisions, and recovery. Acceptance and publication are separate.
