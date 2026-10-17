"""Local ArcGIS discovery/analysis bridge. Never writes to TurnRight's server.

Run with ArcGIS Pro's Python environment (plus requirements-data.txt for compare).
Public discovery also works with Python's standard library. Credentials stay local.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import sys
from urllib.parse import urlencode, urlsplit, parse_qs
import zipfile

SCRIPTS = Path(__file__).resolve().parents[1]
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))
dependencies = Path(__file__).with_name('.deps') / f'cp{sys.version_info.major}{sys.version_info.minor}'
if dependencies.is_dir(): sys.path.insert(0, str(dependencies))
from map_import.network import public_json
from map_import.arcgis import discover as resolve_layers
from map_import.formats import guess_role, inspect_file

PORTAL = 'https://www.arcgis.com/sharing/rest'
SEEDS = {
    'lasu': ['ffd68667b1464eeb999c0050897a82a0', '3050f375e48b40feb1dbb67566002397'],
    'unilag': ['18c645c3189f4c40aa6f29a301b01554', '3ae5894e76fe4b89b8a7f07bb9f3b2fc',
               'ec1287b4297940edbb7d1230f9563e18', '5eb6f9b7d1e2473d9670cc3101f2afb5'],
}


def now():
    # GIS('pro') may initialize the caller's interactive datetime binding.
    # Keep the clock import local so the toolbox and CLI behave identically.
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def encoded(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',', ':')).encode('utf-8')


def save(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(encoded(value))
    return path


class Portal:
    def __init__(self, signed_in=False):
        self.gis = None
        self.warnings = []
        self.base = PORTAL
        if signed_in:
            try:
                from arcgis.gis import GIS
                self.gis = GIS('pro')
                self.base = self.gis.url.rstrip('/') + '/sharing/rest'
                if not self.gis.users.me:
                    self.warnings.append('No signed-in portal user; only public content can be searched.')
                    self.gis, self.base = None, PORTAL
            except Exception:
                self.gis, self.base = None, PORTAL
                self.warnings.append('Active Pro portal unavailable; searched public ArcGIS Online only.')

    def get(self, url, form=None):
        parsed = urlsplit(url)
        # The Pro SDK attaches its token to every requested host. Public web maps
        # can refer to arbitrary third-party services, so authenticate only to
        # the active portal and Esri-hosted ArcGIS services, without redirects.
        portal_host = urlsplit(self.base).hostname
        hosted = bool(parsed.hostname and (
            parsed.hostname == 'arcgis.com' or parsed.hostname.endswith('.arcgis.com')))
        trusted = (parsed.scheme == 'https' and not parsed.username and not parsed.password
                   and parsed.port in (None, 443) and (parsed.hostname == portal_host or hosted))
        if self.gis and trusted:
            params = {k: v[-1] for k, v in parse_qs(parsed.query).items()}
            params.update(form or {})
            params.setdefault('f', 'json')
            result = self.gis._con.get(url.split('?')[0], params, allow_redirects=False)
            if not isinstance(result, dict) or result.get('error'):
                raise ValueError('Portal returned an error; this source was not inspected.')
            return result
        return public_json(url, form, timeout=15)


def discover(baseline, campus_id, campus_name, output, signed_in=False, get=None):
    portal = Portal(signed_in)
    fetch = get or portal.get
    lo, hi = baseline['bounds']
    bbox = ','.join(map(str, [*lo, *hi]))
    slug = 'unilag' if 'unilag' in campus_name.lower() or 'university of lagos' in campus_name.lower() else 'lasu'
    queries = [f'({campus_name} OR {"University of Lagos" if slug == "unilag" else "Lagos State University"})',
               'type:"Feature Service"', 'type:"Web Scene"', 'type:"Image Service"',
               '(type:"Feature Service" OR type:"Image Service") AND group:LivingAtlas']
    if portal.gis and portal.gis.users.me:
        queries.append('orgid:' + portal.gis.properties.id)
        queries.extend('group:' + g.id for g in portal.gis.users.me.groups)
    items, receipts = {}, []
    for query in queries:
        start, pages = 1, 0
        while start > 0 and pages < 5:
            page = fetch(portal.base + '/search?' + urlencode({'f': 'json', 'q': query, 'bbox': bbox, 'num': 100, 'start': start}))
            for item in page.get('results', []):
                if item.get('type') in {'Feature Service', 'Map Service', 'Web Map', 'Web Scene', 'Scene Service', 'Image Service', 'Feature Collection'}:
                    items[item['id']] = item
            start, pages = page.get('nextStart', -1), pages + 1
        receipts.append({'query': query, 'pages': pages, 'complete': start == -1})
    for ident in SEEDS[slug]:
        try:
            item = fetch(PORTAL + '/content/items/' + ident + '?f=json')
            if item.get('id'): items[item['id']] = item
        except (ValueError, OSError):
            portal.warnings.append('Known item unavailable: ' + ident)
    result = {'schemaVersion': 1, 'campusId': campus_id, 'campusName': campus_name, 'bounds': baseline['bounds'],
              'baselineVersion': baseline['version'], 'baselineSha256': hashlib.sha256(encoded(baseline)).hexdigest(),
              'retrievedAt': now(), 'searches': receipts, 'warnings': portal.warnings,
              'items': [{k: item.get(k) for k in ('id', 'title', 'type', 'owner', 'url', 'extent', 'modified', 'description', 'licenseInfo', 'accessInformation')}
                        for item in sorted(items.values(), key=lambda i: i['id'])]}
    save(output, result)
    return result


def inspect(registry, output, signed_in=False, get=None):
    portal = Portal(signed_in)
    fetch = get or portal.get
    directory = Path(output).parent
    layers, ledger, seen = [], [], set()
    for item in registry['items']:
        extent = item.get('extent') or []
        local_extent = len(extent) == 2 and 0 < (extent[1][0] - extent[0][0]) * (extent[1][1] - extent[0][1]) < .5
        title = (item.get('title') or '').lower()
        known = item['id'] in sum(SEEDS.values(), []) or any(word in title for word in ['lasu', 'unilag', 'university of lagos', 'lagos state university', 'akoka'])
        if not known and not local_extent:
            ledger.append({'itemId': item['id'], 'status': 'held-global-reference', 'reason': 'Broad/global extent; not a campus-detail vector candidate. Search receipt retains the source for manual review.'})
            continue
        if item['type'] not in {'Web Map', 'Feature Service', 'Map Service', 'Feature Collection'}:
            ledger.append({'itemId': item['id'], 'status': 'reference-only', 'reason': 'Raster/scene: inspect in Pro; vector import required.'})
            continue
        print('Inspecting:', item.get('title'), flush=True)
        url = item.get('url') if item['type'] in {'Feature Service', 'Map Service'} else PORTAL + '/content/items/' + item['id']
        try:
            resolved, warnings = resolve_layers(url, registry['bounds'], get=fetch)
            ledger.extend({'itemId': item['id'], 'status': 'held', 'reason': w} for w in warnings)
            if not resolved and not warnings:
                ledger.append({'itemId': item['id'], 'status': 'held', 'reason': 'No importable vector layers were resolved from this item.'})
            for layer in resolved:
                identity = layer.get('sourceCollection') or layer.get('sourceUrl') or f"arcgis:{item['id']}:{layer['name']}"
                if identity in seen:
                    ledger.append({'itemId': item['id'], 'layer': identity, 'status': 'duplicate-source'})
                    continue
                seen.add(identity)
                if layer.get('retrievalError'):
                    ledger.append({'itemId': item['id'], 'layer': identity, 'status': 'unavailable', 'reason': layer['retrievalError']})
                    continue
                key = hashlib.sha256(identity.encode()).hexdigest()[:20]
                raw = save(directory / 'snapshots' / (key + '.json'), layer)
                # The existing importer uses GDAL's ESRIJSON conversion, including multipart rings.
                converted = inspect_file(raw, {'layers': []}, directory / 'converted', layer['name'])
                if len(converted) != 1:
                    raise ValueError('Expected one vector layer per resolved source.')
                vector = converted[0]
                candidates = [layer.get('objectIdFieldName'), *[f['name'] for f in vector['fields'] if f['name'].lower() in {'globalid', 'objectid', 'fid', 'id'}]]
                ident = next((f for f in candidates if f and len({str(v['properties'].get(f)) for v in vector['features']}) == len(vector['features']) and all(v['properties'].get(f) is not None for v in vector['features'])), None)
                if not ident:
                    ledger.append({'itemId': item['id'], 'layer': identity, 'status': 'held', 'reason': 'No stable unique source ID field.'})
                    continue
                geojson = save(directory / 'layers' / (key + '.geojson'), {'type': 'FeatureCollection', 'features': vector['features']})
                role = guess_role(layer['name'], vector['geometryTypes'])
                rights = {'attribution': item.get('accessInformation') or item.get('owner') or '',
                          'license': item.get('licenseInfo') or '', 'redistributionConfirmed': False}
                entry = {'name': layer['name'] + ' · ' + key[:6], 'file': geojson.relative_to(directory).as_posix(), 'sourceCollection': identity,
                         'sourceUrl': layer.get('sourceUrl') or url, 'itemId': item['id'], 'role': role, 'idField': ident,
                         'count': len(vector['features']), 'sha256': hashlib.sha256(geojson.read_bytes()).hexdigest(),
                         'sourceCrs': 'EPSG:4326', 'originalCrs': layer.get('originalSpatialReference'), 'horizontalUnit': 'degree',
                         'verticalDatum': None, 'heightUnit': None, 'surveyDate': None,
                         'modifiedAt': item.get('modified'), 'retrievedAt': now(), 'rights': rights,
                         'transformations': ['Complete bounded object-ID retrieval', 'GDAL ESRIJSON to WGS84 GeoJSON; no geometry conflation'],
                         'rawFile': raw.relative_to(directory).as_posix(), 'rawSha256': hashlib.sha256(raw.read_bytes()).hexdigest()}
                layers.append(entry)
                ledger.append({'itemId': item['id'], 'layer': identity, 'status': 'candidate', 'count': entry['count'], 'rights': 'needs-review'})
        except Exception as error:
            ledger.append({'itemId': item['id'], 'status': 'unavailable', 'reason': str(error)[:400]})
    result = {**{k: registry[k] for k in ('campusId', 'campusName', 'bounds', 'baselineVersion', 'baselineSha256')},
              'schemaVersion': 1, 'generator': 'turnright-arcgis-pro', 'retrievedAt': now(), 'layers': layers,
              'ledger': ledger, 'warnings': portal.warnings}
    save(output, result)
    return result


def compare(baseline, inspection, directory, output):
    from shapely.geometry import shape
    from shapely.strtree import STRtree
    if hashlib.sha256(encoded(baseline)).hexdigest() != inspection['baselineSha256']:
        raise ValueError('Baseline changed. Repeat discovery against the current workspace snapshot.')
    originals = [f for f in baseline['map']['features'] if f.get('geometry')]
    shapes = [shape(f['geometry']) for f in originals]
    tree = STRtree(shapes)
    ledger = []
    for layer in inspection['layers']:
        path = Path(directory) / layer['file']
        if hashlib.sha256(path.read_bytes()).hexdigest() != layer['sha256']:
            raise ValueError('Inspected dataset changed; inspect again before comparing.')
        for feature in json.loads(path.read_bytes())['features']:
            ident = str(feature['properties'][layer['idField']])
            if not feature.get('geometry'):
                ledger.append({'layer': layer['sourceCollection'], 'id': ident, 'status': 'invalid-geometry', 'reason': 'Null source geometry; no map feature can be proposed.'})
                continue
            g = shape(feature['geometry'])
            if g.is_empty or not g.is_valid:
                ledger.append({'layer': layer['sourceCollection'], 'id': ident, 'status': 'invalid-geometry'})
                continue
            matches = []
            for index in tree.query(g):
                kind = originals[index].get('properties', {}).get('kind')
                roles = {'building': {'building'}, 'path': {'path'}, 'landcover': {'land'}, 'road-surface': {'land'}, 'boundary': {'boundary'}}
                if layer['role'] in roles and kind not in roles[layer['role']]: continue
                other = shapes[index]
                if not other.is_valid or not g.intersects(other): continue
                exact = g.equals(other)
                overlap = g.intersection(other).area / max(g.union(other).area, 1e-20) if g.area and other.area else 0
                if exact or overlap > .25:
                    matches.append({'id': originals[index]['properties'].get('id'), 'exact': exact, 'overlap': round(overlap, 4)})
            status = 'duplicate' if any(m['exact'] for m in matches) else 'probable-duplicate' if any(m['overlap'] > .98 for m in matches) else 'conflict' if matches else 'addition-candidate'
            ledger.append({'layer': layer['sourceCollection'], 'id': ident, 'status': status, 'matches': matches,
                           'surveyDate': layer['surveyDate'], 'freshness': 'unknown-survey-date' if not layer['surveyDate'] else 'recorded',
                           'rights': 'confirmed' if layer['rights']['redistributionConfirmed'] else 'needs-review'})
    buildings = []
    for f in originals:
        p = f.get('properties', {})
        if p.get('kind') != 'building': continue
        appearance = p.get('appearance') or {}
        buildings.append({'id': p.get('id'), 'name': p.get('name', ''),
                          'treatment': 'preserve-authored' if p.get('modelDocument') or p.get('authoredModelRevision') else 'source-supported' if p.get('height') or p.get('floors') else 'illustrative',
                          'needed': [name for name, present in [('height/floors', p.get('height') or p.get('floors')), ('roof evidence', appearance.get('roofForm')), ('facade evidence', appearance.get('walls'))] if not present]})
    report = {'schemaVersion': 1, 'campusId': inspection['campusId'], 'baselineVersion': baseline['version'],
              'createdAt': now(), 'thresholds': {'polygonOverlapCandidate': .25, 'probableDuplicateOverlap': .98}, 'counts': dict(Counter(r['status'] for r in ledger)),
              'candidates': ledger, 'buildings': buildings, 'buildingTreatments': dict(Counter(b['treatment'] for b in buildings)),
              'limitations': ['Source comparison only; no absence implies demolition.', 'Modification dates are not survey dates.',
                              'No source or editor correction is automatically accepted.']}
    save(output, report)
    return report


def export_bundle(inspection, directory, output):
    from map_import.exchange import MANIFEST
    if not inspection['layers']:
        raise ValueError('No complete layers to export.')
    entries, paths = [], []
    for layer in inspection['layers']:
        path = Path(directory) / layer['file']
        if hashlib.sha256(path.read_bytes()).hexdigest() != layer['sha256']:
            raise ValueError('Dataset changed after inspection.')
        entries.append({k: v for k, v in layer.items() if k not in {'rawFile', 'rawSha256'}})
        paths.append(path)
    manifest = {k: inspection[k] for k in ('schemaVersion', 'generator', 'campusId', 'campusName', 'baselineVersion', 'baselineSha256')}
    manifest['layers'] = entries
    output = Path(output)
    if output.exists(): raise ValueError('Choose a new bundle name; previous evidence is retained.')
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(MANIFEST, encoded(manifest))
        for path, entry in zip(paths, entries): archive.write(path, entry['file'])
    if output.stat().st_size > 50 * 1024 * 1024:
        output.unlink()
        raise ValueError('Bundle exceeds 50 MiB. Export fewer layers.')
    return {'file': str(output), 'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'layers': len(entries)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=['discover', 'inspect', 'compare', 'export'])
    parser.add_argument('--baseline', type=Path)
    parser.add_argument('--input', type=Path)
    parser.add_argument('--campus-id')
    parser.add_argument('--campus-name')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--signed-in', action='store_true')
    args = parser.parse_args()
    baseline = json.loads(args.baseline.read_bytes()) if args.baseline else None
    source = json.loads(args.input.read_bytes()) if args.input else None
    if args.operation == 'discover': result = discover(baseline, args.campus_id, args.campus_name, args.output, args.signed_in)
    elif args.operation == 'inspect': result = inspect(source, args.output, args.signed_in)
    elif args.operation == 'compare': result = compare(baseline, source, args.input.parent, args.output)
    else: result = export_bundle(source, args.input.parent, args.output)
    print(json.dumps({'operation': args.operation, 'output': str(args.output), 'layers': len(result.get('layers', [])) if isinstance(result.get('layers'), list) else result.get('layers'), 'counts': result.get('counts')}))


if __name__ == '__main__':
    main()
