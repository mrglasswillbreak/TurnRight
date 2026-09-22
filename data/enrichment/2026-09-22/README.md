# Initial LASU enrichment candidate — 22 September 2026

**The complete candidate remains review material. A reviewed subset was published
as `lasu-3fe75a6ac04b`; see the publication record below.**

Baseline: production `lasu-78d1db1049f5`, downloaded and verified against its
package manifest. Candidate: `lasu-8bee25f4510d`. Overture release:
`2026-08-19.0`. OSM and permitted LASU ArcGIS snapshots were refreshed on
22 September. The transport extract retains its original 9 September retrieval
date and was verified against the same immutable Overture release.

| Coverage | Published | Proposed candidate |
| --- | ---: | ---: |
| Places | 220 | 281 |
| Building footprints | 380 | 631 |
| Road features | 94 | 94 |
| Named road features | 1 | 1 |
| Food-category places | 0 | 0 |
| Places without a confirmed graph approach | 15 | 25 |

The only recorded street name remains **LAW road**. Generic “Campus path” labels
are excluded from named-street counts. New footprint counts include source
proposals and do not mean that 251 additional buildings have been verified.

Initially, all 16,908 review items were classified in `coverage.json`: **0 accepted**,
**14,949 rejected** (outside the campus), and **1,959 awaiting evidence or owner
review**. These are ledger items, not unique physical-feature counts: source
records and proposed changes can describe the same feature.

The evidence queue includes 55 boundary cases, 798 overlapping footprints,
3 possible duplicate places, 14 places requiring campus-location corroboration,
1 footprint crossing a mapped path, and 73 transport geometries. Ordinary
proposals include 10 campus-identifying Overture places, 262 non-overlapping
Overture footprints, and refreshed OSM/ArcGIS source changes. No place gets a
route merely from proximity. Buildings and occupants retain separate identities.

One restaurant-classified record, **Zinette Homes**, is geocoded inside the
campus but gives an Omole address. It remains in the evidence queue. The selected
sources do not substantiate a campus food venue or additional street names;
those gaps need campus records, business information or surveys.

The transport comparison found only 33.8 m of geometry beyond the published
network at a 5 m tolerance, on a Lagos–Badagry Expressway boundary sliver. It is
held for review. Existing campus paths and permissions are not replaced by that
comparison. The candidate retains all published owner-created feature/place IDs,
their graph connections, and published model references. The private accepted
baseline and unpublished corrections were unavailable locally; the owner's
normal reconciliation and release validation remain required.

## Files and reproduction

- `campus.json`: complete proposed source dataset; not copied to the public app.
- `coverage.json`: full decision ledger, before/after counts, source URLs,
  retrieval dates, checksums and reuse permissions.
- `review.geojson`: geometry and evidence candidates for the owner review viewer.
- `transportation.json`: detailed comparison against the verified public map.
- `snapshots.zip`: bounded reusable input snapshots, public baseline and source
  license notices. Contains no private owner drafts or survey recordings.

Snapshot archive SHA-256:
`303a5e89f7c965b9939ee5ae95ae572b092a57443f89b49f619c2ddcbba86df4`.

With the repository's data dependencies installed, from the repository root:

```sh
python -m zipfile -e data/enrichment/2026-09-22/snapshots.zip data/raw/enrichment-replay
python scripts/enrich_campus.py --offline --release 2026-08-19.0 --raw-dir data/raw/enrichment-replay --base data/raw/enrichment-replay/published/campus.json --output data/candidates/enrichment-replay
```

Audit timestamps can differ between replays; the semantic candidate version is
stable. Load `coverage.json` or `review.geojson` in the owner's Source review
panel to inspect the held items. Whole-record and partial-field review still
require the normal authenticated workflow. Apply migration
`007_source_field_reviews.sql` before using partial-field acceptance.

This inventory accounts for the selected source snapshots. It does not claim a
complete campus survey or parity with Google Maps listings.

## Reviewed publication — 22 September 2026

Published [TurnRight](https://turnright.vercel.app/) package
`lasu-3fe75a6ac04b` through the existing owner preview/publication workflow.
[publication-review.json](publication-review.json) records the decisions, source
snapshot receipts, coverage and verification. Apply its explicit accepted-ID
overrides to the immutable original ledger: **88 accepted**, **14,949 rejected**,
and **1,871 awaiting evidence**. These still count ledger items rather than
unique physical features.

The release adds 40 unnamed Overture building footprints and seven recorded OSM
gates, corrects the existing university place's category, and includes the three
saved owner corrections. Accepted footprints have source confidence of at least
0.8, area of at least 20 m², valid geometry inside campus, no overlap with retained
buildings, and at least 3 m separation from mapped paths. Each was reviewed in
map context; this does not constitute field verification. No new names, heights,
tenants, entrances, routing connections or driving permissions were inferred.

| Coverage | Before publication | Published subset |
| --- | ---: | ---: |
| Places | 220 | 220 |
| Building footprints | 380 | 420 |
| Road features | 94 | 94 |
| Named road features | 1 | 1 |
| Food-category places | 0 | 0 |
| Places without a confirmed graph approach | 15 | 15 |
| Directed walking graph edges | 2,524 | 2,524 |

All 61 proposed new places remain held for duplicate, identity or location
evidence, alongside the remaining 222 non-overlapping footprint proposals and
other unresolved changes. Existing place IDs, walking permissions and path
geometry are preserved. There are still no approved vehicle segments or confirmed
parking connections, so driving correctly reports unavailable coverage.

The fresh source workflow completed before review. Accepted feature payloads
matched the inspected candidate by canonical hash despite snapshot serialization
differences. Migration 007 was applied and verified; university category approval
used its partial-field review workflow. All 45 public package assets, including
23 model sectors, passed size and SHA-256 checks. Desktop/mobile preview checks
passed, and production installed the new package and retained its verified
offline state after reload. The imported excluded-segment narrative describes
the full candidate; the published counts in this table were checked separately.
