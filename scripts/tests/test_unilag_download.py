"""Offline completeness checks for the separate UNILAG research downloader."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("unilag", Path(__file__).parents[1] / "download-unilag.py")
unilag = importlib.util.module_from_spec(spec)
spec.loader.exec_module(unilag)


class DownloadTests(unittest.TestCase):
    def test_geojson_ids_and_projection(self):
        f = {"type": "Feature", "properties": {"OBJECTID": 7}, "geometry": {"type": "Point", "coordinates": [3.39, 6.51]}}
        data = {"type": "FeatureCollection", "features": [f]}
        unilag.validate_geojson(data, [7], "OBJECTID")
        for ids in ([7, 8], [8]):
            with self.assertRaises(ValueError):
                unilag.validate_geojson(data, ids, "OBJECTID")
        data["features"].append(f)
        with self.assertRaises(ValueError):
            unilag.validate_geojson(data, [7], "OBJECTID")
        data["features"] = [f]
        f["geometry"]["coordinates"] = [377000, 727000]
        with self.assertRaises(ValueError):
            unilag.validate_geojson(data, [7], "OBJECTID")

    def test_osm_complete_relations_and_restrictions_are_retained(self):
        raw = b'<osm><node id="1" lon="3.39" lat="6.51"/><way id="2"><nd ref="1"/><tag k="access" v="private"/></way><relation id="3"><member type="way" ref="2" role="from"/><tag k="type" v="restriction"/></relation></osm>'
        _, records = unilag.validate_osm(raw)
        self.assertEqual(len(records), 3)
        self.assertEqual(records[("way", "2")].find("tag").attrib["v"], "private")
        for bad in (raw.replace(b'<nd ref="1"/>', b'<nd ref="9"/>'), raw.replace(b'ref="2"', b'ref="9"'), b'<osm><remark>timed out</remark></osm>', b'<osm><node id="1"/><node id="1"/></osm>'):
            with self.assertRaises(ValueError):
                unilag.validate_osm(bad)


if __name__ == "__main__":
    unittest.main()
