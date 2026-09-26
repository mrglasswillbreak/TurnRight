# Application screenshots

## Multi-campus addition · 26 September 2026

Nine `campus-*-2026-09-26.png` captures cover the directory, creation/boundary preview, source selection, field mapping, preview/review, phone landscape, public switcher, per-campus offline controls and the corrected dark-theme import form. They are unaltered Chromium captures with isolated owner/import API responses. The original eight use checked-in LASU `lasu-4e4c8008b38b` geography; `campus-dark` uses the small automated campus fixture. Second-campus names, counts and URLs are illustrative. No private account, uploaded file or production draft is exposed; no second production campus is implied.

Regenerate from `web/` with `UPDATE_CAMPUS_SCREENSHOTS=true npx playwright test campus-imports.spec.ts` (PowerShell: set `$env:UPDATE_CAMPUS_SCREENSHOTS='true'` first). `--grep 'readable headers'` refreshes just the dark form. Review every image after capture. Offline captures show controls, not proof of a disconnected session. The root README includes **55 distinct screenshots**: the existing 46-image model/navigation gallery plus these nine campus views.


## Current application gallery · 26 September 2026

The gallery shows the current reference-editing, globe and authored-model
workspace alongside the existing public-map and owner workflows. Published model
compatibility remains covered by the frozen legacy regression fixtures.

The complete production-build gallery was rerun after runtime revision
`e610644` on 26 September. Public views now show the globe campus chooser beside
search, with no floating button over navigation. Owner views include the
Campuses entry. The capture workflow passes; screenshot review includes desktop,
portrait, landscape and both themes. These captures retain the same published
campus and isolated owner data described below.

Before the campus-import additions above, the root README contained **46 distinct,
unaltered PNG screenshots**. This production-build gallery uses verified campus
**`lasu-7343cb96c9a5`**: 395 buildings, 220 places, 39 photographs covering 19
buildings, and 84 package assets totaling 20,228,832 bytes. Owner/API responses are
isolated. No production account, private upload, survey or draft is captured or
modified. Windows, lettering, curved boundaries and mesh objects added in editor
captures are illustrative local examples, not published architectural evidence.

Eight additions, also dated `2026-09-26`, cover the current extension. `reference-editing` uses the production gallery and an approved campus photograph at 1920×1080. The other seven are unaltered Chromium regression captures from the current source with isolated fixtures: `animated-globe`, `curved-wall-outline`, `add-wall-courtyard`, `mesh-editing`, `mesh-orbit`, `model-import-preview`, and `model-export`. The fixture building has intentionally simple geometry so its editing handles and commands are visible. The globe is a still of the animated layer; motion is checked separately by the browser workflow.

The 26 filename prefixes listed in the earlier inventory below have all been refreshed with the current UI and campus. Twelve additional captures, all ending in `-2026-09-26.png`, cover:

| Filename prefix | Current view |
| --- | --- |
| `editor-model-wall-text` | Wall lettering with wording and size controls |
| `editor-model-roof-text` | Roof lettering and properties |
| `editor-model-tree-actions` | Nested structure, selected window and Ungroup |
| `editor-model-orbit-current` | Orbit restored after surface editing |
| `editor-model-landscape` | Model beside one editing panel at 844 × 390 |
| `editor-sources-current` | Source review and baseline status |
| `editor-releases-current` | Model review blockers before publication |
| `editor-survey-current` | Survey workspace before recording |
| `editor-model-window-instance` | One window edited independently, with unchanged neighbours |
| `editor-model-bulk-review` | Building Review and Mark all as reviewed |
| `public-building-actions` | Directions and place actions before credits and arrival options |
| `editor-public-building-handoff` | Selected public building opened in its general editing card |

