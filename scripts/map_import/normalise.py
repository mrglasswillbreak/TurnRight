"""Map selected GIS fields onto TurnRight's existing source records."""

from .normalise_result import finish_normalisation

from .normalise_paths import add_paths

from .normalise_values import digest as digest, distance as distance

import copy
import math
import re

from .formats import MAX_FEATURES
from .geometry import (
    components as geometry_components,
    prepare_geometry,
)
from .semantics import mapped_properties


def normalise(layers, source, campus, previous, configuration, import_id):
    from shapely.geometry import shape, mapping

    owner_source = "import:" + source["id"]
    boundary = shape(campus["boundary"]["geometry"])
    if not boundary.is_valid or boundary.is_empty:
        raise ValueError("Repair the campus boundary before importing.")
    # Keep complete intersecting buildings and paths: clipping can sever access topology.
    region = boundary.buffer(0.0001)
    mappings = {m["layer"]: m for m in configuration["layers"]}
    records, warnings, errors, duplicates = {}, [], [], []
    observations, observation_key, collections = {}, None, []
    repairs, diagnostics, mapped_layers = [], [], []
    previous_by_id = {r["id"]: r for r in previous}
    skipped, feature_count = 0, 0
    large_import = (
        sum(
            len(layer["features"])
            for layer in layers
            if mappings.get(layer["name"], {}).get("role", "skip") != "skip"
        )
        > 10000
    )
    categories = {
        "academic",
        "library",
        "food",
        "services",
        "worship",
        "residence",
        "sports",
        "gate",
        "other",
    }

    def add(entity, ident, payload, private_attributes=None):
        key = entity + ":" + ident
        if large_import:
            if entity == "feature":
                payload.setdefault("properties", {})["gisManaged"] = True
            elif entity in ("place", "node", "edge"):
                payload["gisManaged"] = True
        metadata = (
            {
                "sourceCRS": layer["crs"],
                "fields": layer.get("fields", []),
                "layer": layer["name"],
            }
            if private_attributes is not None
            else None
        )
        if metadata is not None and layer.get("exchange"):
            metadata["exchange"] = layer["exchange"]
        record = {
            "id": key,
            "entity": entity,
            "source": owner_source,
            "payload": payload,
            "hash": digest(
                {
                    "payload": payload,
                    "private_attributes": private_attributes,
                    "gis_metadata": metadata,
                }
            )
            if private_attributes is not None
            else digest(payload),
        }
        if private_attributes is not None:
            record["private_attributes"] = private_attributes
        if metadata is not None:
            record["gis_metadata"] = metadata
        if key in records and records[key]["hash"] != record["hash"]:
            raise ValueError("Duplicate source identity: " + ident)
        records[key] = record
        if observation_key is not None:
            observations[observation_key]["records"][key] = record

    for layer in layers:
        m = mappings.get(layer["name"])
        if not m or m["role"] == "skip":
            skipped += len(layer["features"])
            continue
        if not layer.get("crs"):
            errors.append(layer["name"] + ": choose the source coordinate system.")
            continue
        role = m["role"]
        if layer.get("exchange"):
            rights = layer["exchange"]["rights"]
            if (
                rights.get("redistributionConfirmed") is not True
                or not rights.get("license")
                or not rights.get("attribution")
            ):
                errors.append(
                    layer["name"]
                    + ": resolve exchange source rights and export again before preparing candidates."
                )
                continue
            if m.get("idField") != layer["exchange"]["idField"]:
                errors.append(
                    layer["name"]
                    + ": retain the exchange stable ID field to preserve source identity."
                )
                continue
            m = {**m, "identity": layer["sourceCollection"]}
        layer_error_start = len(errors)
        collections.append(
            {
                "identity": layer.get("sourceCollection")
                or layer.get("sourceUrl")
                or m.get("identity")
                or layer["name"],
                "count": len(layer["features"]),
                "layer": layer["name"],
                "contentHash": layer.get("snapshotHash"),
            }
        )
        is_osm = "osmNodes" in layer
        if not m.get("idField") and not is_osm:
            warnings.append(
                layer["name"]
                + ": using feature IDs or content identities. Select a stable field to match records whose contents change."
            )
        expanded = []
        seen_identities = set()
        for feature in layer["features"]:
            for component, geometry in geometry_components(feature.get("geometry")):
                if (
                    geometry
                    and geometry.get("type") == "MultiPoint"
                    and role in ("place", "entrance")
                ):
                    for index, coordinates in enumerate(geometry["coordinates"]):
                        expanded.append(
                            {
                                **feature,
                                "geometry": {
                                    "type": "Point",
                                    "coordinates": coordinates,
                                },
                                "_component": component + ":point:" + str(index),
                                "_sourceContent": {
                                    "geometry": feature["geometry"],
                                    "properties": feature.get("properties", {}),
                                },
                            }
                        )
                else:
                    expanded.append(
                        {
                            **feature,
                            "geometry": geometry,
                            "_component": component,
                            "_sourceContent": {
                                "geometry": feature["geometry"],
                                "properties": feature.get("properties", {}),
                            },
                        }
                    )
        mapped_layer = {
            **layer,
            "features": [],
            "suggestedRole": role,
            "crs": "EPSG:4326",
        }
        mapped_layers.append(mapped_layer)
        for feature in expanded:
            feature_count += 1
            if feature_count > MAX_FEATURES:
                raise ValueError("Import exceeds the feature limit.")
            attrs = feature.get("properties") or {}
            receipt_id = str(
                attrs.get(m.get("idField"))
                if m.get("idField")
                else feature.get("id", "")
            ) + feature.get("_component", "")
            if feature.get("geometry") is None:
                errors.append(
                    layer["name"] + ": missing geometry or coordinate mapping."
                )
                continue
            try:
                geom = shape(feature["geometry"])
            except Exception as error:
                errors.append(
                    f"{layer['name']} {feature.get('id', '')}: invalid geometry ({error})"
                )
                continue
            if layer["crs"] != "EPSG:4326":
                from osgeo import osr
                from shapely.ops import transform

                src = osr.SpatialReference()
                src.SetFromUserInput(layer["crs"])
                src.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
                dst = osr.SpatialReference()
                dst.ImportFromEPSG(4326)
                dst.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
                operation = osr.CoordinateTransformation(src, dst)
                geom = transform(
                    lambda x, y, z=None: operation.TransformPoint(x, y)[:2], geom
                )
            if (
                not all(math.isfinite(x) for x in geom.bounds)
                or geom.bounds[0] < -180
                or geom.bounds[2] > 180
                or geom.bounds[1] < -90
                or geom.bounds[3] > 90
            ):
                errors.append(
                    layer["name"]
                    + ": coordinates fall outside WGS84; check the projection."
                )
                continue
            try:
                geom, repair = prepare_geometry(
                    feature["geometry"]
                    if layer["crs"] == "EPSG:4326"
                    else mapping(geom)
                )
            except Exception as error:
                errors.append(f"{layer['name']} {feature.get('id', '')}: {error}")
                continue
            if repair:
                repairs.append(
                    {"layer": layer["name"], "sourceId": receipt_id, **repair}
                )
            attrs = feature.get("properties") or {}

            def mapped_value(field, fallback):
                key = m.get(field) or fallback
                value = attrs.get(key)
                definition = next(
                    (f for f in layer.get("fields", []) if f["name"] == key), {}
                )
                return definition.get("codedValues", {}).get(str(value), value)

            native = (
                attrs.get(m.get("idField")) if m.get("idField") else feature.get("id")
            )
            stable_native = native is not None and str(native) != ""
            if native is None and not m.get("idField"):
                native = digest({"geometry": feature["geometry"], "properties": attrs})[
                    :24
                ]
            if native is None or str(native) == "":
                errors.append(
                    layer["name"] + ": a feature is missing its selected identifier."
                )
                continue
            upstream_native = str(native)
            collection = (
                layer.get("sourceCollection")
                or layer.get("sourceUrl")
                or m.get("identity")
                or layer["name"]
            )
            observation_key = (collection, upstream_native)
            if observation_key not in observations:
                observations[observation_key] = {
                    "provider": source["kind"],
                    "collection": collection,
                    "nativeId": upstream_native,
                    "stable": stable_native,
                    "featureType": role,
                    "content": feature["_sourceContent"],
                    "records": {},
                    "providerVersion": feature.get("providerVersion"),
                    "embedded": {**layer["embedded"], "nativeField": m.get("idField")}
                    if layer.get("embedded") and m.get("idField")
                    else None,
                    "queryUrl": layer.get("sourceUrl"),
                    "layerIdentity": layer.get("layerIdentity"),
                }
            native = str(native) + feature.get("_component", "")
            if native in seen_identities:
                errors.append(
                    f"{layer['name']}: duplicate source identity {native}; select a unique identifier or repair the source."
                )
                continue
            seen_identities.add(native)
            # Presence outside the campus filter is still source evidence. It
            # cannot be mistaken for a deletion in a complete replacement file.
            if not region.intersects(geom):
                skipped += 1
                continue
            layer_identity = m.get("identity") or layer["name"]
            ident = f"{owner_source}:{digest(layer_identity)[:8]}:{native}"
            if len(ident) > 180:
                ident = f"{owner_source}:{digest([layer['name'], native])}"
            name = str(mapped_value("nameField", "name") or "").strip()[:200]
            category = str(mapped_value("categoryField", "category") or "other").lower()
            if category not in categories:
                category = "other"
            props = {
                "id": ident,
                "name": name,
                "source": owner_source,
                "sourceId": str(native),
                "importLayer": layer_identity,
                "kind": "land" if role in ("landcover", "road-surface") else role,
            }
            semantic_attrs = {
                key: next(
                    (
                        f.get("codedValues", {}).get(str(value), value)
                        for f in layer.get("fields", [])
                        if f["name"] == key
                    ),
                    value,
                )
                for key, value in attrs.items()
            }
            try:
                props.update(
                    mapped_properties(
                        semantic_attrs, {**m, "sourceLayerName": layer["name"]}, role
                    )
                )
            except ValueError as error:
                errors.append(f"{name or ident}: {error}")
                continue
            geometry = mapping(geom)
            if role == "boundary":
                warnings.append(
                    "Campus boundary layer is retained in the import preview; use it when creating a campus. Existing campus boundaries are not replaced by a source refresh."
                )
                skipped += 1
                continue
            allowed = {
                "building": ("Polygon", "MultiPolygon"),
                "path": ("LineString", "MultiLineString"),
                "place": ("Point", "MultiPoint"),
                "entrance": ("Point",),
                "barrier": ("LineString", "MultiLineString", "Polygon", "MultiPolygon"),
                "landcover": ("Polygon", "MultiPolygon"),
                "road-surface": ("Polygon", "MultiPolygon"),
                "overlay": (
                    "Point",
                    "MultiPoint",
                    "LineString",
                    "MultiLineString",
                    "Polygon",
                    "MultiPolygon",
                ),
            }
            if geom.geom_type not in allowed[role]:
                errors.append(
                    f"{layer['name']}: {geom.geom_type} cannot be imported as {role}."
                )
                continue
            for field, target in [("heightField", "height"), ("floorsField", "floors")]:
                value = attrs.get(
                    m.get(field)
                    or ("height" if target == "height" else "building:levels")
                )
                if value not in (None, ""):
                    try:
                        value = float(str(value).removesuffix(" m"))
                        if target == "height" and m.get("heightUnit") == "ft":
                            value *= 0.3048
                        if (
                            not math.isfinite(value)
                            or value <= 0
                            or value > (150 if target == "height" else 50)
                        ):
                            raise ValueError()
                        props[target] = value
                    except (ValueError, TypeError):
                        errors.append(f"{name or ident}: invalid {target}.")
            if "height" in props:
                props["heightSource"] = "source"
                props["heightEstimated"] = False
            add_paths(
                add=add,
                attrs=attrs,
                errors=errors,
                feature=feature,
                geom=geom,
                ident=ident,
                is_osm=is_osm,
                layer=layer,
                m=m,
                mapped_value=mapped_value,
                name=name,
                owner_source=owner_source,
                props=props,
                role=role,
                warnings=warnings,
            )
            old_feature = previous_by_id.get("feature:" + ident)
            if old_feature:
                for key in (
                    "appearance",
                    "buildingTopology",
                    "modelDocumentAsset",
                    "modelAuthoring",
                    "reviewedModelRevision",
                    "authoredModelRevision",
                    "surfaceCurves",
                ):
                    if key in old_feature["payload"].get("properties", {}):
                        props[key] = copy.deepcopy(
                            old_feature["payload"]["properties"][key]
                        )
            public_feature = {
                "type": "Feature",
                "geometry": geometry,
                "properties": props,
            }
            if role == "overlay":
                props["gisManaged"] = True
            private_values = {
                key: value
                for key, value in attrs.items()
                if isinstance(key, str)
                and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,62}", key)
                and key not in ("__proto__", "prototype", "constructor")
                and (value is None or isinstance(value, (str, int, float, bool)))
                and not (isinstance(value, float) and not math.isfinite(value))
            }
            add("feature", ident, public_feature, private_values)
            mapped_layer["features"].append(public_feature)
            if role in ("place", "building", "entrance") and (
                name or role == "entrance"
            ):
                point = geom.representative_point()
                place_id = ident + ":place"
                place = {
                    "id": place_id,
                    "name": name or "Unassigned entrance",
                    "category": "gate" if role == "entrance" else category,
                    "coordinates": [point.x, point.y],
                    "aliases": [],
                    "source": owner_source,
                    "sourceId": str(native),
                    "arrivalKind": "unmapped",
                }
                if role == "building":
                    place["buildingId"] = ident
                add("place", place_id, place)
            if role == "entrance":
                warnings.append(
                    "Imported entrance pins require an explicit building/place assignment and path connection in the editor."
                )
        collections[-1]["complete"] = len(
            errors
        ) == layer_error_start and not layer.get("retrievalError")
    return finish_normalisation(
        collections=collections,
        configuration=configuration,
        diagnostics=diagnostics,
        duplicates=duplicates,
        errors=errors,
        feature_count=feature_count,
        layers=layers,
        mapped_layers=mapped_layers,
        observations=observations,
        owner_source=owner_source,
        previous=previous,
        records=records,
        repairs=repairs,
        skipped=skipped,
        source=source,
        warnings=warnings,
    )
