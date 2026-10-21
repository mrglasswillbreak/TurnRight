"""Untrusted XML must not expand entities or replace a verified source snapshot."""

from io import BytesIO
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from defusedxml.common import EntitiesForbidden

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import import_campus
import source_observations


class XmlSecurityTests(unittest.TestCase):
    def test_download_rejects_entities_without_replacing_previous_snapshot(self):
        for declaration in [
            '<!ENTITY payload "expanded input">',
            '<!ENTITY payload SYSTEM "file:///not-a-real-private-file">',
        ]:
            with (
                self.subTest(declaration=declaration),
                tempfile.TemporaryDirectory() as tmp,
            ):
                destination = Path(tmp) / "osm.xml"
                destination.write_bytes(b"<osm/>")
                incoming = (
                    f"<!DOCTYPE osm [{declaration}]><osm>&payload;</osm>".encode()
                )
                with patch.object(
                    import_campus.urllib.request,
                    "urlopen",
                    return_value=BytesIO(incoming),
                ):
                    with self.assertRaises(EntitiesForbidden):
                        import_campus.fetch(
                            "https://source.example.test/osm", destination
                        )
                self.assertEqual(destination.read_bytes(), b"<osm/>")
                self.assertFalse(destination.with_suffix(".receipt.json").exists())

    def test_cached_source_observations_reject_entities_before_reconciliation(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            (folder / "osm.xml").write_text(
                '<!DOCTYPE osm [<!ENTITY payload "expanded">]><osm>&payload;</osm>'
            )
            with self.assertRaises(EntitiesForbidden):
                source_observations.collect(folder, folder, "fixture-item")


if __name__ == "__main__":
    unittest.main()
