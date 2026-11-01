"""Reconcile owner records, source observations and bounded normalization reports."""

from .normalise_values import digest
import copy
from .geometry import preview_features
from shapely.geometry import shape


def finish_normalisation(
    collections,
    configuration,
    diagnostics,
    duplicates,
    errors,
    feature_count,
    layers,
    mapped_layers,
    observations,
    owner_source,
    previous,
    records,
    repairs,
    skipped,
    source,
    warnings,
):
    # Detect overlaps with other sources. They are review candidates, never auto-merged.
    from shapely.strtree import STRtree

    incoming_buildings = [
        r
        for r in records.values()
        if r["entity"] == "feature" and r["payload"]["properties"]["kind"] == "building"
    ]
    existing = [
        r
        for r in previous
        if r["entity"] == "feature"
        and r["source"] != owner_source
        and r.get("payload", {}).get("properties", {}).get("kind") == "building"
    ] + incoming_buildings
    shapes = [shape(r["payload"]["geometry"]) for r in existing]
    tree = STRtree(shapes)
    for record in records.values():
        if (
            record["entity"] != "feature"
            or record["payload"]["properties"]["kind"] != "building"
        ):
            continue
        geom = shape(record["payload"]["geometry"])
        for index in tree.query(geom):
            if existing[index]["id"] == record["id"]:
                continue
            if (
                existing[index]["source"] == owner_source
                and existing[index]["id"] > record["id"]
            ):
                continue
            candidate = shapes[index]
            if (
                candidate.is_valid
                and geom.intersection(candidate).area
                / max(geom.area, candidate.area, 1e-20)
                > 0.6
            ):
                duplicates.append(
                    {
                        "incomingId": record["payload"]["properties"]["id"],
                        "existingId": existing[index]["payload"]["properties"]["id"],
                        "name": record["payload"]["properties"]["name"],
                    }
                )
    old = {
        r["id"]: r
        for r in previous
        if r["source"] == owner_source
        or r["id"].startswith("feature:" + owner_source + ":")
        or r["id"].startswith("place:" + owner_source + ":")
    }
    # Owner reconciliations remain authoritative; source changes never erase them.
    for ident, record in old.items():
        if record["source"] == "campus-review" and ident in records:
            if record["hash"] != records[ident]["hash"]:
                diagnostics.append(
                    {
                        "sourceId": ident,
                        "message": "Retained owner-reviewed record; compare source changes in the editor.",
                    }
                )
            records[ident] = copy.deepcopy(record)
    mode = configuration.get("refreshMode", "merge")
    selected_prefixes = [
        f"{owner_source}:{digest(m.get('identity') or m['layer'])[:8]}:"
        for m in configuration["layers"]
        if m["role"] != "skip"
    ]
    for ident, record in old.items():
        selected = any(
            ident.split(":", 1)[-1].startswith(prefix) for prefix in selected_prefixes
        )
        if ident not in records and (
            mode == "merge"
            or mode == "replace-layer"
            and not selected
            or record["source"] == "campus-review"
        ):
            records[ident] = copy.deepcopy(record)
    parents = {}

    def component(node):
        parents.setdefault(node, node)
        while parents[node] != node:
            parents[node] = parents[parents[node]]
            node = parents[node]
        return node

    for r in [p for p in previous if p["source"] != owner_source] + list(
        records.values()
    ):
        if r["entity"] == "edge" and r["payload"].get("walkingAccess") not in (
            "private",
            "no",
        ):
            a, b = r["payload"]["from"], r["payload"]["to"]
            parents[component(a)] = component(b)
    components = len({component(n) for n in parents})
    if not components:
        warnings.append(
            "Directions unavailable: there are no reviewed, permitted walking paths. A map-only campus can still be published."
        )
    elif components > 1:
        warnings.append(
            f"Routing gap: {components} disconnected walking networks. Review endpoint connections and entrances; bridges and tunnels are never joined by proximity."
        )
    # Shared campus metadata is updated from the complete accepted baseline, never from just this source.
    meta_record = next((r for r in previous if r["entity"] == "meta"), None)
    if not meta_record:
        raise ValueError("Campus metadata is missing.")
    meta = copy.deepcopy(meta_record)
    metadata = meta["payload"]
    metadata["sources"] = [
        s for s in metadata.get("sources", []) if s["id"] != owner_source
    ] + [
        {
            "id": owner_source,
            "name": source["name"],
            "url": source.get("url") or "",
            "attribution": configuration["attribution"],
            "license": configuration["license"],
            "redistributionConfirmed": configuration["redistributionConfirmed"],
        }
    ]
    meta["hash"] = digest(metadata)
    observations[("__attribution__", source["id"])] = {
        "provider": "configuration",
        "collection": "__attribution__",
        "nativeId": source["id"],
        "stable": True,
        "featureType": "attribution",
        "content": next(s for s in metadata["sources"] if s["id"] == owner_source),
        "records": {meta["id"]: meta},
    }
    collections.append(
        {
            "identity": "__attribution__",
            "count": 1,
            "layer": "Source attribution",
            "complete": True,
        }
    )
    preview, sampling = preview_features(mapped_layers)
    summary = {
        "layers": [
            {
                k: v
                for k, v in layer.items()
                if k not in ("features", "osmNodes", "osmRelations")
            }
            | {"count": len(layer["features"])}
            for layer in layers
        ],
        "counts": {"added": 0, "modified": 0, "removed": 0, "skipped": skipped},
        "warnings": list(dict.fromkeys(warnings)),
        "errors": list(dict.fromkeys(errors))[:500],
        "duplicates": duplicates[:500],
        "features": preview,
        "sampling": sampling,
        "repairs": repairs[:500],
        "diagnostics": diagnostics[:500],
        "totalFeatures": feature_count,
    }
    if duplicates:
        summary["warnings"].append(
            "Overlapping buildings need a keep/merge decision in the existing duplicate review workflow."
        )
    summary["reportCounts"] = {
        "repairs": len(repairs),
        "diagnostics": len(diagnostics),
        "errors": len(set(errors)),
        "duplicates": len(duplicates),
    }
    # Only the shared Node comparator may create review proposals. Raw upstream
    # content is separate from converted shapes, routing and owner corrections.
    for observation in observations.values():
        observation["records"] = list(observation["records"].values())
    # Display layers can change without changing the provider collection (OSM).
    combined = {}
    for collection in collections:
        key = collection["identity"]
        if key not in combined:
            combined[key] = collection.copy()
        else:
            combined[key]["complete"] = combined[key].get(
                "complete", False
            ) and collection.get("complete", False)
            combined[key]["count"] += collection["count"]
    collections = list(combined.values())
    return {
        "summary": summary,
        "proposals": [],
        "convertedRecords": list(records.values()) + [meta],
        "collections": collections,
        "observations": list(observations.values()),
        "expectedSources": previous,
        "repairReport": repairs,
        "diagnosticReport": diagnostics,
        "errorReport": list(dict.fromkeys(errors)),
        "duplicateReport": duplicates,
    }
