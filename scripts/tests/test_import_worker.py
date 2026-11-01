"""Host/converter contracts: private uploads, cancellation, receipts and failures."""

import copy
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch
import urllib.error

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import import_map as worker
from map_import import conversion
from test_map_import import CAMPUS, CONFIG, FEATURE, LAYER, META, SOURCE


class ImportConversionTests(unittest.TestCase):
    def convert(self, phase="inspect", layers=None, files=None, **extra):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            (folder / "Buildings.geojson").write_text(
                json.dumps({"type": "FeatureCollection", "features": [FEATURE]})
            )
            request = {
                "phase": phase,
                "campus": CAMPUS,
                "source": SOURCE,
                "previous": [META],
                "configuration": copy.deepcopy(CONFIG),
                "importId": "one",
                "files": files or [{"path": "Buildings.geojson"}],
                "warnings": ["Review source rights"],
                **extra,
            }
            (folder / "request.json").write_bytes(worker.encoded(request))
            with patch.object(
                conversion,
                "inspect_file",
                return_value=copy.deepcopy(layers or [LAYER]),
            ):
                worker.convert(folder)
            self.assertTrue((folder / "progress.json").exists())
            self.assertFalse((folder / "progress.tmp").exists())
            return json.loads((folder / "result.json").read_bytes())

    def test_inspection_preserves_provenance_and_field_domains_without_full_features(
        self,
    ):
        source = {
            "path": "Buildings.geojson",
            "sourceUrl": "https://maps.example/layer",
            "layerIdentity": "buildings",
            "providerRevision": "revision-1",
            "fields": [
                {
                    "name": "id",
                    "alias": "Building identifier",
                    "domain": {"codedValues": [{"code": "library", "name": "Library"}]},
                }
            ],
        }
        result = self.convert(files=[source])
        layer = result["summary"]["layers"][0]
        self.assertNotIn("features", layer)
        self.assertEqual(layer["count"], 1)
        self.assertEqual(layer["sourceUrl"], source["sourceUrl"])
        self.assertEqual(layer["fields"][0]["codedValues"], {"library": "Library"})
        self.assertTrue(layer["fields"][0]["unique"])
        self.assertEqual(result["summary"]["totalFeatures"], 1)

    def test_duplicate_layer_names_and_nonunique_ids_are_exposed(self):
        layer = copy.deepcopy(LAYER)
        layer["features"] *= 2
        result = self.convert(layers=[layer, copy.deepcopy(layer)])
        self.assertEqual(
            [v["name"] for v in result["summary"]["layers"]],
            ["Buildings", "Buildings (2)"],
        )
        self.assertFalse(result["summary"]["layers"][0]["fields"][0]["unique"])

    def test_preview_uses_real_normalisation_and_retains_source_warnings(self):
        result = self.convert(phase="preview")
        self.assertEqual(result["summary"]["totalFeatures"], 1)
        self.assertIn("Review source rights", result["summary"]["warnings"])
        self.assertTrue(result["observations"])
        self.assertEqual(result["summary"]["errors"], [])

    def test_layer_limit_rejects_before_writing_result(self):
        with self.assertRaisesRegex(ValueError, "limit"):
            self.convert(layers=[LAYER] * 101)


