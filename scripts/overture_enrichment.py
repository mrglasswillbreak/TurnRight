"""Bounded Overture adapters. Never turn an Overture line into a routable edge."""
import json
import re
import pathlib
from shapely.geometry import shape, mapping
from shapely import make_valid
from place_enrichment import evidence, name_key, safe_url

ATTRIBUTION_URL = 'https://docs.overturemaps.org/attribution/'
PLACE_LICENSES = {'meta': 'CDLA-Permissive-2.0', 'microsoft': 'CDLA-Permissive-2.0',
    'pinmeto': 'CDLA-Permissive-2.0', 'krick': 'CDLA-Permissive-2.0', 'renderseo': 'CDLA-Permissive-2.0',
    'dac': 'CDLA-Permissive-2.0', 'brightquery': 'CDLA-Permissive-2.0', 'foursquare': 'Apache-2.0', 'alltheplaces': 'CC0-1.0'}
BUILDING_LICENSES = {'openstreetmap': 'ODbL-1.0', 'osm': 'ODbL-1.0', 'microsoft': 'ODbL-1.0',
    'google': 'CC-BY-4.0', 'esri': 'CC-BY-4.0'}


def read_extract(path, kind):
    if path.stat().st_size > 100_000_000:
        raise ValueError('Overture extract exceeds campus budget')
    data = json.loads(path.read_text(encoding='utf-8'))
    if data.get('type') != 'FeatureCollection' or not isinstance(data.get('features'), list):
        raise ValueError('Incomplete Overture FeatureCollection')
    if len(data['features']) > 20000:
        raise ValueError('Overture extract exceeds expected campus bounds')
    if kind == 'place' and data['features'] and not any(any(k in f.get('properties', {}) for k in ('basic_category', 'taxonomy', 'categories')) for f in data['features']):
        raise ValueError('Unsupported Overture place taxonomy')
    for f in data['features']:
        p = f.get('properties', {})
        if not (p.get('id') or f.get('id')) or p.get('type', kind) != kind or not f.get('geometry'):
            raise ValueError('Unsupported Overture schema: identity/type/geometry missing')
        if kind == 'place' and any(p.get(k) is not None and not isinstance(p[k], str if k == 'basic_category' else dict) for k in ('basic_category', 'taxonomy', 'categories')):
            raise ValueError('Unsupported Overture place taxonomy')
    return data['features']


def place_category(props):
    taxonomy = props.get('taxonomy') or {}
    legacy = props.get('categories') or {}
    subtype = taxonomy.get('primary') or props.get('basic_category') or legacy.get('primary') or 'other'
    all_categories = ' '.join([subtype, props.get('basic_category') or '', *taxonomy.get('hierarchy', [])]).lower()
    for category, terms in [('food', ('food_and_drink', 'restaurant', 'cafe', 'eatery', 'canteen', 'bakery', 'fast_food')),
                            ('library', ('library',)), ('worship', ('mosque', 'church', 'worship')),
                            ('academic', ('university', 'college', 'school', 'education')),
                            ('sports', ('sport', 'stadium', 'fitness')), ('residence', ('dormitory', 'hostel', 'student_housing'))]:
        if any(term in all_categories for term in terms):
            return category, subtype
    return 'services', subtype


def source_licenses(props, kind):
    licenses = PLACE_LICENSES if kind == 'place' else BUILDING_LICENSES
    result = []
    for source in props.get('sources') or []:
        if source.get('property') == '/properties/confidence':
            continue
        dataset = str(source.get('dataset', '')).lower()
        match = next((key for key in licenses if key == dataset or dataset.startswith(key + '_') or dataset.startswith(key + ' ')), None)
        if match is None:
            return []
        if source.get('license') and source['license'] != licenses[match]:
            return []
        result.append({'dataset': source['dataset'], 'license': licenses[match], 'recordId': str(source.get('record_id') or '')})
    return result


