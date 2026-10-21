"""Remote-source snapshots and interrupted converters retain trustworthy receipts."""

import copy
from datetime import datetime, timezone
import io
import json
import subprocess
import unittest
from unittest.mock import patch
import urllib.error

import test_import_worker as helpers
import import_map as worker
from test_map_import import LAYER


class RemoteSourceWorkerTests(unittest.TestCase):
    def setUp(self):
        self.case = helpers.ImportWorkerTests(
            "test_file_inspection_checks_integrity_and_saves_mapping"
        )
        self.case.setUp()
        self.addCleanup(self.case.doCleanups)
        self.case.source.update(kind="osm", url="https://maps.example")
        self.case.content = b'<osm version="0.6"/>'

    def test_osm_download_records_original_content_hash_and_complete_query(self):
        with patch.object(
            worker, "fetch_public", return_value=self.case.content
        ) as fetch:
            self.case.run_worker()
        query = fetch.call_args.kwargs["form"]["data"]
        self.assertIn("(._;>>;)", query)
        self.assertIn('nwr(poly:"6.45 3.19', query)
        self.assertEqual(
            self.case.uploads[
                "storage/v1/object/campus-imports/test/one/snapshot-token.json"
            ],
            self.case.content,
        )
        receipt = next(
            update["retrieval_receipt"]
            for update in self.case.updates()
            if "retrieval_receipt" in update
        )
        self.assertTrue(receipt["retrievedAt"])

    def test_arcgis_download_retains_provider_metadata_and_warnings(self):
        self.case.source["kind"] = "arcgis"
        layer = {
            **copy.deepcopy(LAYER),
            "sourceUrl": "https://maps.example/0",
            "layerIdentity": "native-buildings",
            "providerRevision": "v1",
        }
        with patch(
            "map_import.arcgis.discover",
            return_value=([layer], ["Check redistribution rights"]),
        ) as discover:
            self.case.run_worker()
        discover.assert_called_once()
        snapshot = json.loads(next(iter(self.case.uploads.values())))
        self.assertEqual(snapshot["layers"][0]["layerIdentity"], "native-buildings")
        saved = next(
            update
            for update in self.case.updates()
            if update.get("status") == "mapping"
        )
        self.assertIn("Check redistribution rights", saved["summary"]["warnings"])
        self.assertEqual(saved["summary"]["layers"][0]["providerRevision"], "v1")

    def test_recent_snapshot_reuse_preserves_original_retrieval_time(self):
        retrieved = datetime.now(timezone.utc).isoformat()
        original = self.case.database

        def database(route, method="GET", body=None):
            if "snapshot_path=not.is.null" in route:
                return [
                    {
                        "id": "previous",
                        "snapshot_path": "test/previous/source.json",
                        "retrieval_receipt": {"retrievedAt": retrieved},
                    }
                ]
            return original(route, method, body)

        self.case.database = database
        with patch.object(worker, "fetch_public") as fetch:
            self.case.run_worker()
        fetch.assert_not_called()
        receipt = next(
            update["retrieval_receipt"]
            for update in self.case.updates()
            if "retrieval_receipt" in update
        )
        self.assertEqual(receipt["retrievedAt"], retrieved)

    def test_existing_snapshot_is_reused_without_redownload_or_reupload(self):
        self.case.job.update(
            snapshot_path="test/one/source.json",
            retrieval_receipt={"retrievedAt": "2026-10-01T00:00:00Z"},
        )
        with patch.object(worker, "fetch_public") as fetch:
            self.case.run_worker()
        fetch.assert_not_called()
        self.assertEqual(self.case.uploads, {})

    def test_foreign_snapshot_and_legacy_preview_fail_closed(self):
        self.case.job["snapshot_path"] = "other/one/source.json"
        with self.assertRaisesRegex(ValueError, "Snapshot identity"):
            self.case.run_worker()
        self.case.job.update(snapshot_path="test/one/source.json", phase="preview")
        with self.assertRaisesRegex(ValueError, "original retrieval receipt"):
            self.case.run_worker()
        self.assertEqual(self.case.uploads, {})

    def test_cancelled_or_expired_converter_is_removed_before_returning_failure(self):
        self.case.source["kind"] = "file"
        self.case.content = worker.encoded(
            {"type": "FeatureCollection", "features": [helpers.FEATURE]}
        )
        self.case.process.poll.return_value = None
        self.case.process.communicate.side_effect = [
            subprocess.TimeoutExpired("convert", 15),
            (b"", None),
        ]
        with (
            patch.object(worker.time, "monotonic", side_effect=[0, 1101]),
            self.assertRaisesRegex(ValueError, "time limit"),
        ):
            self.case.run_worker()
        self.case.process.kill.assert_called_once()
        self.assertEqual(self.case.updates()[-1]["status"], "failed")

    def test_missing_private_upload_provides_resumable_recovery(self):
        self.case.source["kind"] = "file"
        for code in [400, 404]:
            error = urllib.error.HTTPError(
                "https://private.example", code, "missing", {}, io.BytesIO(b"")
            )
            with (
                self.subTest(code=code),
                patch.object(self.case, "remote", side_effect=error),
                self.assertRaisesRegex(ValueError, "resume the upload"),
            ):
                self.case.run_worker()

    def test_reporting_failure_cannot_replace_original_processing_error(self):
        self.case.source["kind"] = "file"
        self.case.assets = []
        original = self.case.database

        def database(route, method="GET", body=None):
            if body and body.get("status") == "failed":
                raise RuntimeError("database unavailable")
            return original(route, method, body)

        self.case.database = database
        with self.assertRaisesRegex(ValueError, "at least one") as caught:
            self.case.run_worker()
        self.assertIn("Could not record the failure", caught.exception.__notes__[0])


if __name__ == "__main__":
    unittest.main()
