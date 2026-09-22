"""Create an offline enrichment candidate and complete review ledger. Never publish.

Run with the isolated requirements-data.txt environment. Defaults to the public
production baseline and current Overture release; snapshots remain reproducible.
"""
import argparse
import collections
import copy
import datetime as dt
import hashlib
import json
import pathlib
import re
import subprocess
import sys
import urllib.request
from urllib.parse import urljoin, urlparse
import import_campus
from place_enrichment import coverage, snapshot_manifest, update_coverage
from overture_enrichment import apply_overture, read_extract

ROOT = pathlib.Path(__file__).resolve().parents[1]
BBOX = '3.190,6.455,3.215,6.489'


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    tmp.replace(path)


def candidate_version(data):
    """Stable content identity across offline replays with new audit timestamps."""
    def canonical(value):
        if isinstance(value, list): return [canonical(v) for v in value]
        if isinstance(value, dict):
            return {k: canonical(v) for k, v in value.items() if k not in ('createdAt', 'retrievedAt', 'checkedAt')}
        return value
    content = canonical({k: v for k, v in data.items() if k != 'version'})
    return 'lasu-' + hashlib.sha256(json.dumps(content, sort_keys=True).encode()).hexdigest()[:12]


def preserve_published_owner_data(baseline, candidate):
    """Keep owner-created identities and topology out of upstream deletion proposals."""
    upstream = lambda key: str(key).startswith(('osm:', 'arcgis:', 'overture:'))
    feature_ids = {f['properties']['id'] for f in candidate['map']['features']}
    custom_features = [f for f in baseline['map']['features'] if not upstream(f['properties']['id'])]
    custom_ids = {f['properties']['id'] for f in custom_features}
    candidate['map']['features'] += copy.deepcopy([f for f in custom_features if f['properties']['id'] not in feature_ids])
    place_ids = {p['id'] for p in candidate['places']}
    candidate['places'] += copy.deepcopy([p for p in baseline['places'] if not upstream(p['id']) and p['id'] not in place_ids])
    custom_edges = [e for e in baseline['graph']['edges'] if e['sourceId'] in custom_ids]
    custom_nodes = {key for e in custom_edges for key in (e['from'], e['to'])}
    existing_nodes = {n['id'] for n in candidate['graph']['nodes']}
    edge_ids = {e['id'] for e in candidate['graph']['edges']}
    candidate['graph']['nodes'] += copy.deepcopy([n for n in baseline['graph']['nodes'] if n['id'] in custom_nodes and n['id'] not in existing_nodes])
    candidate['graph']['edges'] += copy.deepcopy([e for e in custom_edges if e['id'] not in edge_ids])
    for key in ('visuals', 'entrances', 'closures', 'placeIdAliases', 'buildingIdAliases'):
        if key in baseline: candidate[key] = copy.deepcopy(baseline[key])
    if baseline.get('driving'):
        candidate['driving']['parking'] = copy.deepcopy(baseline['driving']['parking'])
        restrictions = candidate['driving']['restrictions']
        ids = {r['id'] for r in restrictions}
        restrictions += copy.deepcopy([r for r in baseline['driving']['restrictions'] if not r['id'].startswith('osm:') and r['id'] not in ids])


def published_snapshot(origin, directory):
    parsed = urlparse(origin)
    if parsed.scheme != 'https' or parsed.username or parsed.password:
        raise ValueError('Published baseline must use HTTPS')
    directory.mkdir(parents=True, exist_ok=True)
    import_campus.fetch(urljoin(origin, '/packages/latest.json'), directory / 'manifest.json')
    manifest = read(directory / 'manifest.json')
    path = manifest.get('dataUrl', '')
    if not re.fullmatch(r'/packages/lasu-[a-f0-9]+/campus.json', path) or manifest.get('schemaVersion') not in (1, 2):
        raise ValueError('Unsupported published manifest')
    asset = next((a for a in manifest['assets'] if a['url'] == path), None)
    if not asset:
        raise ValueError('Published campus lacks integrity metadata')
    import_campus.fetch(urljoin(origin, path), directory / 'campus.json')
    content = (directory / 'campus.json').read_bytes()
    if len(content) != asset['bytes'] or hashlib.sha256(content).hexdigest() != asset['sha256']:
        raise ValueError('Published campus integrity check failed')
    return read(directory / 'campus.json')


