"""Read reviewed ArcGIS and OSM snapshots without inventing source identity or access."""

from campus_import_geometry import distance, inside, arc_geometry, feature, category
from campus_access import (
    vehicle_rules,
    node_blocks_vehicle,
    walking_access,
    node_blocks_walking,
    connection_review,
    access_review_id,
)
import json
from defusedxml import ElementTree as ET


def read_arcgis(RAW):
    arc = json.loads((RAW / "arcgis.json").read_text(encoding="utf-8-sig"))
    layers = {
        x["title"]: x["featureCollection"]["layers"][0]["featureSet"]
        for x in arc["operationalLayers"]
    }
    boundary_geom = arc_geometry(layers["Boundary"]["features"][0]["geometry"])
    ring = boundary_geom["coordinates"][0]
    bounds = [
        [min(p[0] for p in ring), min(p[1] for p in ring)],
        [max(p[0] for p in ring), max(p[1] for p in ring)],
    ]
    boundary = feature(
        "lasu-boundary",
        boundary_geom,
        kind="boundary",
        name="Lagos State University · Ojo",
    )
    features, places = [], []
    for layer_name, kind in [
        ("Land Use Land Cover", "land"),
        ("University_Property", "building"),
        ("Infrastructure", "place"),
    ]:
        layer = layers[layer_name]
        for index, item in enumerate(layer["features"]):
            attrs = item["attributes"]
            geom = arc_geometry(
                item["geometry"], layer.get("spatialReference", {}).get("wkid")
            )
            identifier = f"arcgis:{layer_name}:{attrs.get('FID', index)}"
            name = str(
                attrs.get("Build_name")
                or attrs.get("DESC_")
                or attrs.get("LU_Type")
                or ""
            ).strip()
            props = {
                "kind": kind,
                "name": name,
                "source": "arcgis",
                "height": 0,
                "heightEstimated": False,
            }
            # Storey is descriptive source data, not a surveyed height.
            storey = str(attrs.get("Build_Type", attrs.get("STOREY", ""))).upper()
            floors = {"BUNGALOW": 1, "ISTO": 2, "1STO": 2, "2STO": 3, "3STO": 4}.get(
                storey
            )
            if floors and kind == "building":
                props.update(height=floors * 3, heightEstimated=True)
            if kind != "place":
                features.append(feature(identifier, geom, **props))
            if kind != "land" and name:
                if geom["type"] == "Point":
                    coords = geom["coordinates"]
                else:
                    # Keep the place on its first mapped part; a multi-wing mean
                    # could land between buildings and change arrival semantics.
                    first_ring = (
                        geom["coordinates"][0]
                        if geom["type"] == "Polygon"
                        else geom["coordinates"][0][0]
                    )
                    coords = [
                        sum(p[i] for p in first_ring[:-1]) / len(first_ring[:-1])
                        for i in (0, 1)
                    ]
                if not inside(coords, ring):
                    continue
                aliases = [
                    str(attrs.get(k, "")).strip()
                    for k in ("Abbreviati", "Name_of_De", "Name_of_Fa")
                    if str(attrs.get(k, "")).strip()
                ]
                # Never fuzzy-merge distinct nearby buildings solely on proximity.
                places.append(
                    {
                        "id": identifier,
                        "name": name,
                        "category": category(name),
                        "coordinates": coords,
                        "aliases": aliases,
                        "department": str(attrs.get("Name_of_De") or "").strip(),
                        "faculty": str(attrs.get("Name_of_Fa") or "").strip(),
                        "source": "arcgis",
                        "sourceId": identifier,
                        "arrivalKind": "unmapped",
                        "height": props["height"],
                        "heightEstimated": props["heightEstimated"],
                    }
                )
    return boundary, ring, bounds, features, places


