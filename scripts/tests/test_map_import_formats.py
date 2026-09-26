import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from map_import.formats import inspect_file
from map_import.osm import inspect_osm

@unittest.skipUnless(importlib.util.find_spec('osmium'),'OSM integration runs in the pinned Linux GIS image')
class OSMFormatTests(unittest.TestCase):
    def test_xml_pbf_topology_and_incomplete_members(self):
        import osmium
        with tempfile.TemporaryDirectory() as directory:
            folder=Path(directory); xml=folder/'campus.osm'
            xml.write_text('<osm version="0.6"><node id="1" lat="6.46" lon="3.20"/><node id="2" lat="6.46" lon="3.201"/><way id="3"><nd ref="1"/><nd ref="2"/><tag k="highway" v="footway"/></way></osm>')
            layers=inspect_osm(xml)
            path=next(l for l in layers if l['suggestedRole']=='path')
            self.assertEqual(path['features'][0]['osmNodes'],[1,2])
            pbf=folder/'campus.pbf'
            with osmium.SimpleWriter(str(pbf)) as writer:
                class Copy(osmium.SimpleHandler):
                    def node(self,n):writer.add_node(n)
                    def way(self,w):writer.add_way(w)
                Copy().apply_file(str(xml))
            self.assertEqual(inspect_osm(pbf)[0]['features'],layers[0]['features'])
            xml.write_text('<osm version="0.6"><node id="1" lat="6.46" lon="3.20"/><way id="3"><nd ref="1"/><nd ref="2"/><tag k="highway" v="footway"/></way></osm>')
            with self.assertRaises((ValueError,RuntimeError)):inspect_osm(xml)

@unittest.skipUnless(importlib.util.find_spec('osgeo'),'GDAL integration runs in the pinned Linux GIS image')
class GISFormatTests(unittest.TestCase):
    def test_geojson_shapefile_geopackage_and_projection(self):
        from osgeo import ogr,osr
        with tempfile.TemporaryDirectory() as directory:
            folder=Path(directory)
            for driver,extension in [('GeoJSON','.geojson'),('ESRI Shapefile','.shp'),('GPKG','.gpkg')]:
                path=folder/('buildings'+extension)
                ds=ogr.GetDriverByName(driver).CreateDataSource(str(path))
                srs=osr.SpatialReference();srs.ImportFromEPSG(3857);srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
                layer=ds.CreateLayer('Buildings',srs,ogr.wkbPolygon)
                layer.CreateField(ogr.FieldDefn('name',ogr.OFTString))
                feature=ogr.Feature(layer.GetLayerDefn());feature.SetField('name','Library')
                feature.SetGeometry(ogr.CreateGeometryFromWkt('POLYGON ((356222 721000,356232 721000,356232 721010,356222 721010,356222 721000))'))
                layer.CreateFeature(feature);ds=None
                inspected=inspect_file(path,{'layers':[]},folder/'expanded')
                self.assertEqual(inspected[0]['crs'],'EPSG:4326')
                self.assertEqual(inspected[0]['features'][0]['properties']['name'],'Library')
                self.assertLess(abs(inspected[0]['features'][0]['geometry']['coordinates'][0][0][0]),180)
                self.assertEqual(inspected[0]['sourceCrs'],'EPSG:3857')
                preview=inspect_file(path,{'layers':[{'layer':inspected[0]['name'],'role':'building','nameField':'name'}]},folder/'expanded')
                self.assertEqual(preview[0]['features'][0]['geometry'],inspected[0]['features'][0]['geometry'])
            archive=folder/'campus.zip'
            with zipfile.ZipFile(archive,'w') as z:
                for p in folder.glob('buildings.*'):
                    if p.suffix in ('.shp','.shx','.dbf','.prj'):z.write(p,p.name)
            self.assertEqual(len(inspect_file(archive,{'layers':[]},folder/'unpacked')),1)

    def test_kml_kmz_gpx_csv_and_missing_projection(self):
        with tempfile.TemporaryDirectory() as directory:
            folder=Path(directory)
            kml=folder/'places.kml';kml.write_text('<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>Library</name><Point><coordinates>3.2,6.46</coordinates></Point></Placemark></Document></kml>')
            kmz=folder/'places.kmz'
            with zipfile.ZipFile(kmz,'w') as z:z.write(kml,'doc.kml')
            gpx=folder/'places.gpx';gpx.write_text('<gpx version="1.1" creator="TurnRight" xmlns="http://www.topografix.com/GPX/1/1"><wpt lon="3.2" lat="6.46"><name>Library</name></wpt></gpx>')
            for path in (kml,kmz,gpx):
                layers=inspect_file(path,{'layers':[]},folder/'expanded')
                self.assertTrue(any(l['features'] for l in layers))
            csv=folder/'places.csv';csv.write_text('id,name,longitude,latitude\n1,Library,3.2,6.46\n')
            layer=inspect_file(csv,{'layers':[]},folder)[0]
            self.assertIsNone(layer['crs']);self.assertTrue(layer['requiresCoordinates'])
            mapped=inspect_file(csv,{'layers':[{'layer':'places','longitudeField':'longitude','latitudeField':'latitude','crs':'EPSG:4326'}]},folder)[0]
            self.assertEqual(mapped['features'][0]['geometry']['coordinates'],[3.2,6.46])

if __name__=='__main__':unittest.main()
