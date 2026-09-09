# Faculty of Law and International Library walking connections

Reviewed on 9 September 2026. Package: **`lasu-4e4c8008b38b`**.

The Faculty of Law driveway and International Library gate already exist in
OpenStreetMap. Both were excluded by their private-access tags, breaking the
connection to the wider campus network. The project owner separately confirmed
that students may walk through each one. TurnRight records those confirmations
without changing the source tags or drawing new geometry.

## Evidence and correction scope

| Connection | Source feature | Existing tags | Review record |
| --- | --- | --- | --- |
| Faculty of Law driveway | [OSM way 591396656](https://www.openstreetmap.org/way/591396656) | `highway=service`, `service=driveway`, `access=private` | `lasu-law-driveway-2026-09-09` |
| International Library gate | [OSM node 13774055448](https://www.openstreetmap.org/node/13774055448) | `barrier=gate`, `access=private` | `lasu-library-gate-2026-09-09` |

The driveway connects the Law paths, including way `773643304`, through shared
source node `5646139929`. The Library gate is at latitude **6.4712453**, longitude
**3.2008782**, on the connection between ways `1505614007` and `1505614015`.
The importer restores segments only along those existing source lines and nodes.

[`data/campus-access.json`](../data/campus-access.json) retains the earlier 62
ordinary-road confirmations and adds these two individual reviews. Expected
tags prevent an allowance from silently following a changed feature type.
Explicit no-foot restrictions, locks, construction and conditional access
invalidate the reviewed allowance. Other private gates and driveways remain
restricted, and unreopened closures still exclude their edges.

The graph retains the gate's source tags and review ID, and adjacent edges
carry the review IDs they depend on. This is confirmation of student access,
not unrestricted visitor access or a physical survey.

## Source refresh

The refresh used an isolated `data/candidates/connection-review/raw/` directory,
preserving the preceding successful raw files. The OSM request bounds were
longitude **3.190–3.215**, latitude **6.455–6.489**. The northern limit was expanded
from 6.485 to cover the full campus extent.

- The refreshed ArcGIS layer data was byte-identical to the previous snapshot.
- Only ArcGIS metadata `lastViewed` and `numViews` changed. Neither establishes
  new geometry or survey accuracy.
- Before applying the two confirmations, the refreshed import produced zero
  additions, removals or modifications to campus map features.
- The reviewed driveway's derived access changes; the gate correction appears
  in graph data. No building outlines, source path coordinates or place names
  were changed.
- No Google Maps geometry or imagery was imported. The preceding
  [Overture comparison](OVERTURE-COMPARISON.md) found no useful additional walking
  geometry for these connections.

Raw-file SHA-256 hashes, exact feature IDs, route results and before/after
metrics are recorded in the
[`connection-review-summary.json`](../data/connection-review-summary.json).
Raw snapshots remain local, ignored files; the reviewed map is checked in and
included in the downloadable package with attribution.

To create a future isolated candidate without replacing the checked-in seed:

```powershell
python scripts/import_campus.py --download --raw-dir data/candidates/next-review/raw --output data/candidates/next-review
```

Review actual feature changes and corrections before packaging or publishing.
Running an import does not itself approve or publish a map.

## Coverage and routes

| Measure | Previous package `lasu-44f8af5654f1` | Reviewed package |
| --- | ---: | ---: |
| Source place records, including duplicates | 219 | 219 |
| Places with mapped approaches | 206 | 206 |
| Approaches on the largest connected component | 190 | 201 |
| Approaches on smaller components | 16 | 5 |
| Places without any mapped approach | 13 | 13 |
| Confirmed connected entrances | 0 | 0 |
| Walking graph components | 8 | 5 |
| Graph nodes | 1,190 | 1,200 |
| Directed graph edges, including excluded geometry | 2,426 | 2,452 |
| Directed segments excluded for building/barrier conflicts | 166 | 166 |
| Roads with reviewed student access | 62 | 63 |

The 26 additional directed segments come from three existing ways: the Law
driveway and the two roads adjoining the Library gate. No old directed edges
were removed. The gate joins existing components, so it connects more than just
the Library destination record.

Routes below start from the LASU Clinic record `arcgis:Infrastructure:17` and
end at existing mapped approaches. Time assumes the app's walking speed of
1.25 m/s; distances and times are rounded for display.

| Destination record | Shortest displayed route | Alternatives |
| --- | --- | --- |
| Faculty of Law — `arcgis:University_Property:6` | **430 m / 6 min** | 665 m / 9 min |
| International Library — `arcgis:University_Property:3` | **875 m / 12 min** | 1.1 km / 15 min; 1.3 km / 17 min |
| International Library — `arcgis:Infrastructure:108` | **870 m / 12 min** | 1.1 km / 15 min; 1.3 km / 18 min |
| Senate Building — `arcgis:University_Property:120` | **1.0 km / 14 min** | 1.3 km / 17 min; 1.4 km / 19 min |

The Clinic origin is about 11 m from its mapped path. The Law approach stops
about 22 m from the place; the Library outline record's approach stops about
50 m away. Those final entrance links remain unverified. Duplicate Library
records are still preserved for later source review.

## Verification

- Seven Python tests pass, including exact-ID access limits, changed-tag and
  stronger-restriction rejection, source-tag preservation, and an end-to-end
  importer fixture with an unrelated private gate left disconnected.
- All 61 Vitest cases across nine files pass. Five real-campus cases test the
  two destinations, the actual reviewed graph edges, preserved tags, and
  closures that remain effective after an expected reopening date.
- Frontend/API TypeScript compilation and the Vite/PWA production build pass.
  Lint has no errors and eight existing explicit-any warnings.
- The local production browser updated from `lasu-44f8af5654f1` to
  `lasu-4e4c8008b38b` and reached **Ready offline**. It displayed the Law and
  Library routes, alternatives, student-access notice and instruction lists.
- With the local preview server stopped, a fresh reload opened the cached app;
  local search and both routes calculated again. The campus map and routes
  rendered from cached data. The preview server was restarted after the check.
  This simulates unavailable same-origin resources; it is not physical-phone
  airplane mode, live GPS, or a campus walk. Audio assets were verified by the
  download, but audio playback was not re-exercised in this check.

The campus package totals **3,159,499 bytes (3.01 MiB)** across 22 required
assets, excluding the separately cached application shell.

## Rollout and remaining review

The code and map were committed separately as `8a27f7c` and `1cbdb5d` and pushed
to `main`. [GitHub preview run 34410023855](https://github.com/mrglasswillbreak/TurnRight/actions/runs/34410023855)
passed its seven Python and 61 Vitest tests and built the frozen map package.
The [hosted preview](https://turnright-3f8iolg68-muhammed-abdulhadi-s-projects.vercel.app)
displayed both routes and downloaded to **Ready offline**.

Vercel's promotion action rebuilt that frozen preview with the production
environment. Deployment
[`dpl_5DBCHCf9WLfUYbZoxnjrGiR8N89w`](https://vercel.com/muhammed-abdulhadi-s-projects/turnright/5DBCHCf9WLfUYbZoxnjrGiR8N89w)
reached **Ready / Production** with `turnright.vercel.app` assigned. At
**22:07 UTC on 9 September 2026**, the public manifest returned
`lasu-4e4c8008b38b`; all 22 required files matched their byte counts and SHA-256
hashes. The app, editor shell, service worker and preceding package manifest
returned HTTP 200 without authentication. Exact evidence is in
[`connection-release-verification.json`](../data/connection-release-verification.json).
The public browser also completed a fresh download to **Ready offline** for
this version.

The preceding Git deployment `dpl_BHn8UFmU8kTbRtmVwRrf4oz6u3GG` and package
`lasu-44f8af5654f1` remain available. `PUBLISHED_MAP_URL` stays configured, so
subsequent ordinary code builds preserve the newly published map. No
credentials, paid plans or database policies changed for this release.

Existing offline installations must open **Offline → Check updates → Download
update** and wait for **Ready offline**. The version should then be
`lasu-4e4c8008b38b`. An active navigation session keeps its prior package until
it ends; an offline device cannot know about this update before reconnecting.

The editor currently has an older approved source baseline and an outstanding
source-change backlog. This reviewed Git package is separate from that
baseline. Before an editor-led map release, reconcile its source candidates
and saved corrections, then validate and preview the assembled snapshot. Do
not promote the older immutable editor preview as this connection update.

Five place approaches still lie on smaller components: Building
Underconstruction, New Science Block, Ongoing Construction, Ongoing Student
Village 2, and Staff Quarter Block 3. Their exact IDs appear in the audit JSON;
similar names may refer to other records. Thirteen places still lack an approach.

The unchanged source geometry also includes eleven invalid multipart ArcGIS
polygons (nine buildings and two land features) whose exterior rings were
imported as holes. This requires a separate importer/geometry review. No such
polygon was repaired or bypassed for these two connections, and the 166
building/barrier exclusions remain enforced. Field-check representative walks,
entrances, closures and deliberate wrong turns using [ACCEPTANCE.md](ACCEPTANCE.md).
