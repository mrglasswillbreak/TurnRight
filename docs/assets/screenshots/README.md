# Application screenshots

## Current gallery — 15 September 2026

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

To capture fresh originals from `web/` in PowerShell:

```powershell
$env:TURNRIGHT_DOCS_SCREENSHOTS = '1'
npx playwright test --grep "documentation capture" --output test-results/readme
Remove-Item Env:TURNRIGHT_DOCS_SCREENSHOTS
```

In a POSIX shell, prefix the Playwright command with `TURNRIGHT_DOCS_SCREENSHOTS=1`. The opt-in test uses local API fixtures and does not contact the owner's backend. Capture files are written below the Playwright output directory. Inspect them before replacing the corresponding JPEGs here; preserve attribution and update this record when their source changes.

## Historical captures — 9 September 2026

The earlier files below remain as historical references and are no longer the main README gallery. They were captured from application revision `cec03c5` and campus package `lasu-44f8af5654f1`.

| Image | View | Viewport |
| --- | --- | --- |
| [desktop-explore.jpg](desktop-explore.jpg) | Public explorer in Light mode | 1248 × 720 |
| [desktop-route-dark.jpg](desktop-route-dark.jpg) | Manually selected Clinic–Senate route and alternatives | 1248 × 720 |
| [mobile-place.jpg](mobile-place.jpg) | Senate place details | 390 × 844 |
| [appearance.jpg](appearance.jpg) | Public Device appearance setting | 390 × 844 |

All phone screenshots use responsive browser viewports. Physical Android/iPhone installation, GPS, touch and offline checks are tracked separately in [the acceptance checklist](../../ACCEPTANCE.md).
