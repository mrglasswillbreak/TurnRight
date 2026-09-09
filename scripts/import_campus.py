"""Reproducible, bounded LASU source import. No tile downloads or guessed paths.

python scripts/import_campus.py --download   (refreshes raw source snapshots)
python scripts/import_campus.py              (builds from existing snapshots)
python scripts/import_campus.py --output data/candidates  (review candidate)
"""
import argparse
import re
from spatial import blocker
from campus_access import walking_access, node_blocks_walking
import collections
import datetime as dt
import hashlib
import json
import math
import pathlib
import urllib.request
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw'
APP_ID = 'ffd68667b1464eeb999c0050897a82a0'

def fetch(url, destination):
    request = urllib.request.Request(url, headers={'User-Agent': 'TurnRight-LASU/1.0 (https://github.com/mrglasswillbreak/TurnRight)'})
    with urllib.request.urlopen(request, timeout=90) as response:
        data = response.read(35_000_001)
    if len(data) > 35_000_000:
        raise ValueError('Source exceeds expected size; review manually')
    temp = destination.with_suffix('.tmp')
    temp.write_bytes(data)
    # Only replace after successful parsing; a failed fetch never erases a snapshot.
    ET.fromstring(data) if destination.suffix == '.xml' else json.loads(data)
    temp.replace(destination)

def distance(a, b):
    x = math.radians(b[0] - a[0]) * math.cos(math.radians((a[1] + b[1]) / 2))
    y = math.radians(b[1] - a[1])
    return math.hypot(x, y) * 6371000

def inside(p, ring):
    x, y = p
    result = False
    for a, b in zip(ring, ring[1:] + ring[:1]):
        if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
            result = not result
    return result

def project(p, sr):
    if sr in (3857, 102100, 102113):
        return [round(p[0] / 6378137 * 180 / math.pi, 7), round((2 * math.atan(math.exp(p[1] / 6378137)) - math.pi / 2) * 180 / math.pi, 7)]
    if sr not in (4326, None):
        raise ValueError(f'Unsupported CRS: {sr}')
    return [round(p[0], 7), round(p[1], 7)]

def arc_geometry(geometry, default_sr=None):
    sr = geometry.get('spatialReference', {}).get('latestWkid', geometry.get('spatialReference', {}).get('wkid', default_sr))
    if 'rings' in geometry:
        return {'type': 'Polygon', 'coordinates': [[project(p, sr) for p in ring] for ring in geometry['rings']]}
    return {'type': 'Point', 'coordinates': project([geometry['x'], geometry['y']], sr)}

def feature(identifier, geometry, **properties):
    return {'type': 'Feature', 'id': identifier, 'geometry': geometry, 'properties': {'id': identifier, **properties}}

def category(name, tags=None):
    text = (name + ' ' + json.dumps(tags or {})).lower()
    for key, terms in [('library', ['library']), ('worship', ['mosque', 'church', 'chapel', 'worship']), ('food', ['restaurant', 'cafeteria', 'canteen', 'food', 'cafe']), ('gate', ['gate', 'entrance']), ('sports', ['sport', 'stadium', 'football', 'basketball']), ('residence', ['hostel', 'quarters', 'residence']), ('academic', ['faculty', 'department', 'lecture', 'science', 'school', 'laborator', 'classroom', 'education', 'college', 'theatre']), ('services', ['bank', 'atm', 'health', 'clinic', 'admin', 'senate', 'bookshop', 'security', 'centre', 'center'])]:
        if any(re.search(r'\b' + re.escape(word), text) for word in terms):
            return key
    return 'other'

def components(nodes, edges):
    links = collections.defaultdict(set)
    for edge in edges:
        if edge['accessible']:
            links[edge['from']].add(edge['to']); links[edge['to']].add(edge['from'])
    seen, groups = set(), []
    for node in nodes:
        if node not in seen:
            group, stack = set(), [node]
            while stack:
                current = stack.pop()
                if current in seen: continue
                seen.add(current); group.add(current); stack.extend(links[current] - seen)
            groups.append(group)
    return sorted(groups, key=len, reverse=True)

