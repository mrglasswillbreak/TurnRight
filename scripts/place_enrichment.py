"""Source-backed campus POIs. Geometry and existence never imply access."""
import collections
import datetime as dt
import hashlib
import json
import re
import unicodedata
from urllib.parse import urlparse

DETAIL_FIELDS = ('subtype', 'address', 'phone', 'website', 'openingHours', 'businessStatus')
NAME_KEYS = ('name', 'official_name', 'short_name', 'loc_name', 'alt_name')


def names(tags):
    values = []
    for key in (*NAME_KEYS, *sorted(k for k in tags if k.startswith('name:'))):
        values.extend(v.strip() for v in str(tags.get(key, '')).split(';') if v.strip())
    values = list(dict.fromkeys(values))
    return (values[0] if values else '', values[1:])


def name_key(value):
    return ''.join(c for c in unicodedata.normalize('NFKD', value).casefold() if c.isalnum())


def classify(tags, fallback='other'):
    amenity = tags.get('amenity', '')
    if amenity in ('restaurant', 'cafe', 'fast_food', 'food_court', 'canteen', 'bar', 'pub', 'ice_cream'):
        return 'food', amenity
    if tags.get('shop'):
        return 'services', tags['shop']
    if amenity == 'library':
        return 'library', amenity
    if amenity == 'place_of_worship':
        return 'worship', tags.get('religion', amenity)
    if amenity in ('school', 'university', 'college', 'kindergarten'):
        return 'academic', amenity
    if tags.get('leisure') in ('sports_centre', 'pitch', 'stadium', 'swimming_pool', 'fitness_centre'):
        return 'sports', tags['leisure']
    if tags.get('building') in ('dormitory', 'residential', 'apartments'):
        return 'residence', tags['building']
    if tags.get('barrier') == 'gate':
        return 'gate', 'gate'
    if amenity or tags.get('office') or tags.get('healthcare'):
        return 'services', amenity or tags.get('office') or tags['healthcare']
    return fallback, tags.get('tourism', tags.get('leisure', ''))


def safe_url(value):
    value = str(value or '').strip()
    parsed = urlparse(value)
    return value if parsed.scheme in ('http', 'https') and parsed.hostname and not parsed.username and not parsed.password else ''


def details(tags):
    address = tags.get('addr:full') or ', '.join(filter(None, [
        ' '.join(filter(None, [tags.get('addr:housenumber'), tags.get('addr:street')])),
        tags.get('addr:city'), tags.get('addr:postcode')]))
    result = {
        'address': address, 'phone': tags.get('contact:phone', tags.get('phone', '')),
        'website': safe_url(tags.get('contact:website', tags.get('website'))),
        'openingHours': tags.get('opening_hours', ''),
    }
    if tags.get('disused') == 'yes' or tags.get('disused:amenity') or tags.get('disused:shop'):
        result['businessStatus'] = 'closed'
    return {k: v for k, v in result.items() if v}


def evidence(source_id, url, license_name, checked, fields, source_ref, **extra):
    return {field: [{'sourceId': source_id, 'recordId': source_ref, 'url': url,
                     'license': license_name, 'checkedAt': checked, **extra}] for field in fields}