The building card now shows one Edit model button and a read-only summary. The desktop workspace opens in Orbit. Roof and footprint captures use surface-aligned editing; mobile uses the same Edit surface control, with an automatic 2D renderer fallback when needed. Normal editor opacity is 100%; property headers remain outside the scrolling desktop form. Desktop images are 1440 × 1000, desktop globe 1440 × 900, portrait 390 × 844, and landscape 844 × 390. Public screens block service workers to avoid an older installed UI. The offline screenshot shows download controls, not proof of a disconnected session. Walking previews use a manual Clinic origin without GPS; the survey screenshot does not start recording.

### Capture the current gallery

From `web/`, use Node 22 and installed dependencies. Fetch and verify the public manifest and its assets with `preservePublished('work/model-benchmark/public', 'https://turnright.vercel.app', true)` from `scripts/published-assets.mjs`, then run:

```sh
npx playwright test --config playwright.docs.config.ts
```

The project builds a local production app, supplies isolated owner responses and serves the verified campus. Screenshot paths resolve against the repository regardless of the shell working directory. Run it separately from other GPU browser suites. `TURNRIGHT_DOCS_EDITOR_ONLY=1` refreshes owner views; `TURNRIGHT_DOCS_ROUTES_ONLY=1` refreshes walking previews. Inspect the actual images and update provenance after recapture. Use a new date for a later capture. These Chromium/SwiftShader screenshots do not replace physical-phone, native-keyboard or screen-reader acceptance. See [current verification](../../MODEL-EDITOR-VERIFICATION.md).

## Earlier capture records

The records below describe earlier capture runs. Their counts, package versions and workflow labels are historical. The current gallery above supersedes the 25 September 34-image gallery and earlier runs. Their dated files remain as archives. Earlier `editor-model-3d-hold`, `editor-release-review-*` and `public-globe-location` files remain regression archives and are excluded from the current README gallery.

The additional `editor-model-landscape-2026-09-25.png` (844 × 320) and `editor-model-3d-hold-2026-09-25.png` (740 × 390) captures show the current Close button, landscape side tools and touch-held 3D actions. They are unaltered Chromium development-server regression captures of an isolated Library fixture, with no private owner content. Run the `landscape model has` and `3D touch hold` browser journeys, then copy their `landscape-reviewed.png` and `3d-long-press-actions.png` test outputs after inspection. The earlier 26-image production-build gallery is retained.

`public-globe-location-2026-09-25.png` shows the live location label and facing cone with **simulated** GPS and orientation, using the real globe renderer and isolated public place fixture. Reproduce with the `globe retains live` browser journey and its `globe-live-location.png` output. It is a UI regression capture, not field-location or sensor-accuracy evidence. Together these three additions bring the README to 29 distinct captures without removing the earlier views.

The additional `editor-release-review-390-2026-09-25.png` and `editor-release-review-1440-2026-09-25.png` captures show named model-release blockers using the isolated Library browser-test fixture. They are development-server regression captures, not production-campus evidence. Regenerate with `TURNRIGHT_CAPTURE_RELEASE=1` and the `release preflight opens` browser tests. The 26 varied production-build README images below remain intact.

## Earlier 26-image gallery record

That README revision contained **26 distinct unaltered PNG captures** from production builds, using published snapshot **`lasu-313d8a168635`**, SHA-256 `b2927184603beeeefdbb96bc42d4460e46f05ec3a8f58f8238a70b383201954c`. There are 395 buildings, 220 places and 39 photographs. The owner/API fixtures are isolated: no production account, private upload, survey or draft is captured or modified. Model examples include local illustrative detail edits; they are not a newly published building design.

All current public and owner views are captured by `web/playwright.docs.config.ts`, including the eight focused mobile model views. Public screenshots block service workers to avoid an older installed UI. Offline-download screenshots show the actual interface state, not proof of a disconnected session. Separate production PWA journeys verify preparation and offline reloads.

