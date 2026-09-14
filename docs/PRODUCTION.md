# Production deployments

## Editor publication repair — 14 September 2026

The owner reported that editor previews could not be published. The authenticated
editor showed a saved, valid draft and an enabled Publish button. The latest
`test new` preview built successfully, but its
[publication workflow](https://github.com/mrglasswillbreak/TurnRight/actions/runs/34806595392)
failed at 04:35 UTC with `Vercel 422: Resource cannot be processed.`

The release script sent a Preview deployment directly to Vercel's production
promotion endpoint without the required JSON body. Vercel's
[promotion implementation](https://github.com/vercel/vercel/blob/main/packages/cli/src/commands/promote/request-promote.ts)
rebuilds Preview deployments with production settings; direct promotion applies
to production deployments. The workflow fallback also replaced the specific
error with a generic message.

- `902bee9` rebuilds the exact reviewed deployment for production, records the new
  deployment ID before waiting, checks for a previous build after a lost receipt,
  verifies the current production assignment, and uses the rollback endpoint
  when restoring a release.
- `4beb61d` preserves the specific release error in the editor.
- All 238 tests passed, including 12 new publication/recovery/error tests. The
  production build and lint of the changed files passed.
- Vercel reported a successful **Production** deployment for
  `4beb61deba2f106d30f3b2d9520c833cf32e6694` at 04:44:50 UTC:
  [deployment details](https://vercel.com/muhammed-abdulhadi-s-projects/turnright/Atop9BNMgwzGLBT7atAJdMZrNYar),
  [immutable application](https://turnright-mlbjivljt-muhammed-abdulhadi-s-projects.vercel.app/).
- The public application and editor returned 200; all 22 assets for
  `lasu-4e4c8008b38b` matched their declared sizes and checksums.

This deploy repairs the publishing code. The owner's campus preview remains
unpublished; a real publication through the corrected workflow still requires
the owner's next Publish action. No database migration was needed.

## Editor reliability and review update — 14 September 2026

The owner requested focused commits and production deployment. Fifteen
implementation, test and documentation commits were fast-forwarded to `main`.
Vercel reported a successful **Production** deployment for application revision
`641b2e9fc83a80c961513ce9076b7ce4a8f42575`.

- Public application: [turnright.vercel.app](https://turnright.vercel.app/).
- [Production deployment](https://vercel.com/muhammed-abdulhadi-s-projects/turnright/DzmNhygdBpkGuscH93EUsy7xjf4e).
- Immutable URL: [turnright-9u431nae9](https://turnright-9u431nae9-muhammed-abdulhadi-s-projects.vercel.app/).
- At 04:23 UTC, `/`, `/admin` and `/sw.js` returned 200. The service worker
  retains `no-cache, no-store, must-revalidate`; unauthenticated `review-status`
  returned 401 with `no-store`.
- The served application entry is `index-DVdRW6ir.js`; the editor is
  `Admin-BzKmpZNX.js`. The live editor bundle contains local recovery export,
  operation-specific retries, conflict review, repair/duplicate previews,
  release impact and status polling.
- A fresh Chromium session opened the Faculty of Law through its stable place
  link, copied that same ID, calculated Clinic–Law and displayed recorded steps
  information. A phone-sized unknown destination offered focused search, and
  `/admin` opened the configured GitHub sign-in screen. No page errors occurred.
- All 22 published assets retained their exact byte counts and SHA-256 hashes.
  Package `lasu-4e4c8008b38b` remains 3,159,499 bytes. No map drafts were
  published and no database migration was needed.

The final local suite passed 226 tests, the production build and lint with no
errors. Chromium and production PWA acceptance are recorded in
[the reliability verification notes](EDITOR-RELIABILITY.md). Physical
Android/iPhone and authenticated owner acceptance remain pending; Windows
WebKit verification was incomplete because of WebGL context loss. The preceding
production deployment `Cn5F2f8D6MxmFg4ngEXxHnVrncSL`
(`turnright-55oag4lgl`) remains the recorded rollback target.

## Editor baseline repair — 14 September 2026

The owner reported the missing endpoints on path
`osm:way:1534765716:2297333149:2297333129:1`. The live editor has now
reconciled its approved sources with published package `lasu-4e4c8008b38b`,
retaining the reviewed Law driveway and International Library gate access.

- The first reconciliation rolled back because Supabase requires a WHERE
  clause on DELETE. Migration `006_reconciliation_safe_updates.sql` limits
  replacement to the source IDs in the validated review. It was applied
  transactionally; the database's safe-update protection remains enabled.
- All 11 database tests passed on Node 22, including nonempty baseline
  replacement, complete source archival, draft/history preservation, stale
  review rejection and rollback on invalid replacement records. The successful
  live retry additionally verified compatibility with Supabase's DELETE guard.
- The approved baseline now contains 4,372 source rows and has zero missing
  graph endpoints. Its reconciliation archive retains all 1,172 prior source
  rows. All 23 pre-repair correction records and 77 history entries were
  verified intact; one additional edit and history entry arrived during repair.
- Releases displays matching editor/public versions and the replayed draft
  map (220 places, 2,486 directed path segments). The missing-source-node
  warning is gone. Four separate validation messages remain for two entrance
  drafts requiring place or path connections.
- Public package `lasu-4e4c8008b38b` remains 3,159,499 bytes. This repair did
  not publish editor drafts, footprint corrections or the visual catalogue.

## Miniature styling and release-validation repair — 14 September 2026

The owner requested deployment of the completed implementation. Application
revision `3e7e747910478f078ddc49958749cf9b0164cee0` was fast-forwarded to
`main` and Vercel reported **Ready / Production** with the public domain assigned.

- Public application: [turnright.vercel.app](https://turnright.vercel.app/).
- [Production deployment](https://vercel.com/muhammed-abdulhadi-s-projects/turnright/Cn5F2f8D6MxmFg4ngEXxHnVrncSL).
- Immutable URL: [turnright-55oag4lgl](https://turnright-55oag4lgl-muhammed-abdulhadi-s-projects.vercel.app/).
- At 00:57 UTC, all 22 published assets retained their exact lengths and SHA-256
  hashes. Package `lasu-4e4c8008b38b` remains 3,159,499 bytes. The preceding
  `lasu-44f8af5654f1` manifest remains available.
- The served entry, editor and lazy renderer are `index-BabM2uMe.js`,
  `Admin-DMOiYZfw.js` and `campus-model-layer-DfibhRi2.js`. Public `/`, `/admin`
  and `/sw.js` returned 200; the service worker precaches the new application
  and retains its no-cache/no-store policy. Unauthenticated admin access
  returned 401.
- Migration `005_baseline_reconciliation.sql` was applied transactionally.
  Its archive has RLS; anonymous and authenticated clients cannot execute the
  reconciliation function, while the existing server role can. Before/after
  fingerprints matched for all 1,172 source records, 20 correction records and
  65 history entries. No reconciliation was applied during that deployment;
  the subsequent repair is recorded above.
- The existing installed browser offered **Install update** and reopened the
  authenticated editor with its saved workspace. Releases identified the
  missing source endpoints, retained the usable 2,452-segment map, exposed
  Locate/Retry/Download diagnostics and blocked the old preview.
- The live server prepared a baseline review successfully. It retains all
  20 corrections and the Law driveway/Library gate access reviews; four draft
  issues remain after replay. The review was left unapplied at deployment time.

This application deployment enables the rendering and editor workflows and
updates campus styling. The 58 authored models await the separate reviewed
campus-data release; the published package has not gained a visual catalogue.
The nine proposed wing corrections and remaining entrance issues still need
review. See [implementation and evidence coverage](MINIATURE-CAMPUS.md).
The preceding ready deployment, `7mougdEggCDfykCRKR9BiPyhqpbD`
(`turnright-avbq3e2xh`), remains available for rollback.

## Map, editor and 3D update — 13 September 2026

The owner requested deployment of the implemented map/editor improvements.
The 25 implementation commits were fast-forwarded to `main`, and the existing
Vercel Git integration deployed application revision
`932a216e93126a967b897e8a22b769dd6bbf2a2a` successfully.

- Public application: [turnright.vercel.app](https://turnright.vercel.app/).
- [Successful Vercel deployment](https://vercel.com/muhammed-abdulhadi-s-projects/turnright/BARRwm8ZT1HKpmo6cuuzNgiMwNDF).
- Immutable deployment: [turnright-69xf6nluu](https://turnright-69xf6nluu-muhammed-abdulhadi-s-projects.vercel.app/).
- GitHub recorded a successful `Production` deployment for that exact commit.
- At 22:04 UTC, `/`, `/admin` and `/sw.js` returned HTTP 200. The public
  application bundle was `/assets/index-BPiU5JBC.js`, and the editor bundle was
  `/assets/Admin-DgO3BZsD.js`. The served code includes shared building heights,
  the persisted map-view preference and duplicate review. The service worker
  precaches the new application bundle and retains its no-cache response policy.
- An unauthenticated `/api/admin` request returned 401 with `no-store`.
- All 22 published assets matched their pre-deployment byte counts and SHA-256
  hashes. Package `lasu-4e4c8008b38b`, schema 1, remains 3,159,499 bytes. The
  preceding `lasu-44f8af5654f1` manifest remains available.
- An existing installed browser session offered **Settings → Install update**.
  Installation retained its downloaded map and opened the new 3D presentation.
  Faculty of Law details showed the rendering-only illustrative 6 m height and
  retained the existing mapped-approach information.

The application and service worker were validated on Node 22 before deployment;
see [implementation and test results](MAP-IMPROVEMENTS.md). This deployment did
not publish editor drafts, consolidate ambiguous campus records or replace the
reviewed Law/Library access corrections. Reconciliation of the older approved
editor baseline is still required before a campus-data release. Physical-device
checks and the original authenticated desktop drawing reproduction remain open.

## Initial public launch — 9 September 2026

TurnRight is public at **https://turnright.vercel.app/**. The owner explicitly
requested publishing the latest GitHub revision to production on this date.
This replaces the earlier preview-only hosting state; it does not establish
physical-campus or phone verification.

## Law and Library connection update

On 9 September 2026 at 22:07 UTC, the public map was verified as
**`lasu-4e4c8008b38b`** (3,159,499 bytes, 22 required assets). The individually
confirmed Law driveway and International Library gate connect 201 of the 206
mapped approaches to the largest network component. Physical walks and final
building entrances remain unverified.

- Application revision: `1cbdb5db2fa54eff9b71bfd166575ec83ec61f7a`.
- [Successful preview workflow](https://github.com/mrglasswillbreak/TurnRight/actions/runs/34410023855): seven Python and 61 Vitest tests passed.
- Preview deployment: `dpl_Jmzi1AGuTVtUqjYnmpNzChX4kk3E`; hosted Law and Library
  routes and a download to **Ready offline** passed.
- [Production promotion deployment](https://vercel.com/muhammed-abdulhadi-s-projects/turnright/5DBCHCf9WLfUYbZoxnjrGiR8N89w):
  `dpl_5DBCHCf9WLfUYbZoxnjrGiR8N89w`, **Ready / Production**, with
  `turnright.vercel.app` assigned.
- Immutable production URL:
  https://turnright-98n7m4mds-muhammed-abdulhadi-s-projects.vercel.app/.
- All 22 public assets matched their manifest sizes and SHA-256 hashes. `/`,
  `/admin`, `/sw.js`, and the preceding map manifest returned HTTP 200 without
  Vercel authentication.
- A fresh public-browser installation downloaded `lasu-4e4c8008b38b` and
  reached **Ready offline**.
- Preceding deployment `dpl_BHn8UFmU8kTbRtmVwRrf4oz6u3GG` and package
  `lasu-44f8af5654f1` remain available. `PUBLISHED_MAP_URL` remains enabled for
  subsequent code builds.

This publication used a reviewed, frozen Git package. Vercel rebuilt the
preview with production environment settings on promotion. Supabase's older
approved baseline and outstanding source proposals remain separate and must be
reconciled before an editor-led release. See [CONNECTION-REVIEW.md](CONNECTION-REVIEW.md)
and the [public asset verification record](../data/connection-release-verification.json).

## Initial deployment and configuration

- Application revision: `0ee315d2e43f5e09c63ca6ebff33fc6e3cf9e538`, branch `main`.
- Initial Vercel deployment: `dpl_CERT4AGSpjC8vQ1wd18Cdq6wNZJw`.
- Immutable URL: https://turnright-9tm3sd614-muhammed-abdulhadi-s-projects.vercel.app/.
- [Vercel deployment details](https://vercel.com/muhammed-abdulhadi-s-projects/turnright/CERT4AGSpjC8vQ1wd18Cdq6wNZJw).
- Public map package: `lasu-44f8af5654f1`, 3,148,440 bytes, 22 required assets.
- Preceding successful production deployment retained:
  `dpl_GCaLdr2NWhWNL8hk7swguLDzEAti` (same revision/map, before setting
  `PUBLISHED_MAP_URL`). The previous immutable reviewed preview is also retained.

The failure was configuration, not a rejected Git push: **Build and Deployment
→ Ignored Build Step → Only build pre-production** canceled `main` builds.
The setting is now **Automatic**, and the Git connection remains
`mrglasswillbreak/TurnRight`. Root directory `web`, Node.js 22, `npm ci`, Vite,
the Hobby plan and Basic build machine are unchanged. Builds for commits that
do not affect the root directory or its dependencies can still be skipped.

`PUBLISHED_MAP_URL=https://turnright.vercel.app` is set as a Config variable in
both Production and Preview. A second successful production build applied this
setting. Code builds preserve and verify the public map; future map changes use
the reviewed map-release workflow. Publishing code does not automatically
approve imported source changes or editor drafts.

Supabase's Site URL is now `https://turnright.vercel.app/admin`, and that exact
address is in the redirect allowlist alongside the existing preview addresses.
GitHub OAuth, the single-owner allowlist and private-table policies remain in
place. No secret values were changed or committed for this deployment.

This first production publication used the latest checked-in map, as requested.
It was a Vercel Git deployment, not a promotion of the older Supabase release
snapshot. The older snapshot remains a preview in the editor. Before a future
map release, review the source import containing the student-access correction
and preview its assembled map; publishing the older snapshot would serve the
older map. `PUBLISHED_MAP_URL` protects code builds, not intentional map releases.

## Initial deployment verification

- Vercel shows **Ready**, **Production**, the exact revision above, and the
  `turnright.vercel.app` domain assigned to the current deployment.
- Public `/`, `/admin`, `/sw.js` and the package manifest return HTTP 200 without
  Vercel authentication. The service worker has a no-cache/no-store policy.
- All 22 published assets matched the manifest's sizes and SHA-256 hashes.
  The map contains 219 source places, 206 mapped approaches and 62 roads with
  the owner-confirmed student walking permission.
- A fresh public-browser installation downloaded the map to **Ready offline**.
  Search and Clinic-to-Senate routing displayed the 1.0 km / 14 minute route,
  two alternatives, turn instructions and the student-access notice.
- Production GitHub login returned to the public `/admin` URL and opened the
  owner's private editor. One initial map-loading timeout recovered with Retry.
- An unauthenticated admin request returned 401; an empty report submission
  returned 400 before inserting any report.

The 42 TypeScript and five Python tests and local production build had already
passed for this implementation. This deployment required dashboard settings,
not application code changes. Physical-phone airplane mode, live GPS/campus
walks, and an actual production rollback remain unverified; see
[ACCEPTANCE.md](ACCEPTANCE.md).
