import copy
import io
import json
from pathlib import Path
import socket
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from map_import.arcgis import layer_features, discover
from map_import.formats import unpack, safe_xml
from map_import.network import public_addresses
from map_import.normalise import digest, normalise

BOUNDARY={'type':'Feature','geometry':{'type':'Polygon','coordinates':[[[3.19,6.45],[3.22,6.45],[3.22,6.49],[3.19,6.49],[3.19,6.45]]]},'properties':{}}
CAMPUS={'id':'test','boundary':BOUNDARY,'bounds':[[3.19,6.45],[3.22,6.49]]}
SOURCE={'id':'one','name':'University buildings','kind':'file'}
CONFIG={'layers':[{'layer':'Buildings','role':'building','idField':'id','nameField':'name'}],'attribution':'University GIS','license':'CC0','redistributionConfirmed':True}
FEATURE={'type':'Feature','geometry':{'type':'Polygon','coordinates':[[[3.20,6.46],[3.201,6.46],[3.201,6.461],[3.20,6.461],[3.20,6.46]]]},'properties':{'id':'library','name':'Bibliothèque'}}
LAYER={'name':'Buildings','features':[FEATURE],'fields':[{'name':'id'},{'name':'name'}],'crs':'EPSG:4326','geometryTypes':['Polygon'],'suggestedRole':'building'}
META={'id':'meta:campus','entity':'meta','source':'combined','payload':{'sources':[],'version':'draft-test'},'hash':'initial'}


