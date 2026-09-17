# Application screenshots

## Current public interface — 17 September 2026

Captured from the local production preview in the **Codex in-app browser**, using application revision **`d37606f`** with the mobile selection, public update-notice and desktop-resizing changes. The images document this application build and its bundled seed; publishing application code does not publish new campus map data.

The map uses the checked-in **`lasu-4e4c8008b38b`** campus seed. The app renders its real React/MapLibre interface in Device appearance, which resolved to Dark on this machine. The Senate Building is labelled with an unknown/illustrative height in this seed; this gallery does not claim that all enhanced model assets are present. No production owner session, private drafts, reports or GPS coordinates from a device were used.

| Image | View | Captured dimensions |
| --- | --- | --- |
| [public-desktop-full-2026-09-17.png](public-desktop-full-2026-09-17.png) | Full-height desktop destination panel; search, navigation and map controls above its scrolling details | 1248 × 900 |
| [public-desktop-resized-2026-09-17.png](public-desktop-resized-2026-09-17.png) | The same panel shortened to 548 px using its top handle | 1248 × 900 |
| [public-mobile-map-2026-09-17.png](public-mobile-map-2026-09-17.png) | Compact bottom search dock; view/compass on the left and zoom/location on the right | 390 × 844 |
| [public-mobile-place-2026-09-17.png](public-mobile-place-2026-09-17.png) | Destination card resized to 432 px with pinned navigation | 390 × 844 |
| [public-mobile-settings-2026-09-17.png](public-mobile-settings-2026-09-17.png) | Settings dialog shortened to 440 px | 390 × 844 |
| [public-mobile-update-2026-09-17.png](public-mobile-update-2026-09-17.png) | The public update-ready notice with an explicit install button | 390 × 844 |

These are unmodified PNG browser captures: no interface elements were composited, removed or recoloured. The update screenshot uses a real waiting service worker triggered by a comment-only revision to the local built `dist/sw.js`. The original built file was restored after capture; no application source or live deployment was changed for the demonstration.

### Reproduce the current gallery

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

The earlier gallery was produced using the repository’s opt-in documentation-capture fixtures. Current screenshots are captured through the in-app browser using the workflow above. Keep historical fixture images labelled with their original date and data source when retaining them.

## Historical captures — 9 September 2026

The earlier files below remain as historical references and are no longer the main README gallery. They were captured from application revision `cec03c5` and campus package `lasu-44f8af5654f1`.

| Image | View | Viewport |
| --- | --- | --- |
| [desktop-explore.jpg](desktop-explore.jpg) | Public explorer in Light mode | 1248 × 720 |
| [desktop-route-dark.jpg](desktop-route-dark.jpg) | Manually selected Clinic–Senate route and alternatives | 1248 × 720 |
| [mobile-place.jpg](mobile-place.jpg) | Senate place details | 390 × 844 |
| [appearance.jpg](appearance.jpg) | Public Device appearance setting | 390 × 844 |

All phone screenshots use responsive browser viewports. Physical Android/iPhone installation, GPS, touch and offline checks are tracked separately in [the acceptance checklist](../../ACCEPTANCE.md).
