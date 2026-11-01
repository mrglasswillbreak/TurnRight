"""Sample existing routes and associate mapped approaches without inventing connectors."""

from campus_import_geometry import distance, feature, components
from spatial import blocker
import math


def prepare_routing(edges, features, graph_nodes, osm_nodes, places):
    for node in graph_nodes.values():
        if node.get("sourceTags", {}).get("barrier") in {
            "gate",
            "lift_gate",
            "swing_gate",
        }:
            features.append(
                feature(
                    node["id"],
                    {"type": "Point", "coordinates": node["coordinates"]},
                    kind="barrier",
                    name=node["sourceTags"].get("name", "Vehicle gate"),
                    source="osm",
                    sourceTags=node["sourceTags"],
                )
            )
    dense_edges = []
    for edge in edges:
        a, b = edge["from"], edge["to"]
        pa, pb = graph_nodes[a]["coordinates"], graph_nodes[b]["coordinates"]
        steps = max(1, math.ceil(edge["distance"] / 12))
        first, last = sorted((a, b))
        sequence = [a]
        for i in range(1, steps):
            key = f"{edge['sourceId']}:sample:{first}:{last}:{i if a == first else steps - i}"
            graph_nodes[key] = {
                "id": key,
                "coordinates": [
                    round(pa[j] + (pb[j] - pa[j]) * i / steps, 7) for j in (0, 1)
                ],
            }
            sequence.append(key)
        sequence.append(b)
        for i, (start, end) in enumerate(zip(sequence, sequence[1:])):
            dense_edges.append(
                {
                    **edge,
                    "id": f"{edge['id']}:{i}",
                    "from": start,
                    "to": end,
                    "distance": edge["distance"] / steps,
                }
            )
    edges = dense_edges
    for edge in edges:
        conflict = blocker(
            graph_nodes[edge["from"]]["coordinates"],
            graph_nodes[edge["to"]]["coordinates"],
            features,
        )
        if conflict:
            edge["geometryBlocked"] = conflict
    allowed_edges = [
        edge for edge in edges if edge["accessible"] and not edge.get("geometryBlocked")
    ]
    usable_ids = {key for edge in allowed_edges for key in (edge["from"], edge["to"])}
    groups = components(
        {key: value for key, value in graph_nodes.items() if key in usable_ids},
        allowed_edges,
    )
    for place in places:
        # Approach routing explicitly ends on the actual mapped path. No connector
        # across an unmapped courtyard, wall, or building is inserted into the graph.
        options = sorted(
            (
                (distance(place["coordinates"], graph_nodes[k]["coordinates"]), k)
                for k in usable_ids
            )
        )
        if options and options[0][0] <= 90:
            meters, key = options[0]
            place.update(
                graphNode=key,
                approachDistance=round(meters),
                arrivalKind="mapped-approach",
            )
            osm_id = key.removeprefix("osm:node:")
            if meters <= 15 and osm_nodes.get(osm_id, {}).get("tags", {}).get(
                "entrance"
            ) not in (None, "no"):
                place["arrivalKind"] = "entrance"
    return edges, groups
