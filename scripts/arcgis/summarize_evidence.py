"""Small research summary; raw evidence and source snapshots remain private."""
import json
from pathlib import Path
import sys
from collections import Counter

root = Path(sys.argv[1])
for path in root.glob('campuses/*/baseline.json'):
    data = json.loads(path.read_bytes())
    print(path.parent.name, 'buildings:', sum(f.get('properties', {}).get('kind') == 'building' for f in data['map']['features']))
    print('Land classes:', dict(Counter(f.get('properties', {}).get('landClass') for f in data['map']['features'] if f.get('properties', {}).get('kind') == 'land')))
    print('Landmark options:', [(p['id'], p['name']) for p in data['places'] if any(w in p['name'].lower() for w in ['library', 'senate', 'lagoon', 'main gate', 'sport', 'theatre'])][:18])
    print('Vegetation samples:', [(f['properties'].get('id'), f['properties'].get('name'), f['properties'].get('source')) for f in data['map']['features'] if f.get('properties', {}).get('landClass') == 'green'][:6])
for path in root.glob('*evidence.json'):
    data = json.loads(path.read_bytes())
    print(path.name, 'bytes:', path.stat().st_size, 'id:', data.get('evidence_id'), 'operation:', data.get('operation'), 'limitations:', data.get('limitations', [])[:2])