class MapImportTests(unittest.TestCase):
    def test_archive_and_xml_safety(self):
        with tempfile.TemporaryDirectory() as tmp:
            archive=Path(tmp)/'unsafe.zip'
            with zipfile.ZipFile(archive,'w') as f: f.writestr('../escape.shp',b'bad')
            with self.assertRaisesRegex(ValueError,'unsafe'): unpack(archive,Path(tmp)/'out')
            xml=Path(tmp)/'links.kml'
            xml.write_bytes('<kml><NetworkLink/></kml>'.encode('utf-16'))
            with self.assertRaisesRegex(ValueError,'network links'): safe_xml(xml)

    def test_private_dns_and_mixed_answers_rejected(self):
        for addresses in [['127.0.0.1'],['10.1.2.3'],['::1'],['8.8.8.8','192.168.1.2']]:
            with patch.object(socket,'getaddrinfo',return_value=[(0,0,0,'',(ip,443)) for ip in addresses]):
                with self.assertRaises(ValueError): public_addresses('source.example')

    def test_arcgis_checks_every_id_and_stops_incomplete_download(self):
        calls=[]
        def get(url,form=None):
            calls.append((url,form))
            if form is None: return {'name':'Buildings','capabilities':'Query','objectIdField':'OBJECTID','maxRecordCount':2,'geometryType':'esriGeometryPolygon'}
            if 'returnCountOnly' in form: return {'count':3}
            if 'returnIdsOnly' in form: return {'objectIds':[7,8,9]}
            return {'features':[{'attributes':{'OBJECTID':int(i)},'geometry':{'x':3.2,'y':6.46}} for i in form['objectIds'].split(',')]}
        result=layer_features('https://services.example/FeatureServer/0',CAMPUS['bounds'],get)
        self.assertEqual(len(result['features']),3)
        self.assertEqual([f['objectIds'] for _,f in calls if f and 'objectIds' in f],['7,8','9'])
        def partial(url,form=None):
            value=get(url,form)
            if form and 'objectIds' in form: value['features']=[]
            return value
        with self.assertRaisesRegex(ValueError,'incomplete'): layer_features('https://services.example/FeatureServer/0',CAMPUS['bounds'],partial)

    def test_embedded_arcgis_layers_and_unsupported_tiles(self):
        layers,warnings=discover('https://example.org/map',CAMPUS['bounds'],lambda *args: {'operationalLayers':[{'title':'Trees','featureCollection':{'layers':[{'layerDefinition':{'fields':[]},'featureSet':{'features':[]}}]}},{'title':'Imagery','url':'https://example.org/tiles','layerType':'ArcGISTiledMapServiceLayer'}]})
        self.assertEqual(layers[0]['name'],'Trees')
        self.assertIn('non-vector',warnings[0])

    def test_arcgis_cycle_is_bounded(self):
        with self.assertRaisesRegex(ValueError,'cycle'):
            discover('https://example.org/map',CAMPUS['bounds'],lambda *args: {'operationalLayers':[{'url':'https://example.org/map'}]})

    def test_source_refresh_preserves_authored_building_and_coded_labels(self):
        initial=normalise([copy.deepcopy(LAYER)],SOURCE,CAMPUS,[META],CONFIG,'first')
        previous=[p['after'] for p in initial['proposals'] if p['after']]
        building=next(r for r in previous if r['entity']=='feature')
        building['payload']['properties']['appearance']={'walls':{'material':'brick'}}
        building['payload']['properties']['modelDocumentAsset']={'id':'private-asset'}
        building['hash']=digest(building['payload'])
        layer=copy.deepcopy(LAYER);layer['features'][0]['properties']['name']='Refreshed name'
        layer['features'][0]['properties']['category']=7
        layer['fields'].append({'name':'category','codedValues':{'7':'Library'}})
        refreshed=normalise([layer],SOURCE,CAMPUS,previous,CONFIG,'second')
        changed=next(p['after'] for p in refreshed['proposals'] if p['after'] and p['after']['entity']=='feature')
        self.assertEqual(changed['payload']['properties']['modelDocumentAsset'],{'id':'private-asset'})
        self.assertEqual(changed['payload']['properties']['appearance'],{'walls':{'material':'brick'}})
        self.assertEqual(next(p['after'] for p in refreshed['proposals'] if p['after'] and p['after']['entity']=='place')['payload']['category'],'library')

    def test_native_mapping_identity_and_repeat_import(self):
        candidate=normalise([copy.deepcopy(LAYER)],SOURCE,CAMPUS,[META],CONFIG,'upload-one')
        self.assertFalse(candidate['summary']['errors'])
        self.assertEqual(candidate['summary']['counts']['added'],2)
        accepted=[p['after'] for p in candidate['proposals'] if p['after']]
        repeated=normalise([copy.deepcopy(LAYER)],SOURCE,CAMPUS,accepted,CONFIG,'upload-two')
        self.assertEqual(repeated['proposals'],[])
        self.assertEqual(next(r for r in accepted if r['entity']=='place')['payload']['name'],'Bibliothèque')

    def test_missing_crs_invalid_geometry_and_replacement_identity(self):
        layer=copy.deepcopy(LAYER); layer['crs']=None
        self.assertIn('coordinate system',normalise([layer],SOURCE,CAMPUS,[META],CONFIG,'one')['summary']['errors'][0])
        layer=copy.deepcopy(LAYER); layer['features'][0]['geometry']['coordinates'][0]=[[3.2,6.46],[3.201,6.461],[3.201,6.46],[3.2,6.461],[3.2,6.46]]
        self.assertTrue(normalise([layer],SOURCE,CAMPUS,[META],CONFIG,'one')['summary']['errors'])
        config=copy.deepcopy(CONFIG); del config['layers'][0]['idField']
        a=normalise([LAYER],SOURCE,CAMPUS,[META],config,'one')
        b=normalise([LAYER],SOURCE,CAMPUS,[META],config,'two')
        self.assertNotEqual(a['proposals'][0]['source_id'],b['proposals'][0]['source_id'])

    def test_generic_paths_keep_distinct_endpoints_and_restricted_access(self):
        line={'type':'Feature','properties':{'id':'path'},'geometry':{'type':'LineString','coordinates':[[3.2,6.46],[3.201,6.46]]}}
        layer={'name':'Paths','features':[line],'fields':[],'crs':'EPSG:4326','geometryTypes':['LineString'],'suggestedRole':'path'}
        config={**CONFIG,'layers':[{'layer':'Paths','role':'path','idField':'id'}]}
        result=normalise([layer],SOURCE,CAMPUS,[META],config,'one')
        records=[p['after'] for p in result['proposals'] if p['after']]
        self.assertEqual(len([r for r in records if r['entity']=='edge']),2)
        self.assertTrue(all(r['payload']['walkingAccess']=='private' for r in records if r['entity']=='edge'))
        self.assertFalse(next(r for r in records if r['entity']=='feature')['payload']['properties']['autoConnectCrossings'])


if __name__=='__main__': unittest.main()
