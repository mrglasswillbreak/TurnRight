# LASU roads and landscape review — 30 September 2026

**Release status:** LASU package `lasu-4895a363b403` was published on 30 September 2026 from reviewed release `aee5cdc6-51dd-42a0-b2ae-1b5d1ad03b4a`. Its 82 illustrative road surfaces and corrected landscape classes are live. The [release log](PRODUCTION.md) records asset, offline and rollback checks and the separate UNILAG release status.

Baseline: `lasu-2b70a39ca041`, with 393 building footprints, 220 destinations, 44 photographs, 95 routing paths and 30 landscape polygons. The enrichment retains the routing graph, permissions, destinations, photographs and authored models.

## Coverage

All 95 source roads are accounted for: **82 illustrative surface polygons**, **12 with no area remaining after exclusions**, and **one geometry conflict held for review** (`osm:way:220639897`). The valid surfaces cover approximately **46,589 m²**. Widths are 71 service/track surfaces at 4 m, eight footpaths at 1.8 m, two streets at 6 m and one parking aisle at 3 m. None is presented as a surveyed width. Source roads remain independently editable and routable under their existing permissions.

The full generation report identifies every road and exclusion. Three microscopic self-intersections introduced by coordinate conversion are corrected by bounded coordinate snapping, retaining every part, ring and vertex. Their projected area changes are below 0.008%; originals and diagnostics are retained. Independent Shapely checks validate the final geometry and check duplicate area.

The 30 existing land polygons are classified as **11 developed, eight green, five water, three proposal parcels, two wetlands and one bare land**. Proposed uses are retained as proposals; a planned car park is not asserted to exist. Original geometries remain unchanged.

## Reviewed sources and decisions

- **Fresh ArcGIS web-map data:** 135 infrastructure points, 30 land-cover polygons, one boundary and 132 university property records. All 30 land-cover names match the published source; maximum geometry difference is 0.008 m in the source projection. Refreshed classifications use explicit land-use attributes. Existing footprints and destinations are retained.
- **Complete OSM extract:** the campus buffer and complete Badagry Creek relation were reviewed. A forest polygon crossing the boundary remains unresolved. Badagry Creek's complete polygon lies outside the boundary and is excluded. No new in-boundary landscape polygon or individually mapped tree passed this review; none was invented.
- **Existing Overture 2026-08-19 candidates:** 967 intersecting building, place and segment candidates retain their previous decisions. These themes do not supply surveyed road-width polygons or additional landscape classifications.
- **Additional research:** LASU's official contact information supplies geolocation, not a reusable detailed vector layer. A regional Ojo research figure lacks a georeferenced campus dataset with clear redistribution terms. LASUED datasets describe a different university and are excluded.

The candidate ledger contains every reviewed disposition, source checksums, ArcGIS comparisons and unresolved conflicts. It is a coverage review, not a claim of field verification. Streets, material, sidewalks and accessibility require evidence beyond a buffered centreline.

## UNILAG corrections in the same upgrade

The reviewed UNILAG patch reclassifies all 426 accepted parcel identities using the parcel source layer and explicit land use. Street addresses no longer become road surfaces or trees. Unambiguous car-park and garden labels retain their appropriate classes. The 179 surveyed road-width records remain separate and retain their source identities and geometry, including polygon 96's 6,094 vertices and 56 holes.

## Reproduce and inspect

- [Reviewed LASU patch](../data/campus-layer-enrichment/lasu-changes.json)
- [Candidate ledger and source checksums](../data/campus-layer-enrichment/lasu-candidate-ledger.json)
- [Per-road generation report](../data/campus-layer-enrichment/lasu-surface-coverage.json)
- [Original conversion candidates and repair diagnostics](../data/campus-layer-enrichment/lasu-surface-repairs.json)
- [UNILAG parcel corrections](../data/campus-layer-enrichment/unilag-changes.json)

`scripts/enrich_campus_layers.py` reconciles the private downloaded snapshots. `scripts/prepare-campus-layer-detail.mts` generates the reviewable surfaces. `scripts/tests/test_campus_layer_detail.py` independently checks their geometry, accounting and classifications. Public packages contain mapped properties and attribution; raw downloads and private owner drafts remain outside Git.

[Layer workflow](CAMPUS-LAYERS.md) · [Attribution](../data/ATTRIBUTION.md) · [Actual release checks](PRODUCTION.md)
