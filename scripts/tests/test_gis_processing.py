import importlib.util
import json
import pathlib
import tempfile
import unittest
import zipfile
from shapely.geometry import Point, Polygon, MultiPolygon, GeometryCollection, mapping, shape
from shapely.ops import transform
from pyproj import Transformer

spec=importlib.util.spec_from_file_location('campus_gis',pathlib.Path(__file__).parents[1]/'gis'/'process.py')
gis=importlib.util.module_from_spec(spec);spec.loader.exec_module(gis)
forward=Transformer.from_crs(4326,32631,always_xy=True)
inverse=Transformer.from_crs(32631,4326,always_xy=True)
x,y=forward.transform(3.2,6.46)

def feature(identifier,geometry,**properties):
    return {'type':'Feature','id':identifier,'geometry':mapping(transform(inverse.transform,geometry)) if geometry is not None else None,'properties':properties}

class ProcessingTests(unittest.TestCase):
    def run_tool(self,tool,features,overlay=None,**parameters):
        with tempfile.TemporaryDirectory() as directory:
            job={'input_revision':1,'request':{'tool':tool,'parameters':parameters,'input':{'datasetId':'trees','revision':1}},'inputs':{'input':{'features':features},'schema':{'version':1,'fields':[]},'crs':'EPSG:32631'}}
            if overlay is not None: job['inputs']['overlay']={'features':overlay}
            result=gis.run(job,directory)
            if tool=='export':
                with zipfile.ZipFile(pathlib.Path(directory)/'export.zip') as z:
                    return {name:z.read(name) for name in z.namelist()}
            return result

    def test_buffer_uses_metres_and_matches_reference_area(self):
        result=self.run_tool('buffer',[feature('tree',Point(x,y),code='001')],distance=10)
        actual=transform(forward.transform,shape(result['features'][0]['geometry']))
        self.assertAlmostEqual(actual.area,Point(x,y).buffer(10,quad_segs=16).area,places=5)
        self.assertEqual(result['features'][0]['properties']['code'],'001')
        self.assertEqual(result['engine']['units'],'metres')

    def test_holes_multipart_intersection_and_difference(self):
        outer=Polygon([(x,y),(x+100,y),(x+100,y+100),(x,y+100)],holes=[[(x+20,y+20),(x+40,y+20),(x+40,y+40),(x+20,y+40)]])
        other=Polygon([(x+50,y),(x+150,y),(x+150,y+150),(x+50,y+150)])
        f=feature('a',MultiPolygon([outer]));o=feature('b',other,name='Zone')
        for tool,expected in [('clip',outer.intersection(other)),('intersect',outer.intersection(other)),('difference',outer.difference(other))]:
            result=self.run_tool(tool,[f],[o],fields=['name'])
            actual=transform(forward.transform,shape(result['features'][0]['geometry']))
            self.assertLess(actual.symmetric_difference(expected).area,0.0001)

    def test_invalid_geometry_and_inappropriate_crs_fail_explicitly(self):
        invalid=Polygon([(x,y),(x+20,y+20),(x,y+20),(x+20,y),(x,y)])
        with self.assertRaisesRegex(ValueError,'invalid'): self.run_tool('buffer',[feature('bad',invalid)],distance=3)
        far={'id':'far','geometry':{'type':'Point','coordinates':[-74,40]},'properties':{}}
        with self.assertRaisesRegex(ValueError,'area of use'): self.run_tool('buffer',[far],distance=10)

    def test_spatial_join_and_summarize_are_deterministic(self):
        square=Polygon([(x-20,y-20),(x+20,y-20),(x+20,y+20),(x-20,y+20)])
        points=[feature('a',Point(x,y),value=2),feature('b',Point(x+1,y),value=3)]
        result=self.run_tool('spatial-join',points,[feature('zone',square,zone='A')],fields=['zone'])
        self.assertEqual([f['properties']['join_zone'] for f in result['features']],['A','A'])
        summary=self.run_tool('summarize-within',[feature('zone',square)],points,fields=['value'])
        self.assertEqual(summary['features'][0]['properties'],{'within_count':2,'sum_value':5})
        self.assertEqual(self.run_tool('select-location',points,[feature('zone',square)],predicate='within')['features'],self.run_tool('select-location',points,[feature('zone',square)],predicate='within')['features'])

    def test_nearest_and_measure_use_projected_units(self):
        a=feature('a',Point(x,y));b=feature('b',Point(x+30,y+40))
        result=self.run_tool('nearest',[a],[b])
        self.assertAlmostEqual(result['features'][0]['properties']['distance_m'],50,places=5)
        square=Polygon([(x,y),(x+10,y),(x+10,y+10),(x,y+10)])
        metrics=self.run_tool('measure',[feature('square',square)])['features'][0]['properties']
        self.assertAlmostEqual(metrics['area_m2'],100,places=5)
        self.assertAlmostEqual(metrics['length_m'],40,places=5)

    def test_dissolve_and_empty_outputs(self):
        a=feature('a',Point(x,y).buffer(10),group='one');b=feature('b',Point(x+5,y).buffer(10),group='one')
        self.assertEqual(len(self.run_tool('dissolve',[a,b],field='group')['features']),1)
        self.assertEqual(self.run_tool('clip',[a],[])['features'],[])

    def test_collections_become_editable_parts_and_nullable_sums_keep_numeric_types(self):
        mixed=GeometryCollection([Point(x,y),Polygon([(x+50,y),(x+60,y),(x+60,y+10),(x+50,y+10)])])
        result=self.run_tool('dissolve',[feature('mixed',mixed)])
        self.assertEqual({f['geometry']['type'] for f in result['features']},{'Point','Polygon'})
        self.assertEqual(len({f['id'] for f in result['features']}),2)
        zones=[feature('empty',Point(x+100,y).buffer(10)),feature('populated',Point(x,y).buffer(10))]
        result=self.run_tool('summarize-within',zones,[feature('p',Point(x,y),height=3)],fields=['height'])
        self.assertEqual([f['properties']['sum_height'] for f in result['features']],[None,3])
        self.assertEqual(next(f['type'] for f in result['schema']['fields'] if f['name']=='sum_height'),'number')

    def test_attribute_join_preserves_nulls_and_string_identifiers(self):
        source=[feature('a',Point(x,y),asset='001'),feature('b',Point(x+1,y),asset=None)]
        table=[feature('t',None,asset='001',value=5),feature('n',None,asset=None,value=9)]
        rows=self.run_tool('attribute-join',source,table,inputField='asset',overlayField='asset',fields=['value'])['features']
        self.assertEqual([r['properties']['join_value'] for r in rows],[5,None])
        with self.assertRaisesRegex(ValueError,'unique'): self.run_tool('attribute-join',source,[*table,table[0]],inputField='asset',overlayField='asset',fields=['value'])

    def test_calculator_cannot_execute_code_or_allocate_unbounded_strings(self):
        self.assertEqual(gis.calculate('round(area / 10000, 2)',{'area':15500}),1.55)
        self.assertEqual(gis.calculate('concat(code, "-", coalesce(name, "unknown"))',{'code':'001','name':None}),'001-unknown')
        for expression in ['__import__("os").system("echo bad")','value.__class__','[x for x in range(100)]','2 ** 99999','"a" * 999999999','open("file")']:
            with self.assertRaises((ValueError,SyntaxError)): gis.calculate(expression,{'value':1})
        with self.assertRaises(ZeroDivisionError): gis.calculate('1 / zero',{'zero':0})

    def test_exports_include_provenance_and_protect_spreadsheet_formulas(self):
        result=self.run_tool('export',[feature('a',Point(x,y),code='001',label='=1+1',value=None)],format='csv')
        self.assertIn("'=1+1",result['data.csv'].decode('utf-8-sig'))
        self.assertEqual(json.loads(result['metadata.json'])['outputCRS'],'EPSG:4326')
        geo=self.run_tool('export',[feature('a',Point(x,y),value=None)],format='geojson')
        self.assertIsNone(json.loads(geo['data.geojson'])['features'][0]['properties']['value'])

    def test_geopackage_roundtrip_in_gdal_container(self):
        try: from osgeo import ogr
        except ImportError: self.skipTest('GDAL export is exercised in the pinned GIS container')
        result=self.run_tool('export',[feature('a',Point(x,y),code='001',value=None,number=3.5)],format='gpkg')
        with tempfile.TemporaryDirectory() as directory:
            file=pathlib.Path(directory)/'data.gpkg';file.write_bytes(result['data.gpkg'])
            dataset=ogr.Open(str(file));layer=dataset.GetLayer(0);row=layer.GetNextFeature()
            self.assertEqual(row.GetField('code'),'001');self.assertIsNone(row.GetField('value'))
            self.assertEqual(row.GetField(json.loads(result['metadata.json'])['identityField']),'a')
            self.assertEqual(row.GetField('number'),3.5);self.assertEqual(layer.GetSpatialRef().GetAuthorityCode(None),'4326')

if __name__=='__main__': unittest.main()
