"""Capture hash-verified public snapshots for analysis, never an editor overwrite."""
import hashlib
import json
from pathlib import Path
import sys
from urllib.request import urlopen

def capture(output, origin='https://turnright.vercel.app'):
    root = Path(output)
    if any((root / slug / name).exists() for slug in ('lasu', 'unilag') for name in ('baseline.json', 'manifest.json', 'campus.json')):
        raise ValueError('Choose a new capture directory; previous snapshots must remain unchanged.')
    catalogue = json.load(urlopen(origin + '/packages/campuses.json', timeout=60))
    entries = catalogue if isinstance(catalogue, list) else catalogue['campuses']
    for campus in entries:
        if campus['slug'] not in {'lasu', 'unilag'}:
            continue
        folder = root / campus['slug']
        folder.mkdir(parents=True, exist_ok=True)
        manifest = json.load(urlopen(origin + campus['manifestUrl'], timeout=60))
        raw = urlopen(origin + manifest['dataUrl'], timeout=60).read()
        digest = hashlib.sha256(raw).hexdigest()
        asset = next(a for a in manifest['assets'] if a['url'] == manifest['dataUrl'])
        if digest != asset['sha256'] or len(raw) != asset['bytes']:
            raise ValueError('Published snapshot integrity failed')
        (folder / 'baseline.json').write_bytes(raw)
        (folder / 'manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
        (folder / 'campus.json').write_text(json.dumps(campus), encoding='utf-8')
        print(campus['slug'], manifest['version'], len(raw), digest)

if __name__ == '__main__':
    capture(sys.argv[1])
