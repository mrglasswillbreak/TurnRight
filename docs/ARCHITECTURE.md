# TurnRight architecture

`web/` is a Vite React application. MapLibre renders local GeoJSON geometry as vector layers, without raster tiles, satellite imagery or external map calls. This campus-sized dataset fits directly in GeoJSON; a large-area tile pyramid is unnecessary. The map starts flat; measured heights or documented floor counts control extrusions. Fonts/icons are bundled; ASCII campus labels use a local Open Sans glyph range.

## Public device flow

`App.tsx` coordinates Explore → Place details → Route preview → Navigation. Mobile uses a scrollable bottom sheet; desktop a side panel. Search covers names, supplied aliases, departments and faculties. Preferences, recent place selections, saved places and private report drafts live in IndexedDB. GPS is requested for explicit current-location use or navigation, never sent to a server. Foreground visibility controls GPS watching; screen wake lock is best effort.

`routing.worker.ts` runs A* over explicit source nodes/edges. Only permitted edges participate. Four bounded penalty attempts can yield up to two alternatives when overlap is below 80% and walking distance is within 60% of the shortest. No straight connector to a building is synthesized. Source sampling adds vertices along existing lines only. Building/fence conflicts, restrictions and unreopened closures exclude segments. Source discrepancies require review; excluded edges remain in the source records for correction.

`navigation.ts` projects good fixes onto the route. Accuracy worse than 35 m or fixes older than 12 seconds pause progression. Off-route distance must exceed both 22 m and the accuracy-based threshold for eight seconds before rerouting, with a 15-second request cooldown. Multiple distinct fixes near the endpoint trigger arrival. These thresholds need field testing in LASU's buildings and vegetation.

`audio.ts` unlocks Web Audio from a user action and plays locally packaged English maneuver/distance clips. Mute and repeat work independently of network speech. Destination names use only an English speech-synthesis voice marked `localService`; no remote voice is selected. Background navigation/audio is outside scope.

## Offline and versions

Workbox precaches the app shell, CSS, icons, interface fonts, MapLibre worker and routing worker. `offline.ts` stores campus package records/preferences in IndexedDB and package assets in a separate CacheStorage cache. The immutable manifest lists each required file's size and SHA-256. Files are reused only after hash verification. The active pointer changes transactionally only after the full package validates. A download during navigation writes a pending pointer; the next idle session verifies its presence before activation. A failed/interrupted/corrupt download leaves the existing active record intact.

The shell and campus package have separate update lifecycles. Opening/reconnecting fetches release metadata; users choose whether to download a new map. The app reports the downloaded version/date, known updates and missing cached files. Service-worker reload is delayed while navigating. An offline device knows only its downloaded closures. A previous version's assets are retained; removal clears campus packages while leaving preferences and report drafts. No auto-submission or background synchronization sends reports.

The initial package is about 2.15 MiB and contains geometry, places/search fields, graph, closure records, map glyphs, audio manifest and clips. Styles/icons/interface fonts are part of the independently precached app shell. Both are needed before Ready offline is shown. App/package `schemaVersion: 1` is the compatibility boundary; unsupported schemas require an app update.

## Sources and corrections

`scripts/import_campus.py` fetches bounded OSM and ArcGIS snapshots, validates input shape/coverage, normalizes coordinates, derives walking edges, preserves stable IDs, and reports coverage. Raw data and candidates are ignored by Git. `cloud.mjs` splits the dataset into source records and compares semantic hashes, ignoring retrieval timestamps. `sync-sources.mjs` queues additions/modifications/removals; it never applies them to accepted records automatically. A removal set over 20% fails for manual inspection. Initial baseline installation is transactional and refuses to overwrite existing records.

`map_edits` uses `(id, kind)` as its key, so a place and building outline can share a source identifier without losing either correction. Source records and correction history remain separate. `editor-model.ts` overlays corrections onto approved records, preserves established junctions on retained path geometry, and requires new connections explicitly. Moving a place invalidates its old approach until reviewed. A missing endpoint, invalid geometry, false entrance connection or stale closure edge blocks release validation. Buildings/fences that conflict with source paths exclude the affected edges and generate review warnings.

The visual editor uses Terra Draw for shapes, draggable vertices/midpoints, selection, and undo/redo. It provides saved corrections, source before/after geometry, private reports, closures, draft routing and release controls. Published map clients never require this module or the administrative database to navigate.

## Server and release boundaries

`web/api/admin.ts` validates the Supabase session via the Auth service and checks both `ADMIN_USER_ID` and the database singleton allowlist. RLS permits only the allowlisted administrator to read private tables; browser writes are denied. Mutations run in small server endpoints using a service-role JWT. `web/api/reports.ts` validates anonymous submissions and consumes an atomic, daily salted IP-derived rate bucket (five reports/hour). No raw IP is stored in application tables; platform HTTP logs remain subject to hosting-provider behavior. Reports remain private and never edit routes.

The release RPC snapshots approved sources plus corrections; a trigger prevents mutation of snapshot content. GitHub Actions validates and packages the snapshot, uploads only allowed application files through Vercel's API, and waits for READY. A publish/rollback action promotes the exact retained deployment and waits for production alias assignment before success is recorded. Source imports do not deploy code or maps. Failures and quota interruptions are stored as job/release errors when the backend is available.

`PUBLISHED_MAP_URL` protects ordinary code builds from reverting published data to the seed. The build fetches and verifies current map files, failing safely if they are unavailable. Controlled releases freeze their own version and preserve the preceding immutable assets. A rollback serves the preceding deployment's map; a device already holding a newer map keeps it until it consents to the version change.

Setup, live-service acceptance, field surveying and ArcGIS redistribution permission are still required. See `DEPLOYMENT.md` and `ACCEPTANCE.md`.
