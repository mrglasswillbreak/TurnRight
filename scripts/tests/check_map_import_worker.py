"""Run the actual Linux worker command against a runner-owned 0700 workspace.

Host-side Docker smoke test: run after building turnright-gis-import. No secrets,
uploaded user data, network access or live database required.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import uuid

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from import_map import conversion_command

with tempfile.TemporaryDirectory(prefix='private-import-test-') as tmp:
    folder=Path(tmp)
    assert folder.stat().st_mode & 0o777 == 0o700
    geometries={
        'Building_footprint.geojson': {'type':'Polygon','coordinates':[[[3.20,6.46],[3.201,6.46],[3.201,6.461],[3.20,6.461],[3.20,6.46]]]},
        'Roads.geojson.json': {'type':'LineString','coordinates':[[3.20,6.46],[3.201,6.46]]},
        'Road width.geojson.json': {'type':'Polygon','coordinates':[[[3.20,6.46],[3.201,6.46],[3.201,6.461],[3.20,6.461],[3.20,6.46]]]},
    }
    files=[]
    for i,(name,geometry) in enumerate(geometries.items()):
        path=f'input-{i}'+Path(name).suffix
        (folder/path).write_text(json.dumps({'type':'FeatureCollection','crs':{'type':'name','properties':{'name':'EPSG:4326'}},'features':[{'type':'Feature','properties':{'OBJECTID':i+1,'Id':0,'Name':'Bâtiment'},'geometry':geometry}, {'type':'Feature','properties':{'OBJECTID':i+11,'Id':0,'Name':'Courtyard'},'geometry':geometry}]}),encoding='utf-8')
        files.append({'path':path,'label':Path(name).stem})
    # Online ArcGIS uses the same private mount, with ESRIJSON attributes/rings.
    # Match layer_features' actual serialization order, with the schema beyond
    # GDAL's header probe. The old automatic driver chose GeoJSON and failed.
    (folder/'arcgis.json').write_text(json.dumps({'name':'ArcGIS buildings','features':[{'attributes':{'OBJECTID':7,'Description':'x'*12000},'geometry':{'rings':geometries['Building_footprint.geojson']['coordinates']}}],'fields':[{'name':'OBJECTID','type':'esriFieldTypeOID'},{'name':'Description','type':'esriFieldTypeString'}],'geometryType':'esriGeometryPolygon','spatialReference':{'wkid':4326},'objectIdFieldName':'OBJECTID'}))
    files.append({'path':'arcgis.json','label':'ArcGIS buildings'})
    (folder/'request.json').write_text(json.dumps({'files':files,'configuration':{'layers':[]},'phase':'inspect'}))
    command=conversion_command(folder,str(uuid.uuid4()))
    assert command[command.index('--user')+1] == f'{os.getuid()}:{os.getgid()}'
    subprocess.run(command,check=True,timeout=90)
    result=json.loads((folder/'result.json').read_text())['summary']
    assert result['totalFeatures']==7, result
    assert len(result['layers'])==4
    assert all(l['crs']=='EPSG:4326' for l in result['layers'])
    assert next(l for l in result['layers'] if l['name'].startswith('Road width'))['suggestedRole']=='road-surface'
    assert (folder/'result.json').stat().st_uid == os.getuid()
    fields=result['layers'][0]['fields']
    assert next(f for f in fields if f['name']=='OBJECTID')['unique'] is True
    assert next(f for f in fields if f['name']=='Id')['unique'] is False
    print('Private 0700 workspace: uploaded GeoJSON/JSON and online ArcGIS inspection passed; output belongs to the runner.')
