"""Read-only Overture/campus geometry audit; never changes routing or source records.

Install overturemaps and shapely in an isolated environment. See the comparison
report for the tested versions. Download both Overture segment and connector
extracts for the complete campus before running this script.
"""
import argparse
import collections
import datetime as dt
import hashlib
import html
import json
import math
import pathlib
import re
import xml.etree.ElementTree as ET

from shapely.affinity import affine_transform
from shapely import make_valid
from shapely.geometry import LineString, Point, mapping, shape
from shapely.ops import unary_union

ROOT = pathlib.Path(__file__).resolve().parents[1]


def read(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def line_parts(geometry):
    if geometry.geom_type == "LineString":
        return [geometry] if geometry.length > 0 else []
    return [part for child in getattr(geometry, "geoms", []) for part in line_parts(child)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--segments", type=pathlib.Path, required=True)
    parser.add_argument("--connectors", type=pathlib.Path, required=True)
    parser.add_argument("--release", required=True)
    parser.add_argument("--base", type=pathlib.Path, default=ROOT / "data/seed/campus.json")
    parser.add_argument("--osm", type=pathlib.Path, default=ROOT / "data/raw/osm.xml")
    parser.add_argument("--output", type=pathlib.Path, default=ROOT / "data/candidates/overture")
    args = parser.parse_args()
    base, segments, connectors = read(args.base), read(args.segments), read(args.connectors)
    if any(data.get("type") != "FeatureCollection" or not data.get("features") for data in [segments, connectors]):
        raise ValueError("Both extracts must be nonempty GeoJSON FeatureCollections")
    minlon, minlat, maxlon, maxlat = shape(base["boundary"]["geometry"]).bounds
    lon, lat = (minlon + maxlon) / 2, (minlat + maxlat) / 2
    sx, sy = math.pi / 180 * 6371000 * math.cos(math.radians(lat)), math.pi / 180 * 6371000

    def project(geom):
        return affine_transform(geom, [sx, 0, 0, sy, -lon * sx, -lat * sy])

    def unproject(geom):
        return affine_transform(geom, [1 / sx, 0, 0, 1 / sy, lon, lat])

    campus = project(shape(base["boundary"]["geometry"]))
    if not campus.is_valid:
        raise ValueError("Campus boundary is invalid; review before comparing")
    road_features = [f for f in base["map"]["features"] if f["properties"].get("kind") == "path"]
    roads = unary_union([project(shape(f["geometry"])).intersection(campus) for f in road_features])
    nodes = {n["id"]: n["coordinates"] for n in base["graph"]["nodes"]}
    closures = {edge for c in base.get("closures", []) if not c.get("reopenedAt") for edge in c["edgeIds"]}
    usable_edges = [e for e in base["graph"]["edges"] if e["accessible"] and not e.get("geometryBlocked") and e["id"] not in closures]
    routable = unary_union([project(LineString([nodes[e["from"]], nodes[e["to"]]])).intersection(campus) for e in usable_edges])
    invalid_buildings = [f["properties"]["id"] for f in base["map"]["features"] if f["properties"].get("kind") == "building" and not shape(f["geometry"]).is_valid]
    # Some imported ArcGIS multipart outlines were represented as external holes.
    # Repair a COPY for intersection measurements only; do not modify the seed.
    buildings = unary_union([project(make_valid(shape(f["geometry"]))) for f in base["map"]["features"] if f["properties"].get("kind") == "building"])
    osm_ways = {w.attrib["id"]: {t.attrib["k"]: t.attrib["v"] for t in w.findall("tag")} for w in ET.parse(args.osm).getroot().findall("way")}
    osm_nodes = {n.attrib["id"]: n for n in ET.parse(args.osm).getroot().findall("node")}
    rows, overlay, campus_lines = [], [], []
    connector_ids = {f.get("id", f["properties"].get("id")) for f in connectors["features"]}
    for feature in segments["features"]:
        props = feature["properties"]
        if props.get("subtype") != "road":
            continue
        geom = project(shape(feature["geometry"])).intersection(campus)
        parts = line_parts(geom)
        if not parts:
            continue
        geom = unary_union(parts)
        campus_lines.append(geom)
        novel = geom.difference(roads.buffer(5))
        names = props.get("names") or {}
        row = {
            "id": feature.get("id", props.get("id")),
            "class": props.get("class"),
            "name": names.get("primary", "") if isinstance(names, dict) else names,
            "campusMetres": round(geom.length, 1),
            "outsideExistingMap5mMetres": round(novel.length, 1),
            "outsideRoutableGraph5mMetres": round(geom.difference(routable.buffer(5)).length, 1),
            "insideBuildingMetres": round(geom.intersection(buildings).length, 1),
            "sources": props.get("sources", []),
            "accessRestrictions": props.get("access_restrictions", []),
            "connectors": props.get("connectors", []),
            "missingExtractConnectorIds": [c["connector_id"] for c in props.get("connectors", []) if c["connector_id"] not in connector_ids],
            "reviewStatus": "unreviewed",
        }
        rows.append(row)
        overlay.append({"type": "Feature", "geometry": mapping(unproject(geom)), "properties": row})
    if not rows:
        raise ValueError("No road segments intersect campus; do not treat this as an empty successful import")
    overture = unary_union(campus_lines)
    base_way_ids = {f["properties"]["id"].removeprefix("osm:way:") for f in road_features}
    source_ways_absent_from_base = []
    for row in rows:
        for source in row["sources"]:
            match = re.fullmatch(r"w(\d+)@\d+", source.get("record_id", ""))
            if match and match[1] not in base_way_ids:
                source_ways_absent_from_base.append({"segmentId": row["id"], "osmRecord": source["record_id"], "class": row["class"], "campusMetres": row["campusMetres"]})
    existing_rows = []
    for f in road_features:
        props = f["properties"]
        tags = osm_ways.get(props["id"].removeprefix("osm:way:"), {})
        geom = project(shape(f["geometry"])).intersection(campus)
        if geom.length <= 0:
            continue
        existing_rows.append({"id": props["id"], "name": props.get("name", ""), "highway": tags.get("highway"), "access": tags.get("access", "unspecified"), "foot": tags.get("foot", "unspecified"), "campusMetres": round(geom.length, 1), "coordinates": list(unproject(geom.representative_point()).coords[0])})
    private_roads = unary_union([project(shape(f["geometry"])).intersection(campus) for f in road_features if osm_ways.get(f["properties"]["id"].removeprefix("osm:way:"), {}).get("access") == "private"])
    unmapped = [p for p in base["places"] if not p.get("graphNode")]
    nearby = [{"id": p["id"], "name": p["name"], "metresToPrivateRoad": round(project(Point(p["coordinates"])).distance(private_roads), 1)} for p in unmapped]
    campus_entrances = []
    for node_id, node in osm_nodes.items():
        tags = {t.attrib["k"]: t.attrib["v"] for t in node.findall("tag")}
        if tags.get("entrance") not in (None, "no") and campus.covers(project(Point(float(node.attrib["lon"]), float(node.attrib["lat"])))):
            campus_entrances.append({"id": node_id, "tags": tags})
    report = {
        "createdAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "release": args.release,
        "baseVersion": base["version"],
        "inputsSha256": {"base": digest(args.base), "osm": digest(args.osm), "segments": digest(args.segments), "connectors": digest(args.connectors)},
        "invalidBaselineBuildingIdsRepairedForAnalysisOnly": invalid_buildings,
        "method": "Clip to the ArcGIS campus polygon; local equirectangular metres; union removes duplicate direction/overlapping lines. Compare against ALL mapped paths and separately against permitted unclosed/unblocked routing edges. Buffer proximity is geometry similarity, not proof of equal topology or walking permission.",
        "baseline": {"mapWays": len(existing_rows), "privateWays": sum(r["access"] == "private" for r in existing_rows), "footNoWays": sum(r["foot"] == "no" for r in existing_rows), "allMappedMetres": round(roads.length, 1), "routableMetres": round(routable.length, 1), "routableSourceWays": len({e["sourceId"] for e in usable_edges}), "unmappedPlaces": len(unmapped), "unmappedWithin90mOfPrivateRoad": sum(r["metresToPrivateRoad"] <= 90 for r in nearby), "osmEntranceNodesInsideCampus": campus_entrances},
        "overture": {"bboxSegments": len(segments["features"]), "bboxConnectors": len(connectors["features"]), "campusSegments": len(rows), "classes": dict(collections.Counter(r["class"] for r in rows)), "sourceDatasets": dict(collections.Counter(s.get("dataset", "unknown") for r in rows for s in r["sources"])), "campusMetres": round(overture.length, 1), "novelMetresByTolerance": {str(t): round(overture.difference(roads.buffer(t)).length, 1) for t in [2, 5, 10]}, "segmentsWithAtLeast10mNovelGeometryAt5m": sum(r["outsideExistingMap5mMetres"] >= 10 for r in rows), "missingFromOvertureAt5mMetres": round(roads.difference(overture.buffer(5)).length, 1), "segmentsWithAccessRules": sum(bool(r["accessRestrictions"]) for r in rows)},
        "segments": sorted(rows, key=lambda r: -r["outsideExistingMap5mMetres"]),
        "existingWayAccess": existing_rows,
        "unmappedPlacesNearPrivateRoads": sorted(nearby, key=lambda r: r["metresToPrivateRoad"]),
        "limitations": ["Comparison only: nothing has been added to routing or published.", "Proximity does not establish an entrance or a permitted connection.", "Access rules and connector semantics are retained for review, not simplified into permission.", "Results compare the downloaded release against the local seed, not unsaved or hosted administrator drafts.", "No paths in this audit were field surveyed."],
    }
    args.output.mkdir(parents=True, exist_ok=True)
    report["overture"].update({
        "segmentsWithPrivateAccessCondition": sum(any("as_private" in ((a.get("when") or {}).get("recognized") or []) for a in r["accessRestrictions"]) for r in rows),
        "segmentsWithFootDenial": sum(any(a.get("access_type") == "denied" and "foot" in ((a.get("when") or {}).get("mode") or []) for a in r["accessRestrictions"]) for r in rows),
        "sourceWaysAbsentFromBase": source_ways_absent_from_base,
    })
    assert routable.difference(roads.buffer(0.5)).length < 1, "Baseline routing geometry must match the displayed source paths"
    assert all(r["outsideExistingMap5mMetres"] <= r["campusMetres"] + 0.1 for r in rows)
    assert all(not r["missingExtractConnectorIds"] for r in rows), "Download area does not contain all referenced campus-segment connectors"
    (args.output / "comparison.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    (args.output / "overture-campus-review.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": overlay}, ensure_ascii=False), encoding="utf-8")
    (args.output / "comparison.svg").write_text(render_map(campus, roads, routable, overture.difference(roads.buffer(5)), private_roads, buildings, args.release), encoding="utf-8")
    print(json.dumps({key: report[key] for key in ["release", "baseVersion", "baseline", "overture"]}, indent=2))


def render_map(campus, roads, routable, novel, private, buildings, release):
    x0, y0, x1, y1 = campus.bounds
    width, height, margin = 1080, 1340, 70
    scale = min((width - 2 * margin) / (x1 - x0), (height - 320) / (y1 - y0))

    def xy(x, y):
        return (width - (x1 - x0) * scale) / 2 + (x - x0) * scale, 150 + (y1 - y) * scale

    def points(coords):
        return " ".join(f"{u:.2f},{v:.2f}" for u, v in (xy(*p) for p in coords))

    def lines(geometry, color, stroke):
        return "".join(f'<polyline points="{points(line.coords)}" fill="none" stroke="{color}" stroke-width="{stroke}" stroke-linejoin="round" stroke-linecap="round"/>' for line in line_parts(geometry))

    polygons = [buildings] if buildings.geom_type == "Polygon" else list(buildings.geoms)
    footprints = "".join(f'<polygon points="{points(p.exterior.coords)}" fill="#e2e6ea"/>' for p in polygons if p.geom_type == "Polygon")
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
<rect width="100%" height="100%" fill="#f7f9fc"/>
<g font-family="Arial, sans-serif" fill="#16243b">
<text x="45" y="53" font-size="28" font-weight="700">TurnRight: LASU walking network comparison</text>
<text x="45" y="85" font-size="17">Overture {html.escape(release)} versus the current campus seed</text>
<polygon points="{points(campus.exterior.coords)}" fill="#fff" stroke="#a9b4c6" stroke-width="2"/>
{footprints}{lines(roads, '#bec7d4', 2.5)}{lines(private, '#d68c26', 3)}{lines(routable, '#1764ed', 4)}{lines(novel, '#bd32a1', 5)}
<text x="950" y="150" font-size="18">N ↑</text>
<g font-size="17"><text x="45" y="1214" fill="#1764ed">━ Current permitted routing</text>
<text x="420" y="1214" fill="#ae6b11">━ Existing OSM roads tagged private</text>
<text x="45" y="1250" fill="#bd32a1">━ Overture geometry &gt;5 m from existing mapped roads</text>
<text x="45" y="1286" font-size="15">Geometry comparison only. Magenta is not approved walking access. No field verification.</text>
<text x="45" y="1315" font-size="13">© OpenStreetMap contributors, Overture Maps Foundation · LASU / MangroveandpartnersLimited</text></g>
</g></svg>'''


if __name__ == "__main__":
    main()
