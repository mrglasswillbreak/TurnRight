"""Map selected GIS fields onto TurnRight's existing source records."""
import copy
import hashlib
import json
import math
from datetime import datetime, timezone

from .formats import MAX_FEATURES


def digest(value):
    def stable(v):
        if isinstance(v, list): return [stable(x) for x in v]
        if isinstance(v, dict): return {k:stable(x) for k,x in sorted(v.items()) if k not in ('createdAt','retrievedAt','checkedAt')}
        if isinstance(v, float) and v.is_integer(): return int(v)
        return v
    return hashlib.sha256(json.dumps(stable(value),separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()).hexdigest()


def distance(a,b):
    lat1,lat2 = math.radians(a[1]),math.radians(b[1])
    dlat,dlon = lat2-lat1,math.radians(b[0]-a[0])
    h = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
    return 6371000*2*math.atan2(math.sqrt(h),math.sqrt(max(0,1-h)))


def normalise(layers, source, campus, previous, configuration, import_id):
    from shapely.geometry import shape, mapping
    from shapely.validation import explain_validity
    now = datetime.now(timezone.utc).isoformat()
    owner_source = 'import:' + source['id']
    boundary = shape(campus['boundary']['geometry'])
    if not boundary.is_valid or boundary.is_empty: raise ValueError('Repair the campus boundary before importing.')
    # Keep complete intersecting buildings and paths: clipping can sever access topology.
    region = boundary.buffer(0.0001)
    mappings = {m['layer']:m for m in configuration['layers']}
    records, warnings, errors, preview, duplicates = {}, [], [], [], []
    previous_by_id = {r['id']:r for r in previous}
    skipped, feature_count = 0, 0
    categories = {'academic','library','food','services','worship','residence','sports','gate','other'}
    def add(entity, ident, payload):
        key = entity + ':' + ident
        record = {'id':key,'entity':entity,'source':owner_source,'payload':payload,'hash':digest(payload)}
        if key in records and records[key]['hash'] != record['hash']: raise ValueError('Duplicate source identity: ' + ident)
        records[key] = record
    for layer in layers:
        m = mappings.get(layer['name'])
        if not m or m['role'] == 'skip':
            skipped += len(layer['features']); continue
        if not layer.get('crs'):
            errors.append(layer['name'] + ': choose the source coordinate system.'); continue
        role = m['role']
        is_osm = 'osmNodes' in layer
        if not m.get('idField') and not is_osm:
            warnings.append(layer['name'] + ': no stable identifier chosen; later uploads will be reviewed as replacements.')
        for feature in layer['features']:
            feature_count += 1
            if feature_count > MAX_FEATURES: raise ValueError('Import exceeds the feature limit.')
            if feature.get('geometry') is None:
                errors.append(layer['name'] + ': missing geometry or coordinate mapping.'); continue
            geom = shape(feature['geometry'])
            if not geom.is_valid or geom.is_empty:
                errors.append(f"{layer['name']} {feature.get('id','')}: {explain_validity(geom)}"); continue
            if layer['crs'] != 'EPSG:4326':
                from osgeo import osr
                from shapely.ops import transform
                src = osr.SpatialReference(); src.SetFromUserInput(layer['crs']); src.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
                dst = osr.SpatialReference(); dst.ImportFromEPSG(4326); dst.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
                operation = osr.CoordinateTransformation(src,dst)
                geom = transform(lambda x,y,z=None:operation.TransformPoint(x,y)[:2],geom)
            if not all(math.isfinite(x) for x in geom.bounds) or geom.bounds[0] < -180 or geom.bounds[2] > 180 or geom.bounds[1] < -90 or geom.bounds[3] > 90:
                errors.append(layer['name'] + ': coordinates fall outside WGS84; check the projection.'); continue
            if not region.intersects(geom): skipped += 1; continue
            attrs = feature.get('properties') or {}
            def mapped_value(field, fallback):
                key = m.get(field) or fallback
                value = attrs.get(key)
                definition = next((f for f in layer.get('fields',[]) if f['name']==key),{})
                return definition.get('codedValues',{}).get(str(value),value)
            native = attrs.get(m.get('idField')) if m.get('idField') else feature.get('id') if is_osm else f'{import_id}:{feature_count}'
            if native is None or str(native) == '':
                errors.append(layer['name'] + ': a feature is missing its selected identifier.'); continue
            ident = f"{owner_source}:{digest(layer['name'])[:8]}:{native}"
            if len(ident) > 180: ident = f"{owner_source}:{digest([layer['name'],native])}"
            name = str(mapped_value('nameField','name') or '').strip()[:200]
            category = str(mapped_value('categoryField','category') or 'other').lower()
            if category not in categories: category = 'other'
            props = {'id':ident,'name':name,'source':owner_source,'sourceId':str(native),'kind': 'land' if role=='landcover' else role}
            geometry = mapping(geom)
            if role == 'boundary':
                warnings.append('Campus boundary layer is retained in the import preview; use it when creating a campus. Existing campus boundaries are not replaced by a source refresh.')
                skipped += 1; continue
            allowed = {'building':('Polygon','MultiPolygon'),'path':('LineString','MultiLineString'),'place':('Point','MultiPoint'),'entrance':('Point',),'barrier':('LineString','MultiLineString','Polygon','MultiPolygon'),'landcover':('Polygon','MultiPolygon')}
            if geom.geom_type not in allowed[role]:
                errors.append(f"{layer['name']}: {geom.geom_type} cannot be imported as {role}."); continue
            for field,target in [('heightField','height'),('floorsField','floors')]:
                value = attrs.get(m.get(field) or ('height' if target=='height' else 'building:levels'))
                if value not in (None,''):
                    try:
                        value = float(str(value).removesuffix(' m'))
                        if target == 'height' and m.get('heightUnit') == 'ft': value *= 0.3048
                        if not math.isfinite(value) or value <= 0 or value > (150 if target=='height' else 50): raise ValueError()
                        props[target] = value
                    except (ValueError,TypeError): errors.append(f'{name or ident}: invalid {target}.')
            if 'height' in props: props['heightSource']='source'; props['heightEstimated']=False
            if role == 'path':
                lines = list(geom.geoms) if geom.geom_type == 'MultiLineString' else [geom]
                access = m.get('walkingAccess') or str(mapped_value('accessField','access') or 'private').lower()
                if is_osm:
                    access = 'yes' if attrs.get('highway') in ('footway','pedestrian','path','steps','residential','service','unclassified','living_street','tertiary','secondary','primary') else 'no'
                    if attrs.get('access') in ('private','no') or attrs.get('foot') in ('private','no'): access='no'
                    if attrs.get('foot') in ('yes','designated','permissive'): access='yes'
                    if attrs.get('construction') or attrs.get('highway')=='construction' or attrs.get('access:conditional') or attrs.get('foot:conditional'): access='no'
                if access not in ('yes','private','no'): access='private'
                props.update({'walkingAccess':access,'autoConnectCrossings':False,'sourceTags':attrs if is_osm else {}})
                if not is_osm: warnings.append('Imported line endpoints are separate until connected in the editor. Review path access and junctions before routing.')
                for li,line in enumerate(lines):
                    coordinates = list(line.coords)
                    ids = []
                    for vi,point in enumerate(coordinates):
                        node_ref = feature.get('osmNodes',[None]*len(coordinates))[vi] if is_osm else None
                        node_id = f'{owner_source}:node:{node_ref}' if node_ref is not None else f'{ident}:line:{li}:vertex:{vi}'
                        node = {'id':node_id,'coordinates':list(point)}
                        node_data = layer.get('osmNodes',{}).get(str(node_ref),layer.get('osmNodes',{}).get(node_ref,{}))
                        if node_data.get('tags'): node['sourceTags']=node_data['tags']
                        add('node',node_id,node); ids.append(node_id)
                    for vi in range(len(ids)-1):
                        if distance(coordinates[vi],coordinates[vi+1]) < 0.01:
                            errors.append(f'{name or ident}: path has a zero-length segment; repair the source geometry.')
                            continue
                        for reverse in (False,True):
                            a,b = (vi+1,vi) if reverse else (vi,vi+1)
                            edge_id=f'{ident}:line:{li}:edge:{vi}:{int(reverse)}'
                            blocked = any((layer.get('osmNodes',{}).get(str(n),layer.get('osmNodes',{}).get(n,{})).get('tags',{}).get('access') in ('private','no') or layer.get('osmNodes',{}).get(str(n),layer.get('osmNodes',{}).get(n,{})).get('tags',{}).get('barrier') in ('gate','fence','wall','turnstile')) for n in feature.get('osmNodes',[])[vi:vi+2])
                            add('edge',edge_id,{'id':edge_id,'from':ids[a],'to':ids[b],'distance':distance(coordinates[a],coordinates[b]),'name':name or 'Imported path','accessible':attrs.get('highway')!='steps','steps':attrs.get('highway')=='steps','walkingAccess':'no' if blocked else access,'sourceId':ident})
            old_feature = previous_by_id.get('feature:'+ident)
            if old_feature:
                for key in ('appearance','buildingTopology','modelDocumentAsset','modelAuthoring','reviewedModelRevision','authoredModelRevision','surfaceCurves'):
                    if key in old_feature['payload'].get('properties',{}): props[key]=copy.deepcopy(old_feature['payload']['properties'][key])
            public_feature = {'type':'Feature','geometry':geometry,'properties':props}
            add('feature',ident,public_feature)
            if len(preview) < 2000: preview.append(public_feature)
            if role in ('place','building') and name:
                point = geom.representative_point()
                place_id = ident + ':place'
                place = {'id':place_id,'name':name,'category':category,'coordinates':[point.x,point.y],'aliases':[],'source':owner_source,'sourceId':str(native),'arrivalKind':'unmapped'}
                if role=='building': place['buildingId']=ident
                add('place',place_id,place)
            if role=='entrance': warnings.append('Imported entrance pins require an explicit building/place assignment and path connection in the editor.')
    # Detect overlaps with other sources. They are review candidates, never auto-merged.
    from shapely.strtree import STRtree
    existing = [r for r in previous if r['entity']=='feature' and r['source']!=owner_source and r.get('payload',{}).get('properties',{}).get('kind')=='building']
    shapes = [shape(r['payload']['geometry']) for r in existing]
    tree = STRtree(shapes)
    for record in records.values():
        if record['entity'] != 'feature' or record['payload']['properties']['kind'] != 'building': continue
        geom = shape(record['payload']['geometry'])
        for index in tree.query(geom):
            candidate = shapes[index]
            if candidate.is_valid and geom.intersection(candidate).area / max(geom.area,candidate.area,1e-20) > 0.6:
                duplicates.append({'incomingId':record['payload']['properties']['id'],'existingId':existing[index]['payload']['properties']['id'],'name':record['payload']['properties']['name']})
    old = {r['id']:r for r in previous if r['source']==owner_source}
    proposals=[]
    for key in sorted(set(old)|set(records)):
        before,after = old.get(key),records.get(key)
        if before and after and before['hash']==after['hash']: continue
        kind = 'add' if not before else 'remove' if not after else 'modify'
        proposals.append({'id':digest({'source':source['id'],'id':key,'before':before and before['hash'],'after':after and after['hash']}),'source_id':key,'kind':kind,'before':before,'after':after,'base_hash':before and before['hash'],'summary':f"{kind}: {(after or before)['payload'].get('name',key)}"})
    # Shared campus metadata is updated from the complete accepted baseline, never from just this source.
    meta_record = next((r for r in previous if r['entity']=='meta'),None)
    if not meta_record: raise ValueError('Campus metadata is missing.')
    meta = copy.deepcopy(meta_record)
    metadata = meta['payload']
    metadata['sources'] = [s for s in metadata.get('sources',[]) if s['id']!=owner_source] + [{'id':owner_source,'name':source['name'],'url':source.get('url') or '','attribution':configuration['attribution'],'license':configuration['license'],'redistributionConfirmed':configuration['redistributionConfirmed'],'retrievedAt':now}]
    meta['hash']=digest(metadata)
    if meta['hash']!=meta_record['hash']:
        proposals.append({'id':digest({'id':meta['id'],'before':meta_record['hash'],'after':meta['hash']}),'source_id':meta['id'],'kind':'modify','before':meta_record,'after':meta,'base_hash':meta_record['hash'],'summary':'Update campus source attribution'})
    summary={'layers':[{k:v for k,v in l.items() if k not in ('features','osmNodes','osmRelations')} | {'count':len(l['features'])} for l in layers], 'counts':{**{k:sum(p['kind']==kind for p in proposals) for k,kind in [('added','add'),('modified','modify'),('removed','remove')]},'skipped':skipped},'warnings':list(dict.fromkeys(warnings)),'errors':list(dict.fromkeys(errors))[:500],'duplicates':duplicates[:500],'features':{'type':'FeatureCollection','features':preview},'totalFeatures':feature_count}
    if old and summary['counts']['removed'] > len(old)*0.2: summary['errors'].append('Source removed more than 20% of records. Check the boundary, layer mapping and completeness before retrying.')
    if duplicates: summary['warnings'].append('Overlapping buildings need a keep/merge decision in the existing duplicate review workflow.')
    return {'summary':summary,'proposals':proposals,'expectedSources':previous}
