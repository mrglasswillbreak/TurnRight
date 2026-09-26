#!/usr/bin/env python3
"""Host worker plus network-disabled conversion entry point for campus imports."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import urllib.request
from datetime import datetime, timezone

from map_import.formats import inspect_file
from map_import.network import MAX_BYTES, fetch_public


def encoded(value):
    return json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode()


def convert(folder):
    from map_import.normalise import normalise
    folder = Path(folder)
    request = json.loads((folder/'request.json').read_text(encoding='utf-8'))
    layers, warnings = [], request.get('warnings',[])
    for source_file in request['files']:
        data = inspect_file(folder/source_file['path'],request['configuration'],folder/'expanded',source_file.get('label'))
        for layer in data:
            # Expose aliases and domain labels in the mapping UI without losing original values.
            fields = {f['name']:f for f in source_file.get('fields',[])}
            for field in layer['fields']:
                meta = fields.get(field['name'],{})
                if meta.get('alias'): field['alias'] = meta['alias']
                codes = meta.get('domain',{}).get('codedValues',[]) if meta.get('domain') else []
                if codes:
                    field['values']=[str(c['name']) for c in codes]
                    field['codedValues']={str(c['code']):str(c['name']) for c in codes}
            layers.append(layer)
    if len(layers)>100 or sum(len(l['features']) for l in layers)>100000:
        raise ValueError('Import exceeds the layer or feature limit.')
    if len({l['name'] for l in layers}) != len(layers):
        raise ValueError('Multiple datasets have the same layer name. Rename those layers before uploading.')
    if request['phase']=='inspect':
        summary={'layers':[{k:v for k,v in l.items() if k not in ('features','osmNodes','osmRelations')} | {'count':len(l['features'])} for l in layers],'counts':{'added':0,'modified':0,'removed':0,'skipped':0},'warnings':warnings,'errors':[],'duplicates':[],'features':{'type':'FeatureCollection','features':[f for l in layers if l.get('crs')=='EPSG:4326' for f in l['features'] if f.get('geometry')][:2000]},'totalFeatures':sum(len(l['features']) for l in layers)}
        output={'summary':summary}
    else:
        output=normalise(layers,request['source'],request['campus'],request['previous'],request['configuration'],request['importId'])
        output['summary']['warnings']=list(dict.fromkeys(warnings+output['summary']['warnings']))
    (folder/'result.json').write_bytes(encoded(output))


def remote(path, method='GET', body=None, raw=False):
    base=os.environ['SUPABASE_URL'].rstrip('/')
    key=os.environ['SUPABASE_SERVICE_ROLE_KEY']
    request=urllib.request.Request(base+'/'+path, method=method, data=body if isinstance(body,bytes) else encoded(body) if body is not None else None, headers={'Authorization':'Bearer '+key,'apikey':key,'Content-Type':'application/json','Prefer':'return=representation','X-TurnRight-Campus':os.environ.get('CAMPUS_ID','lasu')})
    with urllib.request.urlopen(request,timeout=90) as response:
        content=response.read(250*1024*1024+1)
        if len(content)>250*1024*1024: raise ValueError('Private import artifact exceeds its limit.')
        return content if raw else json.loads(content) if content else None


def db(table, method='GET', body=None):
    from urllib.parse import urlencode
    name=table.split('?')[0]
    if name!='campuses' and not name.startswith('rpc/'):
        table+=('&' if '?' in table else '?')+urlencode({'campus_id':'eq.'+os.environ.get('CAMPUS_ID','lasu')})
    return remote('rest/v1/'+table,method,body)


def run_job():
    from map_import.arcgis import discover
    campus_id=os.environ['CAMPUS_ID']; import_id=os.environ['IMPORT_ID']; token=os.environ['RUN_TOKEN']
    for value in (campus_id,import_id,token):
        if not value or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in value): raise ValueError('Invalid worker identity.')
    selector=f'campus_imports?id=eq.{import_id}&run_token=eq.{token}'
    claimed=db(selector+'&status=eq.queued','PATCH',{'status':'running','message':'Reading source data','updated_at':datetime.now(timezone.utc).isoformat()})
    if not claimed: return
    job=claimed[0]
    def live():
        if not db(selector+'&status=eq.running'): raise ValueError('Import cancelled or replaced by another run.')
    try:
        source=db('campus_sources?id=eq.'+job['source_id'])[0]
        campus=db('campuses?id=eq.'+campus_id)[0]
        previous=[]
        for offset in range(0,300000,1000):
            page=db(f'source_features?order=id&limit=1000&offset={offset}')
            previous.extend(page)
            if len(page)<1000: break
        else: raise ValueError('Campus source record limit exceeded.')
        with tempfile.TemporaryDirectory(prefix='turnright-import-') as temp:
            folder=Path(temp); files=[]; warnings=[]
            raw_snapshot=None
            if source['kind']=='file':
                assets=db(f'campus_import_assets?import_id=eq.{import_id}&order=name')
                if not assets: raise ValueError('Upload at least one map file before inspection.')
                if sum(a['bytes'] for a in assets)>MAX_BYTES: raise ValueError('Upload batch exceeds 50 MiB.')
                for index,asset in enumerate(assets):
                    if not asset['path'].startswith(f'{campus_id}/{import_id}/'): raise ValueError('Import asset identity mismatch.')
                    content=remote('storage/v1/object/campus-imports/'+asset['path'],raw=True)
                    if len(content)!=asset['bytes'] or hashlib.sha256(content).hexdigest()!=asset['sha256']: raise ValueError('Upload is incomplete or failed its integrity check. Start a new upload.')
                    filename=f'input-{index}'+Path(asset['name']).suffix.lower()
                    (folder/filename).write_bytes(content)
                    files.append({'path':filename,'label':Path(asset['name']).stem})
            else:
                if job.get('snapshot_path'):
                    if not job['snapshot_path'].startswith(f'{campus_id}/{import_id}/'): raise ValueError('Snapshot identity mismatch.')
                    raw_snapshot=remote('storage/v1/object/campus-imports/'+job['snapshot_path'],raw=True)
                elif source['kind']=='arcgis':
                    layers,warnings=discover(source['url'],campus['bounds'])
                    raw_snapshot=encoded({'layers':layers,'warnings':warnings})
                else:
                    polygon=campus['boundary']['geometry']
                    rings=[polygon['coordinates'][0]] if polygon['type']=='Polygon' else [p[0] for p in polygon['coordinates']]
                    queries=[]
                    for ring in rings:
                        coords=' '.join(f'{point[1]} {point[0]}' for point in ring)
                        queries.append(f'nwr(poly:"{coords}");')
                    query='[out:xml][timeout:90][maxsize:268435456];('+''.join(queries)+');(._;>>;);out meta;'
                    raw_snapshot=fetch_public(os.environ.get('OVERPASS_URL','https://overpass-api.de/api/interpreter'),form={'data':query})
                if source['kind']=='arcgis':
                    snapshot=json.loads(raw_snapshot)
                    warnings=snapshot.get('warnings',[])
                    for index,layer in enumerate(snapshot['layers']):
                        filename=f'arcgis-{index}.json'; (folder/filename).write_bytes(encoded(layer))
                        files.append({'path':filename,'label':layer['name'],'fields':layer.get('fields',[])})
                else:
                    (folder/'source.osm').write_bytes(raw_snapshot); files=[{'path':'source.osm'}]
                if not job.get('snapshot_path'):
                    snapshot_path=f'{campus_id}/{import_id}/snapshot-{token}.json'
                    remote('storage/v1/object/campus-imports/'+snapshot_path,'POST',raw_snapshot)
                    db(selector+'&status=eq.running','PATCH',{'snapshot_path':snapshot_path,'source_hash':hashlib.sha256(raw_snapshot).hexdigest()})
            live()
            request={'files':files,'warnings':warnings,'source':source,'campus':campus,'previous':previous,'configuration':job['configuration'],'phase':job['phase'],'importId':import_id}
            (folder/'request.json').write_bytes(encoded(request))
            scripts=Path(__file__).resolve().parent
            container_name='campus-import-'+token
            command=['docker','run','--name',container_name,'--rm','--network','none','--cap-drop','ALL','--security-opt','no-new-privileges','--read-only','--memory','2g','--cpus','2','--tmpfs','/tmp:rw,size=512m','-v',f'{folder}:/work','-v',f'{scripts}:/app:ro',os.environ.get('GIS_IMPORT_IMAGE','turnright-gis-import'),'/work']
            process=subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
            try:
                import time
                deadline=time.monotonic()+1100
                while True:
                    try:
                        output,_=process.communicate(timeout=15)
                        break
                    except subprocess.TimeoutExpired:
                        live()
                        if time.monotonic()>=deadline: raise ValueError('Import conversion exceeded its time limit.')
            finally:
                if process.poll() is None:
                    subprocess.run(['docker','rm','-f',container_name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=30)
                    process.kill(); process.communicate()
            if process.returncode:
                message=output.decode(errors='replace').strip().splitlines()[-1] if output else 'Conversion failed'
                raise ValueError(message[:1000])
            live()
            result=json.loads((folder/'result.json').read_text(encoding='utf-8'))
            update={'status':'mapping' if job['phase']=='inspect' else 'preview','summary':result['summary'],'message':'Choose layer mappings' if job['phase']=='inspect' else 'Preview ready; review before applying','updated_at':datetime.now(timezone.utc).isoformat()}
            if job['phase']=='preview':
                path=f'{campus_id}/{import_id}/candidate-{token}.json'
                remote('storage/v1/object/campus-imports/'+path,'POST',encoded(result))
                update['candidate_path']=path
            changed=db(selector+'&status=eq.running','PATCH',update)
            if changed and job.get('auto_queue') and job['phase']=='preview' and not result['summary']['errors']:
                db('rpc/queue_campus_import','POST',{'import_id':import_id,'expected_token':token,'proposals':result['proposals'],'expected_sources':result['expectedSources']})
            db('campus_sources?id=eq.'+source['id'],'PATCH',{'last_checked_at':datetime.now(timezone.utc).isoformat()})
    except Exception as error:
        db(selector+'&status=eq.running','PATCH',{'status':'failed','message':str(error)[:1500],'updated_at':datetime.now(timezone.utc).isoformat()})
        raise


if __name__=='__main__':
    if len(sys.argv)>1 and sys.argv[1]=='fail':
        db(f"campus_imports?id=eq.{os.environ['IMPORT_ID']}&run_token=eq.{os.environ['RUN_TOKEN']}&status=in.(queued,running)",'PATCH',{'status':'failed','message':'The processing job was interrupted or its runtime could not start. Retry this import.','updated_at':datetime.now(timezone.utc).isoformat()})
    elif len(sys.argv)>1 and sys.argv[1]=='convert': convert(sys.argv[2])
    else: run_job()
