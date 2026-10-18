import unittest
from unittest.mock import patch
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from diagnostics import worker_event


class DiagnosticsTests(unittest.TestCase):
    def test_worker_envelope_contains_only_operational_metadata(self):
        with patch('diagnostics.time.monotonic', return_value=5.25):
            event = worker_event('map-import', 5, False)
        self.assertEqual(set(event), {'event', 'timestamp', 'durationMs', 'worker', 'status'})
        self.assertEqual(event['event'], 'worker-failed')
        self.assertEqual(event['durationMs'], 250)
        self.assertEqual(event['status'], 500)
        self.assertEqual(worker_event('map-import', 0, True)['status'], 200)

    def test_unrecognised_workers_are_not_logged(self):
        with self.assertRaises(ValueError):
            worker_event('secret payload', 0, False)
