"""Reproducible, additive cartography review. Never edits a routing node or edge.

Raw downloads stay private. The output contains only mapped application fields,
source references and a disposition for every candidate in the reviewed layers.
"""

from unilag_osm_review import review_osm

import argparse
import copy
import json
import re
import hashlib
from pathlib import Path
from collections import Counter
from shapely.geometry import shape, mapping, Point
from shapely.strtree import STRtree
from map_import.geometry import prepare_geometry
from map_import.semantics import mapped_properties

PREFIX = "import:4e362956-36db-49d4-884d-de4c7b933255:e5e49ffb:"
ROAD_SOURCE = "import:bd74d5cc-2b8d-4d42-977a-00165dc70b7e"
OSM_SOURCE = "unilag-osm-review-2026-09-27"
DATE = "2026-09-30"


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def save(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def nice(value):
    text = re.sub(r"\s+", " ", str(value or "")).strip().title()
    for key in ("Unilag", "C.i.t.s", "Dli", "Atm", "U.l.w.s", "Uba", "Nitda", "Isl"):
        text = text.replace(
            key, {"C.i.t.s": "CITS", "U.l.w.s": "ULWS"}.get(key, key.upper())
        )
    return text


def key(value):
    return re.sub(
        "[^a-z0-9]",
        "",
        str(value)
        .lower()
        .replace("unilag", "")
        .replace("university of lagos", "")
        .replace("centre", "center")
        .replace("faculty of", "")
        .replace("department", "dept"),
    )


def category(name):
    value = name.lower()
    for pattern, kind in [
        ("library", "library"),
        ("mosque|chapel|islamic", "worship"),
        (
            "hostel|residence|jaja|moremi|biobaku|kofo|mariere|amina|makama|tinubu|fagunwa|njoku|carr|akingbola",
            "residence",
        ),
        ("sport|tennis|football|basketball|swimming|squash|handball", "sports"),
        ("canteen|cafeteria|restaurant", "food"),
        (
            "faculty|dept|department|institute|school|lecture|auditorium|arts|science|engineering",
            "academic",
        ),
    ]:
        if re.search(pattern, value):
            return kind
    return "services"


def build(downloads, baseline, output):
    data = load(baseline)
    original = copy.deepcopy(data)
    features = data["map"]["features"]
    by_id = {f["properties"]["id"]: f for f in features}
    buildings = [f for f in features if f["properties"]["kind"] == "building"]
    shapes = [shape(f["geometry"]) for f in buildings]
    tree = STRtree(shapes)
    evidence = []
    candidates = []
    repairs = []
    source = downloads / "UNILAG-Akoka-2026-09-27"
    actual = shape(
        load(source / "osm/campus-boundary.geojson")["features"][0]["geometry"]
    )
    boundary = shape(data["boundary"]["geometry"])
    roads = {
        str(f["properties"]["OBJECTID_1"]): f
        for f in load(downloads / "Roads.geojson.json")["features"]
    }
    for f in features:
        p = f["properties"]
        if p["kind"] == "land":
            p.update(
                mapped_properties(
                    {"NAME": p.get("name", "")}, {"nameField": "NAME"}, "landcover"
                )
            )
            if p["landClass"] == "developed":
                p["landClass"] = "parcel"
        elif p["kind"] == "path":
            raw = roads.get(p["id"].split(":")[-1])
            if raw:
                p["highway"] = (
                    "residential"
                    if raw["properties"].get("ROAD_TYPE") == "ST"
                    else "service"
                )
                p["name"] = nice(p.get("name", "")).replace(" Rd.", " Road")
                p["displaySource"] = (
                    "Owner-provided Roads layer; display classification only"
                )

    for raw in load(downloads / "Road width.geojson.json")["features"]:
        attrs = raw["properties"]
        ident = str(attrs["OBJECTID_1"])
        geom, repair = prepare_geometry(raw["geometry"])
        props = {
            "id": f"{ROAD_SOURCE}:8e590a7a:{ident}",
            "source": ROAD_SOURCE,
            "sourceId": ident,
            "importLayer": "UNILAG Road width",
            "kind": "land",
            "name": attrs["NAME"],
            **mapped_properties(attrs, {"nameField": "NAME"}, "road-surface"),
        }
        features.append(
            {"type": "Feature", "properties": props, "geometry": mapping(geom)}
        )
        candidates.append(
            {
                "source": "road-width",
                "id": ident,
                "status": "included",
                "record": props["id"],
                "class": props["landClass"],
                "surface": props["surface"],
            }
        )
        if repair:
            repairs.append({"sourceId": ident, **repair})

    # Existing reviewed destination identities and coordinates are retained.
    # Building association does not assert an entrance or a route permission.
    for p in data["places"]:
        old = p["name"]
        p["name"] = nice(old)
        p["aliases"] = list(dict.fromkeys([*p.get("aliases", []), old]))
        point = Point(p["coordinates"])
        inside = [
            int(i)
            for i in tree.query(point)
            if shapes[i].covers(point) and shapes[i].area * 111000**2 > 100
        ]
        if not p.get("buildingId") and len(inside) == 1:
            p["buildingId"] = buildings[inside[0]]["properties"]["id"]

    def destination(name, position, ref, building=None, aliases=()):
        normalized = key(name)
        exact = [
            p
            for p in data["places"]
            if normalized in [key(p["name"]), *[key(a) for a in p.get("aliases", [])]]
        ]
        if not exact and building:
            exact = [
                p
                for p in data["places"]
                if p.get("buildingId") == building
                and (normalized in key(p["name"]) or key(p["name"]) in normalized)
            ]
        if exact:
            p = exact[0]
            p["aliases"] = list(dict.fromkeys([*p.get("aliases", []), name, *aliases]))
            p["sourceRefs"] = list(dict.fromkeys([*p.get("sourceRefs", []), ref]))
            if building and not p.get("buildingId"):
                p["buildingId"] = building
            return p["id"], "matched"
        ident = "review:unilag:detail:" + hashlib.sha256(ref.encode()).hexdigest()[:16]
        p = {
            "id": ident,
            "name": nice(name),
            "category": category(name),
            "coordinates": list(position),
            "aliases": list(aliases),
            "source": "campus-review",
            "sourceId": ref,
            "sourceRefs": [ref],
            "arrivalKind": "unmapped",
        }
        if building:
            p["buildingId"] = building
        data["places"].append(p)
        return ident, "included"

    # Reviewed landmark identities: broad ArcGIS "Buildings" polygons are often
    # compounds, not footprints. Keep the original detailed building geometries.
    landmarks = {
        "89": ("Senate Building", "services", ["UNILAG Senate House"]),
        "96": ("Main Library", "library", ["UNILAG Main Library"]),
        "94": (
            "Akintunde Ojo Memorial Hall",
            "library",
            ["Akintunde Ojo Library", "AKT Library"],
        ),
        "93": (
            "J. F. Ade Ajayi Auditorium",
            "academic",
            ["Main Auditorium", "JF Ade Ajayi Hall"],
        ),
        "87": ("Faculty of Arts", "academic", []),
        "491": ("Centre for Information Technology and Systems", "services", ["CITS"]),
        "292": ("Afe Babalola Auditorium", "academic", ["Afe Babalola Hall"]),
        "66": ("Chapel of Christ Our Light", "worship", []),
        "70": ("UNILAG Central Mosque", "worship", ["UNILAG Islamic Centre"]),
        "64": (
            "St Thomas More Catholic Chaplaincy",
            "worship",
            ["St Thomas More Catholic Chapel"],
        ),
        "38": (
            "Jelili Adebisi Omotola Hall",
            "services",
            ["UNILAG Multipurpose Hall", "Multipurpose Hall A, B and C"],
        ),
        "99": ("Faculty of Engineering", "academic", []),
        "261": ("Faculty of Science", "academic", []),
        "524": (
            "Faculty of Management Sciences",
            "academic",
            ["Faculty of Business Administration"],
        ),
        "26": ("Faculty of Education", "academic", []),
        "234": ("UNILAG Medical Centre", "services", ["UNILAG Medical Center"]),
        "283": ("Moremi Hall", "residence", []),
        "270": ("King Jaja Hall", "residence", ["Jaja Hall"]),
        "33": ("Kofo Ademola Hall", "residence", ["Kofo Hall", "Kofoworola Hall"]),
        "34": ("Saburi Biobaku Hall", "residence", ["Biobaku Hall"]),
        "36": ("Henry Carr Hall", "residence", ["Henry Carr Postgraduate Hall"]),
    }
    for suffix, (name, kind, aliases) in landmarks.items():
        f = by_id[PREFIX + suffix]
        f["properties"].update({"name": name, "category": kind})
        matched = next(
            (
                p
                for p in data["places"]
                if any(key(p["name"]) == key(a) for a in [name, *aliases])
            ),
            None,
        )
        if matched:
            matched["name"] = name
            matched["category"] = kind
            matched["aliases"] = list(
                dict.fromkeys([*matched.get("aliases", []), *aliases])
            )
            matched["buildingId"] = PREFIX + suffix
        else:
            g = shape(f["geometry"]).representative_point()
            destination(
                name, [g.x, g.y], "unilag-landmark:" + suffix, PREFIX + suffix, aliases
            )
        evidence.append(
            {
                "id": PREFIX + suffix,
                "name": name,
                "basis": "Detailed footprint, parcel labels, reviewed ArcGIS/OSM facility identity; no entrance or access inferred.",
            }
        )

    # Every preferred ArcGIS candidate receives a disposition. Comparison layers
    # were byte-equivalent at download; their receipts remain with the raw bundle.
    for path in sorted((source / "arcgis").glob("*.geojson")):
        for raw in load(path)["features"]:
            attrs = raw["properties"]
            name = attrs.get("name") or attrs.get("Name") or ""
            g = shape(raw["geometry"])
            entry = {
                "source": "arcgis:" + path.stem,
                "id": str(attrs.get("OBJECTID")),
                "name": name,
            }
            if "Boundary" in path.name:
                entry["status"] = "reference-only"
                entry["reason"] = "Existing published boundary retained."
            elif "Roads" in path.name:
                entry["status"] = "reference-only"
                entry["reason"] = (
                    "Road naming comparator; topology and access preserved."
                )
            elif path.name.startswith("02-"):
                entry["status"] = "reference-only"
                entry["reason"] = (
                    "Compound areas and sports grounds are not individual building footprints."
                )
            elif not boundary.covers(g):
                entry["status"] = "outside-published-boundary"
            elif g.geom_type != "Point":
                entry["status"] = "needs-review"
            else:
                idx = int(tree.nearest(g))
                distance = shapes[idx].distance(g) * 111000
                bid = (
                    buildings[idx]["properties"]["id"]
                    if shapes[idx].covers(g) and shapes[idx].area * 111000**2 > 100
                    else None
                )
                # Source disagreements are explicit, never resolved by a nearest pin alone.
                if re.search(
                    r"Makama|Njoku|Sodeinde|High Rise|Gbajabiam|Acedhars|MADhouse|Tolu Odugbemi",
                    name,
                    re.I,
                ):
                    entry.update(
                        status="needs-review",
                        reason="Conflicting name, shared compound, new construction or shifted footprint; no automatic building association.",
                    )
                else:
                    existing = next(
                        (
                            p
                            for p in data["places"]
                            if key(p["name"]) == key(name)
                            or key(name) in [key(a) for a in p.get("aliases", [])]
                        ),
                        None,
                    )
                    if existing:
                        entry.update(status="matched", record=existing["id"])
                    elif distance <= 10:
                        ident, status = destination(
                            name,
                            list(g.coords)[0],
                            f"arcgis:{path.stem}:{attrs.get('OBJECTID')}",
                            bid,
                        )
                        entry.update(status=status, record=ident)
                    else:
                        entry.update(
                            status="needs-review",
                            reason="Facility pin is not confidently associated with a surveyed footprint.",
                        )
            candidates.append(entry)

    review_osm(
        OSM_SOURCE=OSM_SOURCE,
        actual=actual,
        boundary=boundary,
        buildings=buildings,
        candidates=candidates,
        data=data,
        destination=destination,
        features=features,
        key=key,
        nice=nice,
        shapes=shapes,
        source=source,
        tree=tree,
    )
    old = {f["properties"]["id"]: f for f in original["map"]["features"]}
    changes = {
        "featureUpdates": [
            {
                "id": f["properties"]["id"],
                "properties": {
                    k: v
                    for k, v in f["properties"].items()
                    if old[f["properties"]["id"]]["properties"].get(k) != v
                },
            }
            for f in features
            if f["properties"]["id"] in old and old[f["properties"]["id"]] != f
        ],
        "featureAdds": [f for f in features if f["properties"]["id"] not in old],
        "places": data["places"],
    }
    changes["sources"] = [
        {
            "id": ROAD_SOURCE,
            "name": "UNILAG Road width",
            "url": original["sources"][0]["url"],
            "attribution": "Owner-provided UNILAG road surfaces; OBJECTID_1 retained; original upload and raw attributes preserved privately.",
            "license": "Owner authorised public and offline publication in the UNILAG detail upgrade request, 30 September 2026. No broader reuse licence asserted.",
            "redistributionConfirmed": True,
            "retrievedAt": DATE,
        },
        {
            "id": OSM_SOURCE,
            "name": "OpenStreetMap UNILAG coverage review",
            "url": "https://www.openstreetmap.org/copyright",
            "attribution": "© OpenStreetMap contributors",
            "license": "ODbL-1.0",
            "retrievedAt": "2026-09-27",
        },
    ]
    changes["baselineVersion"] = original["version"]
    changes["graphSha256"] = hashlib.sha256(
        json.dumps(original["graph"], sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    report = {
        "checkedAt": DATE,
        "baselineVersion": original["version"],
        "roads": {
            "sourceFeatures": 179,
            "paved": 80,
            "unpaved": 24,
            "sidewalks": 75,
            "repairs": repairs,
        },
        "candidateCounts": dict(Counter(c["status"] for c in candidates)),
        "candidates": candidates,
        "landmarks": evidence,
        "remaining": [
            "Senate floor totals conflict across sources (11, 12, 13 and 14); architect reference retained with uncertainty.",
            "Main Library parcel labels and compound polygons disagree; landmark association uses the facility pin and identifiable library photograph.",
            "Makama Bida, Eni Njoku and Shodeinde compound assignments disagree.",
            "Medical centre and worship buildings lack confidently licensed exterior references in the searched photograph set.",
            "Unknown roofs, materials, heights and unphotographed elevations retain illustrative defaults.",
            "No new entrance, accessibility, vehicle permission or walking connection is inferred.",
        ],
    }
    save(output / "changes.json", changes)
    save(output / "coverage.json", report)
    save(Path("data/raw/unilag-upgrade/candidate.json"), data)
    print(
        json.dumps(
            {
                "featureUpdates": len(changes["featureUpdates"]),
                "featureAdds": len(changes["featureAdds"]),
                "places": len(data["places"]),
                "candidates": report["candidateCounts"],
                "roadFeatures": len(
                    [
                        f
                        for f in features
                        if f["properties"].get("source") == ROAD_SOURCE
                    ]
                ),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--downloads", type=Path, required=True)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("data/unilag-enrichment"))
    args = parser.parse_args()
    build(args.downloads, args.baseline, args.output)
