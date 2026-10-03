# Campus discovery and offline switching

Open **Choose a campus** beside public search to browse the globe and search published campus names. The chooser is non-modal: dragging, zooming and selecting on the map remain available while it is open. Escape or Close dismisses it and restores focus. Other application dialogs retain their modal behavior.

## Select a campus

Every directory entry represents a published campus. Distant campuses have a pin; from zoom 10 their actual published boundary fades in. Polygon holes and separate islands remain intact. The selected campus has a stronger outline. At zoom 12 its overview silhouette and label disappear as its detailed map takes over, so ordinary destination selection remains available.

Select a silhouette, pin, label or list entry to open that campus. Nearby hits use a larger touch target. Overlapping campus hits open **Choose a campus here**; the list is also the keyboard-accessible alternative. Older directories without outlines retain pins. Private campuses and owner draft boundaries do not appear.

![Published LASU and UNILAG boundary silhouettes](assets/screenshots/campus-silhouettes-desktop-2026-10-03.png)

The existing map stays mounted. **Opening [campus]…** appears while the target package is loaded and validated; the current campus remains usable. On success the campus, explicit URL and last-campus preference change together. A direct flight takes 1.1–2.2 seconds according to distance, zooms out only as needed and fits the destination around the visible panel. It preserves the selected 2D/3D mode and finishes north-up. An already-centred target uses a straight zoom. Reduced motion uses an immediate transition.

Map gestures interrupt the flight without reverting the successful switch. Rotation and location following pause during the transition. Selecting the current campus returns the camera to it. Switching away from active directions first requires **Stop and switch campus**; closing the confirmation retains the walk.

New selections supersede pending loads. A failed or unavailable target leaves the current campus, URL and remembered choice intact and offers **Retry**. Successful switches clear the previous destination, search, route preview and temporary messages, then restore the target campus's saved places, recents, report drafts and download state. Delayed route, voice and download callbacks cannot overwrite the new session.

Browser Back/Forward loads the requested campus through the same path without adding history entries. Shared destination identifiers resolve against that campus. A plain visit to `/` reopens the last successfully used campus; explicit campus links win. First visits and legacy destination links without a campus parameter continue to use LASU.

## Use it offline

Download each required campus from **Offline** and wait for verification before disconnecting. The cached directory includes its silhouettes, so published campuses remain discoverable even when only some are downloaded. Discovery does not download every campus package.

Switching prefers the selected campus's verified downloaded core and audits its remaining assets in the background. If an offline target is not downloaded, an availability message leaves the current campus open. Removing a download affects only that campus; saved places, other campus packages and shared assets remain. Offline directory entries can be older than the live publication catalogue.

## Directory and release contract

`/packages/campuses.json` schema 1 now accepts optional `outline` geometry on an entry: a GeoJSON Polygon or MultiPolygon. The shared validator bounds each outline to 20,000 vertices, checks closed rings and finite WGS84 positions, and rejects malformed content before MapLibre receives it. It does not invent or simplify a campus boundary.

Build/publication preservation verifies the public core asset's byte count and SHA-256, then copies only its boundary type and coordinates into the directory. This also backfills LASU and UNILAG on a code deployment. It never reads private drafts. Directory revisions include outlines when present; the exact legacy revision calculation remains unchanged for entries without them. Older clients ignore the additive field.

The browser caches the complete validated directory in IndexedDB. One shared overview source owns pins, labels, silhouettes and selection handlers. The switch controller and world-geography loader are lazy modules; complete campus packages load only after selection. No database migration, graph edit, permission change or campus republication is required.

## Verification

Use Node 22 from `web/`:

```sh
npm test
npm run lint
npm run check:configured-build
npx playwright test tests/browser/campus-globe-switching.spec.ts tests/browser/globe-search.spec.ts
npx playwright test --config playwright.webkit.config.ts tests/browser/campus-globe-switching.spec.ts tests/browser/globe-search.spec.ts
node scripts/verify-campus-globe.mjs
```

The final command checks the public origin by default, verifies all package assets and runs the 32-view campus/browser/viewport/theme/view matrix plus downloaded-campus switching and reopening offline. It also rejects captures with a blank map region; source readiness alone does not establish visible rendering. Set `VERIFY_ORIGIN` for a preview and `VERIFY_BASELINE` to a captured receipt when comparing unchanged packages. GitHub's **Verify published campus globe** workflow runs the same check and retains its report and unaltered screenshots. It uses public assets only.

Unit tests cover boundary validation, multipart shapes/holes, legacy revisions, wraparound, flight duration, overview styles/overlaps, explicit storage scopes and missing offline targets. Browser tests exercise the real MapLibre instance, selection, history, failure/retry, superseded loads, active-direction confirmation and downloaded/undownloaded offline targets. Production receipts record the executed suites, served package hashes and screenshots. Physical Android/iPhone checks and campus field verification remain separate and pending.

[Architecture](ARCHITECTURE.md) · [Motion and globe settings](MOTION.md) · [Deployment](DEPLOYMENT.md) · [Production evidence](PRODUCTION.md)
