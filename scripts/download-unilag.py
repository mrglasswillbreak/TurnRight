"""Reproducible public-source UNILAG download, without importing/publishing it.

Python 3.11+, shapely==2.1.2, pyproj==3.7.2. Network responses are cached so a
failed Overpass request can be retried without downloading ArcGIS again.
"""

from unilag_source_io import validate_osm as validate_osm

from unilag_source_io import UTC as UTC, write_json as write_json

from unilag_source_comparison import compare as compare

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from pyproj import Transformer
from shapely.geometry import shape, mapping, Polygon
from shapely.ops import transform

from unilag_source_constants import SERVICES, BASE, LAYERS, BOUNDARY_ID


project = Transformer.from_crs(4326, 32631, always_xy=True).transform
unproject = Transformer.from_crs(32631, 4326, always_xy=True).transform


def request(url, data=None):
    req = Request(
        url,
        data=data,
        headers={
            "User-Agent": "TurnRight-UNILAG-source-download/1.0 (manual research)",
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )
    # Operator-only research downloader; callers select fixed ArcGIS/Overpass HTTPS endpoints and responses are size bounded.
    # nosemgrep: local-runtime.semgrep-rules.python.lang.security.audit.dynamic-urllib-use-detected
    with urlopen(req, timeout=240) as response:
        raw = response.read(100 * 1024 * 1024 + 1)
        if len(raw) > 100 * 1024 * 1024:
            raise ValueError("Response exceeds the 100 MiB safety bound")
        return raw


def api(url, **params):
    value = json.loads(request(url + "?" + urlencode({"f": "json", **params})))
    if "error" in value:
        raise ValueError(f"{url}: {value['error']}")
    return value


def validate_geojson(data, ids, oid):
    if data.get("type") != "FeatureCollection":
        raise ValueError("Expected a GeoJSON feature collection")
    if data.get("exceededTransferLimit"):
        raise ValueError("ArcGIS truncated the response")
    got = [str(f["properties"][oid]) for f in data["features"]]
    if len(got) != len(set(got)) or set(got) != set(map(str, ids)):
        raise ValueError("ArcGIS record IDs are missing or duplicated")
    for f in data["features"]:
        if f.get("geometry"):
            bounds = shape(f["geometry"]).bounds
            if bounds and not (
                3 < bounds[0] < 4
                and 6 < bounds[1] < 7
                and 3 < bounds[2] < 4
                and 6 < bounds[3] < 7
            ):
                raise ValueError(
                    "Unexpected placement; expected WGS84 near UNILAG Akoka"
                )


def arcgis(root):
    results = {}
    for label, (service, item_id) in SERVICES.items():
        folder = root / "arcgis" / ("comparison" if label == "comparison" else "")
        metadata_file = folder / "metadata.json"
        if metadata_file.exists():
            saved = json.loads(metadata_file.read_text(encoding="utf-8"))
            for row in saved["layers"]:
                raw = (folder / row["file"]).read_bytes()
                if hashlib.sha256(raw).hexdigest() != row["sha256"]:
                    raise ValueError("Cached ArcGIS dataset checksum mismatch")
            results[label] = saved
            continue
        service_url = BASE + service + "/FeatureServer"
        item = api("https://www.arcgis.com/sharing/rest/content/items/" + item_id)
        meta = {
            "retrievedAt": UTC(),
            "serviceUrl": service_url,
            "item": item,
            "outputCRS": "EPSG:4326",
            "layers": [],
            "redistribution": "Unspecified; public access is not a redistribution licence",
        }
        write_json(folder / "service.json", api(service_url))
        for layer_id in LAYERS:
            url = service_url + "/" + str(layer_id)
            info = api(url)
            ids = sorted(
                api(url + "/query", where="1=1", returnIdsOnly="true")["objectIds"]
                or []
            )
            count = api(url + "/query", where="1=1", returnCountOnly="true")["count"]
            if count != len(ids):
                raise ValueError("ArcGIS count/ID mismatch before retrieval")
            features = []
            batch = min(500, info.get("maxRecordCount", 1000))
            for offset in range(0, len(ids), batch):
                part = api(
                    url + "/query",
                    objectIds=",".join(map(str, ids[offset : offset + batch])),
                    outFields="*",
                    returnGeometry="true",
                    outSR=4326,
                    f="geojson",
                )
                if part.get("exceededTransferLimit"):
                    raise ValueError("Server truncated an object-ID batch")
                features.extend(part["features"])
            data = {"type": "FeatureCollection", "features": features}
            validate_geojson(data, ids, info["objectIdField"])
            final_ids = sorted(
                api(url + "/query", where="1=1", returnIdsOnly="true")["objectIds"]
                or []
            )
            final_info = api(url)
            if ids != final_ids or info.get("editingInfo") != final_info.get(
                "editingInfo"
            ):
                raise ValueError(
                    "ArcGIS changed during retrieval; start a fresh dated download"
                )
            name = f"{layer_id:02d}-{info['name']}.geojson"
            write_json(folder / name, data)
            write_json(folder / f"{layer_id:02d}-layer-metadata.json", info)
            row = {
                "id": layer_id,
                "name": info["name"],
                "file": name,
                "count": count,
                "objectIdField": info["objectIdField"],
                "ids": ids,
                "source": url,
                "retrievedAt": UTC(),
                "editingInfo": info.get("editingInfo"),
                "sha256": hashlib.sha256((folder / name).read_bytes()).hexdigest(),
            }
            meta["layers"].append(row)
            print(label, name, count, flush=True)
        write_json(metadata_file, meta)
        results[label] = meta
    return results


def osm(root, endpoint):
    folder = root / "osm"
    folder.mkdir(parents=True, exist_ok=True)
    boundary_file = folder / "boundary-source.osm"
    boundary_url = f"https://www.openstreetmap.org/api/0.6/way/{BOUNDARY_ID}/full"
    if not boundary_file.exists():
        boundary_file.write_bytes(request(boundary_url))
    _, elements = validate_osm(boundary_file.read_bytes())
    way = elements[("way", BOUNDARY_ID)]
    coords = [
        [float(elements[("node", n.attrib["ref"])].attrib[k]) for k in ("lon", "lat")]
        for n in way.findall("nd")
    ]
    polygon = Polygon(coords)
    if not polygon.is_valid or coords[0] != coords[-1]:
        raise ValueError("Campus boundary is not a valid closed polygon")
    tags = {t.attrib["k"]: t.attrib["v"] for t in way.findall("tag")}
    feature = {
        "type": "Feature",
        "id": "way/" + BOUNDARY_ID,
        "geometry": mapping(polygon),
        "properties": {
            **tags,
            "osm_id": BOUNDARY_ID,
            "osm_type": "way",
            "version": way.attrib.get("version"),
            "editedAt": way.attrib.get("timestamp"),
        },
    }
    write_json(
        folder / "campus-boundary.geojson",
        {"type": "FeatureCollection", "features": [feature]},
    )
    buffered = transform(
        unproject, transform(project, polygon).buffer(500, quad_segs=32)
    )
    write_json(
        folder / "access-buffer-500m.geojson",
        {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": mapping(buffered),
                    "properties": {
                        "distanceMetres": 500,
                        "calculationCRS": "EPSG:32631",
                        "role": "download extent; not campus boundary",
                    },
                }
            ],
        },
    )
    west, south, east, north = buffered.bounds
    bbox = f"{south - 0.00001:.7f},{west - 0.00001:.7f},{north + 0.00001:.7f},{east + 0.00001:.7f}"
    query = f"""// UNILAG Akoka plus a 500 m buffer. Bbox deliberately includes corner overscan.
// Full parent relations and their descendants may extend beyond this rectangle.
[out:xml][timeout:180][maxsize:104857600];
(nwr({bbox});way({BOUNDARY_ID});)->.areaData;
(.areaData;rel(bw.areaData);rel(bn.areaData);)->.withParents;
(.withParents;.withParents >>;);
out meta;
"""
    (folder / "unilag-access.overpassql").write_text(query, encoding="utf-8")
    path = folder / "unilag-akoka-access.osm"
    if not path.exists():
        print("Downloading OSM with complete relation members", bbox, flush=True)
        for attempt in range(3):
            try:
                raw = request(endpoint, urlencode({"data": query}).encode())
                validate_osm(raw)
                path.write_bytes(raw)
                break
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(15 * (attempt + 1))
    elif (folder / "metadata.json").exists():
        saved = json.loads((folder / "metadata.json").read_text(encoding="utf-8"))
        if hashlib.sha256(path.read_bytes()).hexdigest() != saved["sha256"]:
            raise ValueError("Cached OSM dataset checksum mismatch")
    tree, all_elements = validate_osm(path.read_bytes())
    saved_meta = folder / "metadata.json"
    retrieved = (
        json.loads(saved_meta.read_text(encoding="utf-8"))["retrievedAt"]
        if saved_meta.exists()
        else UTC()
    )
    metadata = {
        "retrievedAt": retrieved,
        "endpoint": endpoint,
        "boundarySource": boundary_url,
        "boundaryEditedAt": way.attrib.get("timestamp"),
        "boundaryVersion": way.attrib.get("version"),
        "bboxSouthWestNorthEast": list(map(float, bbox.split(","))),
        "bufferMetres": 500,
        "counts": dict(Counter(k[0] for k in all_elements)),
        "completeReferences": True,
        "osmBase": tree.find("meta").attrib if tree.find("meta") is not None else {},
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "attribution": "© OpenStreetMap contributors",
        "license": "ODbL 1.0",
        "licenseUrl": "https://www.openstreetmap.org/copyright",
        "extentNote": "Complete bbox covers the 500 m polygon buffer; corner overscan and complete referenced objects outside the extent are intentionally retained.",
    }
    write_json(folder / "metadata.json", metadata)
    print("OSM verified", metadata["counts"], flush=True)
    return metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--overpass", default="https://overpass-api.de/api/interpreter")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    arcgis(args.output)
    osm(args.output, args.overpass)
    compare(args.output)


if __name__ == "__main__":
    main()
