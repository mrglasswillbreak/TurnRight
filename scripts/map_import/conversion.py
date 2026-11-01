"""Read private conversion requests and write bounded inspection or normalization results."""

from .encoding import encoded
import json
from pathlib import Path
import re
from map_import.formats import inspect_file, check_expanded_batch
from map_import.geometry import preview_features


def convert(folder):
    from map_import.normalise import normalise

    folder = Path(folder)

    def progress(message):
        temporary = folder / "progress.tmp"
        temporary.write_bytes(encoded({"message": message}))
        temporary.replace(folder / "progress.json")

    request = json.loads((folder / "request.json").read_text(encoding="utf-8"))
    request["configuration"]["_campusId"] = request.get("campus", {}).get("id")
    check_expanded_batch([folder / f["path"] for f in request["files"]])
    layers, warnings = [], request.get("warnings", [])
    for index, source_file in enumerate(request["files"]):
        progress(
            f"Inspecting file {index + 1} of {len(request['files'])}: {source_file.get('label', source_file['path'])}"
        )
        data = inspect_file(
            folder / source_file["path"],
            request["configuration"],
            folder / "expanded",
            source_file.get("label"),
        )
        for layer in data:
            for key in (
                "sourceUrl",
                "layerIdentity",
                "providerRevision",
                "embedded",
                "sourceCollection",
                "snapshotHash",
                "retrievalError",
            ):
                if source_file.get(key) is not None:
                    layer[key] = source_file[key]
            # Expose aliases and domain labels in the mapping UI without losing original values.
            fields = {f["name"]: f for f in source_file.get("fields", [])}
            for field in layer["fields"]:
                meta = fields.get(field["name"], {})
                if not field.get("values"):
                    field["values"] = list(
                        dict.fromkeys(
                            str(f.get("properties", {}).get(field["name"], ""))[:120]
                            for f in layer["features"][:100]
                        )
                    )[:8]
                if meta.get("alias"):
                    field["alias"] = meta["alias"]
                codes = (
                    meta.get("domain", {}).get("codedValues", [])
                    if meta.get("domain")
                    else []
                )
                if codes:
                    field["values"] = [str(c["name"]) for c in codes]
                    field["codedValues"] = {
                        str(c["code"]): str(c["name"]) for c in codes
                    }
                if re.fullmatch(
                    r"(?:id|objectid(?:_[0-9]+)?|fid|globalid)", field["name"], re.I
                ):
                    values = [
                        f.get("properties", {}).get(field["name"])
                        for f in layer["features"]
                    ]
                    field["unique"] = (
                        bool(values)
                        and all(v is not None and str(v).strip() for v in values)
                        and len(set(map(str, values))) == len(values)
                    )
            layers.append(layer)
    if len(layers) > 100 or sum(len(layer["features"]) for layer in layers) > 100000:
        raise ValueError("Import exceeds the layer or feature limit.")
    names = {}
    for layer in layers:
        original = layer["name"]
        names[original] = names.get(original, 0) + 1
        if names[original] > 1:
            layer["name"] = original + " (" + str(names[original]) + ")"
    if request["phase"] == "inspect":
        preview, sampling = preview_features(layers)
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
            "counts": {"added": 0, "modified": 0, "removed": 0, "skipped": 0},
            "warnings": warnings,
            "errors": [],
            "duplicates": [],
            "features": preview,
            "sampling": sampling,
            "totalFeatures": sum(len(layer["features"]) for layer in layers),
        }
        output = {"summary": summary}
    else:
        progress(
            f"Validating and comparing {sum(len(layer['features']) for layer in layers)} features"
        )
        output = normalise(
            layers,
            request["source"],
            request["campus"],
            request["previous"],
            request["configuration"],
            request["importId"],
        )
        output["summary"]["warnings"] = list(
            dict.fromkeys(warnings + output["summary"]["warnings"])
        )
    (folder / "result.json").write_bytes(encoded(output))
