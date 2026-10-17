import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch
import importlib.util

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from map_import.exchange import inspect_exchange, MANIFEST
spec = importlib.util.spec_from_file_location('turnright_bridge', Path(__file__).resolve().parents[1] / 'arcgis' / 'bridge.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)
compare, encoded, export_bundle = bridge.compare, bridge.encoded, bridge.export_bundle

class ExchangeTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.dataset = self.root / 'buildings.geojson'
        self.feature = {'type': 'Feature', 'properties': {'oid': 7}, 'geometry': {'type': 'Polygon', 'coordinates': [[[3.2, 6.47], [3.201, 6.47], [3.201, 6.471], [3.2, 6.471], [3.2, 6.47]]]}}
        self.dataset.write_bytes(encoded({'type': 'FeatureCollection', 'features': [self.feature]}))
        self.entry = {'name': 'buildings', 'file': self.dataset.name, 'sourceCollection': 'arcgis:stable-service:0', 'sourceCrs': 'EPSG:4326', 'horizontalUnit': 'degree', 'originalCrs': {'wkid': 32631}, 'role': 'building', 'idField': 'oid', 'count': 1, 'sha256': hashlib.sha256(self.dataset.read_bytes()).hexdigest(), 'surveyDate': None, 'rights': {'license': '', 'attribution': 'Publisher', 'redistributionConfirmed': False}}
        self.manifest = {'schemaVersion': 1, 'generator': 'turnright-arcgis-pro', 'campusId': 'lasu', 'campusName': 'LASU Ojo', 'baselineVersion': 'snapshot', 'baselineSha256': 'a' * 64, 'layers': [self.entry]}

    def tearDown(self):
        self.temporary.cleanup()

    def inspect(self):
        receipt = self.root / MANIFEST
        receipt.write_bytes(encoded(self.manifest))
        def converter(path, configuration, work, name):
            return [{'name': name, 'crs': 'EPSG:4326', 'features': json.loads(path.read_bytes())['features']}]
        return inspect_exchange([self.dataset, receipt], {'_campusId': 'lasu'}, self.root, converter)

    def test_stable_ids_original_crs_and_unknown_permissions_survive_inspection(self):
        result = self.inspect()[0]
        self.assertEqual(result['sourceCollection'], self.entry['sourceCollection'])
        self.assertEqual(result['exchange']['originalCrs'], {'wkid': 32631})
        self.assertIsNone(result['exchange']['surveyDate'])
        self.assertFalse(result['exchange']['rights']['redistributionConfirmed'])

    def test_rejects_corrupt_counts_and_hashes(self):
        self.entry['count'] = 2
        with self.assertRaisesRegex(ValueError, 'count'): self.inspect()
        self.entry['count'] = 1
        self.dataset.write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'checksum'): self.inspect()

    def test_rejects_other_campus_and_unsafe_paths(self):
        self.manifest['campusId'] = 'unilag'
        with self.assertRaisesRegex(ValueError, 'different campus'): self.inspect()
        self.manifest['campusId'] = 'lasu'
        self.entry['file'] = '../buildings.geojson'
        with self.assertRaisesRegex(ValueError, 'Unsafe'): self.inspect()

    def test_rejects_misdeclared_crs_units_and_non_boolean_rights(self):
        self.entry['sourceCrs'] = 'EPSG:32631'
        with self.assertRaisesRegex(ValueError, 'CRS'): self.inspect()
        self.entry['sourceCrs'] = 'EPSG:4326'
        self.entry['horizontalUnit'] = 'm'
        with self.assertRaisesRegex(ValueError, 'degree'): self.inspect()
        self.entry['horizontalUnit'] = 'degree'
        self.entry['rights']['redistributionConfirmed'] = 'false'
        with self.assertRaisesRegex(ValueError, 'licence'): self.inspect()

    def test_rejects_duplicate_native_ids_and_duplicate_layer_identities(self):
        self.dataset.write_bytes(encoded({'type': 'FeatureCollection', 'features': [self.feature, self.feature]}))
        self.entry.update(count=2, sha256=hashlib.sha256(self.dataset.read_bytes()).hexdigest())
        with self.assertRaisesRegex(ValueError, 'duplicate source'): self.inspect()
        self.manifest['layers'].append(copy.deepcopy(self.entry))
        with self.assertRaises(ValueError): self.inspect()

    def test_compare_accounts_for_every_candidate_and_rejects_stale_baseline(self):
        original = copy.deepcopy(self.feature)
        original['properties'].update(id='owner-building', kind='building', modelDocument={'version': 1})
        baseline = {'version': 'snapshot', 'map': {'features': [original]}}
        self.manifest['baselineSha256'] = hashlib.sha256(encoded(baseline)).hexdigest()
        result = compare(baseline, self.manifest, self.root, self.root / 'report.json')
        self.assertEqual(result['counts'], {'duplicate': 1})
        self.assertEqual(result['buildings'][0]['treatment'], 'preserve-authored')
        baseline['version'] = 'new'
        with self.assertRaisesRegex(ValueError, 'Baseline changed'): compare(baseline, self.manifest, self.root, self.root / 'report.json')

    def test_export_is_repeatable_and_refuses_to_overwrite_evidence(self):
        result = export_bundle(self.manifest, self.root, self.root / 'bundle.zip')
        self.assertEqual(result['layers'], 1)
        with self.assertRaisesRegex(ValueError, 'new bundle name'): export_bundle(self.manifest, self.root, self.root / 'bundle.zip')

    def test_discovered_item_without_resolved_layers_keeps_a_disposition(self):
        registry = {**self.manifest, 'bounds': [[3, 6], [3.1, 6.1]], 'items': [
            {'id': 'empty', 'title': 'LASU empty map', 'type': 'Web Map'}]}
        with patch.object(bridge, 'resolve_layers', return_value=([], [])):
            result = bridge.inspect(registry, self.root / 'inspection.json', get=lambda *_: {})
        self.assertEqual(result['layers'], [])
        self.assertEqual(result['ledger'][0]['itemId'], 'empty')
        self.assertEqual(result['ledger'][0]['status'], 'held')

    def test_signed_in_session_is_never_sent_to_third_party_webmap_targets(self):
        portal = bridge.Portal()
        portal.gis = MagicMock()
        with patch.object(bridge, 'public_json', return_value={'ok': True}) as public:
            for url in ['https://gis.example.com/arcgis/rest/services/map',
                        'https://services.arcgis.com.attacker.example/rest/services/map',
                        'http://www.arcgis.com/sharing/rest/search']:
                self.assertEqual(portal.get(url), {'ok': True})
            self.assertEqual(public.call_count, 3)
        portal.gis._con.get.assert_not_called()

    def test_unavailable_or_unsigned_pro_session_falls_back_to_public_discovery(self):
        fake_gis = MagicMock()
        fake_gis.users.me = None
        fake_gis.url = 'https://organization.example/portal'
        provider = MagicMock()
        provider.GIS.return_value = fake_gis
        with patch.dict(sys.modules, {'arcgis': MagicMock(), 'arcgis.gis': provider}):
            unsigned = bridge.Portal(True)
            self.assertIsNone(unsigned.gis)
            self.assertEqual(unsigned.base, bridge.PORTAL)
            provider.GIS.side_effect = RuntimeError('Pro unavailable')
            unavailable = bridge.Portal(True)
            self.assertIsNone(unavailable.gis)
            self.assertEqual(unavailable.base, bridge.PORTAL)
            self.assertEqual(len(unavailable.warnings), 1)

    def test_signed_in_portal_requests_cannot_forward_auth_through_redirects(self):
        portal = bridge.Portal()
        portal.gis = MagicMock()
        portal.gis._con.get.return_value = {'count': 1}
        self.assertEqual(portal.get('https://services2.arcgis.com/test/query', {'returnCountOnly': 'true'}), {'count': 1})
        self.assertFalse(portal.gis._con.get.call_args.kwargs['allow_redirects'])
        portal.gis._con.get.return_value = 'unexpected redirect body'
        with self.assertRaisesRegex(ValueError, 'Portal returned an error'):
            portal.get('https://www.arcgis.com/sharing/rest/search')

    def test_null_geometry_is_accounted_for_and_cross_role_overlap_is_not_a_conflict(self):
        original = copy.deepcopy(self.feature)
        original['properties'].update(id='green', kind='land')
        baseline = {'version': 'snapshot', 'map': {'features': [original]}}
        self.manifest['baselineSha256'] = hashlib.sha256(encoded(baseline)).hexdigest()
        missing = {'type': 'Feature', 'properties': {'oid': 8}, 'geometry': None}
        self.dataset.write_bytes(encoded({'type': 'FeatureCollection', 'features': [self.feature, missing]}))
        self.entry.update(count=2, sha256=hashlib.sha256(self.dataset.read_bytes()).hexdigest())
        result = compare(baseline, self.manifest, self.root, self.root / 'report.json')
        self.assertEqual(result['counts'], {'addition-candidate': 1, 'invalid-geometry': 1})

if __name__ == '__main__': unittest.main()
