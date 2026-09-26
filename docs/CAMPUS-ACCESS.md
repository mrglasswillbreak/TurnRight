# Student walking access correction

The sections below record the first ordinary-road correction. A subsequent
[Law and Library connection review](CONNECTION-REVIEW.md) adds one separately
confirmed driveway and gate. The historical checked-in snapshot below has 201 approaches on
the main network and five path components in package `lasu-4e4c8008b38b`.

On 9 September 2026 the project owner confirmed that LASU's main internal roads
are open to students on foot, except for specific restricted areas. TurnRight
records this confirmation in `data/campus-access.json` as
`lasu-student-roads-2026-09-09`. This is an owner-confirmed access correction,
not a field survey or a statement that the campus is open to all visitors.

## Scope and preserved restrictions

The policy lists 62 existing OSM way IDs: ordinary campus service roads tagged
`access=private`, without a driveway/parking subtype or an explicit walking
restriction. Their imported `sourceTags` retain the original OSM values; the
derived `walkingAccess: campus` and `accessReviewId` record the correction.
Neither OSM nor the raw source snapshots are edited.

Of the original 77 private-tagged ways, 15 remain excluded from this correction:
11 driveway/parking aisle ways and four ways with explicit no-foot access.
Newly imported private roads are not added automatically. Explicit foot/access
restrictions, conditional access, construction, locked gates, barriers and
unreopened closures still take precedence. Permission on a road does not open
an unknown or private gate on that road.

The editor displays the derived walking access when a path is selected. An
administrator can override it with a more restrictive correction. Renaming a
path preserves its existing graph segments and closure IDs, including omitted
segments at a restricted gate. Route previews disclose use of student campus
roads and still identify unverified final entrance connections.

## Local package and coverage

The regenerated local package is `lasu-44f8af5654f1`, totaling 3,148,440 bytes
(3.00 MiB), excluding the independently cached application shell.

| Measure | Before correction | After correction |
|---|---:|---:|
| Source place records, including duplicates | 219 | 219 |
| Places with a mapped approach | 54 | 206 |
| Places without a mapped approach | 165 | 13 |
| Confirmed connected entrances | 0 | 0 |
| Walking graph components | 7 | 8 |
| Directed segments excluded for building/barrier conflicts | 28 | 166 |

Of the 206 approaches, 190 lie in the largest walking component and 16 in
smaller disconnected components. The increase in components and excluded
segments reflects evaluation of more road geometry; it does not mean every
pair of places was connected. Faculty of Law and the International Library
still needed network connections reviewed at this stage. No straight-line shortcuts or assumed
entrances were added. Full metrics are in `data/coverage-report.json`.

## Verification and rollout

Five Python regression tests cover policy boundaries, preserved source tags,
private gates and an end-to-end importer fixture. All 42 TypeScript tests pass,
including editor permission precedence and preservation of a gap at a gate.
The TypeScript/server build and Vite/PWA build pass; lint has no errors.

The local browser calculated LASU Clinic (`arcgis:Infrastructure:17`) to LASU
Senate Building (`arcgis:University_Property:120`): a displayed 1.0 km / 14 minute
route and two alternatives, with step-by-step instructions and the student
access notice. These are software checks, not verified campus walks.

An existing local production-browser installation downloaded this package and
reached **Ready offline**, then installed the updated application shell. With
the preview server stopped, a fresh reload rendered the campus map, local
search found Senate Building, and the same Clinic-to-Senate route and both
alternatives calculated successfully. This checks unavailable same-origin
resources, not airplane mode or real GPS on a physical phone.

Refresh the local application to load the new package. An installation holding
an older offline package must use **Offline → Download update**. The active
package changes only after all required assets pass verification.

The correction was subsequently deployed to the public production map at the
owner's request on 9 September; see [PRODUCTION.md](PRODUCTION.md). Supabase's
approved records and the older immutable preview remain separate from this Git
publication. Before a future editor map release, import and review the source
candidates, preserve administrator corrections, and validate the assembled
snapshot so an older baseline cannot replace this correction. Physical
route/entrance checks remain in `docs/ACCEPTANCE.md`.

The [Overture comparison](OVERTURE-COMPARISON.md) records the preceding dataset;
its private-road and coverage counts are historical evidence for this change.
