"""Review additive LASU landscape candidates and correct UNILAG parcel semantics.

Never changes routing, access, destinations, photographs, models or source geometry.
Raw snapshots remain private. Every examined candidate has an explicit disposition.
"""
import argparse
import copy
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path
from shapely.geometry import shape, mapping, Point, Polygon, LineString
from shapely.ops import polygonize, unary_union, transform
from pyproj import Transformer
from map_import.geometry import prepare_geometry
from map_import.semantics import land_class

DATE='2026-09-30'
def read(path): return json.loads(Path(path).read_text(encoding='utf-8-sig'))
def write(path,value):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def build(raw,output):
    baseline=read(raw/'lasu-published.json'); data=copy.deepcopy(baseline);ledger=[]
    updates=[];adds=[];boundary=shape(data['boundary']['geometry'])
    arcgis=read(raw/'arcgis.json')
    arc_layers={layer['layerDefinition']['name']:layer['featureSet']['features'] for group in arcgis['operationalLayers'] for layer in group['featureCollection']['layers']}
    fresh_land={str(f['attributes']['FID']):f for f in arc_layers['LU_Type']}
    metric=Transformer.from_crs(4326,3857,always_xy=True).transform
    arc_comparison=[]
    for f in data['map']['features']:
        p=f['properties']
        if p['kind']=='land':
            fresh=fresh_land.get(p['id'].split(':')[-1])
            if not fresh:raise ValueError('Existing LASU landscape source missing from complete ArcGIS response: '+p['id'])
            name=fresh['attributes']['LU_Type']
            rings=fresh['geometry']['rings'];original=Polygon(rings[0],rings[1:])
            distance=transform(metric,shape(f['geometry'])).hausdorff_distance(original)
            arc_comparison.append({'id':p['id'],'freshObjectId':fresh['attributes']['OBJECTID'],'nameMatches':name==p.get('name',''),'geometryDistanceMetres':round(distance,4),'decision':'Existing geometry retained; refreshed classification reviewed.'})
            proposed=bool(re.search('propos|on going',name,re.I))
            patch={'landClass':'parcel' if proposed else land_class(name),'landUse':name,'importLayer':'LASU land use and land cover','sourceId':p['id'].split(':')[-1],'evidenceStatus':'source','proposal':proposed}
            p.update(patch);updates.append({'id':p['id'],'properties':patch})
            ledger.append({'source':'ArcGIS','id':p['id'],'status':'included','reason':'Existing source geometry retained; proposal status preserved.' if proposed else 'Explicit source land-use classification.','class':patch['landClass']})
        if p['kind']=='path':
            tags=p.get('sourceTags',{});patch={k:tags[k] for k in ['surface','service'] if tags.get(k) and not p.get(k)}
            if tags.get('width') and not p.get('width'):
                try:
                    width=float(str(tags['width']).removesuffix(' m'))
                    if 0<width<=200:patch.update(width=width,widthEvidence='source',widthSource='OpenStreetMap width tag')
                except ValueError:ledger.append({'source':'OSM','id':p['id'],'status':'unresolved','reason':'Unrecognised source width; no width inferred from this value.'})
            if patch:p.update(patch);updates.append({'id':p['id'],'properties':patch})
    osm=ET.parse(raw/'osm.xml').getroot()
    if osm.tag!='osm' or osm.find('error') is not None:raise ValueError('Incomplete OSM response')
    full=raw/'osm-relation-2116060.xml'
    if full.exists():
        known={(e.tag,e.attrib.get('id')) for e in osm}
        for e in ET.parse(full).getroot():
            if e.tag in ('node','way','relation') and (e.tag,e.attrib.get('id')) not in known:osm.append(e)
    nodes={n.attrib['id']:[float(n.attrib['lon']),float(n.attrib['lat'])] for n in osm.findall('node')}
    ways={w.attrib['id']:w for w in osm.findall('way')}
    tags=lambda e:{t.attrib['k']:t.attrib['v'] for t in e.findall('tag')}
    def classification(t):
        if t.get('natural') in ('water','wetland'):return t['natural']
        if t.get('waterway')=='riverbank':return 'water'
        if t.get('natural') in ('wood','scrub','grassland','tree_row') or t.get('landuse') in ('forest','grass','meadow','recreation_ground','village_green') or t.get('leisure') in ('garden','park'):return 'green'
        if t.get('leisure') in ('pitch','sports_centre','track','stadium'):return 'sports'
        if t.get('amenity')=='parking' and t.get('parking') not in ('underground','multi-storey'):return 'parking'
        if t.get('highway')=='pedestrian' and t.get('area')=='yes':return 'sidewalk'
        return None
    def way_coordinates(w):
        refs=[n.attrib['ref'] for n in w.findall('nd')]
        if any(n not in nodes for n in refs):raise ValueError('Incomplete member nodes')
        return [nodes[n] for n in refs]
    existing=[(f,shape(f['geometry'])) for f in data['map']['features'] if f['properties']['kind']=='land']
    def consider(identifier,t,geometry):
        role=classification(t)
        if not role:return
        row={'source':'OSM','id':identifier,'class':role}
        try:
            geometry,repair=prepare_geometry(geometry)
            if not geometry.intersects(boundary):
                row.update(status='excluded',reason='Complete candidate lies outside the campus boundary.');ledger.append(row);return
            if not boundary.covers(geometry):
                row.update(status='unresolved',reason='Crosses campus boundary; retained for a separate boundary review.');ledger.append(row);return
            matching=[f['properties']['id'] for f,g in existing if f['properties'].get('landClass')==role and g.intersection(geometry).area/max(geometry.area,1e-15)>0.8]
            if matching:row.update(status='matched',reason='Already represented by same-class campus geometry.',records=matching)
            elif repair and repair.get('requiresReview'):row.update(status='unresolved',reason='Geometry repair requires further review.',repair=repair)
            else:
                p={'id':f'lasu-landscape:{identifier}','source':'lasu-osm-landscape-2026-09-30','sourceId':identifier,'importLayer':'LASU OSM landscape','kind':'land','landClass':role,'name':t.get('name',f'OSM {role}'),'evidenceStatus':'source','sourceUrl':f'https://www.openstreetmap.org/{identifier.replace(":","/")}',**{k:t[k] for k in ('surface','sport','natural','landuse') if k in t}}
                f={'type':'Feature','geometry':mapping(geometry),'properties':p};adds.append(f);data['map']['features'].append(f);existing.append((f,geometry));row.update(status='included',record=p['id'],reason='Complete source polygon within campus. No routing permissions inferred.')
            ledger.append(row)
        except Exception as error:row.update(status='unresolved',reason=str(error));ledger.append(row)
    for ident,w in ways.items():
        t=tags(w)
        if not classification(t):continue
        try:
            points=way_coordinates(w)
            if not LineString(points).intersects(boundary):continue
            if points[0]!=points[-1]:ledger.append({'source':'OSM','id':'way:'+ident,'status':'unresolved','reason':'Area classification on an unclosed way; no guessed boundary.'});continue
            consider('way:'+ident,t,{'type':'Polygon','coordinates':[points]})
        except ValueError as error:ledger.append({'source':'OSM','id':'way:'+ident,'status':'unresolved','reason':str(error)})
    for r in osm.findall('relation'):
        t=tags(r)
        if not classification(t) or t.get('type')!='multipolygon':continue
        members=[m for m in r.findall('member') if m.attrib['type']=='way'];ident='relation:'+r.attrib['id']
        try:
            if any(m.attrib['ref'] not in ways for m in members):raise ValueError('Incomplete relation member ways')
            outers=list(polygonize([LineString(way_coordinates(ways[m.attrib['ref']])) for m in members if m.attrib.get('role','outer')!='inner']))
            inners=list(polygonize([LineString(way_coordinates(ways[m.attrib['ref']])) for m in members if m.attrib.get('role')=='inner']))
            if not outers:raise ValueError('No complete outer rings')
            geometry=unary_union(outers).difference(unary_union(inners));consider(ident,t,mapping(geometry))
        except ValueError as error:ledger.append({'source':'OSM','id':ident,'status':'unresolved','reason':str(error)})
    for n in osm.findall('node'):
        t=tags(n)
        if t.get('natural')!='tree' or not boundary.covers(Point(nodes[n.attrib['id']])):continue
        ident='node:'+n.attrib['id'];p={'id':'lasu-landscape:'+ident,'source':'lasu-osm-landscape-2026-09-30','sourceId':ident,'importLayer':'LASU OSM trees','kind':'overlay','name':t.get('name','Tree'),'vegetation':'trees','color':'#5d9368','evidenceStatus':'source'}
        f={'type':'Feature','geometry':{'type':'Point','coordinates':nodes[n.attrib['id']]},'properties':p};adds.append(f);data['map']['features'].append(f);ledger.append({'source':'OSM','id':ident,'status':'included','reason':'Explicit mapped tree point.','record':p['id']})
    overture=Path('data/raw/enrichment-replay/overture-2026-08-19.0')
    for kind in ('segment','building','place'):
        source=read(overture/(kind+'.geojson'));candidates=source.get('features',[]) if isinstance(source,dict) else source
        for f in candidates:
            if not f.get('geometry') or not shape(f['geometry']).intersects(boundary):continue
            ident=str(f.get('id') or f.get('properties',{}).get('id'))
            ledger.append({'source':'Overture '+kind,'id':ident,'status':'retained-prior-review','reason':'Existing reviewed candidate retained. This theme supplies no surveyed road surface or landscape geometry; routing and existing buildings/places are unchanged.'})
    source={'id':'lasu-osm-landscape-2026-09-30','name':'OpenStreetMap LASU landscape review','url':'https://www.openstreetmap.org/copyright','attribution':'© OpenStreetMap contributors','license':'ODbL-1.0','retrievedAt':DATE}
    data['sources'].append(source)
    assert data['graph']==baseline['graph'] and data['places']==baseline['places'] and data.get('photos')==baseline.get('photos') and data.get('visuals')==baseline.get('visuals')
    write(output/'lasu-changes.json',{'baselineVersion':baseline['version'],'featureUpdates':updates,'featureAdds':adds,'sources':[source]})
    write(raw/'lasu-landscape-preview.json',data)
    write(output/'lasu-candidate-ledger.json',{'date':DATE,'baselineVersion':baseline['version'],'sourceSnapshots':[{'file':name,'sha256':hashlib.sha256((raw/name).read_bytes()).hexdigest()} for name in ('arcgis.json','osm.xml','osm-relation-2116060.xml')],'arcgisLayerCounts':{key:len(value) for key,value in arc_layers.items()},'arcgisLandscapeComparison':arc_comparison,'decisions':dict(Counter(r['status'] for r in ledger)),'candidates':ledger,'additionalResearch':[{'url':'https://www.lasu.edu.ng/home/contact/','status':'reviewed-no-vector-data','reason':'Campus geolocation only; no reusable detailed road/landscape dataset.'},{'url':'https://lasu.edu.ng/publications/inaugural_lectures/inaugural_56th_lecture_of_professor_%20ayo_omotayo.pdf','status':'excluded','reason':'Regional Ojo research figure, not a georeferenced campus vector dataset with explicit redistribution terms.'},{'url':'https://lasued.edu.ng/web/downloads.php','status':'excluded','reason':'Different university and campuses.'}]})
    unilag=read(raw/'unilag-published.json');patches=[]
    for f in unilag['map']['features']:
        p=f['properties']
        if p.get('kind')=='land' and ':9a396140:' in p['id']:
            # This accepted layer is parcels. Street addresses are names only.
            name=p.get('name','').upper()
            classified='parking' if name=='CAR PARK' else 'green' if re.search(r'\bGARDEN\b',name) else 'parcel'
            patch={'importLayer':'UNILAG parcels','landClass':classified,'vegetation':None,'surface':'','landUse':name if classified!='parcel' else 'parcel'};patches.append({'id':p['id'],'properties':patch})
    write(output/'unilag-changes.json',{'baselineVersion':unilag['version'],'featureUpdates':patches,'featureAdds':[],'sources':[]})
    print(json.dumps({'lasuUpdates':len(updates),'lasuAdds':len(adds),'decisions':dict(Counter(r['status'] for r in ledger)),'unilagParcels':len(patches),'routingUnchanged':True}))
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--raw',type=Path,default=Path('data/raw/lasu-layer-upgrade'));parser.add_argument('--output',type=Path,default=Path('data/campus-layer-enrichment'));args=parser.parse_args();build(args.raw,args.output)
