import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from diagnostics import emit_worker
from error_monitoring import NoRedirect, capture_worker_failure


class ErrorMonitoringTests(unittest.TestCase):
    def test_failure_delivery_is_private_bounded_and_redacted(self):
        environment = {
            "SUPABASE_URL": "https://monitoring.example",
            "SUPABASE_SERVICE_ROLE_KEY": "test-only",
            "GITHUB_SHA": "a" * 40,
        }
        event = {
            "event": "worker-failed",
            "jobId": "11111111-1111-4111-8111-111111111111",
            "error": "secret",
            "coordinates": [1, 2],
        }
        with patch("error_monitoring.urllib.request.build_opener") as build:
            capture_worker_failure(event, environment)
        request = build.return_value.open.call_args.args[0]
        self.assertEqual(build.return_value.open.call_args.kwargs["timeout"], 2)
        body = json.loads(request.data)["p_event"]
        self.assertEqual(body["reference"], event["jobId"])
        self.assertEqual(body["revision"], "a" * 40)
        self.assertNotIn("secret", request.data.decode())
        self.assertNotIn("coordinates", body)
        self.assertIsNone(
            NoRedirect().redirect_request(None, None, 302, "", {}, "https://other")
        )

    def test_disabled_invalid_or_successful_events_never_send(self):
        with patch("error_monitoring.urllib.request.build_opener") as build:
            for origin in [
                "invalid",
                "http://public.example",
                "https://user:key@example.com",
                "https://example.com/path",
                "https://example.com?key=1",
                "https://example.com#private",
            ]:
                capture_worker_failure(
                    {"event": "worker-failed"},
                    {"SUPABASE_URL": origin, "SUPABASE_SERVICE_ROLE_KEY": "test"},
                )
            capture_worker_failure({"event": "worker-failed"}, {})
            capture_worker_failure({"event": "worker-completed"}, {})
            capture_worker_failure(
                {"event": "worker-failed"}, {"ERROR_MONITORING_ENABLED": "false"}
            )
        build.assert_not_called()

    def test_loopback_unknown_revision_and_outage_do_not_leak_or_raise(self):
        environment = {
            "SUPABASE_URL": "http://127.0.0.1:54321",
            "SUPABASE_SERVICE_ROLE_KEY": "test",
        }
        with patch("error_monitoring.urllib.request.build_opener") as build:
            capture_worker_failure(
                {"event": "worker-failed", "jobId": "private"}, environment
            )
            body = json.loads(build.return_value.open.call_args.args[0].data)["p_event"]
            self.assertEqual(body["revision"], "unknown")
            self.assertNotIn("reference", body)
            build.return_value.open.side_effect = OSError("private credentials")
            with patch("builtins.print") as output:
                capture_worker_failure({"event": "worker-failed"}, environment)
            self.assertNotIn("private", str(output.call_args))

    def test_standard_logger_and_monitor_receive_the_same_redacted_envelope(self):
        with (
            patch("diagnostics.capture_worker_failure") as capture,
            patch("diagnostics.logging.getLogger") as logger,
        ):
            logger.return_value.handlers = []
            emit_worker("map-import", 0, False, "11111111-1111-4111-8111-111111111111")
            emit_worker("map-import", 0, True)
        self.assertEqual(capture.call_count, 2)
        self.assertEqual(logger.return_value.log.call_count, 2)
        self.assertEqual(capture.call_args.args[0]["event"], "worker-completed")
