"""Stable enrichment identities, owner preservation and change summaries."""

import copy
import hashlib
import json


def candidate_version(data):
    """Stable content identity across offline replays with new audit timestamps."""

    def canonical(value):
        if isinstance(value, list):
            return [canonical(v) for v in value]
        if isinstance(value, dict):
            return {
                k: canonical(v)
                for k, v in value.items()
                if k not in ("createdAt", "retrievedAt", "checkedAt")
            }
        return value

    content = canonical({k: v for k, v in data.items() if k != "version"})
    return (
        "lasu-"
        + hashlib.sha256(json.dumps(content, sort_keys=True).encode()).hexdigest()[:12]
    )


def preserve_published_owner_data(baseline, candidate):
    """Keep owner-created identities and topology out of upstream deletion proposals."""

    def upstream(key):
        return str(key).startswith(("osm:", "arcgis:", "overture:"))

    feature_ids = {f["properties"]["id"] for f in candidate["map"]["features"]}
    custom_features = [
        f for f in baseline["map"]["features"] if not upstream(f["properties"]["id"])
    ]
    custom_ids = {f["properties"]["id"] for f in custom_features}
    candidate["map"]["features"] += copy.deepcopy(
        [f for f in custom_features if f["properties"]["id"] not in feature_ids]
    )
    place_ids = {p["id"] for p in candidate["places"]}
    candidate["places"] += copy.deepcopy(
        [
            p
            for p in baseline["places"]
            if not upstream(p["id"]) and p["id"] not in place_ids
        ]
    )
    custom_edges = [
        e for e in baseline["graph"]["edges"] if e["sourceId"] in custom_ids
    ]
    custom_nodes = {key for e in custom_edges for key in (e["from"], e["to"])}
    existing_nodes = {n["id"] for n in candidate["graph"]["nodes"]}
    edge_ids = {e["id"] for e in candidate["graph"]["edges"]}
    candidate["graph"]["nodes"] += copy.deepcopy(
        [
            n
            for n in baseline["graph"]["nodes"]
            if n["id"] in custom_nodes and n["id"] not in existing_nodes
        ]
    )
    candidate["graph"]["edges"] += copy.deepcopy(
        [e for e in custom_edges if e["id"] not in edge_ids]
    )
    for key in (
        "visuals",
        "entrances",
        "closures",
        "placeIdAliases",
        "buildingIdAliases",
    ):
        if key in baseline:
            candidate[key] = copy.deepcopy(baseline[key])
    if baseline.get("driving"):
        candidate["driving"]["parking"] = copy.deepcopy(baseline["driving"]["parking"])
        restrictions = candidate["driving"]["restrictions"]
        ids = {r["id"] for r in restrictions}
        restrictions += copy.deepcopy(
            [
                r
                for r in baseline["driving"]["restrictions"]
                if not r["id"].startswith("osm:") and r["id"] not in ids
            ]
        )


def changed_records(before, after):
    def flatten(data):
        return {
            **{"place:" + p["id"]: p for p in data["places"]},
            **{"feature:" + f["properties"]["id"]: f for f in data["map"]["features"]},
        }

    old, new = flatten(before), flatten(after)

    def comparable(record):
        r = copy.deepcopy(record)
        r.pop("evidence", None)
        if isinstance(r.get("properties"), dict):
            r["properties"].pop("evidence", None)
        return r

    rows = []
    for key in sorted(old.keys() | new.keys()):
        if comparable(old.get(key, {})) == comparable(new.get(key, {})):
            continue
        rows.append(
            {
                "id": key,
                "status": "awaiting-evidence",
                "reason": "Owner review required",
                "change": "add"
                if key not in old
                else "remove"
                if key not in new
                else "modify",
            }
        )
    return rows
