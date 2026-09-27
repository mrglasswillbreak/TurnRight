# UNILAG Akoka source downloads

The 27 September 2026 research package keeps ArcGIS and OpenStreetMap data separate. It covers UNILAG Akoka plus a 500 m access-road buffer and does **not** import or publish a campus in TurnRight. Raw datasets and the illustrated instructions are delivered under the user's Downloads folder, not committed to this repository.

## Reproduce the package

Use Python 3.11+ and the two pinned GIS dependencies in an isolated environment:

```powershell
py -m venv .venv-unilag
.venv-unilag/Scripts/python.exe -m pip install -r scripts/requirements-unilag.txt
.venv-unilag/Scripts/python.exe scripts/download-unilag.py "$env:USERPROFILE/Downloads/UNILAG-Akoka-YYYY-MM-DD"
.venv-unilag/Scripts/python.exe scripts/unilag-guide.py "$env:USERPROFILE/Downloads/UNILAG-Akoka-YYYY-MM-DD"
```

Choose a new dated directory for a new snapshot. Existing directories are resumable caches: the downloader validates their hashes before reuse. `--overpass <interpreter URL>` selects another suitable endpoint. The script does not contact TurnRight, create a campus or publish data.

The output includes ten preferred ArcGIS GeoJSON layers and ten comparison layers, source metadata, complete OSM XML, the campus boundary, a separate 500 m buffer, the reusable Overpass query, comparison JSON/Markdown, illustrated `DOWNLOAD-INSTRUCTIONS.md`, reproducible scripts, and a verified ZIP with SHA-256 receipts. The instructions contain direct export/count/ID links for every layer and an Overpass Turbo link with the query prefilled. No paid ArcGIS account is required for these public Query endpoints.

## Verified source findings

The preferred [Newly Updated map_WFL1](https://www.arcgis.com/home/item.html?id=18c645c3189f4c40aa6f29a301b01554) and [Updated_UnilagMap_WFL1](https://www.arcgis.com/home/item.html?id=3ae5894e76fe4b89b8a7f07bb9f3b2fc) both report modification dates of 21 September 2026. The downloaded geometries and attributes were identical across all ten layers: 54 buildings, 34 roads, one boundary and 86 facilities. Counts were reconciled against complete object-ID batches, followed by another ID/edit-metadata check. These modification dates are not survey dates.

The OSM snapshot is 27 September 2026 at 03:47:16 UTC. Its explicit boundary is [way 539288366](https://www.openstreetmap.org/way/539288366), version 23. The extract contains 124,103 nodes, 17,128 ways and 72 relations, with all references present. Complete relation members extend beyond the download rectangle. Within/intersecting the buffer there are 7,647 closed building ways and 446 highway ways; 875 building ways intersect the campus itself. These counts exclude building multipolygon relations, which remain in the XML.

The ArcGIS and OSM boundary intersection/union is about 71.9%. The source comparison identifies nine building overlap candidates and 30 pedestrian-path coverage candidates using documented geometric thresholds. These are review leads, not confirmed duplicates or surveyed omissions. Keep the actual campus boundary separate from the buffered download extent and relation overspill.

## Manual downloads

Open the [public Buildings Query form](https://services8.arcgis.com/dmauH753guPhYUcJ/ArcGIS/rest/services/Newly_Updated_map_WFL1/FeatureServer/2/query). Set **Where** to `1=1`, **Out Fields** to `*`, **Return Geometry** to True, **Output Spatial Reference** to `4326`, and **Format** to GEOJSON. Save the response as `.geojson`. Repeat for layer IDs 1, 2, 3 and 13–19. Compare each response with `returnCountOnly=true` and `returnIdsOnly=true`; use bounded object-ID batches when necessary. A successful response can still be truncated. [ArcGIS Query reference](https://developers.arcgis.com/rest/services-reference/enterprise/query-feature-service-layer/).

For OSM, paste the generated `osm/unilag-access.overpassql` into [Overpass Turbo](https://overpass-turbo.eu/), click Run, then **Export → Data → raw OSM data → download**. Keep XML to preserve identities, relation membership and access topology. Reject timeout remarks and missing references; wait before retrying shared endpoints. [Overpass formats](https://dev.overpass-api.de/overpass-doc/en/targets/formats.html) and [usage guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html).

## Review and attribution

Create a separate UNILAG campus using `osm/campus-boundary.geojson`; retain the buffer only as source coverage. OSM is the more complete initial footprint/topology source in this snapshot. ArcGIS facilities and names are a separate reference requiring rights review. For ArcGIS file sources, preserve `OBJECTID` within each source/layer, map `Name` and `Type` where present, and leave unrecorded heights/floors unset. Do not infer access from a generic road line or height from an area field. Preview overlaps, geometry and path connections before queuing review. See [Campuses and map imports](CAMPUS-IMPORTS.md).

OSM requires **© OpenStreetMap contributors** attribution and its applicable [ODbL terms](https://www.openstreetmap.org/copyright). The ArcGIS owner is `temitayoakande`; the downloaded item metadata supplies no explicit redistribution licence. Resolve permission before publishing ArcGIS-derived content or including it in offline packages. Public download access alone is not a redistribution licence.

Run the downloader's focused offline checks with the same environment:

```powershell
.venv-unilag/Scripts/python.exe -m unittest discover -s scripts/tests -p test_unilag_download.py -v
```

They reject missing/duplicated IDs, projected coordinates mistaken for WGS84, incomplete OSM references and partial/error responses. Actual retrieval additionally checks the source counts, hashes, placement and complete buffer coverage. The guide packager checks every ZIP member against its source hash.
