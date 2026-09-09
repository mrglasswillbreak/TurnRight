# TurnRight

**Find your way around LASU Ojo — online or offline.**

TurnRight is a campus walking-navigation PWA for Lagos State University, Ojo. Explore places, compare mapped walking routes, and follow spoken directions using your device's GPS and a downloaded campus map. Search, routing, location processing, and navigation audio run on the device.

[Open TurnRight](https://turnright.vercel.app/) · [Owner editor](https://turnright.vercel.app/admin) · [Deployment guide](docs/DEPLOYMENT.md) · [Report a software issue](https://github.com/mrglasswillbreak/TurnRight/issues)

![TurnRight desktop campus explorer in Light mode](docs/assets/screenshots/desktop-explore.jpg)

> **Project status:** Public personal-project release. The map is derived from published sources and reviewed access corrections; campus routes have **not been field-verified**. Some destinations have only a nearby mapped approach, and confirmed entrance connections are still missing. TurnRight is an independent, non-commercial project, not an official LASU service.

## Contents

- [Screenshots](#screenshots)
- [Features](#features)
- [Quick start](#quick-start)
- [Using TurnRight](#using-turnright)
- [Offline operation and updates](#offline-operation-and-updates)
- [Technology and architecture](#technology-and-architecture)
- [Map data and coverage](#map-data-and-coverage)
- [Administration and publication](#administration-and-publication)
- [Configuration and hosting](#configuration-and-hosting)
- [Development and verification](#development-and-verification)
- [Repository structure](#repository-structure)
- [Troubleshooting](#troubleshooting)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Attribution and licensing](#attribution-and-licensing)

## Screenshots

**Desktop route preview in Dark mode:** a manually selected Clinic-to-Senate walk with two alternatives.

![Dark campus map with a blue walking route and route alternatives](docs/assets/screenshots/desktop-route-dark.jpg)

| Mobile place details | Device appearance settings |
| --- | --- |
| <img src="docs/assets/screenshots/mobile-place.jpg" width="300" alt="Mobile Senate Building details showing directions and the unverified entrance notice"> | <img src="docs/assets/screenshots/appearance.jpg" width="300" alt="Settings with Device appearance selected and the device currently using dark mode"> |

Real browser captures from 9 September 2026. Mobile views use a responsive viewport; they do not represent completed physical-device or campus tests. [Capture details](docs/assets/screenshots/README.md).

## Features

| Area | Implemented behavior |
| --- | --- |
| Campus exploration | Local search, categories, source-supported aliases, saved places, recent selections, readable labels, and place provenance. |
| Walking directions | A* routing in a dedicated worker; shortest permitted walk and up to two sufficiently different alternatives when available. |
| Navigation | Foreground GPS tracking, next maneuver, remaining distance, ETA, instruction list, recentering, map following, north-up orientation, sustained-deviation rerouting, and arrival detection. |
| Spoken guidance | 19 packaged English maneuver/distance clips, mute, repeat, and optional device-local speech for place names. |
| Appearance | Device light/dark preference by default, live system changes, persistent Light/Dark overrides, and an accessible three-option selector. |
| Map display | 2D by default; optional 3D where measured heights or documented floor counts exist. Floor-derived heights are approximate; unknown heights remain flat. |
| Offline maps | Verified resumable downloads, content-hash reuse, atomic activation, version/coverage information, storage checks, and explicit updates. |
| Student reports | Place or pin reports with a category and description; private server submission, spam controls, and device-local offline drafts. |
| Owner editor | GitHub login with one allowlisted administrator, visual geometry/vertex editing, explicit path connections, undo/redo, saved drafts, closures, and route previews. |
| Data maintenance | Daily/on-demand source imports, change review separate from corrections, immutable releases, preview/publish/rollback, and backup export. |

Driving, cycling, indoor positioning, satellite imagery, background navigation, public user accounts, and reviews are outside this release.

## Quick start

### Requirements

- **Node.js 22.13 or later within the 22.x line**, matching the project's supported engine.
- npm and Git.
- A browser with WebGL for the map. Use HTTPS or localhost for service workers and device location.
- Python 3.12+ if you will run source imports or Python tests.

### Start development

```sh
git clone https://github.com/mrglasswillbreak/TurnRight.git
cd TurnRight/web
npm ci
npm run dev
```

Open the URL printed by Vite, normally [localhost:5173](http://localhost:5173). The included campus package works immediately for public exploration and route previews. **No API keys are required for that local experience.**

### Test the production PWA locally

From `web/`:

```sh
npm run build
npm run preview
```

Open [127.0.0.1:4173](http://127.0.0.1:4173), select **Offline → Download campus map**, and wait for **Ready offline**. Use this production build to test service-worker caching and offline reopening; the development server does not provide the production offline lifecycle.

Vite's local servers do not serve the Vercel `/api` functions. Use a configured Vercel preview for connected administration and report submission. For physical-phone GPS/PWA checks, use the HTTPS deployment; an ordinary LAN HTTP address is not equivalent to localhost's secure-context exception.

## Using TurnRight

1. **Explore:** search for a building, faculty, service, or other campus place; use categories to narrow the results.
2. **Check the place:** review its source and walking coverage. Save it locally or report a missing path, entrance, or incorrect detail.
3. **Preview a route:** select Directions, then choose your current location or a manual starting place. Compare the available walking alternatives and entrance notices.
4. **Start walking:** grant location access and allow audio through the Start walking action. Keep the app visible. Use mute/repeat, recenter, or the instruction list as needed.

Poor or stale location fixes pause maneuver progression. Rerouting requires sustained deviation to reduce false wrong turns from GPS jitter. Navigation ends at the mapped endpoint; an approach endpoint is not a surveyed building entrance.

### Appearance

Open **Settings → Appearance**:

| Option | Behavior |
| --- | --- |
| **Device** — default | Follows the browser's `prefers-color-scheme` setting and reacts when the device changes between Light and Dark. |
| **Light** | Keeps the interface and map light until you choose another option. |
| **Dark** | Keeps the interface and map dark until you choose another option. |

The choice survives reopening and works offline. Existing explicit light/dark choices are retained during migration. Choosing Device resumes automatic detection. The application applies appearance before React renders, updates browser theme colors, and recolors the map without recreating it or resetting the current view. Preference changes also synchronize between open tabs on the same origin. If storage is unavailable, the current session still works and a failed save is reported.

### Install on a phone

- **Android Chrome:** open the HTTPS app and use the browser's Install app option when available.
- **iPhone Safari:** open the HTTPS app, choose Share, then Add to Home Screen.

Installation and map download are separate steps. Install the app, complete its offline download, and verify Ready offline before relying on it without a connection. Physical-device installation and live GPS acceptance checks remain listed in [ACCEPTANCE.md](docs/ACCEPTANCE.md).

## Offline operation and updates

An initial online visit and completed download are required. TurnRight stores two complementary parts:

| Stored content | Mechanism | Measured size, 9 September 2026 |
| --- | --- | --- |
| Application shell, styles, icons, interface fonts, map/routing workers | Workbox service-worker precache | Approximately **2.46 MiB**, uncompressed build assets |
| Campus geometry, search fields, routing graph, closures, map glyphs, audio manifest and recordings | CacheStorage assets with IndexedDB package records | **3.00 MiB** — 3,148,440 bytes across 22 assets |

The campus package is `lasu-44f8af5654f1`. Transfer size and browser storage usage differ with compression and browser overhead. No external tile service or satellite imagery is needed.

- **Download safely:** required files are size/hash verified before the active package changes. Interrupted or corrupt updates retain the working version; valid existing files can be reused.
- **Choose updates:** opening or reconnecting checks release metadata. A known newer map is displayed for review and download; it is not silently installed.
- **Keep a walk stable:** a downloaded update waits until active navigation ends. Application updates that require reloading are also delayed during a walk.
- **Know the limits:** offline devices only know closures contained in their downloaded package. Check its date and any newer-release notice before a walk.
- **Recover storage:** the app requests persistent storage where supported, detects missing/evicted assets, and offers retry or deletion controls. Browser storage permission is not a guarantee against eviction.
- **Keep reports as drafts:** reports saved offline remain local until you explicitly submit them online. Reconnecting does not submit them automatically.

## Technology and architecture

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Interface | React 19, TypeScript, Vite 8, Tailwind CSS 4, shadcn/Base UI | Responsive application, accessible controls and dialogs |
| Map | MapLibre GL JS 6, locally packaged GeoJSON vector layers | Campus geometry, labels, routes and optional extrusions |
| Routing | Dedicated Web Worker, A* and bounded alternative generation | Local graph search without blocking the interface |
| Offline storage | Workbox, `vite-plugin-pwa`, IndexedDB, CacheStorage | App shell, verified packages, local preferences and drafts |
| Navigation audio | Web Audio and optional local Web Speech voices | Packaged instructions without an online speech service |
| Visual editor | Terra Draw with the MapLibre adapter | Geometry drawing, vertex editing and explicit connections |
| Hosting/API | Vercel Hobby | Public application, immutable packages and small server endpoints |
| Administration | Supabase Auth, PostgreSQL/PostGIS, row-level security | Owner identity, approved sources, private corrections, reports and releases |
| Data jobs | GitHub Actions, Python and Node.js scripts | Imports, comparison, validation, package builds and deployment |

```mermaid
flowchart LR
    Sources[OSM and permitted ArcGIS data] --> Imports[Import and compare]
    Imports --> Review[Owner review and corrections]
    Review --> Release[Validate, preview and publish]
    Release --> CDN[Vercel app and immutable packages]
    CDN --> Device[Browser and offline storage]
    Device --> Local[Local search, routing, GPS and audio]
    Device -->|Explicit online report| API[Validated private API]
    API --> Admin[Supabase private records]
    Admin --> Review
```

Published navigation does not depend on Supabase being available. GPS processing stays on the device. Report submissions send the selected pin/place and entered description; administrative data is private. Appearance is persisted in IndexedDB with a small localStorage mirror so the first paint can use the saved setting. See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for thresholds, schema boundaries, storage transactions and authorization details.

## Map data and coverage

The map combines **OpenStreetMap** with the **LASU ArcGIS campus layers**. Original source IDs and access tags are retained alongside administrator corrections. A source modification date is not a field-survey date. An [Overture comparison](docs/OVERTURE-COMPARISON.md) did not identify useful additional campus walking geometry in the audited release.

Current checked-in coverage for `lasu-44f8af5654f1`:

| Metric | Count / status |
| --- | --- |
| Source place records, including duplicates awaiting review | 219 |
| Places with a mapped approach | 206 |
| Approaches on the largest connected path component | 190 |
| Places without a mapped approach | 13 |
| Confirmed connected entrances | **0** |
| Disconnected path components | 8 |
| Directed segments excluded for building/barrier conflicts | 166 |
| Existing internal roads enabled by the owner's student-access confirmation | 62 |
| Campus field verification | **Pending** |

A **mapped approach** ends on an existing source path near a place. It does not draw an assumed final connection through a fence, building, or unmapped area. A destination can have an approach yet remain disconnected from the chosen origin.

The student-access correction applies to reviewed ordinary internal roads. Private driveways, parking aisles, explicit no-walking restrictions, barriers, and closures remain excluded; it does not grant unrestricted public campus access. See [CAMPUS-ACCESS.md](docs/CAMPUS-ACCESS.md) and the [machine-readable coverage report](data/coverage-report.json).

Priority survey work includes gate connections, building entrances, disconnected sections near the Faculty of Law and International Library, conflicting source geometry, and duplicate place records. Report and review missing connections before publishing them.

## Administration and publication

The [owner editor](https://turnright.vercel.app/admin) requires the single allowlisted GitHub account. Both database policies and backend endpoints enforce access. Anonymous visitors cannot read drafts, reports, or administrative records, and submitted reports cannot change routes.

The workflow is **review → validate → preview → publish**:

1. Import source candidates daily or through **Check now**. Failed/incomplete imports retain the last successful dataset; candidates do not overwrite approved data.
2. Review additions, removals, geometry changes, and conflicts. Administrator corrections remain separate from imported source records.
3. Edit places, outlines, entrances, paths, barriers, restrictions, or closures. Connect path endpoints explicitly, save drafts, and preview routes.
4. Validate an approved revision and create an immutable package/deployment preview.
5. Review the preview and publish it. Success is recorded only after deployment and production promotion succeed. Retain the preceding release for rollback and export approved data/correction history for recovery.

Closures remain active until explicitly reopened and republished. An expected reopening date creates an overdue-review flag; it never reopens a route automatically.

| Workflow | Trigger / purpose |
| --- | --- |
| `source-update.yml` | Daily at 02:17 UTC or on demand; imports and queues source changes |
| `release.yml` | Reviewed release preview, publication and rollback |
| `preview.yml` | Manual seed-based preview deployment |
| `bootstrap.yml` | One-time accepted source baseline; refuses to overwrite an existing baseline |

For a local source refresh, run from the repository root:

```sh
python scripts/import_campus.py --download --output data/candidates
```

This writes candidates; it does not publish them. `node scripts/package.mjs` builds the checked-in seed package for development. Production map changes use the reviewed release workflow. See the architecture and deployment guides before changing the data pipeline.

## Configuration and hosting

Public local exploration needs no credentials. For connected administration and reports, start with [web/.env.example](web/.env.example) and follow [DEPLOYMENT.md](docs/DEPLOYMENT.md), including the Supabase migrations, GitHub OAuth callback, administrator allowlist, workflow secrets and redirect URLs.

| Variables | Scope / purpose |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Browser-visible Supabase URL/public key for authentication; security depends on RLS and endpoint checks |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_USER_ID` | Server-only database access and administrator identity |
| `GITHUB_REPOSITORY`, `GITHUB_WORKFLOW_TOKEN` | Server-side workflow dispatch configuration |
| `REPORT_RATE_SALT` | Server-only salt for report rate-limit buckets |
| `SOURCE_REDISTRIBUTION_APPROVED` | Build-time rights gate; set only when source redistribution is authorized |
| `PUBLISHED_MAP_URL` | Build-time stable HTTPS origin used to preserve the currently published map during ordinary app builds |

Never put privileged keys in a `VITE_` variable or commit real environment files. The setup guide lists the additional GitHub Actions deployment secrets separately. Keep credentials in the hosting providers' secret stores.

Current Vercel settings use **`web` as the root directory**, **Node 22**, `npm run build`, and `dist` output, with repository files outside the root available to the build. Git changes on `main` drive application deployments. Documentation-only changes may be skipped by Vercel's monorepo detection. The project's configuration and publication history are recorded in [CONFIGURATION.md](docs/CONFIGURATION.md) and [PRODUCTION.md](docs/PRODUCTION.md).

`PUBLISHED_MAP_URL` is configured for code deployments so a new UI build does not revert approved map data to the seed. It fetches and verifies published assets and fails safely if they cannot be obtained. Updating seed files alone is not a replacement for an editor-reviewed production map release.

This project uses free plans without paid overages. Vercel Hobby is limited to personal, non-commercial use; quota exhaustion can interrupt service. Supabase Free may pause inactive projects. Published/downloaded navigation remains independent of the administrative database. Check the current [Vercel Hobby terms](https://vercel.com/docs/plans/hobby) and [Supabase Free plan](https://supabase.com/pricing) before changing the project's use or hosting configuration.

## Development and verification

Run frontend checks from `web/`:

```sh
npm test
npm run lint
npm run build
```

Run importer/access-policy tests from the repository root:

```sh
python -m unittest discover -s scripts/tests -v
```

| Command, from `web/` | Purpose |
| --- | --- |
| `npm run dev` | Vite development server |
| `npm test` | Vitest regression suite |
| `npm run lint` | TypeScript frontend/API checks and Oxlint |
| `npm run build` | Preserve/package data, type-check, compile server imports, build application and service worker |
| `npm run preview` | Serve the production build locally |
| `npm run package` | Regenerate the campus package from the checked-in seed |
| `npm run format -- <path>` | Format selected files with Oxfmt; keep formatting changes focused |

**Verification recorded on 9 September 2026:** 56 Vitest tests across eight files and five Python tests pass. Production build and API compilation pass. Lint has no errors, with eight existing explicit-any warnings. Coverage includes routing/access/closures, alternatives, GPS jitter/staleness/arrival, editor connections, import conflicts, offline transactions/storage failures, private API boundaries, release success gates, and 14 appearance cases.

Appearance checks include device changes, explicit overrides, migration, reopening, cross-tab synchronization, delayed storage hydration, storage failures, and startup-script behavior. Browser checks cover persisted Light mode, returning to Device/Dark, an open route reacting to a change in another tab, and the 390 × 844 settings layout. Automated system-change events do not replace physical OS/device checks.

Earlier offline browser checks exercised cold reopening with the origin server stopped, search, worker routing, alternatives, and recorded audio. Physical Android/iPhone installation, airplane-mode navigation, live GPS, modest-phone performance, representative campus walks, and deliberate wrong turns remain acceptance work. [ACCEPTANCE.md](docs/ACCEPTANCE.md) separates completed evidence from outstanding checks.

## Repository structure

```text
TurnRight/
├── web/
│   ├── src/                 # UI, map, routing, GPS, audio, editor and storage
│   │   ├── appearance.ts    # Device preference, overrides and persistence
│   │   ├── useAppearance.ts # React integration for the appearance store
│   │   └── sw.ts            # Application service worker
│   ├── api/                 # Vercel admin and report endpoints
│   ├── server/              # Server-only validation and authorization
│   ├── tests/               # Regression tests
│   ├── public/              # Packaged map/assets served with the app
│   └── .env.example         # Configuration template without credentials
├── data/                    # Seed, access corrections, attribution and coverage
├── scripts/                 # Import, compare, validate, package and release jobs
├── supabase/migrations/     # Database schema, policies and API grants
├── .github/workflows/       # Source and release automation
└── docs/                    # Setup, architecture, acceptance and screenshots
```

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| “A walking connection for this place has not been mapped” | The destination lacks a supported connection, or its component is disconnected from the origin. Report the actual missing path/entrance and review an explicit editor connection. Do not remove restrictions globally or draw an assumed shortcut. |
| App does not follow the device's appearance | Select **Settings → Appearance → Device**. An explicit Light/Dark choice intentionally overrides the device. Install a waiting app update if the three-option selector is missing. |
| Map will not reopen offline | Use a production PWA build, complete the download, and confirm Ready offline. Check eviction/storage errors and use the repair/download controls. |
| Location is unavailable or inaccurate | Use HTTPS, grant the site's location permission, keep the app visible, and move outdoors. A manual origin still supports route previews. |
| No spoken place name | Names need an available local English voice. Packaged maneuver clips work independently; check mute and device volume, then use Test spoken directions. |
| Local `/admin` or report submission fails | Vite does not host the Vercel API. Use a configured hosted preview and check environment variables, session and administrator allowlist. |
| Import/build/publish fails | Inspect the editor's job/release error and the GitHub/Vercel logs. Resolve the failed source, credentials, validation, or quota issue; do not mark a failed deployment published. |
| Git push succeeds but the approved map is unchanged | App deployments preserve the published package. Review, validate and publish map changes through the release workflow. |

## Documentation

| Guide | Contents |
| --- | --- |
| [Architecture](docs/ARCHITECTURE.md) | Device flow, storage, routing thresholds, data model and security boundaries |
| [Deployment](docs/DEPLOYMENT.md) | Reproducible Vercel, Supabase, GitHub OAuth and workflow setup |
| [Acceptance](docs/ACCEPTANCE.md) | Automated/browser evidence, physical-device checklist and field-survey log |
| [Configuration record](docs/CONFIGURATION.md) | Configured services and operational setup record |
| [Production record](docs/PRODUCTION.md) | Publication history, deployment and package verification |
| [Campus access](docs/CAMPUS-ACCESS.md) | Reviewed student walking correction and remaining path gaps |
| [Overture comparison](docs/OVERTURE-COMPARISON.md) | Additional-data audit and access findings |
| [Source attribution](data/ATTRIBUTION.md) | Map, font and audio provenance and redistribution status |
| [Coverage report](data/coverage-report.json) | Machine-readable baseline coverage metrics |

## Contributing

Use [GitHub issues](https://github.com/mrglasswillbreak/TurnRight/issues) for reproducible software defects and feature proposals. Include the app/package version, browser/device, steps, and expected versus actual behavior. Use the in-app report flow for a specific campus place or path so it reaches the private review queue.

Keep pull requests focused, run checks appropriate to the change, and include screenshots for interface changes. Map contributions need stable feature IDs where available, provenance, redistribution permission, and evidence for paths/access/entrances. Preserve existing corrections and explicitly mark unsurveyed geometry. Do not submit credentials or private report contents to the public repository.

## Attribution and licensing

- **OpenStreetMap:** © OpenStreetMap contributors, ODbL 1.0. The downloadable campus JSON contains the OSM-derived database. [OSM attribution and license](https://www.openstreetmap.org/copyright).
- **LASU ArcGIS layers:** MangroveandpartnersLimited. The TurnRight owner confirmed offline redistribution permission on 8 September 2026; the public ArcGIS item itself supplied no explicit redistribution license. The confirmation is recorded in [ATTRIBUTION.md](data/ATTRIBUTION.md) and is not a general license grant for unrelated uses.
- **Fonts:** Inter under the SIL Open Font License; Open Sans map glyphs under Apache 2.0. Navigation recordings were generated locally; source and regeneration details are recorded in the attribution file.

No standalone source-code license has been selected in this repository. Do not assume an MIT or Apache license for TurnRight's own code; third-party components and datasets retain their respective terms. No Google Maps content, satellite imagery, or externally hosted rendered map tiles are bundled.