| Filename prefix (all end `-2026-09-25.png`) | View |
| --- | --- |
| `public-place-desktop-current` | Campus and Senate destination, Light |
| `public-panel-resized-current` | Same destination with shortened panel |
| `public-map-mobile-current` | Compact campus map |
| `public-place-mobile-current` | Destination and gallery |
| `public-settings-mobile-current` | Public settings |
| `public-offline-mobile-current` | Package status and download controls |
| `public-globe-desktop-current` | Illustrated globe, Light |
| `public-globe-mobile-current` | Illustrated globe, Dark |
| `public-route-desktop-current` | Manual Clinic–Senate walking route, Dark |
| `public-route-mobile-current` | Mobile walking preview; no GPS navigation started |
| `editor-workspace-current` | Explorer and 3D campus |
| `editor-building-current` | Building inspector and gallery at the top |
| `editor-building-mobile-current` | Compact building inspector |
| `editor-settings-mobile-current` | Owner view settings |
| `editor-photos-current` | Visual photo manager |
| `editor-roof-current` | Integrated roof mode |
| `editor-outline-current` | Geographic outline mode |
| `unified-model-desktop` | Measured canvas, hierarchy, model and photo |
| `editor-model-canvas-mobile` | Canvas, selected detail and explicit Move/Resize actions |
| `editor-model-actions-mobile` | Selection menu with commands and shortcuts |
| `editor-model-properties-mobile` | Precise dimensions and focused edit sheet |
| `editor-model-height-mobile` | Whole-building height/floors inside Appearance |
| `editor-model-roof-mobile` | Central geographic roof plan |
| `editor-model-outline-mobile` | Outline plan in Light appearance |
| `editor-model-photo-mobile` | Shared building photograph and independent zoom |
| `editor-model-review-mobile` | Targeted review sheet |

Desktop application views are 1440 × 1000, the desktop globe is 1440 × 900 and mobile views are 390 × 844. Walking previews use a manual Clinic origin with no active GPS navigation; their camera and panel are adjusted to show the route and approach notice. These are Chromium/SwiftShader browser captures, not physical-phone or human screen-reader tests. Images contain the application's own labels, credits and theme colours; no interface elements are composited or removed.

### Reproduce

From `web/`, use Node 22 and installed project dependencies:

```sh
npx vite build --config vite.performance.config.ts
node scripts/benchmark-mobile-model.mjs --prepare
npx playwright test --config playwright.docs.config.ts
```

The benchmark retrieves and verifies the public manifest and all assets into `work/model-benchmark/public`. Its comparison mode needs the documented baseline fixture build; see [the mobile report](../../MOBILE-MODEL-PERFORMANCE.md). The screenshot project itself does not run the timing study. The documentation project builds a separate local production app, supplies isolated owner responses and serves only the verified snapshot assets. Its screenshots overwrite the current filenames; `TURNRIGHT_DOCS_ROUTES_ONLY=1` refreshes only the final two walking previews; `TURNRIGHT_DOCS_EDITOR_ONLY=1` refreshes the owner views. Inspect all captures before updating the README; record a new date if capturing on a later date.

NASA/Natural Earth globe attribution remains in [the source inventory](../../../data/ATTRIBUTION.md). Building photographs retain their public in-app credits and [source identity/rights inventory](../../../data/photo-models/inventory.json). Earlier screenshots below are dated archives and do not describe current controls.

## Archived initial photo workspace and illustrated globe — 24 September 2026

The previous four-image gallery (`public-globe-*-2026-09-24.jpg` and `photo-model-*-2026-09-24.jpg`) used snapshot `lasu-8577d5c85d2c` and the former staged façade form. It is superseded by the current gallery above. Original files remain as historical visual references.

## Archived owner editor — 17 September 2026

Unmodified JPEG captures from application revision **`b69cde0`**, using the real editor in the **Codex in-app browser**. The local preview loaded the checked-in **`lasu-4e4c8008b38b`** campus seed. A temporary development fixture supplied a local sample owner, empty drafts/reports/releases and no source updates. Save/publish requests were disabled in that fixture; no production session or private workspace was opened.