def download_extracts(directory, release):
    directory.mkdir(parents=True, exist_ok=True)
    for kind in ('place', 'building', 'segment', 'connector'):
        dest = directory / (kind + '.geojson')
        receipt = directory / (kind + '.receipt.json')
        if dest.exists() and receipt.exists():
            previous = read(receipt)
            if previous.get('bbox') == BBOX and previous.get('release') == release and previous.get('sha256') == hashlib.sha256(dest.read_bytes()).hexdigest():
                print(f'Using verified cached Overture {kind} ({release})', flush=True)
                continue
        print(f'Downloading bounded Overture {kind} ({release})', flush=True)
        tmp = dest.with_suffix('.pending.geojson')
        # Validate STAC asset paths as well as bounds; the collection column can
        # be null in otherwise complete indexes (August 2026 release).
        if tmp.exists(): tmp.unlink()
        command = [sys.executable, str(ROOT / 'scripts/download_overture.py'), '--kind', kind,
                   '--release', release, '--output', str(tmp)]
        process = subprocess.Popen(command)
        try:
            process.wait(timeout=300)
        except subprocess.TimeoutExpired:
            # Windows venv launchers have a child interpreter; terminate the
            # entire owned process tree before touching another snapshot.
            if sys.platform == 'win32':
                subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], capture_output=True, check=False)
            else:
                process.kill()
            process.wait()
            raise
        if process.returncode:
            raise RuntimeError(f'Overture {kind} extraction failed; previous successful snapshot retained.')
        read_extract(tmp, kind)
        tmp.replace(dest)
        write(receipt, {'bbox': BBOX, 'release': release, 'sha256': hashlib.sha256(dest.read_bytes()).hexdigest()})


