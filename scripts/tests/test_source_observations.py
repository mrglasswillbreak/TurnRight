import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from source_observations import collect

class SourceObservationsTests(unittest.TestCase):
    def snapshots(self,root,xml):
        (root/'osm.xml').write_text(xml,encoding='utf8')
        (root/'arcgis.json').write_text(json.dumps({'operationalLayers':[{'id':'paths','title':'Paths','featureCollection':{'layers':[{'layerDefinition':{'id':0},'featureSet':{'features':[{'attributes':{'FID':1},'geometry':{'paths':[[[3,6],[3.1,6]]]}}]}}]}}]}),encoding='utf8')
        for kind in ('place','building','segment','connector'):
            (root/(kind+'.geojson')).write_text('{"type":"FeatureCollection","features":[]}',encoding='utf8')
        return collect(root,root,'a'*32)
    def test_incomplete_osm_relation_holds_only_osm(self):
        with tempfile.TemporaryDirectory() as tmp:
            result=self.snapshots(Path(tmp),'<osm><relation id="1" version="3"><member type="way" ref="missing" role="outer"/></relation></osm>')
            self.assertFalse(result['collections'][0]['complete'])
            self.assertTrue(result['collections'][1]['complete'])
            self.assertEqual(result['observations'][0]['providerVersion'],3)
    def test_upstream_geometry_has_no_generated_routing_ids(self):
        with tempfile.TemporaryDirectory() as tmp:
            result=self.snapshots(Path(tmp),'<osm><node id="1" lat="6" lon="3"/><node id="2" lat="6" lon="3.1"/><way id="7" version="2"><nd ref="1"/><nd ref="2"/><tag k="highway" v="footway"/></way></osm>')
            way=next(o for o in result['observations'] if o['nativeId']=='way:7')
            self.assertEqual(way['content']['nodes'],['1','2'])
            self.assertNotIn('records',way)
            self.assertTrue(result['collections'][0]['complete'])
    def test_osm_remark_cannot_be_a_successful_empty_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ValueError,'Incomplete OSM'):
                self.snapshots(Path(tmp),'<osm><remark>runtime error: timeout</remark></osm>')
    def test_failed_overture_collection_does_not_hide_independent_observations(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            self.snapshots(root,'<osm><node id="1" lat="6" lon="3"/></osm>')
            (root/'segment.geojson').unlink()
            result=collect(root,root,'a'*32,{'overture:segment':'Download interrupted'})
            failed=next(c for c in result['collections'] if c['identity']=='overture:segment')
            self.assertFalse(failed['complete'])
            self.assertIsNone(failed['count'])
            self.assertTrue(all(c['complete'] for c in result['collections'] if c is not failed))
            self.assertEqual({o['provider'] for o in result['observations']},{'osm','arcgis'})

    def test_duplicate_native_ids_hold_the_collection_without_aborting_independent_inputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            self.snapshots(root,'<osm><node id="1" lat="6" lon="3"/></osm>')
            arc=json.loads((root/'arcgis.json').read_text(encoding='utf8'))
            features=arc['operationalLayers'][0]['featureCollection']['layers'][0]['featureSet']['features']
            features.append(features[0])
            (root/'arcgis.json').write_text(json.dumps(arc),encoding='utf8')
            result=collect(root,root,'a'*32)
            failed=next(c for c in result['collections'] if c['identity'].startswith('arcgis:'))
            self.assertFalse(failed['complete'])
            self.assertIn('duplicate',failed['error'])
            self.assertTrue(all(c['complete'] for c in result['collections'] if c is not failed))
            self.assertEqual({o['provider'] for o in result['observations']},{'osm'})

if __name__=='__main__':unittest.main()
