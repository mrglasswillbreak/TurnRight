"""Read-only ArcGIS duplicate-geometry diagnostics on an existing native review.

Create a new output directory. Never accept, delete, repair or change source rows.
Native-copy IDs are scoped by the recorded source collection; they are not portal IDs.
"""
import argparse
import collections
import hashlib
import json
from datetime import datetime as Timestamp, timezone
from pathlib import Path


def fingerprint(arcpy, dataset):
    fields = [f.name for f in arcpy.ListFields(dataset)
              if f.type not in ('Geometry', 'Blob', 'Raster')]
    records = []
    with arcpy.da.SearchCursor(dataset, ['SHAPE@JSON'] + fields) as cursor:
        for row in cursor:
            records.append(json.dumps(list(row), sort_keys=True, default=str,
                                      ensure_ascii=False, separators=(',', ':')))
    encoded = '\n'.join(sorted(records)).encode('utf8')
    return len(records), hashlib.sha256(encoded).hexdigest()


def review(native_review_directory, new_output_directory):
    import arcpy
    source_root = Path(native_review_directory).resolve()
    root = Path(new_output_directory).resolve()
    root.mkdir(parents=True, exist_ok=False)
    ledger_bytes = (source_root / 'source-review.json').read_bytes()
    ledger = json.loads(ledger_bytes)
    arcpy.management.CreateFileGDB(str(root), 'duplicate-review.gdb')
    result = {
        'schemaVersion': 1, 'recordedAt': Timestamp.now(timezone.utc).isoformat(),
        'proVersion': arcpy.GetInstallInfo()['Version'], 'licence': arcpy.ProductInfo(),
        'sourceLedgerSha256': hashlib.sha256(ledger_bytes).hexdigest(),
        'sourceMutation': False, 'automaticRepair': False, 'automaticAcceptance': False,
        'method': 'ArcGIS Find Identical, Shape only, ONLY_DUPLICATES',
        'xyToleranceRequested': '0.001 Meters',
        'scope': 'Within each archived native layer; no cross-layer or current-condition claim.',
        'idMeaning': 'nativeCopyIds refer to the earlier geometry-review.gdb copy, scoped by sourceCollection. Original portal identities remain in the source archive.',
        'documentation': 'https://doc.esri.com/en/arcgis-pro/latest/tool-reference/data-management/find-identical.html',
        'campuses': [],
    }
    for campus in ledger['campuses']:
        summary = {'slug': campus['slug'], 'layers': []}
        for index, layer in enumerate(campus['layers']):
            name = f"{campus['slug']}_{index}"
            dataset = str(source_root / 'geometry-review.gdb' / name)
            item = {'sourceCollection': layer['sourceCollection'], 'name': layer['name'],
                    'itemId': layer['itemId'], 'sourceFeatures': layer['features'],
                    'sourceDisposition': layer['disposition'], 'surveyDate': layer['surveyDate'],
                    'rights': layer['rights'], 'nativeCopy': name, 'groups': []}
            if not arcpy.Exists(dataset):
                item.update(status='no-native-geometry-copy', reason=layer['nativeStatus'])
            else:
                before_count, before_hash = fingerprint(arcpy, dataset)
                description = arcpy.Describe(dataset)
                item.update(nativeFeatures=before_count, contentSha256Before=before_hash,
                            spatialReference=description.spatialReference.factoryCode,
                            datasetXYTolerance=description.spatialReference.XYTolerance,
                            coordinateUnits=description.spatialReference.angularUnitName if description.spatialReference.type == 'Geographic' else description.spatialReference.linearUnitName)
                table = str(root / 'duplicate-review.gdb' / (name + '_identical'))
                try:
                    arcpy.management.FindIdentical(dataset, table, ['Shape'],
                                                  xy_tolerance='0.001 Meters',
                                                  output_record_option='ONLY_DUPLICATES')
                    groups = collections.defaultdict(list)
                    with arcpy.da.SearchCursor(table, ['IN_FID', 'FEAT_SEQ']) as rows:
                        for native_id, sequence in rows:
                            groups[sequence].append(native_id)
                    item['groups'] = [{'sequence': seq, 'nativeCopyIds': sorted(ids)}
                                      for seq, ids in sorted(groups.items())]
                    item.update(status='checked', duplicateGroupCount=len(groups),
                                duplicateMemberCount=sum(len(ids) for ids in groups.values()),
                                outputTable=name + '_identical')
                except arcpy.ExecuteError:
                    item.update(status='native-check-failed', message=arcpy.GetMessages(2))
                after_count, after_hash = fingerprint(arcpy, dataset)
                if (before_count, before_hash) != (after_count, after_hash):
                    raise RuntimeError('Native source changed during read-only diagnostic: ' + name)
                item['sourceUnchanged'] = True
                item['contentSha256After'] = after_hash
            summary['layers'].append(item)
            print(json.dumps({'campus': campus['slug'], 'layer': index + 1,
                              'total': len(campus['layers']), 'status': item['status'],
                              'duplicateGroups': len(item['groups'])}), flush=True)
        result['campuses'].append(summary)
        (root / 'duplicate-geometry-review.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf8')
    if hashlib.sha256((source_root / 'source-review.json').read_bytes()).hexdigest() != result['sourceLedgerSha256']:
        raise RuntimeError('Source review ledger changed')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('native_review_directory')
    parser.add_argument('new_output_directory')
    args = parser.parse_args()
    review(args.native_review_directory, args.new_output_directory)