| Image | View | Captured dimensions |
| --- | --- | --- |
| [editor-workspace-desktop-2026-09-17.jpg](editor-workspace-desktop-2026-09-17.jpg) | Dark desktop workspace, explorer, drawing tools and campus in 3D | 1248 × 900 |
| [editor-building-mobile-2026-09-17.jpg](editor-building-mobile-2026-09-17.jpg) | Faculty of Law selected with the compact appearance inspector | 390 × 844 |
| [editor-settings-mobile-2026-09-17.jpg](editor-settings-mobile-2026-09-17.jpg) | Compact mobile Settings in Light mode | 390 × 844 |

To reproduce, use isolated owner/API responses like the existing editor browser-test fixture, serve the current editor and campus seed locally, and open it in the in-app browser. Capture the desktop workspace in 3D. Switch to a 390 × 844 viewport, search for Faculty Of Law, select its building record, and capture the inspector. Open Settings and select Light for the final image. Unknown heights remain labelled illustrative; no feature edits are needed. Remove the temporary fixture and reset the viewport afterward.

## Offline globe — 17 September 2026

Actual, unmodified JPEG captures from the local production PWA in the **Codex in-app browser**, using the new globe interface, the checked-in **`lasu-4e4c8008b38b`** campus package and bundled Natural Earth v5.1.2 world geometry. The preview server was stopped before reloading and capturing both views: geometry and country labels came from the saved app/package. No device GPS or private editor data was used.

| Image | View | Captured dimensions |
| --- | --- | --- |
| [public-globe-mobile-dark-2026-09-17.jpg](public-globe-mobile-dark-2026-09-17.jpg) | Dark globe with compact search dock and the existing side controls | 390 × 844 |
| [public-globe-desktop-light-2026-09-17.jpg](public-globe-desktop-light-2026-09-17.jpg) | Light globe beside the full-height public panel and Back to campus action | 1248 × 900 |

To reproduce: build and serve the production app, install its waiting app update if necessary, finish the campus download, stop the local server and reload. Zoom out, then adjust the wheel/pinch zoom until the entire planet fits. Capture mobile in Dark mode and desktop in Light mode, without changing the world data. These are responsive-browser checks, not physical-device airplane-mode or GPS tests.

## Archived public interface — 17 September 2026

Captured from the local production preview in the **Codex in-app browser**, using application revision **`d37606f`** with the mobile selection, public update-notice and desktop-resizing changes. The images document this application build and its bundled seed; publishing application code does not publish new campus map data.

The map uses the checked-in **`lasu-4e4c8008b38b`** campus seed. The app renders its real React/MapLibre interface in Device appearance, which resolved to Dark on this machine. The Senate Building is labelled with an unknown/illustrative height in this seed; this gallery does not claim that all enhanced model assets are present. No production owner session, private drafts, reports or GPS coordinates from a device were used.

| Image | View | Captured dimensions |
| --- | --- | --- |
| [public-desktop-full-2026-09-17.jpg](public-desktop-full-2026-09-17.jpg) | Full-height desktop destination panel; search, navigation and map controls above its scrolling details | 1248 × 900 |
| [public-desktop-resized-2026-09-17.jpg](public-desktop-resized-2026-09-17.jpg) | The same panel shortened to 548 px using its top handle | 1248 × 900 |
| [public-mobile-map-2026-09-17.jpg](public-mobile-map-2026-09-17.jpg) | Compact bottom search dock; view/compass on the left and zoom/location on the right | 390 × 844 |
| [public-mobile-place-2026-09-17.jpg](public-mobile-place-2026-09-17.jpg) | Destination card resized to 432 px with pinned navigation | 390 × 844 |
| [public-mobile-settings-2026-09-17.jpg](public-mobile-settings-2026-09-17.jpg) | Settings dialog shortened to 440 px | 390 × 844 |
| [public-mobile-update-2026-09-17.jpg](public-mobile-update-2026-09-17.jpg) | The public update-ready notice with an explicit install button | 390 × 844 |

These are unmodified JPEG browser captures: no interface elements were composited, removed or recoloured. The update screenshot uses a real waiting service worker triggered by a comment-only revision to the local built `dist/sw.js`. The original built file was restored after capture; no application source or live deployment was changed for the demonstration.

