import unittest
from test_map_import import CAMPUS
from map_import.arcgis import layer_features, discover


class ArcgisCollectionTests(unittest.TestCase):
    def test_arcgis_checks_every_id_and_stops_incomplete_download(self):
        calls = []

        def get(url, form=None):
            calls.append((url, form))
            if form is None:
                return {
                    "name": "Buildings",
                    "capabilities": "Query",
                    "objectIdField": "OBJECTID",
                    "maxRecordCount": 2,
                    "geometryType": "esriGeometryPolygon",
                }
            if "returnCountOnly" in form:
                return {"count": 3}
            if "returnIdsOnly" in form:
                return {"objectIds": [7, 8, 9]}
            return {
                "features": [
                    {
                        "attributes": {"OBJECTID": int(i)},
                        "geometry": {"x": 3.2, "y": 6.46},
                    }
                    for i in form["objectIds"].split(",")
                ]
            }

        result = layer_features(
            "https://services.example/FeatureServer/0", CAMPUS["bounds"], get
        )
        self.assertEqual(len(result["features"]), 3)
        self.assertEqual(
            [f["objectIds"] for _, f in calls if f and "objectIds" in f],
            ["7,8", "9", "7,8", "9"],
        )

        def partial(url, form=None):
            value = get(url, form)
            if form and "objectIds" in form:
                value["features"] = []
            return value

        with self.assertRaisesRegex(ValueError, "incomplete"):
            layer_features(
                "https://services.example/FeatureServer/0", CAMPUS["bounds"], partial
            )

    def test_arcgis_rejects_same_count_identity_changes_and_reuses_layer_metadata(self):
        ids_calls = 0
        metadata = {
            "name": "Buildings",
            "capabilities": "Query",
            "objectIdField": "OBJECTID",
            "maxRecordCount": 2,
            "geometryType": "esriGeometryPolygon",
        }

        def get(url, form=None):
            nonlocal ids_calls
            self.assertIsNotNone(form, "Known metadata must not be fetched again")
            if "returnCountOnly" in form:
                return {"count": 2}
            if "returnIdsOnly" in form:
                ids_calls += 1
                return {"objectIds": [1, 2] if ids_calls == 1 else [1, 3]}
            return {
                "features": [
                    {"attributes": {"OBJECTID": 1}},
                    {"attributes": {"OBJECTID": 2}},
                ]
            }

        with self.assertRaisesRegex(ValueError, "identifiers changed"):
            layer_features(
                "https://example.org/FeatureServer/0",
                CAMPUS["bounds"],
                get,
                metadata=metadata,
            )

    def test_embedded_arcgis_layers_and_unsupported_tiles(self):
        layers, warnings = discover(
            "https://example.org/map",
            CAMPUS["bounds"],
            lambda *args: {
                "operationalLayers": [
                    {
                        "title": "Trees",
                        "featureCollection": {
                            "layers": [
                                {
                                    "layerDefinition": {"fields": []},
                                    "featureSet": {"features": []},
                                }
                            ]
                        },
                    },
                    {
                        "title": "Imagery",
                        "url": "https://example.org/tiles",
                        "layerType": "ArcGISTiledMapServiceLayer",
                    },
                ]
            },
        )
        self.assertEqual(layers[0]["name"], "Trees")
        self.assertIn("non-vector", warnings[0])

    def test_arcgis_cycle_is_bounded(self):
        with self.assertRaisesRegex(ValueError, "cycle"):
            discover(
                "https://example.org/map",
                CAMPUS["bounds"],
                lambda *args: {
                    "operationalLayers": [{"url": "https://example.org/map"}]
                },
            )

    def test_arcgis_detects_content_churn_without_an_editing_revision(self):
        pages = 0

        def get(url, form=None):
            nonlocal pages
            if form is None:
                return {"id": 0, "capabilities": "Query", "objectIdField": "OBJECTID"}
            if "returnCountOnly" in form:
                return {"count": 1}
            if "returnIdsOnly" in form:
                return {"objectIds": [7]}
            pages += 1
            return {
                "features": [
                    {
                        "attributes": {"OBJECTID": 7, "name": str(pages)},
                        "geometry": {"x": 3, "y": 6},
                    }
                ]
            }

        with self.assertRaisesRegex(ValueError, "independent completeness"):
            layer_features("https://example.org/FeatureServer/0", CAMPUS["bounds"], get)

    def test_failed_arcgis_collection_does_not_discard_complete_collections(self):
        def get(url, form=None):
            if url.endswith("FeatureServer?f=json"):
                return {
                    "layers": [{"id": 0, "name": "Held"}, {"id": 1, "name": "Complete"}]
                }
            if "/0?" in url:
                raise OSError("Unavailable layer")
            if form is None:
                return {
                    "id": 1,
                    "name": "Complete",
                    "geometryType": "esriGeometryPolygon",
                    "capabilities": "Query",
                    "objectIdField": "OBJECTID",
                }
            if "returnCountOnly" in form:
                return {"count": 0}
            return {"objectIds": []}

        layers, warnings = discover(
            "https://example.org/FeatureServer", CAMPUS["bounds"], get
        )
        self.assertEqual(len(layers), 2)
        self.assertEqual(layers[0]["retrievalError"], "Unavailable layer")
        self.assertNotIn("retrievalError", layers[1])
        self.assertTrue(warnings)