def build(access_policy=None):
    if access_policy is None:
        access_policy = json.loads((ROOT / 'data/campus-access.json').read_text(encoding='utf-8'))
    arc = json.loads((RAW / 'arcgis.json').read_text(encoding='utf-8-sig'))
    layers = {x['title']: x['featureCollection']['layers'][0]['featureSet'] for x in arc['operationalLayers']}
    boundary_geom = arc_geometry(layers['Boundary']['features'][0]['geometry'])
    ring = boundary_geom['coordinates'][0]
    bounds = [[min(p[0] for p in ring), min(p[1] for p in ring)], [max(p[0] for p in ring), max(p[1] for p in ring)]]
    boundary = feature('lasu-boundary', boundary_geom, kind='boundary', name='Lagos State University · Ojo')
    features, places = [], []
    for layer_name, kind in [('Land Use Land Cover', 'land'), ('University_Property', 'building'), ('Infrastructure', 'place')]:
        layer = layers[layer_name]
        for index, item in enumerate(layer['features']):
            attrs = item['attributes']
            geom = arc_geometry(item['geometry'], layer.get('spatialReference', {}).get('wkid'))
            identifier = f'arcgis:{layer_name}:{attrs.get("FID", index)}'
            name = str(attrs.get('Build_name') or attrs.get('DESC_') or attrs.get('LU_Type') or '').strip()
            props = {'kind': kind, 'name': name, 'source': 'arcgis', 'height': 0, 'heightEstimated': False}
            # Storey is descriptive source data, not a surveyed height.
            storey = str(attrs.get('Build_Type', attrs.get('STOREY', ''))).upper()
            floors = {'BUNGALOW': 1, 'ISTO': 2, '1STO': 2, '2STO': 3, '3STO': 4}.get(storey)
            if floors and kind == 'building': props.update(height=floors * 3, heightEstimated=True)
            if kind != 'place': features.append(feature(identifier, geom, **props))
            if kind != 'land' and name:
                coords = geom['coordinates'] if geom['type'] == 'Point' else [sum(p[i] for p in geom['coordinates'][0][:-1]) / len(geom['coordinates'][0][:-1]) for i in (0, 1)]
                if not inside(coords, ring): continue
                aliases = [str(attrs.get(k, '')).strip() for k in ('Abbreviati', 'Name_of_De', 'Name_of_Fa') if str(attrs.get(k, '')).strip()]
                # Never fuzzy-merge distinct nearby buildings solely on proximity.
                if any(p['name'].lower() == name.lower() and distance(p['coordinates'], coords) < 30 for p in places): continue
                places.append({'id': identifier, 'name': name, 'category': category(name), 'coordinates': coords, 'aliases': aliases, 'department': str(attrs.get('Name_of_De') or '').strip(), 'faculty': str(attrs.get('Name_of_Fa') or '').strip(), 'source': 'arcgis', 'sourceId': identifier, 'arrivalKind': 'unmapped', 'height': props['height'], 'heightEstimated': props['heightEstimated']})
    tree = ET.parse(RAW / 'osm.xml').getroot()
    osm_nodes = {}
    for node in tree.findall('node'):
        osm_nodes[node.attrib['id']] = {'coordinates': [float(node.attrib['lon']), float(node.attrib['lat'])], 'tags': {t.attrib['k']: t.attrib['v'] for t in node.findall('tag')}}
    graph_nodes, edges = {}, []
    campus_ways = []
    for way in tree.findall('way'):
        tags = {t.attrib['k']: t.attrib['v'] for t in way.findall('tag')}
        refs = [x.attrib['ref'] for x in way.findall('nd')]
        if not all(r in osm_nodes for r in refs): continue
        coords = [osm_nodes[r]['coordinates'] for r in refs]
        if not any(inside(p, ring) for p in coords): continue
        identifier = 'osm:way:' + way.attrib['id']
        if tags.get('highway'):
            access = walking_access(identifier, tags, access_policy)
            access_props = {'walkingAccess': access, 'sourceTags': tags}
            if access == 'campus':
                access_props['accessReviewId'] = access_policy['id']
                campus_ways.append(identifier)
            features.append(feature(identifier, {'type': 'LineString', 'coordinates': coords}, kind='path', name=tags.get('name', ''), highway=tags['highway'], footDirection={'yes':'forward','-1':'reverse'}.get(tags.get('oneway:foot'),'both'), source='osm', **access_props))
            if access not in {'yes', 'campus'}: continue
            for i, (a, b) in enumerate(zip(refs, refs[1:])):
                # Restrict routes to campus. Do not create junctions at visual crossings.
                if not inside(osm_nodes[a]['coordinates'], ring) or not inside(osm_nodes[b]['coordinates'], ring): continue
                if any(node_blocks_walking(osm_nodes[r]['tags']) for r in (a, b)): continue
                for r in (a, b): graph_nodes['osm:node:' + r] = {'id': 'osm:node:' + r, 'coordinates': osm_nodes[r]['coordinates']}
                directions = [(a, b)] if tags.get('oneway:foot') == 'yes' else ([(b, a)] if tags.get('oneway:foot') == '-1' else [(a, b), (b, a)])
                for start, end in directions:
                    edges.append({'id': f'{identifier}:{start}:{end}', 'from': 'osm:node:' + start, 'to': 'osm:node:' + end, 'distance': round(distance(osm_nodes[start]['coordinates'], osm_nodes[end]['coordinates']), 2), 'name': tags.get('name', 'Campus path' if tags['highway'] in ('path', 'footway', 'steps') else 'Campus road'), 'accessible': True, 'walkingAccess': access, **({'accessReviewId': access_policy['id']} if access == 'campus' else {}), 'steps': tags['highway'] == 'steps', 'sourceId': identifier})
        elif tags.get('barrier'):
            features.append(feature(identifier, {'type': 'LineString', 'coordinates': coords}, kind='barrier', name=tags.get('barrier'), source='osm'))
        elif tags.get('building') and coords[0] == coords[-1]:
            # Retain separate source layers; OSM supplements ArcGIS rather than overwriting it.
            centroid = [sum(p[i] for p in coords[:-1]) / (len(coords) - 1) for i in (0, 1)]
            if not inside(centroid, ring): continue
            overlap = any(f['properties']['kind'] == 'building' and inside(centroid, f['geometry']['coordinates'][0]) for f in features)
            if not overlap:
                try: height = float(tags.get('height', '0').replace(' m', '')); estimated = False
                except ValueError: height = 0; estimated = False
                if not height and tags.get('building:levels', '').isdigit(): height = int(tags['building:levels']) * 3; estimated = True
                features.append(feature(identifier, {'type': 'Polygon', 'coordinates': [coords]}, kind='building', name=tags.get('name', ''), height=height, heightEstimated=estimated, source='osm'))
        if tags.get('name') and tags.get('highway') is None and (tags.get('building') or tags.get('amenity')):
            centroid = [sum(p[i] for p in coords[:-1]) / max(1, len(coords) - 1) for i in (0, 1)]
            if inside(centroid, ring) and not any(p['name'].lower() == tags['name'].lower() and distance(p['coordinates'], centroid) < 50 for p in places):
                places.append({'id': identifier, 'name': tags['name'], 'category': category(tags['name'], tags), 'coordinates': centroid, 'aliases': [tags['alt_name']] if tags.get('alt_name') else [], 'source': 'osm', 'sourceId': identifier, 'arrivalKind': 'unmapped'})
    for identifier, node in osm_nodes.items():
        tags, coords = node['tags'], node['coordinates']
        if inside(coords, ring) and tags.get('name') and ('amenity' in tags or tags.get('barrier') == 'gate'):
            key = 'osm:node:' + identifier
            places.append({'id': key, 'name': tags['name'], 'category': category(tags['name'], tags), 'coordinates': coords, 'aliases': [], 'source': 'osm', 'sourceId': key, 'arrivalKind': 'unmapped'})
    # Add points along the existing polylines so a long straight road can be
    # selected near its midpoint. This changes sampling, not walkable geometry.
    dense_edges = []
    for edge in edges:
        a, b = edge['from'], edge['to']
        pa, pb = graph_nodes[a]['coordinates'], graph_nodes[b]['coordinates']
        steps = max(1, math.ceil(edge['distance'] / 12))
        first, last = sorted((a, b))
        sequence = [a]
        for i in range(1, steps):
            key = f'{edge["sourceId"]}:sample:{first}:{last}:{i if a == first else steps-i}'
            graph_nodes[key] = {'id': key, 'coordinates': [round(pa[j] + (pb[j] - pa[j]) * i / steps, 7) for j in (0, 1)]}
            sequence.append(key)
        sequence.append(b)
        for i, (start, end) in enumerate(zip(sequence, sequence[1:])):
            dense_edges.append({**edge, 'id': f'{edge["id"]}:{i}', 'from': start, 'to': end, 'distance': edge['distance'] / steps})
    edges = dense_edges
    for edge in edges:
        conflict=blocker(graph_nodes[edge['from']]['coordinates'],graph_nodes[edge['to']]['coordinates'],features)
        if conflict: edge['geometryBlocked']=conflict
    allowed_edges=[edge for edge in edges if not edge.get('geometryBlocked')]
    usable_ids={key for edge in allowed_edges for key in (edge['from'],edge['to'])}
    groups = components({key:value for key,value in graph_nodes.items() if key in usable_ids}, allowed_edges)
    largest = groups[0] if groups else set()
    for place in places:
        # Approach routing explicitly ends on the actual mapped path. No connector
        # across an unmapped courtyard, wall, or building is inserted into the graph.
        options = sorted(((distance(place['coordinates'], graph_nodes[k]['coordinates']), k) for k in usable_ids))
        if options and options[0][0] <= 90:
            meters, key = options[0]
            place.update(graphNode=key, approachDistance=round(meters), arrivalKind='mapped-approach')
            osm_id = key.removeprefix('osm:node:')
            if meters <= 15 and osm_nodes.get(osm_id, {}).get('tags', {}).get('entrance') not in (None, 'no'):
                place['arrivalKind'] = 'entrance'
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    result = {'schemaVersion': 1, 'version': '', 'createdAt': now, 'boundary': boundary, 'bounds': bounds, 'map': {'type': 'FeatureCollection', 'features': features}, 'places': sorted(places, key=lambda p: p['name']), 'graph': {'nodes': list(graph_nodes.values()), 'edges': edges}, 'closures': [], 'coverage': {'fieldVerified': False, 'placeCount': len(places), 'routableCount': sum(p['arrivalKind'] == 'entrance' for p in places), 'approachCount': sum(p['arrivalKind'] == 'mapped-approach' for p in places), 'disconnected': [p['id'] for p in places if not p.get('graphNode')], 'components': len(groups), 'notes': ['Source-derived map; campus walks have not been field-verified.', 'Mapped approach routes stop on an existing path near a building, not at an assumed entrance.', 'Missing paths and entrances require review in the editor.', '3D heights derived from floor counts are approximate (3 m per floor).']}, 'sources': [{'id': 'osm', 'name': 'OpenStreetMap contributors', 'url': 'https://www.openstreetmap.org/copyright', 'attribution': '© OpenStreetMap contributors', 'license': 'ODbL 1.0; OSM-derived database available in the downloadable campus package.', 'retrievedAt': now}, {'id': 'arcgis', 'name': 'LASU Webmap – Main / MangroveandpartnersLimited', 'url': f'https://www.arcgis.com/home/item.html?id={APP_ID}', 'attribution': 'LASU campus layers: MangroveandpartnersLimited, via ArcGIS Online', 'license': 'ArcGIS item is publicly viewable but provides no redistribution license. Confirm permission with the owner before public deployment.', 'retrievedAt': now}]}
    result['coverage']['notes'].append(f"{sum(bool(e.get('geometryBlocked')) for e in edges)} directed segments excluded due to building or barrier conflicts.")
    if campus_ways:
        result['accessPolicy'] = {key: access_policy[key] for key in ('id', 'audience', 'confirmedAt', 'summary')}
        result['coverage']['campusAccessWayCount'] = len(campus_ways)
        result['coverage']['notes'].append(f"Student walking on {len(campus_ways)} existing internal roads enabled from the owner's {access_policy['confirmedAt']} confirmation. Raw OSM private tags retained; private driveways, parking aisles, explicit foot restrictions, barriers and closures are not overridden.")
    digest_input = {k: v for k, v in result.items() if k not in ('version', 'createdAt', 'sources')}
    result['version'] = 'lasu-' + hashlib.sha256(json.dumps(digest_input, sort_keys=True).encode()).hexdigest()[:12]
    if not graph_nodes or not edges or len(places) < 50: raise ValueError('Incomplete import: expected campus places and a nonempty path graph')
    return result

def write_data(data, output):
    output.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode()
    (output / 'campus.json').write_bytes(encoded)
    (output / 'coverage.json').write_text(json.dumps(data['coverage'], indent=2), encoding='utf-8')
    print(json.dumps({'version': data['version'], 'bytes': len(encoded), 'places': len(data['places']), 'nodes': len(data['graph']['nodes']), 'edges': len(data['graph']['edges']), 'mappedApproaches': data['coverage']['approachCount'], 'unmapped': len(data['coverage']['disconnected'])}, indent=2))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--download', action='store_true')
    parser.add_argument('--output', default='data/seed')
    args = parser.parse_args()
    RAW.mkdir(parents=True, exist_ok=True)
    if args.download:
        fetch(f'https://www.arcgis.com/sharing/rest/content/items/{APP_ID}/data?f=json', RAW / 'arcgis.json')
        fetch(f'https://www.arcgis.com/sharing/rest/content/items/{APP_ID}?f=json', RAW / 'arcgis-metadata.json')
        fetch('https://www.openstreetmap.org/api/0.6/map?bbox=3.190,6.455,3.215,6.485', RAW / 'osm.xml')
    write_data(build(), ROOT / args.output)
