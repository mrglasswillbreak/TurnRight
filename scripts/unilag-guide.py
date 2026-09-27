"""Build the illustrated manual guide and checksum-verified ZIP from a download.

Run after download-unilag.py. Does not contact or change TurnRight.
"""
import argparse
import hashlib
import html
import json
from pathlib import Path
import shutil
from urllib.parse import urlencode
import zipfile

from pyproj import Transformer
from shapely.geometry import shape
from shapely.ops import transform


def checksum(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def illustration(path, title, subtitle, steps):
    rows = []
    for i, (label, value) in enumerate(steps):
        y = 135 + 76 * i
        rows.append(f'<rect x="30" y="{y-27}" width="900" height="62" rx="12" fill="#edf3fb"/><text x="50" y="{y}" font-size="18" fill="#334155">{i+1}. {html.escape(label)}</text><text x="380" y="{y}" font-size="18" font-weight="600" fill="#0f497a">{html.escape(value)}</text>')
    height = 165 + len(steps) * 76
    path.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="960" height="{height}" viewBox="0 0 960 {height}"><rect width="960" height="{height}" rx="18" fill="#fff"/><g font-family="Arial,sans-serif"><text x="30" y="42" font-size="26" fill="#0f172a">{html.escape(title)}</text><text x="30" y="76" font-size="16" fill="#475569">{html.escape(subtitle)}</text>{"".join(rows)}<text x="30" y="{height-20}" font-size="14" fill="#64748b">Illustrated field guide — not a screenshot. Values correspond to the linked public service.</text></g></svg>', encoding="utf-8")


def coverage(root, out):
    project = Transformer.from_crs(4326, 32631, always_xy=True).transform
    def load(path):
        return [transform(project, shape(f["geometry"])) for f in json.loads(path.read_text(encoding="utf-8"))["features"]]
    campus = load(root / "osm/campus-boundary.geojson")[0]
    buffer = load(root / "osm/access-buffer-500m.geojson")[0]
    arc = load(root / "arcgis/03-Unilag_Boundary.geojson")
    roads = load(root / "arcgis/01-Unilag_Roads.geojson")
    west, south, east, north = buffer.bounds
    scale = min(780/(east-west), 680/(north-south))
    def path(geom):
        if geom.geom_type.startswith("Multi") or geom.geom_type == "GeometryCollection":
            return " ".join(path(g) for g in geom.geoms)
        rings = [geom.exterior, *geom.interiors] if geom.geom_type == "Polygon" else [geom]
        return " ".join("M" + " L".join(f"{65+(x-west)*scale:.1f},{145+(north-y)*scale:.1f}" for x,y in r.coords) + (" Z" if geom.geom_type == "Polygon" else "") for r in rings)
    svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="960" height="980" viewBox="0 0 960 980"><rect width="960" height="980" fill="#f8fafc"/><g font-family="Arial,sans-serif" fill="#0f172a"><text x="35" y="42" font-size="26">UNILAG Akoka: boundary and download coverage</text><text x="35" y="76" font-size="16">UTM 31N metre geometry • north up • source outlines remain separate</text>']
    svg.append(f'<path d="{path(buffer)}" fill="#dbeafe" stroke="#2563eb" stroke-dasharray="8 6" stroke-width="2"/>')
    svg.append(f'<path d="{path(campus)}" fill="#99f6e455" stroke="#0f766e" stroke-width="3"/>')
    for g in arc:
        svg.append(f'<path d="{path(g)}" fill="none" stroke="#d97706" stroke-width="3"/>')
    for g in roads:
        svg.append(f'<path d="{path(g)}" fill="none" stroke="#64748b" stroke-width="1.2"/>')
    for i, (colour, label) in enumerate([('#0f766e','OSM campus boundary — use for the initial campus draft'),('#d97706','ArcGIS boundary — review the differences'),('#2563eb','500 m buffer — access-road download coverage'),('#64748b','ArcGIS roads — OSM topology remains in the separate XML')]):
        y=865+i*25
        svg.append(f'<path d="M35 {y-5}h30" stroke="{colour}" stroke-width="4"/><text x="80" y="{y}" font-size="16">{label}</text>')
    svg.append('<text x="35" y="972" font-size="12">© OpenStreetMap contributors, ODbL • ArcGIS: temitayoakande, redistribution rights unspecified • 27 September 2026</text></g></svg>')
    out.write_text(''.join(svg), encoding="utf-8")


def build(root):
    images = root / "illustrations"
    images.mkdir(exist_ok=True)
    illustration(images / "arcgis-query.svg", "ArcGIS: export editable WGS84 GeoJSON", "Open a layer → Query. No paid ArcGIS account is needed for these public endpoints.", [
        ("Where", "1=1"), ("Out Fields", "*"), ("Return Geometry", "True"), ("Output Spatial Reference", "4326"), ("Format", "GEOJSON"), ("Query (GET)", "Save response as .geojson"), ("Completeness", "Compare count + all OBJECTIDs")])
    illustration(images / "overpass-download.svg", "Overpass Turbo: keep the original OSM topology", "Paste the included query, or follow the prefilled link in the guide.", [
        ("Load query", "osm/unilag-access.overpassql"), ("Run", "Wait for a complete response"), ("Large-data warning", "Rendering is optional; retain raw data"), ("Export", "Data → raw OSM data → download"), ("Filename", "unilag-akoka-access.osm"), ("Verify", "No remark; every nd/member ref present")])
    coverage(root, images / "coverage.svg")
    meta = json.loads((root / "arcgis/metadata.json").read_text(encoding="utf-8"))
    osm = json.loads((root / "osm/metadata.json").read_text(encoding="utf-8"))
    links=[]
    for row in meta["layers"]:
        base=row['source']+'/query?'
        export=base+urlencode({'where':'1=1','outFields':'*','returnGeometry':'true','outSR':4326,'f':'geojson'})
        count=base+urlencode({'where':'1=1','returnCountOnly':'true','f':'json'})
        ids=base+urlencode({'where':'1=1','returnIdsOnly':'true','f':'json'})
        links.append(f"| {row['id']} · {row['name']} | {row['count']} | [GeoJSON]({export}) · [count]({count}) · [IDs]({ids}) |")
    query=(root / "osm/unilag-access.overpassql").read_text(encoding="utf-8")
    turbo='https://overpass-turbo.eu/?'+urlencode({'Q':query})
    text=f'''# Download UNILAG Akoka yourself

Verified **27 September 2026**. This package contains editable vectors for UNILAG Akoka and an OSM access-road extract covering a **500 m buffer**. It does not create, import or publish a TurnRight campus. Keep the two providers separate until review.

![Boundary and download coverage](illustrations/coverage.svg)

The teal outline is the OSM campus boundary. The orange ArcGIS boundary differs. The blue buffer is download coverage, not a new campus boundary. The XML also includes rectangle corners and complete relation members outside this extent. That overspill is necessary to preserve references; it does not enlarge UNILAG.

## Ready files

- `arcgis/`: ten preferred-service GeoJSON layers, metadata, original IDs and attributes; `arcgis/comparison/` retains the ten comparison layers.
- `osm/unilag-akoka-access.osm`: complete raw OSM XML ({osm['counts']['node']:,} nodes, {osm['counts']['way']:,} ways, {osm['counts']['relation']:,} relations).
- `osm/campus-boundary.geojson`: the actual campus polygon, WGS84.
- `osm/access-buffer-500m.geojson`: coverage only, created in UTM 31N metres and exported to WGS84.
- `osm/unilag-access.overpassql`: reusable query.
- [SOURCE-COMPARISON.md](SOURCE-COMPARISON.md): dates, coverage, names, overlap candidates and recommended sources. `source-comparison.json` provides candidate IDs.
- `CHECKSUMS.sha256`: hashes for every delivered file. The ZIP has a separate adjacent `.sha256` receipt.

## 1. Download from ArcGIS in a browser

Use the public [Newly Updated map_WFL1 service]({meta['serviceUrl']}) (preferred) or [Updated_UnilagMap_WFL1](https://services8.arcgis.com/dmauH753guPhYUcJ/ArcGIS/rest/services/Updated_UnilagMap_WFL1/FeatureServer). Both items report 21 September 2026 modification dates and their ten layers were identical when retrieved. An edit date is not a survey date. These public REST Query endpoints work without sign-in or a paid ArcGIS account; the item-page Export button may require account permissions and is not needed here.

![ArcGIS query field guide](illustrations/arcgis-query.svg)

1. Open the [Buildings layer query form]({meta['serviceUrl']}/2/query).
2. Enter **Where** `1=1`, **Out Fields** `*`, **Return Geometry** True, **Output Spatial Reference** `4326`, and **Format** GEOJSON. Keep **Return IDs Only** and **Return Count Only** False for the geometry download.
3. Click **Query (GET)**. Save the response using your browser's Save page/Save as action. Choose All files if needed and use `02-Buildings.geojson`, not `.html` or `.txt`. The content must start with a JSON object whose `type` is `FeatureCollection`, not a saved HTML query form.
4. Repeat for all ten layers using the direct links below. A browser JSON viewer may display formatted data; save its original response. For a browser that blocks the service, use the public URL in another normal browser or the PowerShell example below.

| Layer | Expected count on retrieval | Ready links |
|---|---:|---|
{chr(10).join(links)}

Counts may change after this date. The layers currently fit in one response, but **never assume a successful response is complete**. Fetch both the count and full object-ID list first. Check `features.length`, unique `properties.OBJECTID` values and any `exceededTransferLimit` flag. For larger layers, request at most the layer's `maxRecordCount` IDs per batch (this package uses at most 500):

```text
.../FeatureServer/2/query?objectIds=1,2,3&outFields=*&returnGeometry=true&outSR=4326&f=geojson
```

The IDs above illustrate the syntax; use IDs actually returned by **IDs**. Combine the batches' `features` arrays into a single FeatureCollection; do not concatenate complete JSON documents. Compare the final unique IDs with the initial list, then fetch IDs and layer `editingInfo` again. If either changed during retrieval, take a fresh snapshot. Never interpret a truncated response as source deletions. See [Esri's query documentation](https://developers.arcgis.com/rest/services-reference/enterprise/query-feature-service-layer/).

PowerShell can save a direct export without the browser's JSON viewer:

```powershell
$layerUrl = '{meta['serviceUrl']}/2'
$exportUrl = "$layerUrl/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson"
Invoke-WebRequest -Uri $exportUrl -OutFile "$env:USERPROFILE/Downloads/02-Buildings.geojson"
$features = Get-Content -Raw "$env:USERPROFILE/Downloads/02-Buildings.geojson" | ConvertFrom-Json
$features.features.Count
```

Verify 54 against the current count endpoint, not only the historical value. The source metadata is EPSG:3857; the requested output is EPSG:4326 (longitude, latitude). Retain source `Shape__Area`/`Shape__Length` as original attributes; they are not heights or geographic degrees.

## 2. Download current OSM XML

Open [Overpass Turbo with the complete query already filled in]({turbo}), or open [Overpass Turbo](https://overpass-turbo.eu/) and paste `osm/unilag-access.overpassql`. The link only fills the editor; click **Run** yourself. The reusable query is:

```overpass
{query.rstrip()}
```

![Overpass download field guide](illustrations/overpass-download.svg)

Wait for completion. Large-result warnings concern displaying data on the map; the raw response is what you need. Open **Export**, then the **Data** section and download **raw OSM data**. Save as `unilag-akoka-access.osm`. Some versions offer “download/copy” beside raw OSM data. Avoid GeoJSON for the routing source: raw XML retains node, way and relation identities, membership, restrictions and tags. See [Overpass data formats](https://dev.overpass-api.de/overpass-doc/en/targets/formats.html).

If the query times out or contains a `<remark>`, discard that partial response, wait, and retry. Do not repeatedly hammer the shared endpoint. [Overpass usage guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html) explains shared-service limits. For a fresh date, rerun the query; its fixed extent remains the delivered Akoka buffer. To recompute against a changed boundary, rerun the Python downloader below.

Verify every way `nd ref` has a corresponding node and every relation `member` is present. Keep `access`, `foot`, `oneway`, `bridge`, `tunnel`, `layer` and restriction relations. The Python downloader does these reference checks. The delivered snapshot's timestamp is in `osm/metadata.json`; a future count difference alone does not prove corruption.

## 3. Reproduce all downloads and integrity checks

Python 3.11+ is required. From this folder, create an isolated environment and use a **new dated output folder** for a fresh snapshot. Existing folders are resumable caches and intentionally reuse verified downloads.

```powershell
py -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements-unilag.txt
.venv/Scripts/python.exe download-unilag.py "$env:USERPROFILE/Downloads/UNILAG-Akoka-NEW-DATE"
.venv/Scripts/python.exe unilag-guide.py "$env:USERPROFILE/Downloads/UNILAG-Akoka-NEW-DATE"
```

The downloader fetches both ArcGIS services, reconciles counts/IDs, rechecks edit metadata, validates placement, calculates the 500 m buffer, retrieves complete OSM members and produces the comparison. It makes no TurnRight requests. `--overpass <HTTPS interpreter URL>` can choose a suitable endpoint. The guide step packages only the expected dataset/document directories, never your `.venv`.

To check a file, run `Get-FileHash -Algorithm SHA256 ./osm/unilag-akoka-access.osm` and compare with `CHECKSUMS.sha256`. Extract the ZIP into a separate directory and compare the extracted hashes before relying on a copied archive.

## 4. TurnRight mapping guidance — review before publication

In **Editor → Campuses → New campus**, choose `osm/campus-boundary.geojson` as the initial boundary and inspect the ArcGIS differences. Do not use the buffer polygon or total OSM extract bounds as the boundary. Create a separate UNILAG campus; do not import into LASU.

In that campus's **Import data**, add OSM XML as its own source. The importer preserves OSM identities and access topology. Review access restrictions, gates, disconnected paths and bridges before enabling directions. A line on a map does not prove a permitted walking connection.

Add ArcGIS as separate sources/layers only after checking rights. These are suggested mappings to confirm in the preview:

| Source | Role | Stable identifier | Fields and review |
|---|---|---|---|
| Buildings (2) | Building | OBJECTID, scoped to this source/layer | Name → name; Type → category; height/floors remain unset unless independently recorded |
| Roads (1) | Path | OBJECTID | Inspect each field and access; generic road lines do not automatically establish walkability or connected junctions |
| Boundary (3) | Boundary or skip | OBJECTID | Compare with the chosen campus polygon; do not import both as buildings |
| Facility categories (13–19) | Place where compatible | OBJECTID per layer | Name/Type when present; inspect aliases and categories, preserve remaining attributes privately |

Use **Inspect layers → Map fields → Build preview → Queue for review**. Point facilities may duplicate polygon building names; inspect candidates rather than importing both as destinations blindly. Heights and floors must not be inferred from area, capacity or establishment year. Keep source names and original spelling until reviewed. Choose WGS84/EPSG:4326 for these downloaded GeoJSON files; do not override them back to native 3857.

The XML is about 26 MiB; complete relation geometry extends outside the buffer and may add processing work. TurnRight's upload/normalized-feature/public-package budgets still apply independently. Review the proposed coverage and skipped features; reduce sources intentionally if limits are exceeded, without breaking OSM references. Imports create private review candidates. Publishing remains a separate Releases action, and was not performed for this package.

## Attribution and rights

OSM data: **© OpenStreetMap contributors**, [ODbL 1.0](https://www.openstreetmap.org/copyright). Retain attribution and the applicable database licence in any redistribution. ArcGIS owner: **temitayoakande**; the two item pages and metadata supply no explicit redistribution licence. Public download access does not establish publication rights; obtain permission before publishing ArcGIS-derived geometry or bundling it offline. Source edit dates are not survey dates.
'''
    (root / "DOWNLOAD-INSTRUCTIONS.md").write_text(text, encoding="utf-8")
    # Copy the reproducible tools, without copying an environment or repository data.
    for name in ("download-unilag.py", "unilag-guide.py", "requirements-unilag.txt"):
        source=Path(__file__).parent/name
        if source.resolve() != (root/name).resolve():
            shutil.copyfile(source, root/name)
    allowed=("arcgis", "osm", "illustrations")
    files=[p for folder in allowed for p in (root/folder).rglob('*') if p.is_file()]
    files += [root/name for name in ("SOURCE-COMPARISON.md","source-comparison.json","DOWNLOAD-INSTRUCTIONS.md","download-unilag.py","unilag-guide.py","requirements-unilag.txt")]
    files.sort(key=lambda p:p.relative_to(root).as_posix())
    (root / "CHECKSUMS.sha256").write_text(''.join(f'{checksum(p)}  {p.relative_to(root).as_posix()}\n' for p in files), encoding="utf-8")
    files.append(root / "CHECKSUMS.sha256")
    archive=root.with_suffix('.zip')
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for p in files:
            z.write(p, root.name+'/'+p.relative_to(root).as_posix())
    with zipfile.ZipFile(archive) as z:
        if z.testzip():
            raise ValueError("ZIP integrity failed")
        for p in files:
            if hashlib.sha256(z.read(root.name+'/'+p.relative_to(root).as_posix())).hexdigest()!=checksum(p):
                raise ValueError("ZIP member checksum mismatch")
    digest=checksum(archive)
    archive.with_suffix('.zip.sha256').write_text(f'{digest}  {archive.name}\n',encoding="utf-8")
    print(json.dumps({"archive":str(archive),"files":len(files),"bytes":archive.stat().st_size,"sha256":digest},indent=2))


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('folder', type=Path)
    build(parser.parse_args().folder)
