"""Add source-derived vehicle metadata without replacing reviewed walking data.

python scripts/upgrade_driving.py --input data/seed/campus.json
No road or parking permission is inferred from walking approvals.
"""
import argparse
import hashlib
import json
from pathlib import Path
from import_campus import build


def upgrade(existing, imported):
    existing['schemaVersion'] = 3 if existing.get('schemaVersion') == 3 else 2
    existing['driving'] = imported['driving']
    incoming_nodes = {n['id']: n for n in imported['graph']['nodes']}
    incoming_edges = {e['id']: e for e in imported['graph']['edges']}
    incoming_features = {f['properties']['id']: f for f in imported['map']['features']}
    node_ids = {n['id'] for n in existing['graph']['nodes']}
    edge_ids = {e['id'] for e in existing['graph']['edges']}
    feature_ids = {f['properties']['id'] for f in existing['map']['features']}
    for node in existing['graph']['nodes']:
        if node['id'] in incoming_nodes:
            node['sourceTags'] = incoming_nodes[node['id']].get('sourceTags', {})
    for edge in existing['graph']['edges']:
        incoming = incoming_edges.get(edge['id'])
        if incoming:
            edge['vehicle'] = incoming['vehicle']
            edge['vehicleAllowed'] = incoming['vehicleAllowed']
        else:
            edge['vehicleAllowed'] = False
    for edge in imported['graph']['edges']:
        if edge['id'] not in edge_ids:
            existing['graph']['edges'].append({**edge, 'accessible': False})
            for key in (edge['from'], edge['to']):
                if key not in node_ids:
                    existing['graph']['nodes'].append(incoming_nodes[key])
                    node_ids.add(key)
    for feature in existing['map']['features']:
        incoming = incoming_features.get(feature['properties']['id'])
        if incoming and 'vehicle' in incoming['properties']:
            feature['properties']['vehicle'] = incoming['properties']['vehicle']
    for feature in imported['map']['features']:
        if feature['properties']['id'] not in feature_ids and feature['properties'].get('kind') in {'path', 'barrier'}:
            existing['map']['features'].append(feature)
    existing['version'] = 'lasu-' + hashlib.sha256(json.dumps(existing, sort_keys=True).encode()).hexdigest()[:12]
    return existing


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=Path, required=True)
    args = parser.parse_args()
    data = json.loads(args.input.read_text(encoding='utf-8'))
    if data.get('driving'):
        raise SystemExit('Already upgraded; use source reconciliation for later changes.')
    result = upgrade(data, build())
    args.input.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f"Added vehicle metadata to {len(result['graph']['edges'])} directed segments; parking awaits owner review.")
