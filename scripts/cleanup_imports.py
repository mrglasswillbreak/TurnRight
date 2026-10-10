#!/usr/bin/env python3
"""Dry-run by default; delete only DB-claimed remote-import artifacts via Storage."""
import argparse
import json
import os
import re
import uuid

from import_map import db, remote


def checked_paths(campus, import_id, objects):
    identity = str(uuid.UUID(import_id))
    if not re.fullmatch(r'[a-z0-9-]+', campus):
        raise ValueError('Invalid cleanup campus.')
    prefix = campus + '/' + identity + '/'
    if not isinstance(objects, list) or len(objects) > 100:
        raise ValueError('Cleanup exceeds the bounded file batch.')
    paths = []
    for item in objects:
        path = item.get('path', '')
        if not path.startswith(prefix) or not re.fullmatch(
            r'(snapshot|candidate)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json',
            path[len(prefix):],
        ):
            raise ValueError('Cleanup returned a protected or unexpected file path.')
        uuid.UUID(item['object_id'])
        if path in paths:
            raise ValueError('Duplicate cleanup file.')
        paths.append(path)
    return paths


def cleanup(apply=False, database=db, storage=remote, report=print):
    total = {'plannedFiles': 0, 'plannedBytes': 0, 'deletedFiles': 0, 'deletedBytes': 0}
    # The database owns retention and race protection; no local age-only file matching.
    for campus in database('campuses?select=id&order=id'):
        os.environ['CAMPUS_ID'] = campus['id']
        planned = database('rpc/plan_import_artifact_cleanup', 'POST', {})
        total['plannedFiles'] += len(planned)
        total['plannedBytes'] += sum(row['bytes'] for row in planned)
        report(json.dumps({'campus': campus['id'], 'mode': 'apply' if apply else 'dry-run', 'files': planned}))
        if not apply:
            continue
        for import_id in dict.fromkeys(row['import_id'] for row in planned):
            objects = database('rpc/claim_import_artifact_cleanup', 'POST', {'target_id': import_id})
            paths = checked_paths(campus['id'], import_id, objects)
            if not paths:
                continue
            # Never DELETE storage.objects with SQL: that would orphan the actual bytes.
            storage('storage/v1/object/campus-imports', 'DELETE', {'prefixes': paths})
            removed = database('rpc/finish_import_artifact_cleanup', 'POST', {'target_id': import_id})
            total['deletedFiles'] += removed
            total['deletedBytes'] += sum(row['bytes'] for row in objects) if removed else 0
            report(json.dumps({'campus': campus['id'], 'import': import_id, 'deletedFiles': removed}))
    report(json.dumps(total))
    return total


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Permanently remove files claimed by the retention policy')
    cleanup(parser.parse_args().apply)
