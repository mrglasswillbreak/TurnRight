"""Compare inspected ArcGIS layers and export independently reviewable bundles."""

from collections import Counter
import hashlib
import json
from pathlib import Path
import zipfile
from arcgis_review_io import now, encoded, save


def compare(baseline, inspection, directory, output):
    from shapely.geometry import shape
    from shapely.strtree import STRtree

    if hashlib.sha256(encoded(baseline)).hexdigest() != inspection["baselineSha256"]:
        raise ValueError(
            "Baseline changed. Repeat discovery against the current workspace snapshot."
        )
    originals = [f for f in baseline["map"]["features"] if f.get("geometry")]
    shapes = [shape(f["geometry"]) for f in originals]
    tree = STRtree(shapes)
    ledger = []
    for layer in inspection["layers"]:
        path = Path(directory) / layer["file"]
        if hashlib.sha256(path.read_bytes()).hexdigest() != layer["sha256"]:
            raise ValueError(
                "Inspected dataset changed; inspect again before comparing."
            )
        for feature in json.loads(path.read_bytes())["features"]:
            ident = str(feature["properties"][layer["idField"]])
            if not feature.get("geometry"):
                ledger.append(
                    {
                        "layer": layer["sourceCollection"],
                        "id": ident,
                        "status": "invalid-geometry",
                        "reason": "Null source geometry; no map feature can be proposed.",
                    }
                )
                continue
            g = shape(feature["geometry"])
            if g.is_empty or not g.is_valid:
                ledger.append(
                    {
                        "layer": layer["sourceCollection"],
                        "id": ident,
                        "status": "invalid-geometry",
                    }
                )
                continue
            matches = []
            for index in tree.query(g):
                kind = originals[index].get("properties", {}).get("kind")
                roles = {
                    "building": {"building"},
                    "path": {"path"},
                    "landcover": {"land"},
                    "road-surface": {"land"},
                    "boundary": {"boundary"},
                }
                if layer["role"] in roles and kind not in roles[layer["role"]]:
                    continue
                other = shapes[index]
                if not other.is_valid or not g.intersects(other):
                    continue
                exact = g.equals(other)
                overlap = (
                    g.intersection(other).area / max(g.union(other).area, 1e-20)
                    if g.area and other.area
                    else 0
                )
                if exact or overlap > 0.25:
                    matches.append(
                        {
                            "id": originals[index]["properties"].get("id"),
                            "exact": exact,
                            "overlap": round(overlap, 4),
                        }
                    )
            status = (
                "duplicate"
                if any(m["exact"] for m in matches)
                else "probable-duplicate"
                if any(m["overlap"] > 0.98 for m in matches)
                else "conflict"
                if matches
                else "addition-candidate"
            )
            ledger.append(
                {
                    "layer": layer["sourceCollection"],
                    "id": ident,
                    "status": status,
                    "matches": matches,
                    "surveyDate": layer["surveyDate"],
                    "freshness": "unknown-survey-date"
                    if not layer["surveyDate"]
                    else "recorded",
                    "rights": "confirmed"
                    if layer["rights"]["redistributionConfirmed"]
                    else "needs-review",
                }
            )
    buildings = []
    for f in originals:
        p = f.get("properties", {})
        if p.get("kind") != "building":
            continue
        appearance = p.get("appearance") or {}
        buildings.append(
            {
                "id": p.get("id"),
                "name": p.get("name", ""),
                "treatment": "preserve-authored"
                if p.get("modelDocument") or p.get("authoredModelRevision")
                else "source-supported"
                if p.get("height") or p.get("floors")
                else "illustrative",
                "needed": [
                    name
                    for name, present in [
                        ("height/floors", p.get("height") or p.get("floors")),
                        ("roof evidence", appearance.get("roofForm")),
                        ("facade evidence", appearance.get("walls")),
                    ]
                    if not present
                ],
            }
        )
    report = {
        "schemaVersion": 1,
        "campusId": inspection["campusId"],
        "baselineVersion": baseline["version"],
        "createdAt": now(),
        "thresholds": {
            "polygonOverlapCandidate": 0.25,
            "probableDuplicateOverlap": 0.98,
        },
        "counts": dict(Counter(r["status"] for r in ledger)),
        "candidates": ledger,
        "buildings": buildings,
        "buildingTreatments": dict(Counter(b["treatment"] for b in buildings)),
        "limitations": [
            "Source comparison only; no absence implies demolition.",
            "Modification dates are not survey dates.",
            "No source or editor correction is automatically accepted.",
        ],
    }
    save(output, report)
    return report


def export_bundle(inspection, directory, output):
    from map_import.exchange import MANIFEST

    if not inspection["layers"]:
        raise ValueError("No complete layers to export.")
    entries, paths = [], []
    for layer in inspection["layers"]:
        path = Path(directory) / layer["file"]
        if hashlib.sha256(path.read_bytes()).hexdigest() != layer["sha256"]:
            raise ValueError("Dataset changed after inspection.")
        entries.append(
            {k: v for k, v in layer.items() if k not in {"rawFile", "rawSha256"}}
        )
        paths.append(path)
    manifest = {
        k: inspection[k]
        for k in (
            "schemaVersion",
            "generator",
            "campusId",
            "campusName",
            "baselineVersion",
            "baselineSha256",
        )
    }
    manifest["layers"] = entries
    output = Path(output)
    if output.exists():
        raise ValueError("Choose a new bundle name; previous evidence is retained.")
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(MANIFEST, encoded(manifest))
        for path, entry in zip(paths, entries):
            archive.write(path, entry["file"])
    if output.stat().st_size > 50 * 1024 * 1024:
        output.unlink()
        raise ValueError("Bundle exceeds 50 MiB. Export fewer layers.")
    return {
        "file": str(output),
        "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        "layers": len(entries),
    }
