# Application tour and screenshot maintenance

The October 2026 gallery includes source-update inboxes, map-wide previews and an adjustable phone editor, alongside earlier application views. Every image is a direct browser capture; no UI was painted over, assembled from separate screens, or generated. [Machine-readable capture records](assets/screenshots/redesign-2026-10-07.json) provide dimensions, theme, revision, fixture and image hashes. [Historical captures](assets/screenshots/README.md) remain intact.

## Map previews and adjustable phone panels · 11 October 2026

| All matching source proposals | Phone map preview | Resized editing panel |
| --- | --- | --- |
| ![Desktop source map preview frames proposals beside its controls](assets/screenshots/source-map-preview-desktop-2026-10-11.png) | ![Phone preview fits the changes below its legend and controls](assets/screenshots/source-map-preview-mobile-2026-10-11.png) | ![Phone properties panel expanded with its accessible drag handle](assets/screenshots/editor-adjustable-panel-mobile-2026-10-11.png) |

The preview captures show 101 synthetic proposals over the checked-in LASU `lasu-4e4c8008b38b` seed. The panel capture uses the small `browserCampus` fixture and a synthetic Library edit. These are unaltered local Chromium captures, not production decisions. [Source and image digests](assets/screenshots/source-map-preview-2026-10-11.json).

Reproduce with `npm run test:browser -- tests/browser/editor.spec.ts --grep "source updates map preview|workspace panes: mobile editing height" --output ../test-results/source-map-preview` from `web/`. Use `npm run test:survey-webkit` with the same arguments for WebKit. The independent preview journeys verify all pages, actual rendered source data, previous shapes and read-only closing; the resizing journey checks dragging, keyboard access, input preservation, reload and reset.

## Source updates capture workflow

The new [Source updates workspace](SOURCE-UPDATES.md) has desktop and phone capture journeys in `web/tests/browser/editor.spec.ts`. They use the real React/MapLibre interface with isolated owner/API responses and 101 synthetic proposals. The names, proposal counts, removals, decisions, and progress are demonstration data; no production proposal is reviewed by these tests.

Run sequentially from `web/` after installing the pinned dependencies and Playwright browsers:

```powershell
npm run test:browser -- tests/browser/editor.spec.ts --grep "source updates bulk review" --output ../test-results/source-updates-chromium
npm run test:survey-webkit -- tests/browser/editor.spec.ts --grep "source updates bulk review" --output ../test-results/source-updates-webkit
```

Each engine writes `source-updates-desktop.png`, `source-updates-mobile.png`, `source-updates-confirm-desktop.png`, and `source-updates-confirm-mobile.png` inside its per-test output directories. Desktop uses 1440 × 1000 and phone uses 390 × 844. The application regression workflow also retains them in its browser artifacts when the journeys reach the capture steps.

