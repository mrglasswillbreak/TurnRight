<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/brand/wordmark-reversed.svg">
  <img src="docs/assets/brand/wordmark.svg" width="330" alt="TurnRight">
</picture>

# Campus maps, made together

TurnRight brings campus mapping, building authoring, and public navigation into one application. Small teams can import spatial data, edit a shared draft, investigate quality issues, obtain independent approval, and publish maps that visitors can download for offline use.

[Explore the map](https://turnright.vercel.app/) · [Team workspace](https://turnright.vercel.app/admin) · [Documentation](docs/README.md) · [Contributing](CONTRIBUTING.md)

> TurnRight is an independent project, not an official university service. Routes have not been field-verified; mapped approaches and building models do not establish entrance access or accessibility.

## See TurnRight in action

### Explore a campus

Search destinations, inspect 3D buildings and photographs, choose between walking or driving routes, and get GPS-enabled turn-by-turn directions. LASU Ojo and UNILAG Akoka have independent published packages and offline downloads.

| Desktop map | Phone view |
| --- | --- |
| ![Desktop campus map with search and navigation](docs/assets/screenshots/redesign-public-desktop-2026-10-07.png) | <img src="docs/assets/screenshots/redesign-public-mobile-2026-10-07.png" width="260" alt="Campus place details in a phone browser viewport"> |

### Map and maintain

Five workspaces follow the team workflow: **Data → Edit → Analyze → Review → Publish**. Resizable panes keep the map, feature explorer, properties, and attribute table in predictable places. The workspace remembers your layout; focus mode and compact mobile sheets make room for the task at hand.

On phones, drag the editing panel's top handle to adjust its height. Keyboard resizing and remembered sizes are included. [Editor layout](docs/EDITOR-LAYOUT.md).

| Map editing | Structured data |
| --- | --- |
| ![Map editor with contextual navigation and docked panes](docs/assets/screenshots/redesign-editor-desktop-2026-10-07.png) | ![Data workspace with dataset catalogue, map and attribute table](docs/assets/screenshots/redesign-gis-data-2026-10-07.png) |

### Model buildings and prepare photographs

Work with footprints, roofs, façades, surface text, curves, and meshes. Compare models with photographic references. Crop, adjust, redact, resize, and compress photographs locally before attaching them to campus work.

| Building authoring | Photo comparison |
| --- | --- |
| ![Building model beside its photographic reference](docs/assets/screenshots/redesign-model-desktop-2026-10-07.png) | ![Local image comparison with file and compression controls](docs/assets/screenshots/redesign-photo-desktop-2026-10-07.png) |

### Review and publish deliberately

Keep external map data current in **Review → Source updates**. Check connected sources, compare readable changes against the map, and accept or reject selected rows or all matching results. Bulk decisions continue in the background, preserve editor corrections, and remain separate from publication. [Source update guide](docs/SOURCE-UPDATES.md).

Choose **Preview all matching changes on map** to inspect the entire filtered inbox across pages. The read-only overlay distinguishes additions, changes and removals, with optional previous shapes and click-through comparisons.

| Source inbox and map comparison | Bulk confirmation on a phone |
| --- | --- |
| ![Source updates inbox beside a labelled source outline and retained editor correction](docs/assets/screenshots/source-updates-desktop-2026-10-11.png) | ![Phone confirmation with a fixed selection count, geometry warning and removal acknowledgement](docs/assets/screenshots/source-updates-confirm-mobile-2026-10-11.png) |

These October 11 captures use 101 synthetic proposals and isolated decisions. [Capture record](docs/assets/screenshots/source-updates-2026-10-11.json).

| Preview all matching changes | Adjustable phone editor |
| --- | --- |
| ![Source proposals across the campus with before and after outline controls](docs/assets/screenshots/source-map-preview-desktop-2026-10-11.png) | <img src="docs/assets/screenshots/editor-adjustable-panel-mobile-2026-10-11.png" width="260" alt="Expanded phone editing panel with a keyboard-accessible drag handle"> |

These local fixture views demonstrate the map preview and saved panel sizing. [Capture record](docs/assets/screenshots/source-map-preview-2026-10-11.json).


Resolve map-linked issues, submit immutable content, and obtain approval from someone who did not contribute to it. Publish an approved preview or submit historical content for renewed review.

Accepted sources already form the working baseline. For connection recovery and the accepted-updates → review → preview workflow, see [editor availability](docs/EDITOR-AVAILABILITY.md).

| Independent review | Publication |
| --- | --- |
| ![Quality checks and immutable review submissions](docs/assets/screenshots/redesign-gis-review-2026-10-07.png) | ![Approved snapshots, releases and map export controls](docs/assets/screenshots/redesign-gis-publish-2026-10-07.png) |

[More layouts and workflows](docs/SCREENSHOTS.md) · [Capture provenance](docs/assets/screenshots/README.md)

Screenshots illustrate the local application with published campus assets and isolated demonstration accounts/API responses. Phone views are browser simulations. Demonstration counts and edits are not production inventories or performance measurements; published deployment status is recorded separately in [Production](docs/PRODUCTION.md).

## What you can do

- **Manage spatial data:** import common GIS formats, configure typed attributes, filter and page datasets, retain source provenance, and export GeoJSON, CSV, or GeoPackage.
- **Edit and analyze:** author geometry with undo and recovery; run buffers, overlays, joins, measurements, and other bounded spatial operations.
- **Coordinate a team:** use campus-scoped roles, assignments, evidence, validation, independent approval, and an audit trail.
- **Publish useful maps:** style layers, preview approved releases, export A4/A3 maps, and distribute separately verified campus packages.
- **Navigate on site:** find places, plan walking/driving journeys, use foreground GPS and spoken guidance, and reopen downloaded campuses offline.

Server queries, team synchronization, analysis, and publication need a connection. Prepared personal editing and image recovery have separate offline support. There is no cross-campus routing, indoor navigation, or verified step-free guarantee. See [supported workflows and limits](docs/GIS-PLATFORM.md).

## Run locally

Prerequisite: **Node 22.23.3**, pinned in `.node-version` and `.nvmrc`.

```sh
cd web
npm ci
npm run dev
```

The public map runs without credentials. Vite does not emulate the private Vercel APIs. Team authentication, imports, database queries, analysis, and publication require the [deployment configuration](docs/DEPLOYMENT.md). Keep service credentials out of `VITE_*` variables and Git.

Typical checks, from `web/`:

```sh
npm test -- --maxWorkers=2
npm run lint
npm run check:configured-build
npm run test:browser
```

See [Contributing](CONTRIBUTING.md) for focused browser checks, offline verification, native GIS requirements, and documentation maintenance.

## Find your guide

| I want to… | Start here |
| --- | --- |
| Understand the complete team workflow | [Campus GIS platform](docs/GIS-PLATFORM.md) |
| Learn the editor, panes, and shortcuts | [Editor guide](docs/EDITOR.md) |
| Import campus data | [Campuses and imports](docs/CAMPUS-IMPORTS.md) |
| Check sources and review many updates | [Source updates and bulk review](docs/SOURCE-UPDATES.md) |
| Build and review a model | [Unified model editor](docs/UNIFIED-MODEL-EDITOR.md) |
| Edit and compress photographs | [Photo editing](docs/PHOTO-EDITING.md) |
| Understand the code and data flow | [Architecture](docs/ARCHITECTURE.md) |
| Configure and operate a deployment | [Deployment](docs/DEPLOYMENT.md) and [Configuration](docs/CONFIGURATION.md) |
| Check measured limits and verification | [Performance](docs/PERFORMANCE.md), [Acceptance](docs/ACCEPTANCE.md), [Production](docs/PRODUCTION.md) |

## Architecture at a glance

React and TypeScript power the PWA; MapLibre provides the shared campus map and Three.js supports building authoring. Supabase/PostGIS stores scoped team data and review records. Vercel serves the app/API, while isolated workers and GitHub Actions handle processing and release gates.

Public packages and private drafts are distinct. Application deployments preserve published campus content; data becomes public through the reviewed publication workflow. Arbitrary dataset attributes remain private until explicitly selected for publication.

| Directory | Purpose |
| --- | --- |
| `web/src` | Public app and editor workspaces |
| `web/api`, `web/server` | Authentication, data, processing, review, publication |
| `web/tests` | Unit, database, browser, and offline checks |
| `scripts` | Import, processing, packaging, and verification tooling |
| `supabase/migrations` | Additive database migrations |
| `data`, `docs` | Attributed sources, guides, and dated evidence |

## Contributing and attribution

Start with [Contributing](CONTRIBUTING.md). Changes should preserve campus identities, provenance, private attributes, recovery, independent review, and existing resource budgets.

Software licensing terms have not been declared in a root licence file. Data, photographs, codecs, and other assets have their own terms: consult [data attribution](data/ATTRIBUTION.md), [photo records](data/photos/README.md), and in-app credits. OpenStreetMap-derived data retains ODbL attribution; authorization to publish a source does not automatically grant broader reuse rights. [Brand assets and usage](docs/BRAND.md).
