# TurnRight documentation

TurnRight combines a public campus navigation PWA, a private GIS/map workspace and a building authoring editor. LASU Ojo is the default and currently the only published campus. Separate campuses can be created and imported privately, then reviewed and published independently. See the [project overview and screenshots](../README.md), [repository map](../README.md#repository-structure) and [verified production state](PRODUCTION.md).

## Use the application

| Task | Guide |
| --- | --- |
| Create a campus, import GIS files/OSM/public ArcGIS, map fields and review | [Campuses and map imports](CAMPUS-IMPORTS.md) |
| Edit places, paths, entrances, access and source changes | [Owner editor](EDITOR.md) |
| Edit windows, walls, roofs, footprints, text and model review | [Unified model editor](UNIFIED-MODEL-EDITOR.md) and [building editing](BUILDING-EDITOR.md) |
| Use photo reference split, curves, mesh components and GLB/glTF/OBJ/STL | [Model authoring](MODEL-AUTHORING.md) |
| Edit standard and custom roof plans | [Building roofs](BUILDING-ROOFS.md) |
| Upload, credit, recover and approve photographs; edit arrival guides | [Arrival guides and photos](ARRIVAL-GUIDES.md) |
| Record and review private path/entrance evidence | [Walking surveys](SURVEY.md) |
| Use vehicle routes, parking and the walking handoff | [Driving](DRIVING.md) |
| Understand offline spoken guidance | [Voice](VOICE.md) |
| Use compass/location assistance and decorative globe animation | [Motion](MOTION.md) |
| Recover incomplete edits, resolve conflicts and inspect release changes | [Editor reliability](EDITOR-RELIABILITY.md) |

Native surface editing can fall back to 2D when WebGL is unavailable; mesh editing requires WebGL. Standard model files preserve supported static geometry and appearance, while native parameters, review state and history remain in TurnRight. GIS imports do not include imagery/PDF alignment or private ArcGIS authentication. No cross-campus routing or interior room workflow is provided.

## Develop, configure and deploy

| Area | Reference |
| --- | --- |
| Module ownership, data flow, workers, persistence and compatibility | [Architecture](ARCHITECTURE.md) |
| New installations, migrations 001–015, credentials and release jobs | [Deployment](DEPLOYMENT.md) |
| Existing project configuration and operational settings | [Configuration](CONFIGURATION.md) |
| Current production revision and dated deployment receipts | [Production](PRODUCTION.md) |
| Automated acceptance and uncompleted physical-device/field checks | [Acceptance](ACCEPTANCE.md) |
| Model commands, renderer identity, regression and budget evidence | [Model editor verification](MODEL-EDITOR-VERIFICATION.md) |
| Worker bounds, upload behavior and measurements | [Performance](PERFORMANCE.md) and [mobile model performance](MOBILE-MODEL-PERFORMANCE.md) |
| Theme tokens and text contrast | [Dark-mode readability](DARK-MODE-READABILITY.md) and [map styling](DARK-MAP-STYLING.md) |
| Screenshot files, fixture provenance and reproduction | [Screenshot inventory](assets/screenshots/README.md) |
| Source/data reuse and public credits | [Attribution](../data/ATTRIBUTION.md) and [photo source records](../data/photos/README.md) |

Start with Node 22.13+ in the 22.x line and `npm ci` inside `web/`. `npm run dev` serves the public seed with no credentials; it does not serve the Vercel APIs. Browser workflows isolate authentication and private data. `npm test`, `npm run lint`, `npm run build` and `npm run check:configured-build` cover the app and budgets. Full GIS driver checks run in the pinned Linux container; [import verification](CAMPUS-IMPORTS.md#verification) provides the commands. App code deployment preserves published packages; map/model publication is a separate owner action.

## Research and historical evidence

These records retain the package, date and measurements they assessed. Their counts and older interface labels are not the current application specification. Do not rewrite source observations to match a newer UI; consult the current guides above for operating instructions.

- [LASU enrichment](ENRICHMENT.md) and its [September 22 candidate ledger](../data/enrichment/2026-09-22/README.md).
- [Campus access](CAMPUS-ACCESS.md), [Law/Library connection review](CONNECTION-REVIEW.md) and [Overture comparison](OVERTURE-COMPARISON.md). Their access exceptions apply only to LASU and the recorded source identities.
- [Building reference research](BUILDING-REFERENCE-RESEARCH.md), [appearance coverage](BUILDING-APPEARANCE-COVERAGE.md), [roof coverage](BUILDING-ROOF-COVERAGE.md), [miniature-campus assessment](MINIATURE-CAMPUS.md) and [visual reference sheets](../data/visuals/reference-sheets.md).
- [Photographic models](PHOTO-MODELS.md), [all-building/photo coverage](PHOTO-MODEL-COVERAGE.md) and [September 24 verification](PHOTO-MODEL-VERIFICATION.md).
- [Earlier map/editor improvements](MAP-IMPROVEMENTS.md), dated sections of [Production](PRODUCTION.md), and the archived captures in the [screenshot inventory](assets/screenshots/README.md).

When changing a workflow, update its guide and the README entry, recapture affected screens from the actual application, validate relative links and heading anchors, and record measured results with their date/package. Keep example campuses and illustrative model changes labelled. Software-rendered phone screenshots and automated GPS fixtures do not establish physical-device behavior or campus safety.