def osm_geometry_records(tree):
    """Build complete polygons, including relation holes; reject incomplete relations."""
    from shapely.geometry import Point, Polygon, LineString, MultiPolygon
    nodes = {n.attrib['id']: n for n in tree.findall('node')}
    coords = {k: (float(n.attrib['lon']), float(n.attrib['lat'])) for k, n in nodes.items()}
    ways = {w.attrib['id']: w for w in tree.findall('way')}
    tags = lambda el: {t.attrib['k']: t.attrib['v'] for t in el.findall('tag')}
    for key, n in nodes.items():
        if tags(n):
            yield f'osm:node:{key}', tags(n), Point(coords[key]), None
    for key, w in ways.items():
        refs = [n.attrib['ref'] for n in w.findall('nd')]
        if len(refs) < 2 or any(r not in coords for r in refs):
            yield f'osm:way:{key}', tags(w), None, 'Incomplete way geometry'
            continue
        points = [coords[r] for r in refs]
        polygon = len(refs) >= 4 and refs[0] == refs[-1] and not tags(w).get('highway')
        yield f'osm:way:{key}', tags(w), Polygon(points) if polygon else LineString(points), None
    for key, rel in ((r.attrib['id'], r) for r in tree.findall('relation')):
        rt = tags(rel)
        if rt.get('type') != 'multipolygon':
            continue
        try:
            rings = {'outer': [], 'inner': []}
            for role in rings:
                segments = []
                for member in rel.findall('member'):
                    if member.attrib.get('role', 'outer') != role:
                        continue
                    if member.attrib.get('type') != 'way' or member.attrib['ref'] not in ways:
                        raise ValueError('Incomplete multipolygon members')
                    refs = [n.attrib['ref'] for n in ways[member.attrib['ref']].findall('nd')]
                    if any(r not in coords for r in refs) or len(refs) < 2:
                        raise ValueError('Incomplete multipolygon coordinates')
                    segments.append(refs)
                while segments:
                    chain = segments.pop(0)
                    while chain[-1] != chain[0]:
                        match = next((i for i, s in enumerate(segments) if chain[-1] in (s[0], s[-1])), None)
                        if match is None:
                            raise ValueError('Unclosed multipolygon ring')
                        part = segments.pop(match)
                        chain += (part if part[0] == chain[-1] else part[::-1])[1:]
                    rings[role].append([coords[r] for r in chain])
            outers = [Polygon(r) for r in rings['outer']]
            if not outers:
                raise ValueError('Missing multipolygon exterior')
            holes = [[] for _ in outers]
            for ring in rings['inner']:
                choices = [i for i, outer in enumerate(outers) if outer.covers(Polygon(ring))]
                if not choices:
                    raise ValueError('Multipolygon hole outside exterior')
                holes[min(choices, key=lambda i: outers[i].area)].append(ring)
            polygons = [Polygon(r, holes[i]) for i, r in enumerate(rings['outer'])]
            yield f'osm:relation:{key}', rt, polygons[0] if len(polygons) == 1 else MultiPolygon(polygons), None
        except ValueError as error:
            yield f'osm:relation:{key}', rt, None, str(error)


