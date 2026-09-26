"""Keep OSM identities and topology instead of reconstructing joins from coordinates."""
import json
from .formats import guess_role, MAX_FEATURES, safe_xml


def inspect_osm(path):
    import osmium
    if path.suffix.lower() != '.pbf':
        safe_xml(path)
        import xml.etree.ElementTree as ET
        for _,element in ET.iterparse(path,events=('end',)):
            if element.tag == 'remark' and ''.join(element.itertext()).strip():
                raise ValueError('Overpass reported an incomplete extract. Retry with a smaller boundary.')
            element.clear()
    nodes, ways, areas, relations = {}, [], [], []
    class Reader(osmium.SimpleHandler):
        def node(self,n):
            if len(nodes) >= 2000000: raise ValueError('OSM extract exceeds the coordinate limit.')
            nodes[n.id] = {'coordinates':[n.location.lon,n.location.lat], 'tags':dict(n.tags)}
        def way(self,w):
            if len(ways) >= MAX_FEATURES: raise ValueError('OSM extract exceeds the feature limit.')
            ways.append({'id':w.id,'nodes':[n.ref for n in w.nodes],'tags':dict(w.tags)})
        def relation(self,r):
            if len(relations) >= MAX_FEATURES: raise ValueError('OSM extract exceeds the relation limit.')
            relations.append({'id':r.id,'tags':dict(r.tags),'members':[{'type':m.type,'ref':m.ref,'role':m.role} for m in r.members]})
        def area(self,a):
            if a.from_way(): return
            try:
                geom = json.loads(osmium.geom.GeoJSONFactory().create_multipolygon(a))
                areas.append({'type':'Feature','id':f'relation:{a.orig_id()}','geometry':geom,'properties':dict(a.tags)})
            except RuntimeError as error:
                raise ValueError('OSM multipolygon is incomplete. Supply all referenced members.') from error
    Reader().apply_file(str(path),locations=True,idx='flex_mem')
    way_ids = {w['id'] for w in ways}
    relation_ids = {r['id'] for r in relations}
    completed_areas = {a['id'] for a in areas}
    for relation in relations:
        if relation['tags'].get('type') in ('multipolygon','restriction'):
            for member in relation['members']:
                if (member['type']=='w' and member['ref'] not in way_ids) or (member['type']=='n' and member['ref'] not in nodes) or (member['type']=='r' and member['ref'] not in relation_ids):
                    raise ValueError('OSM relation has missing members. Import a complete campus extract.')
        if relation['tags'].get('type')=='multipolygon' and f"relation:{relation['id']}" not in completed_areas:
            raise ValueError('OSM multipolygon could not be assembled. Supply a complete extract with valid rings.')
    by_role = {}
    def add(feature):
        role = guess_role('',[feature['geometry']['type']],feature['properties'])
        by_role.setdefault(role,[]).append(feature)
    for node_id,node in nodes.items():
        if node['tags']:
            add({'type':'Feature','id':f'node:{node_id}','geometry':{'type':'Point','coordinates':node['coordinates']},'properties':node['tags']})
    for way in ways:
        if any(n not in nodes for n in way['nodes']): raise ValueError('OSM way has missing nodes. Import a complete extract.')
        coords = [nodes[n]['coordinates'] for n in way['nodes']]
        if len(coords) < 2: continue
        tags = way['tags']
        closed = len(coords) >= 4 and way['nodes'][0] == way['nodes'][-1]
        polygon = closed and tags.get('area') != 'no' and any(tags.get(k) for k in ('building','landuse','natural','area','leisure'))
        add({'type':'Feature','id':f"way:{way['id']}",'geometry':{'type':'Polygon' if polygon else 'LineString','coordinates':[coords] if polygon else coords},'properties':tags,'osmNodes':way['nodes']})
    for area in areas: add(area)
    return [{'name':f'OSM {role}','suggestedRole':role,'geometryTypes':sorted({f['geometry']['type'] for f in features}),'features':features,'fields':[{'name':k} for k in sorted({key for f in features for key in f['properties']})],'crs':'EPSG:4326','osmNodes':nodes,'osmRelations':relations} for role,features in by_role.items()]
