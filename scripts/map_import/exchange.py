"""Versioned ArcGIS Pro exchange bundles. Metadata is evidence, never approval."""
import hashlib
import json
import re
from pathlib import Path, PurePosixPath

MANIFEST = 'turnright-exchange.json'
ROLES = {'building', 'path', 'place', 'entrance', 'barrier', 'landcover', 'road-surface', 'overlay', 'boundary', 'skip'}


def inspect_exchange(files, configuration, work, inspect):
    manifests = [p for p in files if p.name == MANIFEST]
    if not manifests:
        return None
    if len(manifests) != 1:
        raise ValueError('Choose one TurnRight exchange bundle per archive.')
    manifest_path = manifests[0]
    if manifest_path.stat().st_size > 1024 * 1024:
        raise ValueError('Exchange manifest exceeds 1 MiB.')
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    if manifest.get('schemaVersion') != 1 or manifest.get('generator') != 'turnright-arcgis-pro':
        raise ValueError('Unsupported TurnRight exchange version or generator.')
    campus = manifest.get('campusId')
    if not isinstance(campus, str) or not campus.strip():
        raise ValueError('Exchange bundle needs a target campus identity.')
    if configuration.get('_campusId') and campus != configuration['_campusId']:
        raise ValueError('This exchange bundle belongs to a different campus.')
    if not manifest.get('baselineVersion') or not re.fullmatch(r'[a-f0-9]{64}', str(manifest.get('baselineSha256', ''))):
        raise ValueError('Exchange bundle needs its baseline version and SHA-256.')
    entries = manifest.get('layers')
    if not isinstance(entries, list) or not 1 <= len(entries) <= 100:
        raise ValueError('Exchange bundle needs between 1 and 100 layers.')
    result, identities, names, expected_files = [], set(), set(), {manifest_path.resolve()}
    base = manifest_path.parent.resolve()
    for entry in entries:
        relative = PurePosixPath(entry.get('file', ''))
        if not relative.parts or relative.is_absolute() or '..' in relative.parts or '\\' in str(relative) or ':' in str(relative):
            raise ValueError('Unsafe exchange dataset path.')
        path = base.joinpath(*relative.parts).resolve()
        if not path.is_relative_to(base) or path.suffix.lower() not in {'.geojson', '.gpkg'} or not path.is_file():
            raise ValueError('Exchange datasets must be included GeoJSON or GeoPackage files.')
        if path in expected_files:
            raise ValueError('Each exchange dataset must be declared once.')
        expected_files.add(path)
        identity, name = entry.get('sourceCollection'), entry.get('name')
        if not isinstance(identity, str) or not identity or identity in identities or not isinstance(name, str) or not name or name in names:
            raise ValueError('Exchange layer names and source identities must be unique.')
        identities.add(identity); names.add(name)
        if not re.fullmatch(r'[a-f0-9]{64}', str(entry.get('sha256', ''))) or hashlib.sha256(path.read_bytes()).hexdigest() != entry['sha256']:
            raise ValueError('Exchange dataset checksum failed. Export a fresh complete bundle.')
        if entry.get('role') not in ROLES or not entry.get('idField') or not entry.get('sourceCrs'):
            raise ValueError('Exchange layer needs a role, stable ID field and source CRS.')
        if entry.get('horizontalUnit') not in {'m', 'ft', 'degree'}:
            raise ValueError('Exchange layer needs a recognized horizontal unit.')
        rights = entry.get('rights')
        if not isinstance(rights, dict) or not isinstance(rights.get('attribution'), str) or not isinstance(rights.get('license'), str) or type(rights.get('redistributionConfirmed')) is not bool:
            raise ValueError('Exchange layer needs attribution and licence metadata, including unresolved rights.')
        layers = inspect(path, configuration, work, name)
        if len(layers) != 1:
            raise ValueError('Export each exchange layer into its own dataset.')
        layer = layers[0]
        observed_crs = layer.get('sourceCrs') or layer.get('crs')
        aliases = {'OGC:CRS84': 'EPSG:4326', 'CRS84': 'EPSG:4326', 'WGS 84': 'EPSG:4326'}
        normalize_crs = lambda value: aliases.get(str(value).upper(), str(value).upper())
        if normalize_crs(observed_crs) != normalize_crs(entry['sourceCrs']):
            raise ValueError('Exchange source CRS does not match the dataset. Export again instead of overriding its CRS.')
        if normalize_crs(entry['sourceCrs']) == 'EPSG:4326' and entry['horizontalUnit'] != 'degree':
            raise ValueError('WGS84 exchange coordinates must declare degree units.')
        features = layer['features']
        if len(features) != entry.get('count'):
            raise ValueError('Exchange feature count does not match its receipt.')
        ids = [f.get('properties', {}).get(entry['idField']) for f in features]
        if any(v is None or str(v) == '' for v in ids) or len(set(map(str, ids))) != len(ids):
            raise ValueError('Exchange features have missing or duplicate source identities.')
        # Do not turn the author's permission declaration into a release approval.
        layer.update(name=name, sourceCollection=identity, suggestedRole=entry['role'],
                     sourceCrs=entry['sourceCrs'], exchange={**{k: manifest.get(k) for k in ('baselineVersion', 'baselineSha256', 'campusId')}, **{k: entry.get(k) for k in (
                         'sourceCollection', 'sourceUrl', 'idField', 'sourceCrs', 'originalCrs', 'horizontalUnit',
                         'verticalDatum', 'heightUnit', 'surveyDate', 'retrievedAt', 'modifiedAt',
                         'rights', 'transformations', 'sha256')}})
        result.append(layer)
    if {p.resolve() for p in files} != expected_files:
        raise ValueError('Exchange archive contains undeclared files. Export a fresh bundle.')
    return result