def apply_overture(data, extracts, release, checked):
    campus = shape(data['boundary']['geometry'])
    rows = []
    overlay = []
    existing = data['map']['features']
    buildings = [(f, make_valid(shape(f['geometry']))) for f in existing if f['properties'].get('kind') == 'building']
    paths=[(f['properties']['id'],shape(f['geometry'])) for f in existing if f['properties'].get('kind')=='path']
    sources = {}
    def hold(row, f, reason, **extra):
        row.update(reason=reason, **extra)
        overlay.append({'type': 'Feature', 'id': row['id'], 'geometry': f['geometry'], 'properties': row.copy()})
    for kind in ('place', 'building', 'segment'):
        for f in extracts.get(kind, []):
            p = f['properties']
            key = 'overture:' + str(p.get('id') or f['id'])
            geom = shape(f['geometry'])
            if not geom.intersects(campus):
                rows.append({'id': key, 'kind': kind, 'status': 'rejected', 'reason': 'Outside campus'})
                continue
            row = {'id': key, 'kind': kind, 'status': 'awaiting-evidence', 'release': release}
            rows.append(row)
            if not geom.is_valid or not campus.covers(geom):
                hold(row, f, 'Invalid geometry' if not geom.is_valid else 'Crosses campus boundary')
                continue
            if kind == 'segment':
                # The separate transport report quantifies genuinely novel lengths.
                hold(row, f, 'Transportation comparison only; routing/access review required')
                continue
            provenance = source_licenses(p, kind)
            if not provenance:
                hold(row, f, 'Source license requires review')
                continue
            for s in provenance:
                sid = 'overture-' + kind + '-' + re.sub(r'[^a-z0-9]+', '-', s['dataset'].lower())
                license_name = ('ODbL-1.0; upstream ' if kind == 'building' else '') + s['license']
                attribution = f"Overture Maps Foundation; {s['dataset']}"
                if s['dataset'].lower() in ('osm', 'openstreetmap'):
                    attribution += '; © OpenStreetMap contributors'
                if s['dataset'].lower() == 'foursquare':
                    attribution += '; Copyright 2024 Foursquare Labs, Inc. All rights reserved. Transformed to Overture schema and TurnRight campus fields.'
                sources[sid] = {'id': sid, 'name': attribution, 'url': ATTRIBUTION_URL, 'license': license_name,
                                'attribution': attribution, 'retrievedAt': checked, 'release': release}
                if s['license'] in ('CDLA-Permissive-2.0', 'Apache-2.0'):
                    license_dir = pathlib.Path(__file__).resolve().parents[1] / 'data/licenses'
                    sources[sid]['licenseText'] = (license_dir / (s['license'] + '.txt')).read_text(encoding='utf-8')
                    if s['dataset'].lower() == 'foursquare':
                        sources[sid]['notice'] = (license_dir / 'Foursquare-NOTICE.txt').read_text(encoding='utf-8')
            ev = lambda fields: {field: [dict(evidence('overture-' + kind + '-' + re.sub(r'[^a-z0-9]+', '-', s['dataset'].lower()), ATTRIBUTION_URL,
                ('ODbL-1.0; upstream ' if kind == 'building' else '') + s['license'], checked, [field], key, release=release)[field][0], upstreamRecordId=s['recordId']) for s in provenance] for field in fields}
            named = p.get('names') or {}
            name = named.get('primary', '')
            aliases = list(dict.fromkeys([v['value'] for v in (named.get('common') or []) + (named.get('rules') or []) if v.get('value') and v['value'] != name]))
            if kind == 'building':
                if geom.geom_type not in ('Polygon', 'MultiPolygon'):
                    hold(row, f, 'Building needs polygon geometry')
                    continue
                matches = [b['properties']['id'] for b, g in buildings if g.intersects(geom) and g.intersection(geom).area > 0]
                if matches:
                    hold(row, f, 'Overlapping building; compare alternate footprint', matches=matches)
                    continue
                crossed=[key for key,path in paths if geom.intersection(path).length>0]
                if crossed:
                    hold(row,f,'Footprint intersects a mapped path; geometry review required',matches=crossed)
                    continue
                props = {'id': key, 'kind': 'building', 'name': name, 'aliases': aliases, 'source': 'overture',
                         'sourceRefs': [s['recordId'] for s in provenance], 'evidence': ev(['name', 'geometry'])}
                existing.append({'type': 'Feature', 'id': key, 'geometry': mapping(geom), 'properties': props})
                buildings.append((existing[-1], geom))
                row.update(reason='New footprint proposed for owner review', proposed=True)
                continue
            if not name or geom.geom_type != 'Point':
                hold(row, f, 'Place needs a recorded name and point location')
                continue
            if not (p.get('taxonomy') or p.get('basic_category') or p.get('categories')):
                hold(row, f, 'Place classification requires evidence')
                continue
            cat, subtype = place_category(p)
            first = lambda k: next(iter(p.get(k) or []), '')
            address = first('addresses')
            address = ', '.join(str(address[k]) for k in ('freeform', 'locality', 'region', 'postcode') if address.get(k)) if isinstance(address, dict) else str(address)
            place = {'id': key, 'name': name, 'aliases': aliases, 'category': cat, 'subtype': subtype,
                     'coordinates': list(geom.coords[0]), 'source': 'overture', 'sourceId': key, 'arrivalKind': 'unmapped',
                     'sourceRefs': [s['recordId'] for s in provenance]}
            for field, value in [('address', address), ('phone', first('phones')), ('website', safe_url(first('websites')))]:
                if value:
                    place[field] = value
            status = {'open': 'operating', 'closed': 'closed', 'permanently_closed': 'closed', 'temporarily_closed': 'temporarily-closed'}.get(p.get('operating_status'))
            if status:
                place['businessStatus'] = status
            place['evidence'] = ev(['name', 'aliases', 'coordinates', 'category', *[k for k in ('subtype', 'address', 'phone', 'website', 'businessStatus') if k in place]])
            # Existence confidence is not coordinate accuracy or an access review.
            if p.get('confidence') is not None:
                row['sourceConfidence'] = p['confidence']
            campus_key = lambda value: name_key(re.sub(r'\b(lagos state university|lasu)\b', '', value, flags=re.I))
            matches = [other['id'] for other in data['places'] if any(campus_key(value) and campus_key(value) == campus_key(name) for value in [other['name'], *other.get('aliases', [])]) or (other.get('phone') and other.get('phone') == place.get('phone')) or (other.get('website') and other.get('website') == place.get('website'))]
            if matches:
                hold(row, f, 'Possible duplicate; identity review required', matches=matches, proposedPlace=place)
                continue
            # Source coordinates alone are unreliable: observed records include
            # Omole and Delta State addresses geocoded onto LASU. Retain these
            # candidates for independent evidence instead of proposing them as
            # campus establishments. The name/address is corroboration, not proof.
            if not re.search(r'\blas[u]\b|lagos state university', name+' '+address, re.I):
                hold(row, f, 'Campus location needs corroboration; source name/address does not identify LASU', proposedPlace=place)
                continue
            containing = [b['properties']['id'] for b, g in buildings if g.covers(geom)]
            if len(containing) == 1:
                place['buildingId'] = containing[0]
            data['places'].append(place)
            row.update(reason='New place proposed for owner review; entrance unconfirmed', proposed=True, name=name)
    data['sources'] += list(sources.values())
    return rows, {'type': 'FeatureCollection', 'features': overlay}
