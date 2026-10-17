"""Read-only source disposition and ArcGIS geometry audit before Pro access expires.

Inputs and portable archives are immutable. Native checking uses disposable copies;
no geometry repair, source acceptance, licence inference or publication occurs.
"""
import argparse
import collections
import hashlib
import json
from datetime import datetime as Timestamp, timezone
from pathlib import Path


def review(campuses, output):
    import arcpy
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    arcpy.management.CreateFileGDB(str(output), "geometry-review.gdb")
    gdb = output / "geometry-review.gdb"
    receipt = {"schemaVersion": 1, "createdAt": Timestamp.now(timezone.utc).isoformat(),
               "proVersion": arcpy.GetInstallInfo()["Version"], "sourceMutation": False,
               "automaticRepair": False, "campuses": []}
    for slug in ("lasu", "unilag"):
        folder = Path(campuses).resolve() / slug
        archive_folder = folder / "portable-archive"
        archive = json.loads((archive_folder / "archive.json").read_bytes())
        coverage = json.loads((folder / "coverage.json").read_bytes())
        inspection = json.loads((folder / "inspection.json").read_bytes())
        for file in archive["files"]:
            content = (archive_folder / file["file"]).read_bytes()
            if hashlib.sha256(content).hexdigest() != file["sha256"]:
                raise ValueError("Portable evidence hash mismatch: " + file["file"])
        campus = {"slug": slug, "campusId": archive["campusId"],
                  "baselineVersion": archive["baselineVersion"],
                  "archiveSha256": hashlib.sha256((archive_folder / "archive.json").read_bytes()).hexdigest(),
                  "candidateCounts": coverage["counts"], "layers": [],
                  "candidateDispositions": coverage["candidates"]}
        for index, layer in enumerate(archive["layers"]):
            original = next(item for item in inspection["layers"]
                            if item["sourceCollection"] == layer["sourceCollection"])
            source = str(archive_folder / 'evidence' / original["file"])
            geojson = json.loads(Path(source).read_bytes())
            geometries = [f.get("geometry") for f in geojson["features"] if f.get("geometry")]
            copied = str(gdb / f"{slug}_{index}")
            issues_table = str(gdb / f"{slug}_{index}_issues")
            problems = collections.Counter()
            native_count = 0
            native_status = "empty-or-null-geometry"
            if geometries:
                types = {"Polygon": "POLYGON", "MultiPolygon": "POLYGON", "LineString": "POLYLINE", "MultiLineString": "POLYLINE", "Point": "POINT", "MultiPoint": "MULTIPOINT"}
                arcpy.conversion.JSONToFeatures(source, copied, types[geometries[0]["type"]])
                native_count = int(arcpy.management.GetCount(copied)[0])
                if native_count != len(geometries):
                    raise ValueError("Native non-null feature count differs from evidence")
                arcpy.management.CheckGeometry(copied, issues_table, "ESRI")
                with arcpy.da.SearchCursor(issues_table, ["PROBLEM"]) as rows:
                    for problem, in rows:
                        problems[problem] += 1
                native_status = "checked"
            null_count = layer["count"] - len(geometries)
            if null_count:
                problems["null source geometry"] += null_count
            campus["layers"].append({
                "sourceCollection": layer["sourceCollection"], "name": layer["name"],
                "itemId": original["itemId"], "sourceUrl": original["sourceUrl"],
                "features": layer["count"], "nativeCheckedFeatures": native_count,
                "nativeStatus": native_status, "nativeGeometryProblems": dict(problems),
                "surveyDate": layer["surveyDate"], "modifiedAt": layer["modifiedAt"],
                "rights": layer["rights"],
                "disposition": "held-source-rights-and-date-review" if not layer["rights"]["redistributionConfirmed"] else "requires-feature-review",
                "reason": "Public availability does not establish permission. Compare exact existing permission records before any new use; upload time is not survey time.",
            })
        receipt["campuses"].append(campus)
        (output / "source-review.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
        print(json.dumps({"campus": slug, "layers": len(campus["layers"]),
                          "features": sum(x["features"] for x in campus["layers"]),
                          "geometryProblems": sum(sum(x["nativeGeometryProblems"].values()) for x in campus["layers"])}), flush=True)
    return receipt


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("campuses")
    parser.add_argument("new_output")
    args = parser.parse_args()
    review(args.campuses, args.new_output)
