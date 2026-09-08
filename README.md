# TurnRight

A LASU Ojo campus map PWA built with React, TypeScript, Vite, MapLibre and Tailwind/shadcn. Search, walking route calculation, GPS processing and spoken directions run on the device. Supabase is used only for the protected editor and private student reports.

## Run locally

Use Node.js 22:

```sh
cd web
npm ci
npm run dev
```

The included campus package lets you explore immediately, without keys. For the real service worker and offline reopening:

```sh
npm run build
npm run preview
```

Open the URL printed by Vite, choose **Offline → Download campus map**, and wait for **Ready offline**. A completed initial online visit/download is required. The map package is approximately **2.15 MiB**; the application shell is approximately **2.45 MiB** uncompressed, stored separately. Actual transfer/storage varies by browser and compression. No satellite imagery or external tile server is used.

## What is implemented

- Responsive 2D map, optional 3D with approximate floor-derived heights, light/dark appearance, local search, saved places and recent selections.
- Manual or current-location origins, A* in a worker, bounded alternatives, explicit graph connections, closures, building/fence conflict exclusions, and turn instructions.
- Foreground GPS navigation with accuracy/staleness checks, sustained-deviation rerouting, arrival detection, following/recentering, wake lock where available, mute/repeat and 19 packaged voice clips. Destination names use a local English speech voice only when the browser exposes one.
- Hash-verified, resumable campus downloads; atomic activation; pending updates held until a walk ends; storage readiness/eviction checks; explicit map and app updates.
- GitHub-authenticated owner editor, vertex editing, undo/redo, explicit connections, draft validation/route preview, private reports and offline report drafts.
- Supabase RLS migration, bounded daily/on-demand imports, source review separate from corrections, immutable release snapshots, Vercel preview/promotion/rollback workflows, and backup export.

## Coverage and remaining acceptance work

The seed has **219 source place records, 54 mapped approaches and zero confirmed connected entrances**. It retains duplicate/conflicting source names for review. There are **7 disconnected path components**, and **28 directed segments are excluded** because building or barrier geometry conflicts with the path. A mapped approach ends on a source path near a place; it does not invent the final walk to a door. Unsupported destinations are identified in the interface. This is not a field-verified campus navigation release.

Vercel Hobby and Supabase Free are configured; live preview verification is in progress. The owner confirmed ArcGIS offline redistribution permission on 8 September 2026. See the [configuration record](docs/CONFIGURATION.md) for current deployment status and the remaining acceptance work:

- [Deployment and account setup](docs/DEPLOYMENT.md)
- [Verification and campus field checks](docs/ACCEPTANCE.md)
- [Architecture, data and release behavior](docs/ARCHITECTURE.md)
- [Source attribution and rights status](data/ATTRIBUTION.md)
- [Machine-readable coverage](data/coverage-report.json)

## Development checks

Run `npm test` and `npm run build` from `web/`. Tests cover routing restrictions, route diversity, geometry conflicts, GPS jitter/staleness/arrival, editor connections, offline transactions, import failures, API authorization, and deployment success gates. Vite's local servers do not serve Vercel `/api` functions; use your Vercel preview to test connected administration/report submission.

To refresh raw source data locally, run `python scripts/import_campus.py --download --output data/candidates` from the repository root. Candidates never replace the published map automatically. `node scripts/package.mjs` packages the checked-in seed for local development; production data publication goes through the editor workflow. See the architecture guide before changing data.

TurnRight is an independent personal, non-commercial project, not an official LASU service. Driving, cycling, indoor positioning, satellite imagery, public accounts and reviews are outside this release.
