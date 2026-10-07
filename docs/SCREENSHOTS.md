# Application tour and screenshot maintenance

The October 2026 gallery contains sixteen application views plus two editor-control details. Every image is a direct browser capture; no UI was painted over, assembled from separate screens, or generated. [Machine-readable capture records](assets/screenshots/redesign-2026-10-07.json) provide dimensions, theme, revision, fixture and image hashes. [Historical captures](assets/screenshots/README.md) remain intact.

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
