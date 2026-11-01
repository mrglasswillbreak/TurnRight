"""Bounded deterministic GIS export formats and provenance bundles."""

from gis.limits import MAX_BYTES
import csv
import json
import zipfile
from pyproj import Transformer
from shapely.geometry import shape, mapping
from shapely.ops import transform


def export_data(features, schema, params, output, metadata):
    format = params.get("format", "geojson")
    if format not in ("geojson", "csv", "gpkg"):
        raise ValueError("Choose GeoJSON, CSV or GeoPackage")
    target = output / ("data." + format)
    if format == "geojson":
        if params.get("crs", "EPSG:4326") != "EPSG:4326":
            raise ValueError("GeoJSON uses WGS84 longitude/latitude")
        target.write_text(
            json.dumps(
                {
                    "type": "FeatureCollection",
                    "features": features,
                    "turnright": metadata,
                },
                allow_nan=False,
            ),
            encoding="utf8",
        )
    elif format == "csv":
        fields = [f["name"] for f in schema["fields"]]
        with target.open("w", newline="", encoding="utf-8-sig") as stream:
            # Every exported user cell passes cell() below, which prefixes spreadsheet formula markers; schema field names are validated identifiers.
            # nosemgrep: local-runtime.semgrep-rules.python.lang.security.use-defusedcsv
            writer = csv.writer(stream)
            writer.writerow(["feature_id", *fields, "geometry_wkt"])

            def cell(v):
                return (
                    "'" + v
                    if isinstance(v, str)
                    and v.lstrip().startswith(("=", "+", "-", "@", "\t", "\r"))
                    else v
                )

            for f in features:
                writer.writerow(
                    [
                        cell(str(f["id"])),
                        *[cell(f["properties"].get(k)) for k in fields],
                        shape(f["geometry"]).wkt if f.get("geometry") else "",
                    ]
                )
    else:
        from osgeo import ogr, osr, gdal

        gdal.UseExceptions()
        code = params.get("crs", "EPSG:4326")
        if code != "EPSG:4326" and code != metadata["engine"]["analysisCRS"]:
            raise ValueError("Choose WGS84 or the validated analysis CRS")
        srs = osr.SpatialReference()
        srs.ImportFromEPSG(int(code.split(":")[1]))
        srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
        dataset = ogr.GetDriverByName("GPKG").CreateDataSource(str(target))
        layer = dataset.CreateLayer("features", srs, ogr.wkbUnknown)
        identity_field = "turnright_feature_id"
        while identity_field in {f["name"] for f in schema["fields"]}:
            identity_field = "_" + identity_field
        layer.CreateField(ogr.FieldDefn(identity_field, ogr.OFTString))
        metadata["identityField"] = identity_field
        for field in schema["fields"]:
            kind = {
                "number": ogr.OFTReal,
                "boolean": ogr.OFTInteger,
                "date": ogr.OFTDateTime,
                "text": ogr.OFTString,
            }[field["type"]]
            definition = ogr.FieldDefn(field["name"], kind)
            if field["type"] == "boolean":
                definition.SetSubType(ogr.OFSTBoolean)
            layer.CreateField(definition)
        transformer = Transformer.from_crs(
            4326, code, always_xy=True, allow_ballpark=False
        )
        layer.StartTransaction()
        for f in features:
            row = ogr.Feature(layer.GetLayerDefn())
            row.SetField(identity_field, str(f["id"]))
            for field in schema["fields"]:
                value = f["properties"].get(field["name"])
                if value is not None:
                    row.SetField(
                        field["name"], int(value) if isinstance(value, bool) else value
                    )
            if f.get("geometry"):
                geom = transform(transformer.transform, shape(f["geometry"]))
                row.SetGeometry(ogr.CreateGeometryFromJson(json.dumps(mapping(geom))))
            layer.CreateFeature(row)
        layer.CommitTransaction()
        dataset.SetMetadata({"TURNRIGHT": json.dumps(metadata)})
        dataset = None
    metadata["outputCRS"] = (
        params.get("crs", "EPSG:4326") if format == "gpkg" else "EPSG:4326"
    )
    metadata["nulls"] = (
        "Empty cells represent null in CSV; GeoJSON and GeoPackage preserve null values."
    )
    with zipfile.ZipFile(output / "export.zip", "w", zipfile.ZIP_DEFLATED) as archive:
        archive.write(target, target.name)
        archive.writestr("metadata.json", json.dumps(metadata, indent=2))
    if (output / "export.zip").stat().st_size > MAX_BYTES:
        raise ValueError("Export exceeds 50 MiB")