### Historical capture procedure

1. Build the current source and run the production preview from `web/` with `npm run build` and `npm run preview`. Use a separate local origin for captures so production preferences and recovery data are untouched.
2. Open that preview in the **in-app browser**. Set a 1248 × 900 desktop viewport, search for Senate, and open the first LASU Senate Building result from the checked-in seed. Clear the query while retaining the selected destination.
3. Expand the panel to full height, then capture it again after dragging its top handle to a shorter height. Keep the full application, attribution and controls in the frame.
4. Use a 390 × 844 phone viewport. Capture the compact card, its expanded destination details at 432 px, and Settings at 440 px. Use actual UI controls to resize and change views.
5. For the update notice, install one local production build and then serve a new service-worker revision from the same local origin. Wait for the normal update-ready UI. Keep this demonstration local and restore temporary build-only changes afterward.
6. Inspect every saved image, record its actual dimensions and map package, reset the temporary viewport and close capture tabs. Phone-sized browser captures do not replace physical-device checks.

## Editor and enhanced-model gallery — 15 September 2026

These images show the application UI from revision `5d878a2`, including original enhanced-model colours and shared public/editor Appearance settings. Chromium renders the real React, MapLibre, Three.js and roof-editor code.

The capture uses the checked-in `lasu-4e4c8008b38b` seed geometry and `data/visuals/catalogue.json` / sector assets through the repository's enhanced-campus fixture. Reviewed ring corrections are accepted in that fixture. Owner login and API responses are isolated test data; no production reports, credentials or owner draft contents are captured. The roof screenshot shows an unfinished demonstration plan, not a surveyed or published roof change.

| Image | View | Viewport |
| --- | --- | --- |
| [public-campus-dark.jpg](public-campus-dark.jpg) | Selected Senate Building and enhanced campus in Dark mode | 1440 × 1000 |
| [public-place-phone.jpg](public-place-phone.jpg) | Public destination details and enhanced architecture | 390 × 844 |
| [editor-workspace.jpg](editor-workspace.jpg) | Workspace, explorer and campus context | 1440 × 1000 |
| [editor-building.jpg](editor-building.jpg) | Building Appearance inspector and selected model | 1440 × 1000 |
| [editor-roof.jpg](editor-roof.jpg) | Wing roof plan and custom-roof controls | 1440 × 1000 |
| [editor-settings.jpg](editor-settings.jpg) | Appearance, rendering, tilt and opacity | 1440 × 1000 |
| [editor-settings-phone.jpg](editor-settings-phone.jpg) | Editor Settings in a phone viewport | 390 × 844 |

PNG browser captures are encoded as JPEG at the original dimensions for repository size. No interface elements are composited, removed or recoloured. The map, lighting and settings backgrounds come from the application itself. No GPS fix, active walk or completed physical-device test is implied.

The earlier gallery was produced using the repository’s opt-in documentation-capture fixtures. Those captures predate the current production fixture workflow above. Keep historical fixture images labelled with their original date and data source when retaining them.

## Historical captures — 9 September 2026

The earlier files below remain as historical references and are no longer the main README gallery. They were captured from application revision `cec03c5` and campus package `lasu-44f8af5654f1`.

| Image | View | Viewport |
| --- | --- | --- |
| [desktop-explore.jpg](desktop-explore.jpg) | Public explorer in Light mode | 1248 × 720 |
| [desktop-route-dark.jpg](desktop-route-dark.jpg) | Manually selected Clinic–Senate route and alternatives | 1248 × 720 |
| [mobile-place.jpg](mobile-place.jpg) | Senate place details | 390 × 844 |
| [appearance.jpg](appearance.jpg) | Public Device appearance setting | 390 × 844 |

All phone screenshots use responsive browser viewports. Physical Android/iPhone installation, GPS, touch and offline checks are tracked separately in [the acceptance checklist](../../ACCEPTANCE.md).
