# Production deployment — 9 September 2026

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