def enrich_osm(data, tree, checked):
    """Supplement the importer without regenerating its road topology or permissions."""
    from shapely.geometry import shape, mapping
    from shapely import make_valid
    campus = shape(data['boundary']['geometry'])
    places = {p['id']: p for p in data['places']}
    features = {str(f['properties']['id']): f for f in data['map']['features']}
    buildings=[(key,make_valid(shape(f['geometry']))) for key,f in features.items() if f['properties'].get('kind')=='building']
    issues = []
    for key, tags, geometry, error in osm_geometry_records(tree):
        relevant = any(k in tags for k in ('amenity', 'shop', 'office', 'tourism', 'leisure', 'healthcare', 'building', 'highway', 'entrance')) or tags.get('barrier') == 'gate'
        if not relevant:
            continue
        if error or geometry is None or not geometry.is_valid:
            issues.append({'id': key, 'status': 'awaiting-evidence', 'reason': error or 'Invalid geometry'})
            continue
        if not geometry.intersects(campus):
            continue
        name, aliases = names(tags)
        source_url = 'https://www.openstreetmap.org/' + key.replace('osm:', '').replace(':', '/')
        ev = lambda fields: evidence('osm', source_url, 'ODbL-1.0', checked, fields, key)
        if key in features:
            props = features[key]['properties']
            props.update(aliases=aliases, evidence=ev(['name', 'aliases', 'geometry']))
            if name:
                props['name'] = name
        if not campus.covers(geometry):
            issues.append({'id': key, 'status': 'awaiting-evidence', 'reason': 'Crosses campus boundary', 'geometry': mapping(geometry)})
            continue
        if tags.get('building') and geometry.geom_type in ('Polygon', 'MultiPolygon') and key not in features:
            # Keep an overlapping alternate footprint in review, not as a second building.
            overlaps = [fid for fid,footprint in buildings if footprint.intersects(geometry) and footprint.intersection(geometry).area > 0]
            if overlaps:
                issues.append({'id': key, 'status': 'awaiting-evidence', 'reason': 'Overlapping building', 'matches': overlaps, 'geometry': mapping(geometry)})
            else:
                features[key] = {'id': key, 'type': 'Feature', 'geometry': mapping(geometry), 'properties': {'id': key, 'kind': 'building', 'name': name, 'aliases': aliases, 'source': 'osm', 'evidence': ev(['geometry', 'name'])}}
                buildings.append((key,geometry))
        poi = any(k in tags for k in ('amenity', 'shop', 'office', 'tourism', 'leisure', 'healthcare', 'building')) or tags.get('barrier') == 'gate'
        if not poi or tags.get('highway') or not name:
            continue
        point = geometry.representative_point()
        previous = places.get(key, {})
        category, subtype = classify(tags, previous.get('category', 'other'))
        values = dict(name=name, aliases=aliases, category=category, subtype=subtype, **details(tags))
        places[key] = {**previous, 'id': key, 'coordinates': list(point.coords[0]), 'source': 'osm', 'sourceId': key,
                       'arrivalKind': previous.get('arrivalKind', 'unmapped'), **values,
                       'evidence': ev([*values, 'coordinates'])}
        if key in features and features[key]['properties'].get('kind') == 'building':
            places[key]['buildingId'] = key
    data['places'] = sorted(places.values(), key=lambda p: (p['name'], p['id']))
    data['map']['features'] = list(features.values())
    # Reflect reviewed names in instructions without changing graph identities.
    for edge in data['graph']['edges']:
        p = features.get(edge['sourceId'], {}).get('properties', {})
        if p.get('name'):
            edge['name'] = p['name']
    return issues


def coverage(data):
    roads = [f for f in data['map']['features'] if f['properties'].get('kind') == 'path']
    named = lambda f: bool(f['properties'].get('name')) and not re.fullmatch(r'(campus )?(path|road)|unnamed( road)?', f['properties']['name'], re.I)
    names_ = {f['properties']['name'] for f in roads if named(f)}
    return {'places': len(data['places']), 'categories': dict(sorted(collections.Counter(p['category'] for p in data['places']).items())),
            'buildings': sum(f['properties'].get('kind') == 'building' for f in data['map']['features']),
            'roadFeatures': len(roads), 'namedRoadFeatures': sum(named(f) for f in roads),
            'streetNames': sorted(names_), 'unnamedRoadIds': [f['properties']['id'] for f in roads if not named(f)],
            'disconnectedPlaces': [p['id'] for p in data['places'] if not p.get('graphNode')]}


def update_coverage(data):
    data['coverage'].update(placeCount=len(data['places']),
        routableCount=sum(p['arrivalKind'] == 'entrance' for p in data['places']),
        approachCount=sum(p['arrivalKind'] == 'mapped-approach' for p in data['places']),
        disconnected=[p['id'] for p in data['places'] if not p.get('graphNode')])


def snapshot_manifest(raw, files):
    rows = []
    for name, url, license_name in files:
        path = raw / name
        content = path.read_bytes()
        receipt_path=path.with_suffix('.receipt.json')
        receipt=json.loads(receipt_path.read_text(encoding='utf-8')) if receipt_path.exists() else {}
        rows.append({'file': name, 'url': url, 'license': license_name,
                     'sha256': hashlib.sha256(content).hexdigest(), 'bytes': len(content),
                     'retrievedAt': receipt.get('originalRetrieval') or dt.datetime.fromtimestamp(path.stat().st_mtime, dt.timezone.utc).isoformat()})
    return rows
