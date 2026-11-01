"""Convert reviewed path geometry into conservative routing nodes and edges."""

from .normalise_values import distance
from .semantics import public_tags


def add_paths(
    add,
    attrs,
    errors,
    feature,
    geom,
    ident,
    is_osm,
    layer,
    m,
    mapped_value,
    name,
    owner_source,
    props,
    role,
    warnings,
):
    if role == "path":
        lines = list(geom.geoms) if geom.geom_type == "MultiLineString" else [geom]
        access = (
            m.get("walkingAccess")
            or str(mapped_value("accessField", "access") or "private").lower()
        )
        if is_osm:
            access = (
                "yes"
                if attrs.get("highway")
                in (
                    "footway",
                    "pedestrian",
                    "path",
                    "steps",
                    "residential",
                    "service",
                    "unclassified",
                    "living_street",
                    "tertiary",
                    "secondary",
                    "primary",
                )
                else "no"
            )
            if attrs.get("access") in ("private", "no") or attrs.get("foot") in (
                "private",
                "no",
            ):
                access = "no"
            if attrs.get("foot") in ("yes", "designated", "permissive"):
                access = "yes"
            if (
                attrs.get("construction")
                or attrs.get("highway") == "construction"
                or attrs.get("access:conditional")
                or attrs.get("foot:conditional")
            ):
                access = "no"
        if access not in ("yes", "private", "no"):
            access = "private"
        props.update(
            {
                "walkingAccess": access,
                "autoConnectCrossings": False,
                "sourceTags": public_tags(attrs) if is_osm else {},
            }
        )
        if not is_osm:
            warnings.append(
                "Imported line endpoints are separate until connected in the editor. Review path access and junctions before routing."
            )
        for li, line in enumerate(lines):
            coordinates = list(line.coords)
            ids = []
            for vi, point in enumerate(coordinates):
                node_ref = (
                    feature.get("osmNodes", [None] * len(coordinates))[vi]
                    if is_osm
                    else None
                )
                node_id = (
                    f"{owner_source}:node:{node_ref}"
                    if node_ref is not None
                    else f"{ident}:line:{li}:vertex:{vi}"
                )
                node = {"id": node_id, "coordinates": list(point)}
                node_data = layer.get("osmNodes", {}).get(
                    str(node_ref), layer.get("osmNodes", {}).get(node_ref, {})
                )
                if node_data.get("tags"):
                    node["sourceTags"] = public_tags(node_data["tags"])
                add("node", node_id, node)
                ids.append(node_id)
            for vi in range(len(ids) - 1):
                if distance(coordinates[vi], coordinates[vi + 1]) < 0.01:
                    errors.append(
                        f"{name or ident}: path has a zero-length segment; repair the source geometry."
                    )
                    continue
                for reverse in (False, True):
                    a, b = (vi + 1, vi) if reverse else (vi, vi + 1)
                    edge_id = f"{ident}:line:{li}:edge:{vi}:{int(reverse)}"
                    blocked = any(
                        (
                            layer.get("osmNodes", {})
                            .get(str(n), layer.get("osmNodes", {}).get(n, {}))
                            .get("tags", {})
                            .get("access")
                            in ("private", "no")
                            or layer.get("osmNodes", {})
                            .get(str(n), layer.get("osmNodes", {}).get(n, {}))
                            .get("tags", {})
                            .get("barrier")
                            in ("gate", "fence", "wall", "turnstile")
                        )
                        for n in feature.get("osmNodes", [])[vi : vi + 2]
                    )
                    add(
                        "edge",
                        edge_id,
                        {
                            "id": edge_id,
                            "from": ids[a],
                            "to": ids[b],
                            "distance": distance(coordinates[a], coordinates[b]),
                            "name": name or "Imported path",
                            "accessible": attrs.get("highway") != "steps",
                            "steps": attrs.get("highway") == "steps",
                            "walkingAccess": "no" if blocked else access,
                            "sourceId": ident,
                        },
                    )
