"""Geometry, classification and connected-component primitives for campus snapshots."""

import re
import collections
import json
import math
from place_enrichment import classify


def distance(a, b):
    x = math.radians(b[0] - a[0]) * math.cos(math.radians((a[1] + b[1]) / 2))
    y = math.radians(b[1] - a[1])
    return math.hypot(x, y) * 6371000


def inside(p, ring):
    x, y = p
    result = False
    for a, b in zip(ring, ring[1:] + ring[:1]):
        if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (
            b[1] - a[1]
        ) + a[0]:
            result = not result
    return result


def project(p, sr):
    if sr in (3857, 102100, 102113):
        return [
            round(p[0] / 6378137 * 180 / math.pi, 7),
            round(
                (2 * math.atan(math.exp(p[1] / 6378137)) - math.pi / 2) * 180 / math.pi,
                7,
            ),
        ]
    if sr not in (4326, None):
        raise ValueError(f"Unsupported CRS: {sr}")
    return [round(p[0], 7), round(p[1], 7)]


def arc_geometry(geometry, default_sr=None):
    sr = geometry.get("spatialReference", {}).get(
        "latestWkid", geometry.get("spatialReference", {}).get("wkid", default_sr)
    )
    if "rings" in geometry:
        rings = [[project(p, sr) for p in ring] for ring in geometry["rings"]]

        # Esri rings can contain multiple exterior parts. GeoJSON's later rings
        # are holes, so independent wings must be emitted as a MultiPolygon.
        def area(ring):
            return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:])))

        polygons = []
        for ring in sorted(rings, key=area, reverse=True):
            parents = [
                p for p in polygons if all(inside(point, p[0]) for point in ring[:-1])
            ]
            if parents:
                min(parents, key=lambda p: area(p[0])).append(ring)
            else:
                polygons.append([ring])
        polygons.sort(key=lambda polygon: rings.index(polygon[0]))
        if len(polygons) == 1:
            return {"type": "Polygon", "coordinates": polygons[0]}
        return {"type": "MultiPolygon", "coordinates": polygons}
    return {"type": "Point", "coordinates": project([geometry["x"], geometry["y"]], sr)}


def feature(identifier, geometry, **properties):
    return {
        "type": "Feature",
        "id": identifier,
        "geometry": geometry,
        "properties": {"id": identifier, **properties},
    }


def category(name, tags=None):
    if tags:
        mapped, _ = classify(tags)
        if mapped != "other":
            return mapped
    text = (name + " " + json.dumps(tags or {})).lower()
    for key, terms in [
        ("library", ["library"]),
        ("worship", ["mosque", "church", "chapel", "worship"]),
        ("food", ["restaurant", "cafeteria", "canteen", "food", "cafe"]),
        ("gate", ["gate", "entrance"]),
        ("sports", ["sport", "stadium", "football", "basketball"]),
        ("residence", ["hostel", "quarters", "residence"]),
        (
            "academic",
            [
                "faculty",
                "department",
                "lecture",
                "science",
                "school",
                "laborator",
                "classroom",
                "education",
                "college",
                "theatre",
            ],
        ),
        (
            "services",
            [
                "bank",
                "atm",
                "health",
                "clinic",
                "admin",
                "senate",
                "bookshop",
                "security",
                "centre",
                "center",
            ],
        ),
    ]:
        if any(re.search(r"\b" + re.escape(word), text) for word in terms):
            return key
    return "other"


def components(nodes, edges):
    links = collections.defaultdict(set)
    for edge in edges:
        if edge["accessible"]:
            links[edge["from"]].add(edge["to"])
            links[edge["to"]].add(edge["from"])
    seen, groups = set(), []
    for node in nodes:
        if node not in seen:
            group, stack = set(), [node]
            while stack:
                current = stack.pop()
                if current in seen:
                    continue
                seen.add(current)
                group.add(current)
                stack.extend(links[current] - seen)
            groups.append(group)
    return sorted(groups, key=len, reverse=True)
