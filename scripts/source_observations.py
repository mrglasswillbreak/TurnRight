"""Upstream evidence for the LASU adapter, before map/routing transformations."""
import json
from collections import Counter
import xml.etree.ElementTree as ET


def collect(raw, overture, item_id, failed_collections=None):
    from map_import.normalise import digest
    observations, collections = [], []
    failed_collections = failed_collections or {}
    osm_failure = failed_collections.get('osm:objects')
    tree = ET.Element('osm') if osm_failure else ET.parse(raw/'osm.xml').getroot()
    if tree.find('remark') is not None: raise ValueError('Incomplete OSM extract: remark returned')
    source_objects = [e for e in tree if e.tag in ('node','way','relation')]
    objects = {(e.tag,e.attrib.get('id')):e for e in source_objects}
    complete = not osm_failure and len(objects) == len(source_objects)
    for (kind, native), e in objects.items():
        if not native: complete=False; continue
        content = {'tags':{t.attrib['k']:t.attrib['v'] for t in e.findall('tag')}}
        if kind == 'node': content['coordinates']=[float(e.attrib['lon']),float(e.attrib['lat'])]
        if kind == 'way':
            refs=[n.attrib['ref'] for n in e.findall('nd')]
            if any(('node',ref) not in objects for ref in refs): complete=False; continue
            content['nodes']=refs
            content['coordinates']=[[float(objects['node',ref].attrib['lon']),float(objects['node',ref].attrib['lat'])] for ref in refs]
        if kind == 'relation':
            content['members']=[dict(m.attrib) for m in e.findall('member')]
            if any((m['type'],m['ref']) not in objects for m in content['members']): complete=False
        observations.append({'provider':'osm','collection':'osm:objects','nativeId':kind+':'+native,
            'rootId':'osm:'+kind+':'+native,'stable':True,'providerVersion':int(e.attrib.get('version','1')),'content':content})
    collections.append({'identity':'osm:objects','complete':complete,'count':None if osm_failure else len(source_objects),**({'error':osm_failure or 'Missing members or invalid native identifiers; collection held.'} if not complete else {})})
    arc_failure = failed_collections.get('arcgis:'+item_id)
    arc={} if arc_failure else json.loads((raw/'arcgis.json').read_text(encoding='utf-8-sig'))
    if arc_failure: collections.append({'identity':'arcgis:'+item_id,'complete':False,'count':None,'error':arc_failure})
    for entry in arc.get('operationalLayers',[]):
        for i,layer in enumerate(entry.get('featureCollection',{}).get('layers',[])):
            definition=layer.get('layerDefinition',{})
            collection='arcgis:'+item_id+':'+str(entry.get('id') or entry['title'])+':'+str(definition.get('id',i))
            feature_set=layer.get('featureSet',{})
            features=feature_set.get('features',[])
            collections.append({'identity':collection,'complete':isinstance(features,list) and not feature_set.get('exceededTransferLimit',False),'count':len(features),'contentHash':digest(features,True)})
            for index,f in enumerate(features):
                native=f.get('attributes',{}).get('FID')
                observations.append({'provider':'arcgis','collection':collection,'nativeId':str(native if native is not None else index),
                    'rootId':f"arcgis:{entry['title']}:{native if native is not None else index}",'stable':native is not None and entry.get('id') is not None,
                    'embedded':{'itemId':item_id,'entryId':entry.get('id'),'layerId':definition.get('id',i),'nativeField':'FID'},'layerIdentity':digest(definition),
                    'content':{'attributes':f.get('attributes',{}),'geometry':f.get('geometry')}})
    for kind in ('place','building','segment','connector'):
        if 'overture:'+kind in (failed_collections or {}):
            collections.append({'identity':'overture:'+kind,'complete':False,'count':None,'error':failed_collections['overture:'+kind]})
            continue
        data=json.loads((overture/(kind+'.geojson')).read_text(encoding='utf-8'))
        if data.get('type')!='FeatureCollection' or not isinstance(data.get('features'),list): raise ValueError('Incomplete Overture snapshot')
        collections.append({'identity':'overture:'+kind,'complete':True,'count':len(data['features']),'contentHash':digest(data['features'],True)})
        for f in data['features']:
            native=f.get('properties',{}).get('id') or f.get('id')
            observations.append({'provider':'overture','collection':'overture:'+kind,'nativeId':str(native),'rootId':'overture:'+str(native),'stable':native is not None,'content':{'geometry':f.get('geometry'),'properties':f.get('properties',{})}})
    # A bad collection cannot invalidate independently complete providers. Drop
    # ambiguous identities from comparison, retaining the failed receipt and
    # original artifact so absence cannot authorize removal or superseding.
    key = lambda o: (o['provider'],o['collection'],o['nativeId'])
    identities = Counter(key(o) for o in observations)
    invalid = {o['collection'] for o in observations if not o['stable'] or identities[key(o)] > 1}
    for collection in collections:
        if collection['identity'] in invalid:
            collection.update(complete=False,error='Missing or duplicate native identifiers; collection held.')
    observations = [o for o in observations if identities[key(o)] == 1]
    return {'observations':observations,'collections':collections}
