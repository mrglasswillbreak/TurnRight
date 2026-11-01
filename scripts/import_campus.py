"""Reproducible, bounded LASU source import. No tile downloads or guessed paths.

python scripts/import_campus.py --download   (refreshes raw source snapshots)
python scripts/import_campus.py              (builds from existing snapshots)
python scripts/import_campus.py --output data/candidates  (review candidate)
"""

from campus_import_routing import prepare_routing

from campus_import_sources import read_osm

from campus_import_sources import read_arcgis

from campus_import_geometry import (
    distance as distance,
    inside as inside,
    project as project,
    arc_geometry as arc_geometry,
    feature as feature,
    category as category,
    components as components,
)

import argparse
import datetime as dt
import hashlib
import json
import pathlib
import urllib.request
from defusedxml import ElementTree as ET
from place_enrichment import enrich_osm, update_coverage, snapshot_manifest

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw"
APP_ID = "ffd68667b1464eeb999c0050897a82a0"


def fetch(url, destination):
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "TurnRight-LASU/1.0 (https://github.com/mrglasswillbreak/TurnRight)"
        },
    )
    # Operator-only legacy downloader; callers build fixed ArcGIS/Overpass HTTPS URLs and enforce a 35 MB response limit.
    # nosemgrep: local-runtime.semgrep-rules.python.lang.security.audit.dynamic-urllib-use-detected
    with urllib.request.urlopen(request, timeout=90) as response:
        data = response.read(35_000_001)
    if len(data) > 35_000_000:
        raise ValueError("Source exceeds expected size; review manually")
    temp = destination.with_suffix(".tmp")
    temp.write_bytes(data)
    # Only replace after successful parsing; a failed fetch never erases a snapshot.
    ET.fromstring(data) if destination.suffix == ".xml" else json.loads(data)
    temp.replace(destination)
    destination.with_suffix(".receipt.json").write_text(
        json.dumps(
            {
                "originalRetrieval": dt.datetime.now(dt.timezone.utc).isoformat(),
                "url": url,
                "sha256": hashlib.sha256(data).hexdigest(),
            }
        ),
        encoding="utf-8",
    )


