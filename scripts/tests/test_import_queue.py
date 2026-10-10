import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from map_import.queue import batches, queue_import, MAX_BATCH_BYTES


class ImportQueueTests(unittest.TestCase):
    def test_unicode_bytes_and_record_limits_preserve_every_record(self):
        rows = [{'id': str(i), 'payload': '地図' * 900} for i in range(1000)]
        chunks = list(batches(rows))
        self.assertEqual([r for _, chunk in chunks for r in chunk], rows)
        for offset, chunk in chunks:
            self.assertEqual(chunk[0]['id'], str(offset))
            self.assertLessEqual(len(chunk), 100)
            self.assertLessEqual(len(json.dumps(chunk, ensure_ascii=False, separators=(',', ':')).encode()), MAX_BATCH_BYTES)
        self.assertEqual([len(c) for _, c in batches([{'id': str(i)} for i in range(201)])], [100, 100, 1])

    def test_oversized_record_rejected_before_any_database_request(self):
        calls = []
        with self.assertRaisesRegex(ValueError, '384 KiB'):
            queue_import(lambda *args: calls.append(args), 'job', 'token', {'summary': {'errors': []}, 'expectedSources': [], 'proposals': [{'id': 'a', 'payload': 'x' * MAX_BATCH_BYTES}]})
        self.assertEqual(calls, [])

    def test_large_before_after_proposal_fits_without_raising_database_limit(self):
        rows = [{'id': 'large', 'before': {'data': 'x' * 167000}, 'after': {'data': 'y' * 167000}}]
        chunks = list(batches(rows))
        self.assertEqual(chunks, [(0, rows)])
        self.assertLess(len(json.dumps(chunks[0][1]).encode()), 512 * 1024)

    def test_incomplete_upload_never_finishes(self):
        calls = []
        def db(path, method, body):
            calls.append(path)
            if path.endswith('stage_campus_import_queue'): raise TimeoutError('connection lost')
        with self.assertRaises(TimeoutError):
            queue_import(db, 'job', 'token', {'summary': {'errors': []}, 'expectedSources': [{'id': 'a'}], 'proposals': []})
        self.assertEqual(calls, ['rpc/begin_campus_import_queue', 'rpc/stage_campus_import_queue'])

    def test_finish_only_receives_identity(self):
        calls = []
        queue_import(lambda *args: calls.append(args), 'job', 'token', {'summary': {'errors': []}, 'expectedSources': [], 'proposals': []})
        self.assertEqual(calls[-1], ('rpc/finish_campus_import_queue', 'POST', {'import_id': 'job', 'expected_token': 'token'}))


if __name__ == '__main__': unittest.main()
