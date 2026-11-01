"""Review OSM candidates while preserving the existing routing graph."""

import re
from defusedxml import ElementTree as ET
from shapely.geometry import shape, mapping, Polygon, Point
from shapely.strtree import STRtree


def review_osm(
    OSM_SOURCE,
    actual,
    boundary,
    buildings,
    candidates,
    data,
    destination,
    features,
    key,
    nice,
    shapes,
    source,
    tree,
):
    # Review the complete OSM extract. Newly accepted polygons must be inside
    # both the existing region and the campus polygon, separated from the primary
    # survey and all existing road centrelines. No routing data is imported.
    root = ET.parse(source / "osm/unilag-akoka-access.osm").getroot()
    nodes = {
        n.get("id"): [float(n.get("lon")), float(n.get("lat"))]
        for n in root.findall("node")
    }
    road_shapes = [
        shape(f["geometry"]) for f in features if f["properties"]["kind"] == "path"
    ]
    road_tree = STRtree(road_shapes)
    accepted = []
    for w in root.findall("way"):
        attrs = {t.get("k"): t.get("v") for t in w.findall("tag")}
        points = [nodes[n.get("ref")] for n in w.findall("nd")]
        relevant = (
            attrs.get("building")
            or attrs.get("natural") in ("water", "wood", "wetland")
            or attrs.get("leisure") in ("pitch", "park", "garden", "swimming_pool")
            or attrs.get("amenity") == "parking"
        )
        if not relevant:
            continue
        entry = {"source": "osm-way", "id": w.get("id"), "name": attrs.get("name", "")}
        if len(points) < 4 or points[0] != points[-1]:
            entry["status"] = "needs-review"
            candidates.append(entry)
            continue
        g = Polygon(points)
        if not g.is_valid:
            entry["status"] = "invalid-source"
            candidates.append(entry)
            continue
        if not actual.covers(g) or not boundary.covers(g):
            entry["status"] = "outside-campus"
            candidates.append(entry)
            continue
        overlaps = [
            (
                int(i),
                g.intersection(shapes[i]).area
                / max(1e-16, min(g.area, shapes[i].area)),
            )
            for i in tree.query(g)
        ]
        overlap = max(overlaps, key=lambda t: t[1]) if overlaps else None
        if attrs.get("building"):
            if overlap and overlap[1] >= 0.1:
                entry.update(
                    status="matched" if overlap[1] >= 0.6 else "needs-review",
                    record=buildings[overlap[0]]["properties"]["id"],
                    overlap=round(overlap[1], 4),
                )
                if overlap[1] >= 0.6 and attrs.get("name"):
                    f = buildings[overlap[0]]
                    bid = f["properties"]["id"]
                    name = attrs["name"]
                    if not f["properties"].get("name"):
                        f["properties"]["name"] = nice(name)
                    if not re.search("Makama|Njoku|Akingola", name, re.I):
                        p = g.representative_point()
                        destination(
                            name,
                            [p.x, p.y],
                            "https://www.openstreetmap.org/way/" + w.get("id"),
                            bid,
                        )
            elif shapes[int(tree.nearest(g))].distance(g) * 111000 < 12:
                entry["status"] = "needs-review"
                entry["reason"] = (
                    "Possible shifted duplicate within 12 m of the detailed survey."
                )
            elif g.area * 111000**2 < 25 or attrs.get("man_made"):
                entry["status"] = "needs-review"
                entry["reason"] = "Small structure or utility object."
            elif any(g.intersects(road_shapes[i]) for i in road_tree.query(g)):
                entry["status"] = "needs-review"
                entry["reason"] = (
                    "Footprint intersects an existing route; field review needed."
                )
            else:
                ident = "unilag:osm:way:" + w.get("id")
                props = {
                    "id": ident,
                    "kind": "building",
                    "source": OSM_SOURCE,
                    "sourceId": w.get("id"),
                    "name": nice(attrs.get("name", "")),
                    "buildingCategory": attrs.get("building", "yes"),
                }
                accepted.append(
                    {"type": "Feature", "geometry": mapping(g), "properties": props}
                )
                entry.update(status="included", record=ident)
        elif overlap and overlap[1] > 0.1:
            entry.update(
                status="needs-review",
                reason="Landscape geometry overlaps surveyed buildings.",
            )
        else:
            existing_land = [
                f
                for f in features
                if f["properties"]["kind"] == "land"
                and f["properties"].get("landClass")
                not in ("parcel", "road", "sidewalk")
            ]
            if any(
                g.intersection(shape(f["geometry"])).area / max(g.area, 1e-16) > 0.6
                for f in existing_land
            ):
                entry["status"] = "covered-by-existing-landscape"
            else:
                kind = (
                    "water"
                    if attrs.get("natural") == "water"
                    or attrs.get("leisure") == "swimming_pool"
                    else "parking"
                    if attrs.get("amenity") == "parking"
                    else "sports"
                    if attrs.get("leisure") == "pitch"
                    else "wetland"
                    if attrs.get("natural") == "wetland"
                    else "green"
                )
                ident = "unilag:osm:way:" + w.get("id")
                accepted.append(
                    {
                        "type": "Feature",
                        "geometry": mapping(g),
                        "properties": {
                            "id": ident,
                            "kind": "land",
                            "landClass": kind,
                            "source": OSM_SOURCE,
                            "sourceId": w.get("id"),
                            "name": nice(attrs.get("name", "")),
                        },
                    }
                )
                entry.update(status="included", record=ident)
        candidates.append(entry)
    features.extend(accepted)
    # Nodes and relations are reviewed separately: relation member ways already
    # have dispositions above, but that does not establish a complete multipolygon.
    reviewed_ways = {c["id"]: c for c in candidates if c["source"] == "osm-way"}
    for node in root.findall("node"):
        attrs = {t.get("k"): t.get("v") for t in node.findall("tag")}
        if not any(
            k in attrs
            for k in (
                "name",
                "amenity",
                "shop",
                "tourism",
                "leisure",
                "natural",
                "entrance",
                "barrier",
            )
        ):
            continue
        point = Point(nodes[node.get("id")])
        entry = {
            "source": "osm-node",
            "id": node.get("id"),
            "name": attrs.get("name", ""),
        }
        if not actual.covers(point) or not boundary.covers(point):
            entry["status"] = "outside-campus"
        elif "entrance" in attrs or "barrier" in attrs:
            entry.update(
                status="reference-only",
                reason="Access feature requires field review; no permissions or routing connection inferred.",
            )
        else:
            matched = next(
                (
                    p
                    for p in data["places"]
                    if attrs.get("name")
                    and key(attrs["name"])
                    in [key(p["name"]), *[key(a) for a in p.get("aliases", [])]]
                ),
                None,
            )
            if matched:
                entry.update(status="matched", record=matched["id"])
            else:
                entry.update(
                    status="needs-review",
                    reason="Point-only candidate; no confirmed facility identity or current footprint association.",
                )
        candidates.append(entry)
    for relation in root.findall("relation"):
        attrs = {t.get("k"): t.get("v") for t in relation.findall("tag")}
        members = [
            m.get("ref") for m in relation.findall("member") if m.get("type") == "way"
        ]
        local = [
            reviewed_ways[m]
            for m in members
            if m in reviewed_ways and reviewed_ways[m]["status"] != "outside-campus"
        ]
        entry = {
            "source": "osm-relation",
            "id": relation.get("id"),
            "name": attrs.get("name", ""),
            "memberWays": len(members),
        }
        if attrs.get("type") in ("restriction", "route"):
            entry.update(
                status="reference-only",
                reason="Routing relation retained for comparison; existing graph preserved.",
            )
        elif attrs.get("amenity") == "university" or attrs.get("boundary"):
            entry.update(
                status="reference-only",
                reason="Boundary or institutional compound; existing campus extent retained.",
            )
        elif not local:
            entry.update(
                status="outside-reviewed-coverage",
                reason="No reviewed in-campus member polygon; relation not imported.",
            )
        else:
            entry.update(
                status="needs-review",
                reason="Member ways accounted separately; complete multipolygon holes and compound identity need reconciliation before addition.",
            )
        candidates.append(entry)