Inspect the actual captures and successful test results before promoting any image into this gallery. Use a new dated filename and record the exact commit, browser version, fixture identity, dimensions, and SHA-256 digest. Keep earlier images and manifests. The four October 11 captures below passed their Chromium desktop/phone journeys and were inspected individually. Their [capture record](assets/screenshots/source-updates-2026-10-11.json) identifies the tested commit, pinned browser, fixture and file digests. The October 7 captures remain dated examples of the earlier interface. [Rollout status](PRODUCTION.md#source-updates-rollout--11-october-2026).

## Source updates · 11 October 2026

| Inbox and comparison | Bulk confirmation |
| --- | --- |
| ![Desktop source inbox beside map outlines and editor overrides](assets/screenshots/source-updates-desktop-2026-10-11.png) | ![Desktop confirmation with exact counts and removal acknowledgement](assets/screenshots/source-updates-confirm-desktop-2026-10-11.png) |
| ![Phone source inbox and selection controls](assets/screenshots/source-updates-mobile-2026-10-11.png) | ![Phone confirmation with geometry and removal warnings](assets/screenshots/source-updates-confirm-mobile-2026-10-11.png) |

These unaltered captures use the Vite development server at commit `1feb53f77c954698c0c6d6dd3074db85a06399db`, the published LASU package, and isolated owner/API fixtures with 101 synthetic proposals. They establish the appearance of the tested interface, not a production decision or deployment.

## Visual tour

| View | What it demonstrates | Capture |
| --- | --- | --- |
| Public desktop | Place search, building details and public navigation | [1440 × 1000, light](assets/screenshots/redesign-public-desktop-2026-10-07.png) |
| Public mobile | A selected place in a phone viewport | [390 × 844, light](assets/screenshots/redesign-public-mobile-2026-10-07.png) |
| Edit | Feature explorer, map and contextual properties | [1440 × 1000, light](assets/screenshots/redesign-editor-desktop-2026-10-07.png) |
| Data | Datasets, map, attributes and schema/export controls | [1440 × 1000, light](assets/screenshots/redesign-gis-data-2026-10-07.png) |
| Model reference split | Structure, model, photograph and inspector | [1440 × 1000, light](assets/screenshots/redesign-model-desktop-2026-10-07.png) |
| Photo comparison | File list, before/after canvas and compression settings | [1440 × 900, light](assets/screenshots/redesign-photo-desktop-2026-10-07.png) |
| Review | Quality checks and independent immutable submissions | [1440 × 1000, light](assets/screenshots/redesign-gis-review-2026-10-07.png) |
| Publish | Approved content, releases and map exports | [1440 × 1000, light](assets/screenshots/redesign-gis-publish-2026-10-07.png) |
| Globe | Campus context at world scale | [1440 × 900, dark](assets/screenshots/redesign-globe-2026-10-07.png) |
| Mobile editor | Workspace chooser and one active sheet | [390 × 844, light](assets/screenshots/redesign-editor-mobile-2026-10-07.png) |
| Analyze | Tools, parameters and processing history | [1440 × 1000, light](assets/screenshots/redesign-gis-analyze-2026-10-07.png) |
| Imports | Inspected fields in an isolated campus import | [1440 × 900, light](assets/screenshots/redesign-imports-2026-10-07.png) |
| Model portrait | Selected wall in the full-screen model workspace | [390 × 844, light](assets/screenshots/redesign-model-portrait-2026-10-07.png) |
| Model landscape | Selected wall in a short landscape viewport | [844 × 390, light](assets/screenshots/redesign-model-landscape-2026-10-07.png) |
| Mobile photos | Full-screen photograph comparison | [390 × 844, light](assets/screenshots/redesign-photo-mobile-2026-10-07.png) |
| Offline use | Package preparation and download controls | [390 × 844, light](assets/screenshots/redesign-offline-2026-10-07.png) |

The [editor guide](EDITOR.md#legend-and-activity) also illustrates [collapsed legend](assets/screenshots/redesign-legend-collapsed-2026-10-07.png) and [expanded Activity](assets/screenshots/redesign-activity-expanded-2026-10-07.png) states. The normal editor view shows the collapsed Activity icon.

## Provenance

Public, editor, model and GIS captures render the published **LASU lasu-4895a363b403** package and its attributed assets in the actual local application. Owner/team authentication and private API responses are isolated test fixtures. The GIS 100,000-row label demonstrates paged controls; it is not a campus inventory or performance measurement. Example submissions and approvals never modify production data.

Imports use `campus-imports.spec.ts`'s small synthetic campus, source and inspected-layer responses. Photos use the actual PhotoOptimizer component in `photo-harness.html` with the repository's *School of Communication exterior*: **Abiolakintrunde**, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), [original photograph](https://commons.wikimedia.org/wiki/File:Lagos_state_university_school_of_communication.jpg), catalogue ID `commons:112540966`. The application resizes/compresses a private copy for comparison. Source rights and modifications remain in [photo records](../data/photos/README.md).

Phone views are browser viewports, not photographs of physical devices. The offline screenshot demonstrates the interface; prepared-package tests separately verify offline behavior. These local captures do not claim that this working-tree revision is deployed. See [Production](PRODUCTION.md) for deployment evidence.

## Reproduce

Use the pinned Node version, `npm ci` in `web/`, and installed Playwright Chromium/WebKit binaries. Public/model fixtures require the verified published assets under `web/work/model-benchmark/public`; preserve the package manifest and asset hashes when preparing that fixture. See the [existing fixture preparation record](assets/screenshots/README.md). Run these commands sequentially from `web/` (PowerShell):

```powershell
node node_modules/@playwright/test/cli.js test --config playwright.redesign-docs.config.ts --output work/capture-public-editor
$env:TURNRIGHT_GIS_SCREENSHOTS = '1'
node node_modules/@playwright/test/cli.js test --config playwright.gis-docs.config.ts --output work/capture-gis
Remove-Item Env:TURNRIGHT_GIS_SCREENSHOTS
$env:TURNRIGHT_REDESIGN_SCREENSHOTS = '1'
node node_modules/@playwright/test/cli.js test tests/browser/campus-imports.spec.ts --grep 'responsive screens' --output work/capture-imports
node node_modules/@playwright/test/cli.js test tests/browser/photo-processing.spec.ts --grep 'photo comparison edits' --output work/capture-photos
Remove-Item Env:TURNRIGHT_REDESIGN_SCREENSHOTS
node scripts/record-screenshots.mjs
node scripts/check-docs.mjs
```

The public/editor and GIS galleries use configured production builds. Import and photograph fixtures use Vite's development server to expose their test harnesses. Keep each Playwright run's output directory separate; concurrent runs must not share an output directory or a server port.

## Maintenance checklist

- Give new captures a new date; never overwrite an older dated image to make historical evidence look current. Change the gallery's output date and record script together.
- Verify the intended viewport, theme, completed loading, legible labels, credits, and selected state. Inspect every image at native size; check phone and landscape controls for overlap and clipping.
- Use public or explicitly synthetic data. Do not capture private accounts, location histories, tokens, or production drafts. Label fixture counts and simulated states.
- Keep a concise caption and useful alt text wherever an image is embedded. Describe the feature shown, not the file name.
- Regenerate the record after the final captures. Record the base commit and working-tree source digest, browser version, fixture identities, image dimensions and SHA-256 hashes.
- Run the documentation link/asset checker and the relevant browser, offline and accessibility checks. Screenshots supplement behavioral tests; they do not replace them.
