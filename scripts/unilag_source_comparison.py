"""Compare cached UNILAG source snapshots and write their review evidence."""

from unilag_source_io import validate_osm
from unilag_source_constants import SERVICES, BOUNDARY_ID
from datetime import datetime, timezone
import json
from pyproj import Transformer
from shapely.geometry import shape, Polygon, LineString, box
from shapely.ops import transform, unary_union
from unilag_source_io import write_json

project = Transformer.from_crs(4326, 32631, always_xy=True).transform
unproject = Transformer.from_crs(32631, 4326, always_xy=True).transform


def compare(root):
    """Report source differences without fusing or repairing the source records."""
    primary = json.loads((root / "arcgis/metadata.json").read_text(encoding="utf-8"))
    other = json.loads(
        (root / "arcgis/comparison/metadata.json").read_text(encoding="utf-8")
    )
    rows, differences, layers = [], [], {}
    for row in primary["layers"]:
        a = json.loads((root / "arcgis" / row["file"]).read_text(encoding="utf-8"))[
            "features"
        ]
        b = json.loads(
            (root / "arcgis/comparison" / row["file"]).read_text(encoding="utf-8")
        )["features"]
        layers[row["id"]] = a
        by_id = {str(f["properties"][row["objectIdField"]]): f for f in b}
        changed = []
        preferred_ids = {str(f["properties"][row["objectIdField"]]) for f in a}
        changed.extend(sorted(set(by_id) - preferred_ids))
        for f in a:
            oid = str(f["properties"][row["objectIdField"]])
            if f != by_id.get(oid):
                changed.append(oid)
        differences.append(
            {
                "layer": row["name"],
                "preferredCount": len(a),
                "comparisonCount": len(b),
                "differentIds": changed,
            }
        )
        rows.append(
            f"| {row['id']} | {row['name']} | {len(a)} | {len(b)} | {len(changed)} |"
        )
    campus = shape(
        json.loads((root / "osm/campus-boundary.geojson").read_text(encoding="utf-8"))[
            "features"
        ][0]["geometry"]
    )
    buffer = shape(
        json.loads(
            (root / "osm/access-buffer-500m.geojson").read_text(encoding="utf-8")
        )["features"][0]["geometry"]
    )
    osm_meta = json.loads((root / "osm/metadata.json").read_text(encoding="utf-8"))
    s, w, n, e = osm_meta["bboxSouthWestNorthEast"]
    if not box(w, s, e, n).covers(buffer):
        raise ValueError("Download rectangle does not cover the 500 m buffer")
    _, elements = validate_osm((root / "osm/unilag-akoka-access.osm").read_bytes())
    osm_buildings, osm_paths, buildings_in_campus = [], [], 0
    for (kind, oid), el in elements.items():
        if kind != "way":
            continue
        tags = {t.attrib["k"]: t.attrib["v"] for t in el.findall("tag")}
        if not tags.get("highway") and not tags.get("building"):
            continue
        coords = [
            (
                float(elements[("node", nd.attrib["ref"])].attrib["lon"]),
                float(elements[("node", nd.attrib["ref"])].attrib["lat"]),
            )
            for nd in el.findall("nd")
        ]
        if len(coords) < 2:
            continue
        geom = LineString(coords)
        if not geom.intersects(buffer):
            continue
        if (
            tags.get("building") not in (None, "no")
            and len(coords) >= 4
            and coords[0] == coords[-1]
        ):
            polygon = Polygon(coords)
            if not polygon.is_valid:
                continue
            if polygon.intersects(campus):
                buildings_in_campus += 1
            osm_buildings.append((oid, tags, transform(project, polygon)))
        if tags.get("highway"):
            osm_paths.append((oid, tags, transform(project, geom.intersection(buffer))))
    overlaps, conflicts, invalid = [], [], []
    for f in layers[2]:
        geom = transform(project, shape(f["geometry"]))
        if not geom.is_valid:
            invalid.append(f["properties"]["OBJECTID"])
            continue
        for oid, tags, candidate in osm_buildings:
            if not geom.intersects(candidate):
                continue
            intersection = geom.intersection(candidate).area
            union = geom.union(candidate).area
            if not union or intersection / union < 0.25:
                continue
            row = {
                "arcgisObjectId": f["properties"]["OBJECTID"],
                "osmWayId": oid,
                "intersectionOverUnion": round(intersection / union, 4),
                "arcgisName": f["properties"].get("Name"),
                "osmName": tags.get("name"),
            }
            overlaps.append(row)
            names = [
                str(row[k] or "").strip().casefold() for k in ("arcgisName", "osmName")
            ]
            if all(names) and names[0] != names[1]:
                conflicts.append(row)
    arc_roads = unary_union(
        [transform(project, shape(f["geometry"])) for f in layers[1]]
    )
    missing = []
    for oid, tags, geom in osm_paths:
        if tags.get("highway") not in ("footway", "path", "pedestrian", "steps"):
            continue
        away = geom.difference(arc_roads.buffer(15)).length
        if away > 20:
            missing.append(
                {
                    "osmWayId": oid,
                    "highway": tags["highway"],
                    "name": tags.get("name"),
                    "lengthAwayFromArcgisRoadsMetres": round(away, 1),
                    "access": {
                        k: v
                        for k, v in tags.items()
                        if k
                        in (
                            "access",
                            "foot",
                            "private",
                            "bridge",
                            "tunnel",
                            "level",
                            "layer",
                        )
                    },
                }
            )
    a = transform(project, unary_union([shape(f["geometry"]) for f in layers[3]]))
    b = transform(project, campus)
    boundary = {
        "arcgisAreaSquareMetres": round(a.area),
        "osmAreaSquareMetres": round(b.area),
        "intersectionOverUnion": round(a.intersection(b).area / a.union(b).area, 5),
        "symmetricDifferenceSquareMetres": round(a.symmetric_difference(b).area),
    }
    report = {
        "arcgisComparison": differences,
        "boundaryComparison": boundary,
        "osmBuildingWaysInBuffer": len(osm_buildings),
        "osmBuildingWaysIntersectingCampus": buildings_in_campus,
        "osmHighwayWaysInBuffer": len(osm_paths),
        "overlapCandidates": overlaps,
        "conflictingNames": conflicts,
        "footpathCoverageCandidates": missing,
        "invalidArcgisBuildingIds": invalid,
        "bufferCoverageVerified": True,
        "analysisNotes": "Geometric candidates only; not a survey or automatic merge. Building relations remain in the complete XML; counts here describe closed building ways. Overlap threshold IoU 0.25; footpath gaps are >20 m outside a 15 m ArcGIS road corridor.",
    }
    write_json(root / "source-comparison.json", report)
    dates = [
        datetime.fromtimestamp(m["item"]["modified"] / 1000, timezone.utc).isoformat()
        for m in (primary, other)
    ]
    text = f"""# UNILAG Akoka — source comparison

Retrieved {primary["retrievedAt"]} (ArcGIS) and {osm_meta["retrievedAt"]} (OSM). These are downloads for private review, not a TurnRight import or publication.

## ArcGIS comparison

Preferred: [Newly Updated map_WFL1](https://www.arcgis.com/home/item.html?id={SERVICES["preferred"][1]}), by `{primary["item"]["owner"]}`; item modified **{dates[0]}**.
Comparison: [Updated_UnilagMap_WFL1](https://www.arcgis.com/home/item.html?id={SERVICES["comparison"][1]}), by `{other["item"]["owner"]}`; item modified **{dates[1]}**.

| Layer ID | Name | Preferred records | Comparison records | Different records by OBJECTID |
|---|---|---:|---:|---:|
{chr(10).join(rows)}

Each layer's count was reconciled against the complete object-ID list, all IDs were downloaded in batches of at most 500, and the final IDs/edit metadata were rechecked. GeoJSON is WGS84 (EPSG:4326). Original attribute values are retained, including source spellings and computed area/length fields; those fields are not recomputed in degrees. Layer metadata includes native EPSG:3857 and field definitions.

The former service is the recommended ArcGIS input when equivalent. Different IDs, if any, are listed in `source-comparison.json`. Item modification and layer edit timestamps describe database edits, **not survey dates**. No field survey date or explicit redistribution licence was supplied in the item metadata. Obtain permission before publishing ArcGIS-derived geometry or distributing it in TurnRight offline packages.

## OSM and access-road coverage

The campus boundary is [way {BOUNDARY_ID}](https://www.openstreetmap.org/way/{BOUNDARY_ID}), version {osm_meta["boundaryVersion"]}, last edited {osm_meta["boundaryEditedAt"]}. Overpass database snapshot: {osm_meta["osmBase"].get("osm_base", "not reported")}.

- Actual campus boundary: `osm/campus-boundary.geojson`.
- Separate 500 m buffer: `osm/access-buffer-500m.geojson`, calculated in UTM zone 31N, EPSG:32631.
- Download rectangle (south, west, north, east): `{s}, {w}, {n}, {e}`. It covers the complete buffer plus rectangular corner overscan.
- XML: **{osm_meta["counts"]["node"]:,} nodes, {osm_meta["counts"]["way"]:,} ways, {osm_meta["counts"]["relation"]:,} relations**. Every referenced node and relation member is present. Complete parent relation geometry deliberately extends beyond the rectangle; do not use the extract's total bounds as the campus boundary.
- Within/intersecting the 500 m buffer: **{len(osm_buildings)} closed building ways** and **{len(osm_paths)} highway ways**; {buildings_in_campus} building ways intersect the campus itself. Building multipolygon relations are retained in XML and are not included in that closed-way count.

Retain `access`, `foot`, `oneway`, `bridge`, `tunnel`, `layer` and restriction relations. Downloaded paths are not certified walkable; review gates, private access, steps and real junctions before routing. OSM contributors' edit timestamps are not physical verification dates.

## Differences requiring review

- Boundary areas: ArcGIS **{boundary["arcgisAreaSquareMetres"]:,} m²**, OSM **{boundary["osmAreaSquareMetres"]:,} m²**. Their intersection/union is **{boundary["intersectionOverUnion"]:.1%}**; symmetric difference **{boundary["symmetricDifferenceSquareMetres"]:,} m²**. Inspect both outlines; neither is a surveyed legal boundary.
- **{len(overlaps)}** cross-source building overlap candidates (intersection/union ≥25%). Importing both without review can duplicate geometry.
- **{len(conflicts)}** overlapping candidates have different nonempty names. Exact IDs/names are in `source-comparison.json`; spelling differences are not automatically resolved.
- **{len(missing)}** OSM pedestrian-path candidates have more than 20 m outside a 15 m corridor around ArcGIS roads. These indicate coverage differences, not confirmed missing real-world paths.
- Invalid preferred ArcGIS building geometries detected: **{len(invalid)}**. The downloaded records remain unchanged; use the editor's repair/review workflow where needed.

Recommendation: use OSM topology/access data for the initial routing review and the more complete footprint set; use preferred ArcGIS facility categories and names as a separately reviewed reference. Keep overlapping source records separate until their IDs, geometry and names are resolved. Use the explicit campus boundary, not the buffer or relation overspill, to create UNILAG. All new data remains private until the owner's review-and-publish workflow.

## Attribution and reproducibility

OSM: **© OpenStreetMap contributors**, [ODbL 1.0](https://www.openstreetmap.org/copyright). ArcGIS: `{primary["item"]["owner"]}`, the two linked items; licence unspecified. Preserve both source records and resolve rights before combining or publishing them.

`arcgis/metadata.json`, `arcgis/comparison/metadata.json`, per-layer metadata and `osm/metadata.json` contain source URLs, timestamps, original identifiers, counts and SHA-256 hashes. `CHECKSUMS.sha256` covers the final package. See [illustrated download instructions](DOWNLOAD-INSTRUCTIONS.md). No paid ArcGIS account is required.
"""
    (root / "SOURCE-COMPARISON.md").write_text(text, encoding="utf-8")
    print(
        json.dumps(
            {
                k: v
                for k, v in report.items()
                if k
                not in (
                    "overlapCandidates",
                    "conflictingNames",
                    "footpathCoverageCandidates",
                )
            },
            indent=2,
        ),
        flush=True,
    )
