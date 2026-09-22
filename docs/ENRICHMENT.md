# Campus enrichment

The [initial candidate and complete review ledger](../data/enrichment/2026-09-22/README.md)
include a verified production comparison and bounded input archive for offline
reproduction. They are review material, not a public map release.

TurnRight keeps reusable source data in its offline map. Google Maps listings,
imagery and traced geometry are not inputs. Coverage stays within the existing
LASU campus polygon. A source's existence claim does not grant access or confirm
an entrance, accuracy, opening hours or parking availability.

## Reproduce a candidate

Use Python 3.12+ in an isolated environment and install
`python -m pip install -r scripts/requirements-data.txt`. From the repository root:

```sh
python scripts/enrich_campus.py
python scripts/enrich_campus.py --offline --release 2026-08-19.0
```

The first command verifies the current production campus JSON against its public
manifest, refreshes bounded OSM and permitted LASU ArcGIS snapshots, and downloads
Overture places, buildings, transportation segments and connectors. The current
release is resolved once per run; completed extracts are cached by release,
bounding box and SHA-256. Failed, truncated or unrecognized extracts stop the run
before anything can enter the source queue. A bounded adapter matches typed STAC
asset paths as well as file extents, because the August 2026 index has a null
`collection` column. Row-level bbox filtering is applied independently; missing
theme metadata fails the run rather than being interpreted as empty coverage.
Parquet row-group statistics restrict HTTPS range downloads, with a 200 MB
transfer ceiling per selected file; unrelated global data is not downloaded.
`--cached-sources` reuses the current OSM/ArcGIS snapshot when retrying an Overture
download. An offline replay reads all four completed extracts without networking.

Use `--base PATH`, `--raw-dir PATH`, and `--output PATH` for isolated comparisons.
The existing `import_campus.py` remains available for an OSM/ArcGIS-only candidate.
It now also requires the data dependencies above.

Outputs are in `data/candidates/enrichment/`:

- `campus.json`: proposed source dataset, **not a published package**.
- `coverage.json`: public baseline, proposed counts, snapshot receipts, and a
  decision ledger. `awaiting-evidence` includes source-backed proposals needing
  owner review. No local import manufactures an owner acceptance.
- `review.geojson`: overlapping footprints, likely duplicates, boundary cases,
  and transportation geometry held for review.
- `transportation/`: a refreshed comparison with the actual published network.

The owner Source review panel can open the coverage or GeoJSON review artifacts
to locate uncertain candidates. The daily source workflow uploads these artifacts
and queues ordinary source additions/modifications/removals. It does not publish.

## Owner review and provenance

Before the first enriched release, reconcile the accepted source baseline with
the published map using the existing owner workflow. The daily workflow reads
accepted sources and owner corrections with the existing private service role;
only counts and a fingerprint enter the coverage report. When those credentials
are unavailable locally, the report states that limitation explicitly.

Source review shows changed fields, before/after geometry, supporting evidence
and possible duplicate identities. For modified records, owners can accept
descriptive fields separately; coordinates, connections and other differences
remain pending. Apply `supabase/migrations/007_source_field_reviews.sql` before
using this control. It records decisions privately and rejects stale reviews.
Whole-record review continues to work unchanged. Source absence is not evidence
of closure or demolition.

Keep tenants separate from buildings and other nearby businesses. A duplicate
suggestion never merges records. Owner corrections, saved-place aliases, walking
and driving approvals, parking, closures and model references survive source
refreshes. Release validation still checks topology and restrictions.

Business details support subtype, address, public business phone, website,
recorded hours and recorded status. Each imported field retains source identity,
record reference, check date, license and release where applicable. Owner edits
can record a new evidence source and date. Changed fields discard stale evidence.
Do not put private notes or contact details in public evidence fields.

Survey markers can represent a new business/place or an entrance to an existing
place. Business markers can be applied without drawing a connecting path.
Reviewed path sections have an optional observed name; the survey session name
does not become a street name. Existing accuracy, foreground recording, undo,
recovery and explicit connection rules still apply.

## Offline behavior and source rights

Optional details remain compatible with existing schema 1/2 readers. Old packages
simply lack them. Street search highlights source geometry without inventing a
destination. Recorded hours/status never imply a live opening check. Websites
need an internet connection. Package creation includes required label glyph ranges,
attribution and public evidence; raw recordings and reviewer identities are omitted.

Overture providers are checked against the documented licensing registry in the
adapter. Unknown or changed provider licenses remain in review. Building themes
carry ODbL plus applicable upstream attribution; place records retain their
provider-specific license. Machine-generated footprints are candidates, not
surveyed outlines. Google Open Buildings is a separately licensed dataset and
must not be confused with Google Maps content.

Initial source checks found off-campus businesses geocoded onto the campus.
Overture places therefore need a campus-identifying source name/address before
entering ordinary additions; other locations stay in the evidence queue.
Footprints overlapping existing buildings or crossing mapped paths also remain
in geometry review. Generic “Campus path” labels are not counted as street names.

Completion means all discovered candidates in the selected snapshots are
accounted for, with unresolved gaps listed. It does not claim exhaustive campus
coverage, field verification or parity with another map provider.
