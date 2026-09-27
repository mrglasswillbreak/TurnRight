"""Reproducible public-source UNILAG download, without importing/publishing it.

Python 3.11+, shapely==2.1.2, pyproj==3.7.2. Network responses are cached so a
failed Overpass request can be retried without downloading ArcGIS again.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

from pyproj import Transformer
from shapely.geometry import shape, mapping, Polygon, LineString, box
from shapely.ops import transform, unary_union

SERVICES = {
    "preferred": ("Newly_Updated_map_WFL1", "18c645c3189f4c40aa6f29a301b01554"),
    "comparison": ("Updated_UnilagMap_WFL1", "3ae5894e76fe4b89b8a7f07bb9f3b2fc"),
}
BASE = "https://services8.arcgis.com/dmauH753guPhYUcJ/ArcGIS/rest/services/"
LAYERS = [1, 2, 3, 13, 14, 15, 16, 17, 18, 19]
BOUNDARY_ID = "539288366"
UTC = lambda: datetime.now(timezone.utc).isoformat()
project = Transformer.from_crs(4326, 32631, always_xy=True).transform
unproject = Transformer.from_crs(32631, 4326, always_xy=True).transform


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def request(url, data=None):
    req = Request(url, data=data, headers={"User-Agent": "TurnRight-UNILAG-source-download/1.0 (manual research)",
                  "Content-Type": "application/x-www-form-urlencoded"})
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
            if bounds and not (3 < bounds[0] < 4 and 6 < bounds[1] < 7 and 3 < bounds[2] < 4 and 6 < bounds[3] < 7):
                raise ValueError("Unexpected placement; expected WGS84 near UNILAG Akoka")


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
        meta = {"retrievedAt": UTC(), "serviceUrl": service_url, "item": item,
                "outputCRS": "EPSG:4326", "layers": [], "redistribution": "Unspecified; public access is not a redistribution licence"}
        write_json(folder / "service.json", api(service_url))
        for layer_id in LAYERS:
            url = service_url + "/" + str(layer_id)
            info = api(url)
            ids = sorted(api(url + "/query", where="1=1", returnIdsOnly="true")["objectIds"] or [])
            count = api(url + "/query", where="1=1", returnCountOnly="true")["count"]
            if count != len(ids):
                raise ValueError("ArcGIS count/ID mismatch before retrieval")
            features = []
            batch = min(500, info.get("maxRecordCount", 1000))
            for offset in range(0, len(ids), batch):
                part = api(url + "/query", objectIds=",".join(map(str, ids[offset:offset + batch])),
                           outFields="*", returnGeometry="true", outSR=4326, f="geojson")
                if part.get("exceededTransferLimit"):
                    raise ValueError("Server truncated an object-ID batch")
                features.extend(part["features"])
            data = {"type": "FeatureCollection", "features": features}
            validate_geojson(data, ids, info["objectIdField"])
            final_ids = sorted(api(url + "/query", where="1=1", returnIdsOnly="true")["objectIds"] or [])
            final_info = api(url)
            if ids != final_ids or info.get("editingInfo") != final_info.get("editingInfo"):
                raise ValueError("ArcGIS changed during retrieval; start a fresh dated download")
            name = f"{layer_id:02d}-{info['name']}.geojson"
            write_json(folder / name, data)
            write_json(folder / f"{layer_id:02d}-layer-metadata.json", info)
            row = {"id": layer_id, "name": info["name"], "file": name, "count": count,
                   "objectIdField": info["objectIdField"], "ids": ids, "source": url,
                   "retrievedAt": UTC(), "editingInfo": info.get("editingInfo"),
                   "sha256": hashlib.sha256((folder / name).read_bytes()).hexdigest()}
            meta["layers"].append(row)
            print(label, name, count, flush=True)
        write_json(metadata_file, meta)
        results[label] = meta
    return results


def validate_osm(raw):
    tree = ET.fromstring(raw)
    if tree.tag != "osm" or tree.find("remark") is not None:
        raise ValueError("Overpass returned an error or an incomplete extract")
    records = [e for e in tree if e.tag in ("node", "way", "relation")]
    elements = {(e.tag, e.attrib["id"]): e for e in records}
    if len(elements) != len(records):
        raise ValueError("Duplicated OSM identity")
    for e in elements.values():
        references = [("node", n.attrib["ref"]) for n in e.findall("nd")]
        references += [(m.attrib["type"], m.attrib["ref"]) for m in e.findall("member")]
        for key in references:
            if key not in elements:
                raise ValueError(f"Incomplete OSM reference: {e.tag}/{e.attrib['id']} -> {key}")
    return tree, elements


def osm(root, endpoint):
    folder = root / "osm"
    folder.mkdir(parents=True, exist_ok=True)
    boundary_file = folder / "boundary-source.osm"
    boundary_url = f"https://www.openstreetmap.org/api/0.6/way/{BOUNDARY_ID}/full"
    if not boundary_file.exists():
        boundary_file.write_bytes(request(boundary_url))
    _, elements = validate_osm(boundary_file.read_bytes())
    way = elements[("way", BOUNDARY_ID)]
    coords = [[float(elements[("node", n.attrib["ref"])].attrib[k]) for k in ("lon", "lat")] for n in way.findall("nd")]
    polygon = Polygon(coords)
    if not polygon.is_valid or coords[0] != coords[-1]:
        raise ValueError("Campus boundary is not a valid closed polygon")
    tags = {t.attrib["k"]: t.attrib["v"] for t in way.findall("tag")}
    feature = {"type": "Feature", "id": "way/" + BOUNDARY_ID, "geometry": mapping(polygon),
               "properties": {**tags, "osm_id": BOUNDARY_ID, "osm_type": "way", "version": way.attrib.get("version"), "editedAt": way.attrib.get("timestamp")}}
    write_json(folder / "campus-boundary.geojson", {"type": "FeatureCollection", "features": [feature]})
    buffered = transform(unproject, transform(project, polygon).buffer(500, quad_segs=32))
    write_json(folder / "access-buffer-500m.geojson", {"type": "FeatureCollection", "features": [{"type": "Feature", "geometry": mapping(buffered), "properties": {"distanceMetres": 500, "calculationCRS": "EPSG:32631", "role": "download extent; not campus boundary"}}]})
    west, south, east, north = buffered.bounds
    bbox = f"{south-0.00001:.7f},{west-0.00001:.7f},{north+0.00001:.7f},{east+0.00001:.7f}"
    query = f'''// UNILAG Akoka plus a 500 m buffer. Bbox deliberately includes corner overscan.
// Full parent relations and their descendants may extend beyond this rectangle.
[out:xml][timeout:180][maxsize:104857600];
(nwr({bbox});way({BOUNDARY_ID});)->.areaData;
(.areaData;rel(bw.areaData);rel(bn.areaData);)->.withParents;
(.withParents;.withParents >>;);
out meta;
'''
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
    retrieved = json.loads(saved_meta.read_text(encoding="utf-8"))["retrievedAt"] if saved_meta.exists() else UTC()
    metadata = {"retrievedAt": retrieved, "endpoint": endpoint, "boundarySource": boundary_url,
                "boundaryEditedAt": way.attrib.get("timestamp"), "boundaryVersion": way.attrib.get("version"),
                "bboxSouthWestNorthEast": list(map(float, bbox.split(','))), "bufferMetres": 500,
                "counts": dict(Counter(k[0] for k in all_elements)), "completeReferences": True,
                "osmBase": tree.find("meta").attrib if tree.find("meta") is not None else {},
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "attribution": "© OpenStreetMap contributors", "license": "ODbL 1.0", "licenseUrl": "https://www.openstreetmap.org/copyright",
                "extentNote": "Complete bbox covers the 500 m polygon buffer; corner overscan and complete referenced objects outside the extent are intentionally retained."}
    write_json(folder / "metadata.json", metadata)
    print("OSM verified", metadata["counts"], flush=True)
    return metadata


def compare(root):
    """Report source differences without fusing or repairing the source records."""
    primary = json.loads((root / "arcgis/metadata.json").read_text(encoding="utf-8"))
    other = json.loads((root / "arcgis/comparison/metadata.json").read_text(encoding="utf-8"))
    rows, differences, layers = [], [], {}
    for row in primary["layers"]:
        a = json.loads((root / "arcgis" / row["file"]).read_text(encoding="utf-8"))["features"]
        b = json.loads((root / "arcgis/comparison" / row["file"]).read_text(encoding="utf-8"))["features"]
        layers[row["id"]] = a
        by_id = {str(f["properties"][row["objectIdField"]]): f for f in b}
        changed = []
        preferred_ids = {str(f["properties"][row["objectIdField"]]) for f in a}
        changed.extend(sorted(set(by_id) - preferred_ids))
        for f in a:
            oid = str(f["properties"][row["objectIdField"]])
            if f != by_id.get(oid):
                changed.append(oid)
        differences.append({"layer": row["name"], "preferredCount": len(a), "comparisonCount": len(b), "differentIds": changed})
        rows.append(f"| {row['id']} | {row['name']} | {len(a)} | {len(b)} | {len(changed)} |")
    campus = shape(json.loads((root / "osm/campus-boundary.geojson").read_text(encoding="utf-8"))["features"][0]["geometry"])
    buffer = shape(json.loads((root / "osm/access-buffer-500m.geojson").read_text(encoding="utf-8"))["features"][0]["geometry"])
    osm_meta = json.loads((root / "osm/metadata.json").read_text(encoding="utf-8"))
    s,w,n,e = osm_meta["bboxSouthWestNorthEast"]
    if not box(w,s,e,n).covers(buffer):
        raise ValueError("Download rectangle does not cover the 500 m buffer")
    _, elements = validate_osm((root / "osm/unilag-akoka-access.osm").read_bytes())
    osm_buildings, osm_paths, buildings_in_campus = [], [], 0
    for (kind, oid), el in elements.items():
        if kind != "way": continue
        tags = {t.attrib["k"]:t.attrib["v"] for t in el.findall("tag")}
        if not tags.get("highway") and not tags.get("building"): continue
        coords = [(float(elements[("node", nd.attrib["ref"])].attrib["lon"]), float(elements[("node", nd.attrib["ref"])].attrib["lat"])) for nd in el.findall("nd")]
        if len(coords) < 2: continue
        geom = LineString(coords)
        if not geom.intersects(buffer): continue
        if tags.get("building") not in (None,"no") and len(coords)>=4 and coords[0]==coords[-1]:
            polygon = Polygon(coords)
            if not polygon.is_valid: continue
            if polygon.intersects(campus): buildings_in_campus += 1
            osm_buildings.append((oid, tags, transform(project, polygon)))
        if tags.get("highway"):
            osm_paths.append((oid,tags,transform(project,geom.intersection(buffer))))
    overlaps, conflicts, invalid = [], [], []
    for f in layers[2]:
        geom = transform(project,shape(f["geometry"]))
        if not geom.is_valid:
            invalid.append(f["properties"]["OBJECTID"])
            continue
        for oid, tags, candidate in osm_buildings:
            if not geom.intersects(candidate): continue
            intersection=geom.intersection(candidate).area
            union=geom.union(candidate).area
            if not union or intersection/union < 0.25: continue
            row={"arcgisObjectId":f["properties"]["OBJECTID"],"osmWayId":oid,"intersectionOverUnion":round(intersection/union,4),"arcgisName":f["properties"].get("Name"),"osmName":tags.get("name")}
            overlaps.append(row)
            names = [str(row[k] or "").strip().casefold() for k in ("arcgisName","osmName")]
            if all(names) and names[0]!=names[1]: conflicts.append(row)
    arc_roads = unary_union([transform(project,shape(f["geometry"])) for f in layers[1]])
    missing = []
    for oid,tags,geom in osm_paths:
        if tags.get("highway") not in ("footway","path","pedestrian","steps"): continue
        away = geom.difference(arc_roads.buffer(15)).length
        if away > 20:
            missing.append({"osmWayId":oid,"highway":tags["highway"],"name":tags.get("name"),"lengthAwayFromArcgisRoadsMetres":round(away,1),"access":{k:v for k,v in tags.items() if k in ("access","foot","private","bridge","tunnel","level","layer")}})
    a = transform(project,unary_union([shape(f["geometry"]) for f in layers[3]]))
    b = transform(project,campus)
    boundary = {"arcgisAreaSquareMetres":round(a.area),"osmAreaSquareMetres":round(b.area),"intersectionOverUnion":round(a.intersection(b).area/a.union(b).area,5),"symmetricDifferenceSquareMetres":round(a.symmetric_difference(b).area)}
    report={"arcgisComparison":differences,"boundaryComparison":boundary,"osmBuildingWaysInBuffer":len(osm_buildings),"osmBuildingWaysIntersectingCampus":buildings_in_campus,"osmHighwayWaysInBuffer":len(osm_paths),"overlapCandidates":overlaps,"conflictingNames":conflicts,"footpathCoverageCandidates":missing,"invalidArcgisBuildingIds":invalid,"bufferCoverageVerified":True,"analysisNotes":"Geometric candidates only; not a survey or automatic merge. Building relations remain in the complete XML; counts here describe closed building ways. Overlap threshold IoU 0.25; footpath gaps are >20 m outside a 15 m ArcGIS road corridor."}
    write_json(root / "source-comparison.json",report)
    dates = [datetime.fromtimestamp(m["item"]["modified"]/1000,timezone.utc).isoformat() for m in (primary,other)]
    text=f'''# UNILAG Akoka — source comparison

Retrieved {primary['retrievedAt']} (ArcGIS) and {osm_meta['retrievedAt']} (OSM). These are downloads for private review, not a TurnRight import or publication.

## ArcGIS comparison

Preferred: [Newly Updated map_WFL1](https://www.arcgis.com/home/item.html?id={SERVICES['preferred'][1]}), by `{primary['item']['owner']}`; item modified **{dates[0]}**.
Comparison: [Updated_UnilagMap_WFL1](https://www.arcgis.com/home/item.html?id={SERVICES['comparison'][1]}), by `{other['item']['owner']}`; item modified **{dates[1]}**.

| Layer ID | Name | Preferred records | Comparison records | Different records by OBJECTID |
|---|---|---:|---:|---:|
{chr(10).join(rows)}

Each layer's count was reconciled against the complete object-ID list, all IDs were downloaded in batches of at most 500, and the final IDs/edit metadata were rechecked. GeoJSON is WGS84 (EPSG:4326). Original attribute values are retained, including source spellings and computed area/length fields; those fields are not recomputed in degrees. Layer metadata includes native EPSG:3857 and field definitions.

The former service is the recommended ArcGIS input when equivalent. Different IDs, if any, are listed in `source-comparison.json`. Item modification and layer edit timestamps describe database edits, **not survey dates**. No field survey date or explicit redistribution licence was supplied in the item metadata. Obtain permission before publishing ArcGIS-derived geometry or distributing it in TurnRight offline packages.

## OSM and access-road coverage

The campus boundary is [way {BOUNDARY_ID}](https://www.openstreetmap.org/way/{BOUNDARY_ID}), version {osm_meta['boundaryVersion']}, last edited {osm_meta['boundaryEditedAt']}. Overpass database snapshot: {osm_meta['osmBase'].get('osm_base','not reported')}.

- Actual campus boundary: `osm/campus-boundary.geojson`.
- Separate 500 m buffer: `osm/access-buffer-500m.geojson`, calculated in UTM zone 31N, EPSG:32631.
- Download rectangle (south, west, north, east): `{s}, {w}, {n}, {e}`. It covers the complete buffer plus rectangular corner overscan.
- XML: **{osm_meta['counts']['node']:,} nodes, {osm_meta['counts']['way']:,} ways, {osm_meta['counts']['relation']:,} relations**. Every referenced node and relation member is present. Complete parent relation geometry deliberately extends beyond the rectangle; do not use the extract's total bounds as the campus boundary.
- Within/intersecting the 500 m buffer: **{len(osm_buildings)} closed building ways** and **{len(osm_paths)} highway ways**; {buildings_in_campus} building ways intersect the campus itself. Building multipolygon relations are retained in XML and are not included in that closed-way count.

Retain `access`, `foot`, `oneway`, `bridge`, `tunnel`, `layer` and restriction relations. Downloaded paths are not certified walkable; review gates, private access, steps and real junctions before routing. OSM contributors' edit timestamps are not physical verification dates.

## Differences requiring review

- Boundary areas: ArcGIS **{boundary['arcgisAreaSquareMetres']:,} m²**, OSM **{boundary['osmAreaSquareMetres']:,} m²**. Their intersection/union is **{boundary['intersectionOverUnion']:.1%}**; symmetric difference **{boundary['symmetricDifferenceSquareMetres']:,} m²**. Inspect both outlines; neither is a surveyed legal boundary.
- **{len(overlaps)}** cross-source building overlap candidates (intersection/union ≥25%). Importing both without review can duplicate geometry.
- **{len(conflicts)}** overlapping candidates have different nonempty names. Exact IDs/names are in `source-comparison.json`; spelling differences are not automatically resolved.
- **{len(missing)}** OSM pedestrian-path candidates have more than 20 m outside a 15 m corridor around ArcGIS roads. These indicate coverage differences, not confirmed missing real-world paths.
- Invalid preferred ArcGIS building geometries detected: **{len(invalid)}**. The downloaded records remain unchanged; use the editor's repair/review workflow where needed.

Recommendation: use OSM topology/access data for the initial routing review and the more complete footprint set; use preferred ArcGIS facility categories and names as a separately reviewed reference. Keep overlapping source records separate until their IDs, geometry and names are resolved. Use the explicit campus boundary, not the buffer or relation overspill, to create UNILAG. All new data remains private until the owner's review-and-publish workflow.

## Attribution and reproducibility

OSM: **© OpenStreetMap contributors**, [ODbL 1.0](https://www.openstreetmap.org/copyright). ArcGIS: `{primary['item']['owner']}`, the two linked items; licence unspecified. Preserve both source records and resolve rights before combining or publishing them.

`arcgis/metadata.json`, `arcgis/comparison/metadata.json`, per-layer metadata and `osm/metadata.json` contain source URLs, timestamps, original identifiers, counts and SHA-256 hashes. `CHECKSUMS.sha256` covers the final package. See [illustrated download instructions](DOWNLOAD-INSTRUCTIONS.md). No paid ArcGIS account is required.
'''
    (root / "SOURCE-COMPARISON.md").write_text(text,encoding="utf-8")
    print(json.dumps({k:v for k,v in report.items() if k not in ("overlapCandidates","conflictingNames","footpathCoverageCandidates")},indent=2),flush=True)


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
