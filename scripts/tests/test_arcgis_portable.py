import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'arcgis'))
from export_portable import detail_fields, export_portable
from bridge import encoded

try:
    from osgeo import gdal
except ImportError:
    gdal = None


class PortableEvidenceTests(unittest.TestCase):
    def test_project_resume_cannot_clear_an_unowned_or_completed_project(self):
        script = Path(__file__).resolve().parents[1] / 'arcgis' / 'create_project.py'
        spec = importlib.util.spec_from_file_location('turnright_project_test', script)
        module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {'arcpy': MagicMock()}):
            spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory) / 'Owned.aprx'
            project.write_text('existing user project', encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'interrupted project'):
                module.create('unused', directory, project, resume=True)
            project.with_suffix('.turnright-project.json').write_text(json.dumps({
                'generator': 'turnright-arcgis-pro', 'status': 'complete', 'project': str(project.resolve())}), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'interrupted project'):
                module.create('unused', directory, project, resume=True)
            self.assertEqual(project.read_text(), 'existing user project')
            module.arcpy.mp.ArcGISProject.assert_not_called()

    def test_field_inventory_distinguishes_empty_and_zero_without_asserting_units(self):
        result = detail_fields([
            {'properties': {'Name': 'Library', 'Height': 0, 'survey_date': None}},
            {'properties': {'Height': 12, 'survey_date': '2008'}}])
        self.assertEqual(result, [{'field': 'Height', 'populated': 2, 'samples': ['0', '12']},
                                  {'field': 'survey_date', 'populated': 1, 'samples': ['2008']}])

    @unittest.skipUnless(gdal, 'Native GDAL required for portable archive verification')
    def test_native_archive_preserves_ids_holes_null_geometry_rights_and_hashes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            study = root / 'study'
            study.mkdir()
            baseline = {'version': 'snapshot', 'map': {'features': []}}
            (study / 'baseline.json').write_bytes(encoded(baseline))
            features = [
                {'type': 'Feature', 'properties': {'FID': 'source-007', 'Height': 12}, 'geometry': {
                    'type': 'Polygon', 'coordinates': [
                        [[3, 6], [3.01, 6], [3.01, 6.01], [3, 6.01], [3, 6]],
                        [[3.002, 6.002], [3.002, 6.004], [3.004, 6.004], [3.004, 6.002], [3.002, 6.002]]]}},
                {'type': 'Feature', 'properties': {'FID': 'source-008', 'Height': None}, 'geometry': None}]
            source = study / 'building.geojson'
            source.write_bytes(encoded({'type': 'FeatureCollection', 'features': features}))
            inspection = {'campusId': 'test', 'campusName': 'Campus', 'baselineVersion': 'snapshot',
                          'baselineSha256': hashlib.sha256(encoded(baseline)).hexdigest(), 'layers': [{
                              'name': 'Building', 'file': source.name, 'sourceCollection': 'arcgis:test:0',
                              'idField': 'FID', 'count': 2, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                              'sourceCrs': 'EPSG:4326', 'rights': {'redistributionConfirmed': False}, 'surveyDate': None}]}
            (study / 'inspection.json').write_bytes(encoded(inspection))
            output = root / 'archive'
            result = export_portable(study, output)
            self.assertEqual(result['features'], 2)
            manifest = json.loads((output / 'archive.json').read_bytes())
            self.assertFalse(manifest['requiresArcGISPro'])
            self.assertFalse(manifest['layers'][0]['rights']['redistributionConfirmed'])
            self.assertIsNone(manifest['layers'][0]['surveyDate'])
            for entry in manifest['files']:
                self.assertEqual(hashlib.sha256((output / entry['file']).read_bytes()).hexdigest(), entry['sha256'])
            package = gdal.OpenEx(str(output / 'campus-review.gpkg'), gdal.OF_VECTOR)
            layer = package.GetLayer(0)
            shapes = {f.GetField('FID'): json.loads(f.GetGeometryRef().ExportToJson()) if f.GetGeometryRef() else None for f in layer}
            self.assertEqual(shapes['source-007'], features[0]['geometry'])
            self.assertIsNone(shapes['source-008'])
            self.assertEqual(layer.GetSpatialRef().GetAuthorityCode(None), '4326')
            package = None
            with self.assertRaisesRegex(ValueError, 'new archive'):
                export_portable(study, output)
            source.write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, 'checksum'):
                export_portable(study, root / 'corrupt')
            self.assertFalse((root / 'corrupt').exists())


if __name__ == '__main__':
    unittest.main()
