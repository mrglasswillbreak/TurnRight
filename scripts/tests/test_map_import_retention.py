import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from cleanup_imports import cleanup, checked_paths

JOB = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
TOKEN = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
OBJECT = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
PATH = f'lasu/{JOB}/candidate-{TOKEN}.json'
ROW = {'import_id': JOB, 'path': PATH, 'object_id': OBJECT, 'bytes': 123}


class RetentionTests(unittest.TestCase):
    def database(self, path, method='GET', body=None):
        self.calls.append((path, method, body))
        if path.startswith('campuses?'):
            return [{'id': 'lasu'}]
        if path.endswith('plan_import_artifact_cleanup'):
            return [ROW]
        if path.endswith('claim_import_artifact_cleanup'):
            return self.claimed
        if path.endswith('finish_import_artifact_cleanup'):
            return 1
        raise AssertionError(path)

    def setUp(self):
        self.calls = []
        self.claimed = [ROW]
        self.environment = patch.dict(os.environ, {})
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def test_dry_run_never_claims_or_deletes(self):
        result = cleanup(database=self.database, storage=lambda *a: self.fail('delete'), report=lambda x: None)
        self.assertEqual(result['plannedFiles'], 1)
        self.assertEqual(result['deletedFiles'], 0)
        self.assertEqual(len(self.calls), 2)

    def test_storage_api_then_database_confirmation(self):
        def storage(path, method, body):
            self.assertEqual(path, 'storage/v1/object/campus-imports')
            self.assertEqual(method, 'DELETE')
            self.assertEqual(body, {'prefixes': [PATH]})
            self.assertTrue(self.calls[-1][0].endswith('claim_import_artifact_cleanup'))
        result = cleanup(True, self.database, storage, lambda x: None)
        self.assertEqual(result['deletedBytes'], 123)
        self.assertTrue(self.calls[-1][0].endswith('finish_import_artifact_cleanup'))

    def test_failed_storage_delete_is_not_marked_complete(self):
        def unavailable(*args):
            raise TimeoutError('Storage response lost')
        with self.assertRaises(TimeoutError):
            cleanup(True, self.database, unavailable, lambda x: None)
        self.assertFalse(any('finish_' in call[0] for call in self.calls))

    def test_job_that_became_active_is_skipped(self):
        self.claimed = []
        result = cleanup(True, self.database, lambda *a: self.fail('delete'), lambda x: None)
        self.assertEqual(result['deletedFiles'], 0)

    def test_never_deletes_uploads_baselines_or_another_campus(self):
        for path in [f'lasu/{JOB}/baseline.json', f'lasu/{JOB}/detail-preparation.json',
                     f'lasu/{JOB}/{TOKEN}.geojson', PATH.replace('lasu/', 'other/'),
                     PATH + '/child', PATH.replace('candidate-', '../candidate-')]:
            with self.subTest(path=path), self.assertRaises(ValueError):
                checked_paths('lasu', JOB, [{**ROW, 'path': path}])
        with self.assertRaises(ValueError):
            checked_paths('lasu', JOB, [ROW] * 101)
        with self.assertRaises(ValueError):
            checked_paths('lasu', JOB, [ROW, ROW])


if __name__ == '__main__':
    unittest.main()
