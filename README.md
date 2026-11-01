<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/brand/wordmark-reversed.svg">
  <img src="docs/assets/brand/wordmark.svg" width="330" alt="TurnRight">
</picture>

# TurnRight

**Explore a campus. Build a better map.**

TurnRight combines a public campus map and globe with a private GIS editor. Visitors can discover campuses, inspect places and buildings, plan journeys, and download maps for offline use. Campus teams can import data, edit geometry and building models, review source changes, and publish independently approved map releases.

[Explore the map](https://turnright.vercel.app/) · [Open the editor](https://turnright.vercel.app/admin) · [Documentation](docs/README.md) · [Contributing](CONTRIBUTING.md)

> Independent project; not an official university service. Routes and entrances still require field verification. Building models and mapped approaches do not establish access or step-free accessibility. See [release readiness](docs/PRODUCTION.md) for verification status and remaining checks.

## Public map and globe

### Published campus detail

Published on **18 October 2026**, the LASU Ojo and UNILAG Akoka upgrade adds precision drawing, previewed geometry refinement, reusable building palettes, illustrative greenery, per-campus visitor layers and landmark exploration. It retains the MapLibre/Three.js renderer, authored buildings, routing, source attribution and existing editor corrections. Recorded, estimated and illustrative dimensions remain distinct.

The [campus detail guide](docs/CAMPUS-DETAIL-UPGRADE.md) describes the implementation, source review and release evidence. The [ArcGIS Python toolbox](scripts/arcgis/TurnRight.pyt) discovers sources, inspects coverage, compares candidates and exports versioned review bundles. It keeps portal authentication local and sends imports through the existing private review workflow.

The October 17–18 Pro review checked 52 copied vector layers and preserved GeoJSON, GeoPackage, provenance, geometry findings and synthetic GLB examples outside the repository's temporary output. The dedicated LASU/UNILAG project has four maps/scenes and no broken references. Controlled desktop studies verified exact numeric construction, undo/redo, separate-output building regularization and batch appearance with saved-data readback, and recorded reference snapping, cancellation and measured trace limitations. Pro's Licensing page confirms expiry on **6 November 2026**. [Archive index and remaining Pro priorities](docs/CAMPUS-DETAIL-UPGRADE.md#time-limited-pro-access) explain what is saved during the limited access window. Published navigation and portable exports continue to work after Pro access ends. [REA and local iD studies](docs/CAMPUS-DETAIL-UPGRADE.md#rea-studies-and-interaction-specification) inform the editor; API, desktop and browser evidence retain their distinct verification scope.

| LASU Ojo · published 3D                                                                                    | UNILAG Akoka · published 3D                                                                                    |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| ![Published LASU 3D map and Senate photograph](docs/assets/screenshots/live-lasu-published-2026-10-18.png) | ![Published UNILAG 3D map and Senate photograph](docs/assets/screenshots/live-unilag-published-2026-10-18.png) |

These are unaltered public captures of **LASU `lasu-41ec73876464`** and **UNILAG `unilag-b7655a90045c`**. The final production audit passes 236 asset hashes, 32 Chromium/WebKit views and four offline journeys. Existing geometry, routes and detailed models are preserved. Extra ArcGIS sources remain held for permissions, dates and feature conflicts. [Production receipts](docs/PRODUCTION.md) · [Capture provenance](docs/assets/screenshots/live-publication-2026-10-18.json).

### Discover and explore

Start with the campus map or open **Choose a campus** to explore the globe. Select a published campus by name, pin, or boundary. The existing map stays open during switching, and unavailable downloads leave the current campus usable. [LASU Ojo](https://turnright.vercel.app/?campus=lasu) and [UNILAG Akoka](https://turnright.vercel.app/?campus=unilag) have separate published packages; campus identity follows shared links, saved places, and offline downloads.

| Campus map                                                                                                           | World view                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| ![Public campus map with selected building and place details](docs/assets/screenshots/live-lasu-dark-2026-10-18.png) | ![Dark globe view showing geographic context around West Africa](docs/assets/screenshots/tour-globe-2026-10-15.png) |

- Search destinations and streets, browse categories, save places, and share destination links.
- Switch between 2D and 3D, use light/dark/device appearance, and adjust map rendering and motion settings.
- Inspect building footprints, authored models, photographs, source credits, and arrival information. Recorded, estimated, and illustrative dimensions remain distinguishable.
- Submit a correction report or keep a local report draft for later. Reports enter private review and do not immediately change the map.

### Navigate and prepare for offline use

Preview walking or driving routes from a selected origin. Foreground GPS, route instructions, spoken guidance, and deviation handling support a journey over the mapped network. Driving includes mapped vehicle restrictions, parking, and a walking handoff where available.

Download each campus from **Offline** and wait for **Ready offline** before disconnecting. For an existing download, choose **Download update** after a campus release. Verified packages retain the map, search, routing, recorded guidance, and every published model detail level and texture. Updates preserve the active journey and the preceding valid package until a replacement is ready.

| Place details on a phone                                                                                                                          | Offline preparation                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| <img src="docs/assets/screenshots/live-unilag-phone-2026-10-18.png" width="280" alt="Place details and map controls in a phone browser viewport"> | <img src="docs/assets/screenshots/tour-offline-2026-10-15.png" width="280" alt="Campus download and offline verification controls"> |

Navigation runs in the foreground. There is no cross-campus route planner, indoor room navigation, or verified step-free guarantee. An offline campus directory can list campuses that have not been downloaded. [Public map guide](docs/PUBLIC-MAP.md) · [Globe and switching](docs/CAMPUS-GLOBE.md) · [Driving](docs/DRIVING.md) · [Voice](docs/VOICE.md).

## Editor and campus team workflow

The authenticated editor organizes work as **Data → Edit → Analyze → Review → Publish**. Campus-scoped roles control access. Desktop panes resize around a persistent map; phones use a workspace chooser and adjustable sheets. Layout preferences, unsaved input, recovery, and feature selection are preserved through supported workspace changes.

| Precision drawing                                                                                                                        | Dataset management                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| ![Numeric rectangle construction, reference snapping and drawing preview](docs/assets/screenshots/tour-precision-desktop-2026-10-18.png) | ![Data workspace with dataset catalogue and paged attribute table](docs/assets/screenshots/tour-gis-data-2026-10-15.png) |

| Workspace   | Capabilities                                                                                                                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Data**    | Create/manage campuses; inspect GIS files, OSM and public ArcGIS sources; map fields; maintain typed datasets, provenance, filters and saved views; import CSV joins and export supported formats. |
| **Edit**    | Edit places, paths, entrances, boundaries, roads and layers; control junctions, restrictions and closures; use geometry tools, undo/redo, conflict handling and recovery.                          |
| **Analyze** | Run bounded spatial tools such as buffers, overlays, joins and measurements against immutable inputs; inspect jobs and staged results before applying changes.                                     |
| **Review**  | Resolve map-linked issues, reports and duplicates; compare source updates; inspect provenance and removal evidence; submit immutable content for independent approval.                             |
| **Publish** | Preview an approved snapshot, style/export A4 or A3 maps, publish a campus package, and prepare a historical campus restore for renewed review.                                                    |

### Buildings, photographs, and field evidence

The model workspace supports footprints, walls, roofs, façades, surface lettering, curves, mesh components, and photographic references. Supported static geometry and appearance can pass through GLB/glTF, OBJ, and STL; native parameters, review history, and recovery remain in TurnRight. Native surface editing has a 2D fallback; mesh editing requires WebGL.

Imported mesh faces support planar photograph projection with crop preview, apply/cancel, source credits and undo. Structural, facade and fine-detail classifications produce three map variants, while GLB export and seven building views provide portable review material. Detailed models stream with bounded memory; campus downloads include every published detail level and texture before reporting **Ready offline**. The existing 12 MiB base-visual limit remains unchanged.

The [LASU Ojo SolidCraft campaign](docs/LASU-MODELS.md) preserves the current 614-building release as its baseline. Its first batch contains 20 exterior model proposals with native masters, editable models, portable exports and photographic comparisons. The current offline fixture is 42.8 MiB; all editable sources fit the unchanged 25 MiB document limit. Three photo-linked buildings and four further researched buildings remain identification gaps. The owner has authorized publication through the [guarded model import and review workflow](docs/MODEL-CAMPAIGN-PUBLICATION.md), and all 20 models are saved in the private editor. Their [verified reconciliation](data/lasu-models/import-reconciliation-2026-11-01.json) preserves unrelated content; review and public map release remain pending. A software release does not publish map models or establish independent architectural acceptance.

| Photographic mesh finishing                                                                                                           | GLB and building renders                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| ![Crop preview and apply/cancel for one selected synthetic mesh face](docs/assets/screenshots/tour-mesh-photo-preview-2026-11-01.png) | ![Prepared GLB and PNG downloads in the model workspace](docs/assets/screenshots/tour-building-render-export-2026-11-01.png) |

These are direct local captures using synthetic geometry and an attributed School of Communication photograph. [Fixture, photo credit and capture hashes](docs/SCREENSHOTS.md#model-finishing-and-export--1-november-2026).

Photographs can be cropped, adjusted, redacted, resized, compressed, compared, and reordered locally before upload. Attribution, approval, private drafts, upload recovery, and arrival guides stay connected to campus work. Private walking surveys collect path and entrance evidence for review.

| Building authoring                                                                                                              | Photo editing                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| ![Building model with structure controls and photographic reference](docs/assets/screenshots/tour-model-desktop-2026-10-15.png) | ![Photograph comparison and local compression controls](docs/assets/screenshots/tour-photo-desktop-2026-10-15.png) |

[Editor guide](docs/EDITOR.md) · [Model authoring](docs/MODEL-AUTHORING.md) · [Photo editing](docs/PHOTO-EDITING.md) · [Walking surveys](docs/SURVEY.md).

### Source review and controlled publication

**Review → Source updates** separates upstream observations, accepted source data, and editor corrections. Filter proposals, compare previous/proposed shapes, preview all matching changes on the map, and apply a frozen selection through bounded background work. Evidence checks block unverified removals. Eligible decisions have a previewed private undo that retains later editor corrections.

Accepting a source update changes the private working map. Publication requires a validated immutable snapshot and independent approval, or an explicitly audited original-owner override. Application code deployment preserves published campus packages. Restoring one campus does not restore the whole website or replace other campuses.

| Independent review                                                                                                   | Approved publication                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| ![Review workspace with validation and immutable submission](docs/assets/screenshots/tour-gis-review-2026-10-15.png) | ![Publication workspace with approved snapshot and map export](docs/assets/screenshots/tour-gis-publish-2026-10-15.png) |

The source reliability changes in migrations **045–048** require a staged rollout and per-source enablement. Their checked-in validation record is local evidence, not a production deployment receipt. [Source updates](docs/SOURCE-UPDATES.md) · [Deployment](docs/DEPLOYMENT.md) · [Production status](docs/PRODUCTION.md).

The LASU/UNILAG campus images show the public packages published on 18 October. The editor, globe and offline-control images are dated local application captures with isolated demonstration accounts/API responses. Phone images are browser simulations. Example editor counts and approvals are not production inventories. [Full gallery, provenance, and reproduction](docs/SCREENSHOTS.md).

## Run locally

Use **Node 22.23.3**, pinned in [.node-version](.node-version) and [.nvmrc](.nvmrc).

```sh
npm ci
npm run doctor
npm run dev
```

Open the address printed by Vite. The public seed map works without credentials. The local seed is a development fixture; it need not match the current public catalogue.

For the complete editor, follow [local development](docs/LOCAL_DEVELOPMENT.md): the pinned Linux/WSL2 development container and `npm run local:up` provide local Supabase/PostGIS, real role-based sessions, private storage and isolated workers with two synthetic campuses. No hosted credentials are needed. Startup preserves local work; reset is explicit. Vite alone serves the public app. Hosted editing uses [deployment and authentication setup](docs/DEPLOYMENT.md) and [environment configuration](docs/CONFIGURATION.md). Never put service credentials in `VITE_*` variables.

For a production build and local static preview:

```sh
npm run build
npm run preview --workspace web
```

Python **3.12** and the pinned Linux GIS containers are needed for importer/native processing work, not for starting the public web app. See [Contributing](CONTRIBUTING.md) for the complete development and verification workflow.

## Architecture and repository

React and TypeScript provide the PWA and editor. MapLibre renders the public map, globe, and shared editing map; Three.js supports model authoring. IndexedDB and the service worker handle local recovery and verified offline packages. Supabase/PostGIS holds private campus work, roles, review records, and processing state. Vercel serves the web app/API; GitHub Actions and isolated workers process imports, analysis, and releases.

```text
Public sources → private imports and observations → team edits and review
                                                       ↓
                                               approved snapshot
                                                       ↓
Visitors ← verified offline packages ← published campus release
```

| Path                            | Responsibility                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------- |
| [web/](web/README.md)           | App, API, browser tooling, unit/database/browser tests and public runtime assets |
| [scripts/](scripts/README.md)   | Importers, isolated workers, packaging, release and data verification            |
| [supabase/](supabase/README.md) | Ordered additive database migrations                                             |
| [data/](data/README.md)         | Attributed source records, seed data, licences and research evidence             |
| [docs/](docs/README.md)         | User guides, architecture, operations, screenshots and dated evidence            |
| `.github/workflows/`            | CI, scheduled source checks, processing and reviewed release gates               |

[Architecture](docs/ARCHITECTURE.md) · [Repository conventions](docs/REPOSITORY.md) · [Configuration](docs/CONFIGURATION.md).

## Quality and release readiness

Run from the repository root:

```sh
npx playwright install chromium webkit
npm run check
npm test -- --maxWorkers=1
npm run test:coverage
npm run check:dependencies
npm run build
npm run check:configured-build
npm run test:survey-webkit --workspace web
npm run test:survey-pwa --workspace web
```

Install Playwright browsers first with `npx playwright install chromium webkit`. CI also checks native PostGIS, importer isolation, backup restoration, photo workflows, offline behavior, and map/globe/voice/JavaScript budgets. The configured-build command uses test authentication placeholders; its output must not be deployed.

The full-source application coverage gate combines passing unit/component tests with all required Chromium journeys and enforces 80% statements, lines and functions plus 70% branches. Native processing requires 80% lines and 70% branches. [Repository readiness](docs/READINESS-UPDATE.md) records exact-revision results and the assessment mapping; those results do not predict an external score.

Physical Android/iPhone checks, campus field verification, live role acceptance, and a public rollback rehearsal remain outstanding acceptance checks. Exact-snapshot approvals and any explicitly authorized owner exception are recorded in the release evidence. [Acceptance checklist](docs/ACCEPTANCE.md) · [Readiness and deployment evidence](docs/PRODUCTION.md) · [Performance bounds](docs/PERFORMANCE.md).

## Contributing, security, and rights

Read [Contributing](CONTRIBUTING.md) before changing data or workflows, and [Security](SECURITY.md) for reporting a vulnerability. Preserve campus isolation, source provenance, private attributes, recovery, and independent publication review.

Original software is proprietary under [LICENSE](LICENSE); commercial licensing requires a separate written agreement. [Third-party notices](THIRD_PARTY.md) distinguish dependencies and assets from original code. Data, photographs, codecs and fonts retain their own terms: consult [data attribution](data/ATTRIBUTION.md), [photograph records](data/photos/README.md), and in-app credits. Source redistribution permission does not grant broader reuse rights. [Brand assets](docs/BRAND.md).