def read_osm(RAW, access_policy, features, places, ring):
    tree = ET.parse(RAW / "osm.xml").getroot()
    osm_nodes = {}
    for node in tree.findall("node"):
        osm_nodes[node.attrib["id"]] = {
            "coordinates": [float(node.attrib["lon"]), float(node.attrib["lat"])],
            "tags": {t.attrib["k"]: t.attrib["v"] for t in node.findall("tag")},
        }
    graph_nodes, edges = {}, []
    campus_ways = []
    for way in tree.findall("way"):
        tags = {t.attrib["k"]: t.attrib["v"] for t in way.findall("tag")}
        refs = [x.attrib["ref"] for x in way.findall("nd")]
        if not all(r in osm_nodes for r in refs):
            raise ValueError(
                "OSM way has missing nodes; this extract cannot establish source removals"
            )
        coords = [osm_nodes[r]["coordinates"] for r in refs]
        if not any(inside(p, ring) for p in coords):
            continue
        identifier = "osm:way:" + way.attrib["id"]
        if tags.get("highway"):
            access = walking_access(identifier, tags, access_policy)
            rules = vehicle_rules(tags)
            access_props = {
                "walkingAccess": access,
                "sourceTags": tags,
                "vehicle": rules,
            }
            if access == "campus":
                access_props["accessReviewId"] = access_review_id(
                    identifier, tags, access_policy
                )
                campus_ways.append(identifier)
            features.append(
                feature(
                    identifier,
                    {"type": "LineString", "coordinates": coords},
                    kind="path",
                    name=tags.get("name", ""),
                    highway=tags["highway"],
                    footDirection={"yes": "forward", "-1": "reverse"}.get(
                        tags.get("oneway:foot"), "both"
                    ),
                    source="osm",
                    **access_props,
                )
            )
            for i, (a, b) in enumerate(zip(refs, refs[1:])):
                # Restrict routes to campus. Do not create junctions at visual crossings.
                if not inside(osm_nodes[a]["coordinates"], ring) or not inside(
                    osm_nodes[b]["coordinates"], ring
                ):
                    continue
                walkable = access in {"yes", "campus"} and not any(
                    node_blocks_walking(
                        osm_nodes[r]["tags"], "osm:node:" + r, access_policy
                    )
                    for r in (a, b)
                )
                vehicle_blocked = any(
                    node_blocks_vehicle(osm_nodes[r]["tags"]) for r in (a, b)
                )
                gate_reviews = []
                for r in (a, b):
                    node_key = "osm:node:" + r
                    node = {
                        "id": node_key,
                        "coordinates": osm_nodes[r]["coordinates"],
                        "sourceTags": osm_nodes[r]["tags"],
                    }
                    review = connection_review(
                        node_key, osm_nodes[r]["tags"], access_policy
                    )
                    if review and osm_nodes[r]["tags"].get("barrier") == "gate":
                        node.update(
                            sourceTags=osm_nodes[r]["tags"], accessReviewId=review["id"]
                        )
                        gate_reviews.append(review["id"])
                    graph_nodes[node_key] = node
                review_ids = (
                    [access_props["accessReviewId"]] if access == "campus" else []
                ) + gate_reviews
                walking_directions = (
                    [(a, b)]
                    if tags.get("oneway:foot") == "yes"
                    else (
                        [(b, a)]
                        if tags.get("oneway:foot") == "-1"
                        else [(a, b), (b, a)]
                    )
                )
                directions = [(a, b), (b, a)]
                for start, end in directions:
                    edges.append(
                        {
                            "id": f"{identifier}:{start}:{end}",
                            "from": "osm:node:" + start,
                            "to": "osm:node:" + end,
                            "distance": round(
                                distance(
                                    osm_nodes[start]["coordinates"],
                                    osm_nodes[end]["coordinates"],
                                ),
                                2,
                            ),
                            "name": tags.get(
                                "name",
                                "Campus path"
                                if tags["highway"] in ("path", "footway", "steps")
                                else "Campus road",
                            ),
                            "vehicle": rules.copy(),
                            "vehicleAllowed": not vehicle_blocked
                            and (
                                rules["direction"] == "both"
                                or (rules["direction"] == "forward") == (start == a)
                            ),
                            "accessible": walkable
                            and (start, end) in walking_directions,
                            "walkingAccess": "campus" if gate_reviews else access,
                            **({"accessReviewId": review_ids[0]} if review_ids else {}),
                            **(
                                {"accessReviewIds": list(dict.fromkeys(review_ids))}
                                if gate_reviews
                                else {}
                            ),
                            "steps": tags["highway"] == "steps",
                            "sourceId": identifier,
                        }
                    )
        elif tags.get("barrier"):
            features.append(
                feature(
                    identifier,
                    {"type": "LineString", "coordinates": coords},
                    kind="barrier",
                    name=tags.get("barrier"),
                    source="osm",
                )
            )
        elif tags.get("building") and coords[0] == coords[-1]:
            # Retain separate source layers; OSM supplements ArcGIS rather than overwriting it.
            centroid = [
                sum(p[i] for p in coords[:-1]) / (len(coords) - 1) for i in (0, 1)
            ]
            if not inside(centroid, ring):
                continue
            overlap = any(
                f["properties"]["kind"] == "building"
                and any(
                    inside(centroid, polygon[0])
                    and not any(inside(centroid, hole) for hole in polygon[1:])
                    for polygon in (
                        [f["geometry"]["coordinates"]]
                        if f["geometry"]["type"] == "Polygon"
                        else f["geometry"]["coordinates"]
                    )
                )
                for f in features
            )
            if not overlap:
                try:
                    height = float(tags.get("height", "0").replace(" m", ""))
                    estimated = False
                except ValueError:
                    height = 0
                    estimated = False
                if not height and tags.get("building:levels", "").isdigit():
                    height = int(tags["building:levels"]) * 3
                    estimated = True
                features.append(
                    feature(
                        identifier,
                        {"type": "Polygon", "coordinates": [coords]},
                        kind="building",
                        name=tags.get("name", ""),
                        height=height,
                        heightEstimated=estimated,
                        source="osm",
                    )
                )
        if (
            tags.get("name")
            and tags.get("highway") is None
            and (tags.get("building") or tags.get("amenity"))
        ):
            centroid = [
                sum(p[i] for p in coords[:-1]) / max(1, len(coords) - 1) for i in (0, 1)
            ]
            if inside(centroid, ring) and not any(
                p["name"].lower() == tags["name"].lower()
                and distance(p["coordinates"], centroid) < 50
                for p in places
            ):
                places.append(
                    {
                        "id": identifier,
                        "name": tags["name"],
                        "category": category(tags["name"], tags),
                        "coordinates": centroid,
                        "aliases": [tags["alt_name"]] if tags.get("alt_name") else [],
                        "source": "osm",
                        "sourceId": identifier,
                        "arrivalKind": "unmapped",
                    }
                )
    for identifier, node in osm_nodes.items():
        tags, coords = node["tags"], node["coordinates"]
        if (
            inside(coords, ring)
            and tags.get("name")
            and ("amenity" in tags or tags.get("barrier") == "gate")
        ):
            key = "osm:node:" + identifier
            places.append(
                {
                    "id": key,
                    "name": tags["name"],
                    "category": category(tags["name"], tags),
                    "coordinates": coords,
                    "aliases": [],
                    "source": "osm",
                    "sourceId": key,
                    "arrivalKind": "unmapped",
                }
            )
    return tree, osm_nodes, graph_nodes, edges, campus_ways