def build(access_policy=None):
    if access_policy is None:
        access_policy = json.loads(
            (ROOT / "data/campus-access.json").read_text(encoding="utf-8")
        )
    boundary, ring, bounds, features, places = read_arcgis(RAW=RAW)
    tree, osm_nodes, graph_nodes, edges, campus_ways = read_osm(
        RAW=RAW,
        access_policy=access_policy,
        features=features,
        places=places,
        ring=ring,
    )
    # Add points along the existing polylines so a long straight road can be
    # selected near its midpoint. This changes sampling, not walkable geometry.
    enriched = {
        "boundary": boundary,
        "places": places,
        "map": {"features": features},
        "graph": {"edges": edges},
    }
    checked = dt.datetime.fromtimestamp(
        (RAW / "osm.xml").stat().st_mtime, dt.timezone.utc
    ).isoformat()
    enrichment_issues = enrich_osm(enriched, tree, checked)
    places, features = enriched["places"], enriched["map"]["features"]
    edges, groups = prepare_routing(
        edges=edges,
        features=features,
        graph_nodes=graph_nodes,
        osm_nodes=osm_nodes,
        places=places,
    )
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    restrictions = []
    for relation in tree.findall("relation"):
        tags = {t.attrib["k"]: t.attrib["v"] for t in relation.findall("tag")}
        if tags.get("type") != "restriction" or "motorcar" in tags.get(
            "except", ""
        ).split(";"):
            continue
        members = relation.findall("member")
        starts = [
            "osm:way:" + m.attrib["ref"]
            for m in members
            if m.attrib.get("role") == "from"
        ]
        ends = [
            "osm:way:" + m.attrib["ref"]
            for m in members
            if m.attrib.get("role") == "to"
        ]
        via = [m for m in members if m.attrib.get("role") == "via"]
        restriction = tags.get(
            "restriction:motorcar",
            tags.get("restriction:motor_vehicle", tags.get("restriction", "")),
        )
        if (
            len(starts) == len(ends) == len(via) == 1
            and via[0].attrib["type"] == "node"
            and restriction.startswith(("no_", "only_"))
            and not any(":conditional" in k for k in tags)
        ):
            node_id = "osm:node:" + via[0].attrib["ref"]
            if (
                node_id in graph_nodes
                and any(e["sourceId"] == starts[0] for e in edges)
                and any(e["sourceId"] == ends[0] for e in edges)
            ):
                restrictions.append(
                    {
                        "id": "osm:relation:" + relation.attrib["id"],
                        "fromSourceId": starts[0],
                        "toSourceId": ends[0],
                        "viaNodeId": node_id,
                        "kind": "only" if restriction.startswith("only_") else "no",
                        "uTurn": restriction == "no_u_turn",
                    }
                )
        else:
            # Unsupported via-way/conditional restrictions fail closed until owner review.
            for edge in edges:
                if edge["sourceId"] in starts:
                    edge["vehicle"]["conditional"] = True
            for f in features:
                if f["properties"].get("id") in starts:
                    f["properties"]["vehicle"]["conditional"] = True
    result = {
        "schemaVersion": 2,
        "driving": {"version": 1, "parking": [], "restrictions": restrictions},
        "version": "",
        "createdAt": now,
        "boundary": boundary,
        "bounds": bounds,
        "map": {"type": "FeatureCollection", "features": features},
        "places": sorted(places, key=lambda p: p["name"]),
        "graph": {"nodes": list(graph_nodes.values()), "edges": edges},
        "closures": [],
        "coverage": {
            "fieldVerified": False,
            "placeCount": len(places),
            "routableCount": sum(p["arrivalKind"] == "entrance" for p in places),
            "approachCount": sum(p["arrivalKind"] == "mapped-approach" for p in places),
            "disconnected": [p["id"] for p in places if not p.get("graphNode")],
            "components": len(groups),
            "notes": [
                "Source-derived map; campus walks have not been field-verified.",
                "Mapped approach routes stop on an existing path near a building, not at an assumed entrance.",
                "Missing paths and entrances require review in the editor.",
                "3D heights derived from floor counts are approximate (3 m per floor).",
            ],
        },
        "sources": [
            {
                "id": "osm",
                "name": "OpenStreetMap contributors",
                "url": "https://www.openstreetmap.org/copyright",
                "attribution": "© OpenStreetMap contributors",
                "license": "ODbL 1.0; OSM-derived database available in the downloadable campus package.",
                "retrievedAt": now,
            },
            {
                "id": "arcgis",
                "name": "LASU Webmap – Main / MangroveandpartnersLimited",
                "url": f"https://www.arcgis.com/home/item.html?id={APP_ID}",
                "attribution": "LASU campus layers: MangroveandpartnersLimited, via ArcGIS Online",
                "license": "ArcGIS item is publicly viewable but provides no redistribution license. Confirm permission with the owner before public deployment.",
                "retrievedAt": now,
            },
        ],
    }
    result["coverage"]["notes"].append(
        f"{sum(bool(e.get('geometryBlocked')) for e in edges)} directed segments excluded due to building or barrier conflicts."
    )
    result["sources"][1]["license"] = (
        "Owner-confirmed offline redistribution permission, 2026-09-08; see data/ATTRIBUTION.md."
    )
    result["sourceSnapshots"] = snapshot_manifest(
        RAW,
        [
            (
                "osm.xml",
                "https://www.openstreetmap.org/api/0.6/map?bbox=3.190,6.455,3.215,6.489",
                "ODbL-1.0",
            ),
            (
                "arcgis.json",
                f"https://www.arcgis.com/sharing/rest/content/items/{APP_ID}/data?f=json",
                "Owner-confirmed permission 2026-09-08",
            ),
        ],
    )
    update_coverage(result)
    if campus_ways:
        result["accessPolicy"] = {
            key: access_policy[key]
            for key in ("id", "audience", "confirmedAt", "summary")
        }
        result["accessPolicy"]["connectionReviews"] = access_policy.get(
            "connectionReviews", []
        )
        result["coverage"]["campusAccessWayCount"] = len(campus_ways)
        result["coverage"]["notes"].append(
            f"Student walking on {len(campus_ways)} existing internal roads enabled from the owner's {access_policy['confirmedAt']} confirmation. Original OSM tags retained; only individually reviewed driveways and gates may override private access. Other restrictions, no-foot access, locked gates, construction and closures remain enforced."
        )
    digest_input = {
        k: v for k, v in result.items() if k not in ("version", "createdAt", "sources")
    }
    result["version"] = (
        "lasu-"
        + hashlib.sha256(json.dumps(digest_input, sort_keys=True).encode()).hexdigest()[
            :12
        ]
    )
    if not graph_nodes or not edges or len(places) < 50:
        raise ValueError(
            "Incomplete import: expected campus places and a nonempty path graph"
        )
    result["_sourceIssues"] = enrichment_issues
    return result


def write_data(data, output):
    output.mkdir(parents=True, exist_ok=True)
    issues = data.pop("_sourceIssues", [])
    (output / "source-issues.json").write_text(
        json.dumps(issues, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    encoded = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode()
    (output / "campus.json").write_bytes(encoded)
    (output / "coverage.json").write_text(
        json.dumps(data["coverage"], indent=2), encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "version": data["version"],
                "bytes": len(encoded),
                "places": len(data["places"]),
                "nodes": len(data["graph"]["nodes"]),
                "edges": len(data["graph"]["edges"]),
                "mappedApproaches": data["coverage"]["approachCount"],
                "unmapped": len(data["coverage"]["disconnected"]),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--output", default="data/seed")
    parser.add_argument(
        "--raw-dir",
        type=pathlib.Path,
        default=RAW,
        help="Isolated source snapshot directory for reproducible review",
    )
    args = parser.parse_args()
    RAW = args.raw_dir.resolve()
    RAW.mkdir(parents=True, exist_ok=True)
    if args.download:
        fetch(
            f"https://www.arcgis.com/sharing/rest/content/items/{APP_ID}/data?f=json",
            RAW / "arcgis.json",
        )
        fetch(
            f"https://www.arcgis.com/sharing/rest/content/items/{APP_ID}?f=json",
            RAW / "arcgis-metadata.json",
        )
        fetch(
            "https://www.openstreetmap.org/api/0.6/map?bbox=3.190,6.455,3.215,6.489",
            RAW / "osm.xml",
        )
    write_data(build(), ROOT / args.output)
