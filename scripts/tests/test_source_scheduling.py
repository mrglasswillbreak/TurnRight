"""Scheduled checks claim once, respect opt-ins and preserve campus identity."""

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import check_map_sources as scheduler
from map_import.queue import queue_verified_import, queue_import


class SourceSchedulingTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(
            os.environ,
            {
                "GITHUB_REPOSITORY": "example/test",
                "GITHUB_TOKEN": "test-only",
                "SOURCE_ID": "",
                "OVERPASS_SCHEDULE_ALLOWED": "false",
            },
        )
        self.env.start()
        self.addCleanup(self.env.stop)
        self.sources = [
            {"id": "eligible", "kind": "arcgis", "name": "Public buildings"}
        ]
        self.calls = []
        self.pending = set()
        self.unclaimed = set()

    def database(self, route, method="GET", body=None):
        self.calls.append((os.environ.get("CAMPUS_ID"), route, method, body))
        if route.startswith("campuses?"):
            return [{"id": "alpha", "slug": "alpha"}, {"id": "beta", "slug": "beta"}]
        if route.startswith("campus_sources?"):
            return self.sources
        if route.startswith("campus_imports?source_id="):
            return (
                [{"id": "pending"}]
                if any(
                    "source_id=eq." + source + "&" in route for source in self.pending
                )
                else []
            )
        if route == "rpc/queue_source_check":
            return {
                "created": body["source_identity"] not in self.unclaimed,
                "job": {"id": "job", "run_token": "token"},
            }
        return []

    def run_scheduler(self, status=204):
        response = MagicMock()
        response.__enter__.return_value.status = status
        with (
            patch.object(scheduler, "db", side_effect=self.database),
            patch.object(
                scheduler.urllib.request, "urlopen", return_value=response
            ) as request,
            patch("builtins.print"),
        ):
            scheduler.check_sources()
            return request

    def test_daily_checks_skip_files_recent_pending_and_unclaimed_sources(self):
        self.sources += [
            {"id": "file", "kind": "file"},
            {"id": "osm", "kind": "osm"},
            {
                "id": "recent",
                "kind": "arcgis",
                "last_checked_at": datetime.now(timezone.utc).isoformat(),
            },
            {"id": "pending", "kind": "arcgis"},
            {"id": "unclaimed", "kind": "arcgis"},
        ]
        self.pending.add("pending")
        self.unclaimed.add("unclaimed")
        requests = self.run_scheduler()
        self.assertEqual(requests.call_count, 2)
        inputs = [
            json.loads(call.args[0].data)["inputs"] for call in requests.call_args_list
        ]
        self.assertEqual([value["campus_id"] for value in inputs], ["alpha", "beta"])
        self.assertTrue(
            all(
                value["import_id"] == "job" and value["run_token"] == "token"
                for value in inputs
            )
        )
        queries = [
            (campus, route)
            for campus, route, _, _ in self.calls
            if route.startswith("campus_sources?")
        ]
        self.assertEqual(
            queries,
            [
                (campus, "campus_sources?schedule=eq.daily&order=id")
                for campus in ["alpha", "beta"]
            ],
        )

    def test_explicit_source_ignores_recency_but_requires_osm_opt_in(self):
        identity = "11111111-1111-4111-8111-111111111111"
        self.sources = [
            {
                "id": identity,
                "kind": "osm",
                "name": "OSM",
                "last_checked_at": datetime.now(timezone.utc).isoformat(),
            }
        ]
        with patch.dict(
            os.environ, {"SOURCE_ID": identity, "OVERPASS_SCHEDULE_ALLOWED": "true"}
        ):
            requests = self.run_scheduler()
        self.assertEqual(requests.call_count, 2)
        self.assertTrue(
            any("id=eq." + identity in route for _, route, _, _ in self.calls)
        )

    def test_dispatch_failure_marks_claim_failed_for_retry(self):
        with self.assertRaisesRegex(ValueError, "Could not start"):
            self.run_scheduler(status=500)
        campus, route, method, body = self.calls[-1]
        self.assertEqual(
            (campus, route, method), ("alpha", "campus_imports?id=eq.job", "PATCH")
        )
        self.assertEqual(body["status"], "failed")

    def test_invalid_requested_source_fails_before_accessing_database(self):
        with (
            patch.dict(os.environ, {"SOURCE_ID": "bad&schedule=eq.daily"}),
            self.assertRaises(ValueError),
        ):
            self.run_scheduler()
        self.assertEqual(self.calls, [])


class VerifiedQueueTests(unittest.TestCase):
    def test_verified_queue_writes_identity_bound_candidate_and_cleans_temporary_file(
        self,
    ):
        candidate = {"observations": [], "receipt": {"contentHash": "verified"}}
        captured = []

        def execute(command, **options):
            path = Path(command[-1])
            captured.append((path, json.loads(path.read_text()), options))

        progress = MagicMock()
        with patch("subprocess.run", side_effect=execute):
            queue_verified_import(
                MagicMock(), "import-one", "run-one", candidate, progress
            )
        path, payload, options = captured[0]
        self.assertFalse(path.exists())
        self.assertEqual(
            payload,
            {
                **candidate,
                "runId": "run-one",
                "importId": "import-one",
                "token": "run-one",
            },
        )
        self.assertEqual(options, {"check": True, "timeout": 1100})
        progress.assert_called_once()

    def test_legacy_candidates_and_invalid_batches_never_claim_database_state(self):
        database = MagicMock()
        with patch("subprocess.run") as execute:
            for candidate in [{}, {"receipt": {}}, {"observations": []}]:
                with (
                    self.subTest(candidate=candidate),
                    self.assertRaisesRegex(ValueError, "legacy preview"),
                ):
                    queue_verified_import(database, "job", "token", candidate)
            execute.assert_not_called()
        for candidate in [
            {
                "summary": {"errors": ["invalid"]},
                "expectedSources": [],
                "proposals": [],
            },
            {"summary": {"errors": []}, "expectedSources": {}, "proposals": []},
        ]:
            with self.assertRaises(ValueError):
                queue_import(database, "job", "token", candidate)
        database.assert_not_called()

    def test_progress_tracks_staging_and_final_validation(self):
        database = MagicMock(return_value={"status": "reviewed"})
        progress = MagicMock()
        result = queue_import(
            database,
            "job",
            "token",
            {
                "summary": {"errors": []},
                "expectedSources": [{"id": "source"}],
                "proposals": [{"id": "proposal"}],
            },
            progress,
        )
        self.assertEqual(result, {"status": "reviewed"})
        self.assertEqual(progress.call_count, 3)
        self.assertIn("complete campus baseline", progress.call_args.args[0])


if __name__ == "__main__":
    unittest.main()
