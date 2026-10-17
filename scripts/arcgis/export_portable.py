"""Preserve a campus study in open formats before time-limited Pro access ends.

Requires GDAL, but not ArcPy, a portal session or an active Pro licence. Raw
GeoJSON and JSON evidence remain authoritative; the GeoPackage is a review copy.
Never publishes, approves permissions, or overwrites an earlier archive.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import shutil
import tempfile

from bridge import encoded, now


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def local_file(root, relative):
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()) or not path.is_file():
        raise ValueError('Evidence path must name a file within its campus directory.')
    return path


def detail_fields(features):
    """Inventory possible evidence fields; names alone do not establish meaning."""
    keywords = re.compile(r'height|elevat|level|floor|storey|story|roof|material|colou?r|survey|date|year', re.I)
    names = sorted({name for f in features for name in f.get('properties', {}) if keywords.search(name)})
    return [{'field': name,
             'populated': sum(f.get('properties', {}).get(name) not in (None, '') for f in features),
             'samples': list(dict.fromkeys(str(f.get('properties', {}).get(name)) for f in features
                                           if f.get('properties', {}).get(name) not in (None, '')))[:8]}
            for name in names]


def export_portable(campus_directory, output):
    from osgeo import gdal
    gdal.UseExceptions()
    root, output = Path(campus_directory).resolve(), Path(output).resolve()
    if output.exists():
        raise ValueError('Choose a new archive directory; earlier evidence is retained.')
    inspection = json.loads((root / 'inspection.json').read_bytes())
    baseline = json.loads((root / 'baseline.json').read_bytes())
    if hashlib.sha256(encoded(baseline)).hexdigest() != inspection['baselineSha256']:
        raise ValueError('Baseline changed after source inspection.')
    inputs, identities = [], set()
    for layer in inspection['layers']:
        if layer['sourceCollection'] in identities:
            raise ValueError('Duplicate source identity in inspection.')
        identities.add(layer['sourceCollection'])
        path = local_file(root, layer['file'])
        if digest(path) != layer['sha256']:
            raise ValueError('Source checksum changed after inspection.')
        features = json.loads(path.read_bytes())['features']
        ids = [str(f.get('properties', {}).get(layer['idField'])) for f in features]
        if len(features) != layer['count'] or len(ids) != len(set(ids)) or any(
                f.get('properties', {}).get(layer['idField']) is None for f in features):
            raise ValueError('Source count or stable identities changed.')
        if layer.get('rawFile'):
            raw = local_file(root, layer['rawFile'])
            if digest(raw) != layer['rawSha256']:
                raise ValueError('Raw source checksum changed after inspection.')
        inputs.append((layer, path, ids, detail_fields(features)))
    output.parent.mkdir(parents=True, exist_ok=True)
    # Failed native conversions leave no apparently complete archive behind.
    with tempfile.TemporaryDirectory(prefix='turnright-portable-', dir=output.parent) as staging:
        target = Path(staging)
        source_dir = target / 'evidence'
        source_dir.mkdir()
        receipts = ['baseline.json', 'inspection.json', 'discovery.json', 'comparison.json',
                    'portal/discovery.json', 'portal/inspection.json', 'portal/comparison.json']
        receipts += [layer[key] for layer, _, _, _ in inputs for key in ('file', 'rawFile') if layer.get(key)]
        for relative in dict.fromkeys(receipts):
            if not (root / relative).exists():
                continue
            source = local_file(root, relative)
            destination = source_dir / source.relative_to(root)
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, destination)
        package = target / 'campus-review.gpkg'
        exports, field_inventory = [], []
        for index, (layer, path, ids, fields) in enumerate(inputs):
            name = 'candidate_' + hashlib.sha256(layer['sourceCollection'].encode()).hexdigest()[:20]
            source = gdal.OpenEx(str(path), gdal.OF_VECTOR, allowed_drivers=['GeoJSON'])
            existing = {source.GetLayer(0).GetLayerDefn().GetFieldDefn(i).GetName().lower()
                        for i in range(source.GetLayer(0).GetLayerDefn().GetFieldCount())}
            rowid = 'turnright_rowid'
            while rowid.lower() in existing:
                rowid += '_'
            options = gdal.VectorTranslateOptions(
                format='GPKG', accessMode=None if index == 0 else 'update', layerName=name,
                options=['-unsetFid'],
                layerCreationOptions=['FID=' + rowid, 'SPATIAL_INDEX=YES'])
            converted = gdal.VectorTranslate(str(package), source, options=options)
            if converted is None:
                raise ValueError('GeoPackage conversion failed for ' + layer['name'])
            converted = None
            source = None
            # Reopen the saved file, checking actual records and native IDs.
            saved = gdal.OpenEx(str(package), gdal.OF_VECTOR, allowed_drivers=['GPKG'])
            saved_layer = saved.GetLayerByName(name)
            actual = [str(f.GetField(layer['idField'])) for f in saved_layer]
            if Counter(actual) != Counter(ids):
                raise ValueError('GeoPackage did not preserve stable source identities.')
            saved = None
            exports.append({'layer': name, 'sourceCollection': layer['sourceCollection'],
                            'name': layer['name'], 'count': len(ids), 'idField': layer['idField'],
                            'sourceCrs': layer['sourceCrs'], 'rights': layer['rights'],
                            'surveyDate': layer.get('surveyDate'), 'modifiedAt': layer.get('modifiedAt')})
            field_inventory.append({'sourceCollection': layer['sourceCollection'], 'name': layer['name'],
                                    'possibleDetailFields': fields})
        (target / 'detail-fields.json').write_bytes(encoded({
            'schemaVersion': 1, 'layers': field_inventory,
            'limitation': 'Field names and samples are leads for review, not verified dimensions or survey dates.'}))
        (target / 'README.txt').write_text(
            'TurnRight campus research archive\n\n'
            'Open campus-review.gpkg with QGIS or any compatible GeoPackage reader.\n'
            'Original source GeoJSON, raw responses, baselines and review receipts are in evidence/.\n'
            'archive.json records file hashes and source identity. No ArcGIS login or Pro licence is needed.\n'
            'GeoJSON and JSON evidence are authoritative; the GeoPackage is a convenient review copy.\n'
            'Candidate source permissions remain unresolved unless their receipt explicitly confirms them.\n'
            'This archive is private research, not an approved TurnRight publication or import bundle.\n'
            'Use the separately validated turnright-exchange.json bundle for candidate imports.\n'
            'Modification dates are not survey dates. Detail-field names require interpretation.\n', encoding='utf-8')
        manifest = {'schemaVersion': 1, 'kind': 'turnright-portable-research', 'createdAt': now(),
                    'campusId': inspection['campusId'], 'campusName': inspection['campusName'],
                    'baselineVersion': inspection['baselineVersion'], 'baselineSha256': inspection['baselineSha256'],
                    'gdalVersion': gdal.VersionInfo('--version'), 'requiresArcGISPro': False,
                    'layers': exports, 'files': [
                        {'file': p.relative_to(target).as_posix(), 'bytes': p.stat().st_size, 'sha256': digest(p)}
                        for p in sorted(target.rglob('*')) if p.is_file()]}
        (target / 'archive.json').write_bytes(encoded(manifest))
        # Same-volume rename publishes the complete local archive atomically.
        target.rename(output)
    return {'output': str(output), 'layers': len(exports), 'features': sum(e['count'] for e in exports),
            'files': len(manifest['files']), 'manifestSha256': digest(output / 'archive.json')}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('campus_directory', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    print(json.dumps(export_portable(args.campus_directory, args.output)))