def changed_records(before, after):
    def flatten(data):
        return {**{'place:' + p['id']: p for p in data['places']},
                **{'feature:' + f['properties']['id']: f for f in data['map']['features']}}
    old, new = flatten(before), flatten(after)
    def comparable(record):
        r = copy.deepcopy(record)
        r.pop('evidence', None)
        if isinstance(r.get('properties'), dict):
            r['properties'].pop('evidence', None)
        return r
    rows = []
    for key in sorted(old.keys() | new.keys()):
        if comparable(old.get(key, {})) == comparable(new.get(key, {})):
            continue
        rows.append({'id': key, 'status': 'awaiting-evidence', 'reason': 'Owner review required',
                     'change': 'add' if key not in old else 'remove' if key not in new else 'modify'})
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', type=pathlib.Path)
    parser.add_argument('--published-url', default='https://turnright.vercel.app')
    parser.add_argument('--raw-dir', type=pathlib.Path, default=ROOT / 'data/raw/enrichment')
    parser.add_argument('--output', type=pathlib.Path, default=ROOT / 'data/candidates/enrichment')
    parser.add_argument('--release')
    parser.add_argument('--offline', action='store_true', help='Use complete cached snapshots; no network')
    parser.add_argument('--cached-sources', action='store_true', help='Reuse the existing OSM/ArcGIS snapshot while completing Overture downloads')
    args = parser.parse_args()
    args.raw_dir.mkdir(parents=True, exist_ok=True)
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    print('Verifying published campus baseline', flush=True)
    baseline = read(args.base) if args.base else (read(args.raw_dir / 'published/campus.json') if args.offline else published_snapshot(args.published_url, args.raw_dir / 'published'))
    if args.release:
        release = args.release
    elif args.offline:
        release = read(args.raw_dir / 'selected-release.json')['release']
    else:
        from overturemaps.core import get_latest_release
        release = get_latest_release()
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}\.\d+', release):
        raise ValueError('Invalid Overture release')
    raw = args.raw_dir / 'sources'
    raw.mkdir(parents=True, exist_ok=True)
    if not args.offline and not args.cached_sources:
        for name, url in [('arcgis.json', f'https://www.arcgis.com/sharing/rest/content/items/{import_campus.APP_ID}/data?f=json'),
                          ('arcgis-metadata.json', f'https://www.arcgis.com/sharing/rest/content/items/{import_campus.APP_ID}?f=json'),
                          ('osm.xml', 'https://www.openstreetmap.org/api/0.6/map?bbox=' + BBOX)]:
            print(f'Refreshing {name}', flush=True)
            import_campus.fetch(url, raw / name)
    overture = args.raw_dir / ('overture-' + release)
    if not args.offline:
        download_extracts(overture, release)
        write(args.raw_dir / 'selected-release.json', {'release': release})
    for kind in ('place', 'building', 'segment', 'connector'):
        path=overture/(kind+'.geojson')
        receipt=read(overture/(kind+'.receipt.json'))
        if receipt.get('release') != release or receipt.get('bbox') != BBOX or receipt.get('sha256') != hashlib.sha256(path.read_bytes()).hexdigest():
            raise ValueError('Overture snapshot receipt mismatch: '+kind)
    import_campus.RAW = raw
    candidate = import_campus.build()
    source_issues = candidate.pop('_sourceIssues', [])
    # Owner-created roads/buildings are not upstream deletions. Keep the actual
    # published geometry and graph, including its restrictions and identities.
    preserve_published_owner_data(baseline, candidate)
    extracts = {kind: read_extract(overture / (kind + '.geojson'), kind) for kind in ('place', 'building', 'segment')}
    checked = dt.datetime.fromtimestamp((overture / 'place.geojson').stat().st_mtime, dt.timezone.utc).isoformat()
    rows, overlay = apply_overture(candidate, extracts, release, checked)
    update_coverage(candidate)
    candidate['sourceSnapshots'] += snapshot_manifest(overture, [(kind + '.geojson', 'https://stac.overturemaps.org/' + release + '/catalog.json', 'Per-record licensing; see sources') for kind in ('place', 'building', 'segment', 'connector')])
    candidate['version'] = candidate_version(candidate)
    ledger = source_issues + rows + changed_records(baseline, candidate)
    report = {'createdAt': now, 'baselineVersion': baseline['version'], 'baselineSource': str(args.base) if args.base else args.published_url,
              'candidateVersion': candidate['version'], 'overtureRelease': release, 'before': coverage(baseline), 'after': coverage(candidate),
              'decisions': dict(collections.Counter(row['status'] for row in ledger)), 'candidates': ledger,
              'limitations': ['No owner approvals or production publication performed.', 'Private accepted source records and corrections must be reconciled in the owner editor before publication.', 'Source coverage is not a complete field inventory. Unknown names, entrances and access require evidence.'],
              'snapshots': candidate['sourceSnapshots']}
    context = args.raw_dir / 'owner-context.json'
    report['ownerContext'] = read(context) if context.exists() else {'available': False, 'reason': 'Authenticated baseline export unavailable locally; owner reconciliation required before publication.'}
    args.output.mkdir(parents=True, exist_ok=True)
    write(args.output / 'campus.json', candidate)
    write(args.output / 'coverage.json', report)
    write(args.output / 'review.geojson', overlay)
    write(args.output / 'source-issues.json', source_issues)
    subprocess.run([sys.executable, str(ROOT / 'scripts/compare_overture.py'), '--segments', str(overture / 'segment.geojson'),
                    '--connectors', str(overture / 'connector.geojson'), '--release', release, '--base', str(args.base or args.raw_dir / 'published/campus.json'),
                    '--osm', str(raw / 'osm.xml'), '--output', str(args.output / 'transportation')], check=True)
    print(json.dumps({k: report[k] for k in ('baselineVersion', 'candidateVersion', 'overtureRelease', 'before', 'after', 'decisions')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