class ImportPrivateTransportTests(unittest.TestCase):
    def test_private_api_scopes_rows_but_not_campus_catalogue_or_rpc(self):
        with (
            patch.dict(os.environ, {"CAMPUS_ID": "other-campus"}),
            patch.object(worker, "remote") as remote,
        ):
            worker.db("source_features?limit=1")
            worker.db("campus_imports", "PATCH", {"status": "failed"})
            worker.db("campuses")
            worker.db("rpc/claim", "POST", {})
        self.assertEqual(
            [c.args[0] for c in remote.call_args_list],
            [
                "rest/v1/source_features?limit=1&campus_id=eq.other-campus",
                "rest/v1/campus_imports?campus_id=eq.other-campus",
                "rest/v1/campuses",
                "rest/v1/rpc/claim",
            ],
        )

    def test_transport_encodes_body_and_preserves_raw_bytes_or_empty_response(self):
        with patch.dict(
            os.environ,
            {
                "SUPABASE_URL": "https://private.example/",
                "SUPABASE_SERVICE_ROLE_KEY": "test-only",
                "CAMPUS_ID": "campus-a",
            },
        ):
            for body, content, raw, expected in [
                ({"name": "地図"}, b'{"ok":true}', False, {"ok": True}),
                (b"upload", b"file", True, b"file"),
                (None, b"", False, None),
            ]:
                response = MagicMock()
                response.__enter__.return_value.read.return_value = content
                with patch.object(
                    worker.urllib.request, "urlopen", return_value=response
                ) as open_url:
                    self.assertEqual(
                        worker.remote("objects", "POST", body, raw), expected
                    )
                request = open_url.call_args.args[0]
                self.assertEqual(request.get_header("X-turnright-campus"), "campus-a")
                self.assertEqual(
                    request.data,
                    body
                    if isinstance(body, bytes)
                    else worker.encoded(body)
                    if body
                    else None,
                )

    def test_http_error_identity_and_bounded_service_message_are_preserved(self):
        for payload in [b'{"message":"missing upload"}', b"not-json", b"[]"]:
            error = urllib.error.HTTPError(
                "https://private.example", 404, "missing", {}, io.BytesIO(payload)
            )
            with (
                patch.dict(
                    os.environ,
                    {
                        "SUPABASE_URL": "https://private.example",
                        "SUPABASE_SERVICE_ROLE_KEY": "test-only",
                    },
                ),
                patch.object(worker.urllib.request, "urlopen", side_effect=error),
                self.assertRaises(urllib.error.HTTPError) as caught,
            ):
                worker.remote("objects")
            self.assertIs(caught.exception, error)
            if payload.startswith(b"{"):
                self.assertEqual(error.__notes__, ["Import service: missing upload"])


class ImportWorkerTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(
            os.environ, {"CAMPUS_ID": "test", "IMPORT_ID": "one", "RUN_TOKEN": "token"}
        )
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.job = {
            "id": "one",
            "source_id": "one",
            "phase": "inspect",
            "configuration": copy.deepcopy(CONFIG),
        }
        self.source = copy.deepcopy(SOURCE)
        self.content = worker.encoded(
            {"type": "FeatureCollection", "features": [FEATURE]}
        )
        self.assets = [
            {
                "name": "Buildings.geojson",
                "path": "test/one/Buildings.geojson",
                "bytes": len(self.content),
                "sha256": hashlib.sha256(self.content).hexdigest(),
            }
        ]
        self.calls = []
        self.uploads = {}
        self.claimed = True
        self.cancelled = False
        self.process = MagicMock(returncode=0)
        self.process.communicate.return_value = (b"", None)
        self.process.poll.return_value = 0

    def database(self, route, method="GET", body=None):
        self.calls.append((route, method, body))
        if route.startswith("campus_sources"):
            return [self.source]
        if route.startswith("campuses?"):
            return [CAMPUS]
        if route.startswith("source_features?"):
            return [META]
        if route.startswith("campus_import_assets?"):
            return self.assets
        if "status=eq.queued" in route:
            return [self.job] if self.claimed else []
        if "snapshot_path=not.is.null" in route:
            return []
        return [] if self.cancelled and method == "GET" else [{"id": "one"}]

    def remote(self, path, method="GET", body=None, raw=False):
        if method == "POST":
            self.uploads[path] = body
            return None
        return self.content

    def launch(self, command, **kwargs):
        folder = Path(command[command.index("-v") + 1].removesuffix(":/work"))
        worker.convert(folder)
        return self.process

    def run_worker(self):
        with (
            patch.object(worker, "db", side_effect=self.database),
            patch.object(worker, "remote", side_effect=self.remote),
            patch.object(
                conversion,
                "inspect_file",
                side_effect=lambda *args: copy.deepcopy([LAYER]),
            ),
            patch.object(worker.os, "getuid", return_value=1000, create=True),
            patch.object(worker.os, "getgid", return_value=1000, create=True),
            patch.object(worker.subprocess, "Popen", side_effect=self.launch),
            patch.object(worker.subprocess, "run") as run,
            patch.object(worker, "queue_import") as queue,
        ):
            worker.run_job()
            return run, queue

    def updates(self):
        return [body for _, method, body in self.calls if method == "PATCH" and body]

    def test_file_inspection_checks_integrity_and_saves_mapping(self):
        self.run_worker()
        saved = next(
            update for update in self.updates() if update.get("status") == "mapping"
        )
        self.assertEqual(saved["summary"]["totalFeatures"], 1)
        self.assertEqual(self.uploads, {})
        self.assertTrue(
            any("run_token=eq.token" in route for route, _, _ in self.calls)
        )

    def test_preview_stores_immutable_candidate_and_verified_receipt_before_queue(self):
        self.job.update(phase="preview", auto_queue=True)
        run, queue = self.run_worker()
        candidate = json.loads(
            self.uploads[
                "storage/v1/object/campus-imports/test/one/candidate-token.json"
            ]
        )
        self.assertEqual(candidate["receipt"]["importerVersion"], "map-import/2")
        self.assertTrue(candidate["receipt"]["retrievedAt"])
        self.assertFalse(candidate["completeReplacement"])
        self.assertTrue(candidate["observations"])
        self.assertEqual(run.call_args.args[0][-1], "--preview")
        queue.assert_called_once()

    def test_unclaimed_or_invalid_identity_cannot_do_work(self):
        self.claimed = False
        self.run_worker()
        self.assertEqual(len(self.calls), 1)
        with (
            patch.dict(os.environ, {"RUN_TOKEN": "../other"}),
            self.assertRaisesRegex(ValueError, "identity"),
        ):
            self.run_worker()

    def test_invalid_uploads_fail_without_saving_mapping(self):
        for mutation, message in [
            ({"path": "other/one/file"}, "identity"),
            ({"sha256": "wrong"}, "integrity"),
            ({"name": "../file"}, "filename"),
            ({"bytes": worker.MAX_BYTES + 1}, "50 MiB"),
        ]:
            original = self.assets[0].copy()
            self.assets[0].update(mutation)
            with (
                self.subTest(mutation=mutation),
                self.assertRaisesRegex(ValueError, message),
            ):
                self.run_worker()
            self.assertEqual(self.updates()[-1]["status"], "failed")
            self.assets[0] = original
        self.assets = []
        with self.assertRaisesRegex(ValueError, "at least one"):
            self.run_worker()

    def test_cancellation_after_download_never_launches_converter(self):
        self.cancelled = True
        with self.assertRaisesRegex(ValueError, "cancelled"):
            self.run_worker()
        self.process.communicate.assert_not_called()

    def test_converter_failure_retains_actionable_last_line(self):
        self.process.returncode = 1
        self.process.communicate.return_value = (b"trace details\nBad projection", None)
        with self.assertRaisesRegex(ValueError, "Bad projection"):
            self.run_worker()
        self.assertEqual(self.updates()[-1]["message"], "Bad projection")

    def test_slow_converter_reports_progress_then_completes(self):
        self.process.communicate.side_effect = [
            subprocess.TimeoutExpired("convert", 15),
            (b"", None),
        ]
        self.run_worker()
        self.assertEqual(self.process.communicate.call_count, 2)
        self.assertTrue(
            any(
                update.get("message", "").startswith("Inspecting file")
                for update in self.updates()
            )
        )

    def test_queue_phase_rejects_foreign_candidate_and_preserves_verified_payload(self):
        self.job.update(phase="queue", candidate_path="other/one/candidate.json")
        with self.assertRaisesRegex(ValueError, "complete import preview"):
            self.run_worker()
        self.job["candidate_path"] = "test/one/candidate.json"
        self.content = b'{"observations":[],"receipt":{"contentHash":"verified"}}'
        _, queue = self.run_worker()
        self.assertEqual(queue.call_args.args[3], json.loads(self.content))


if __name__ == "__main__":
    unittest.main()
