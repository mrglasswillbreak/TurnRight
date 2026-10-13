"""Bound review-queue requests before PostgreSQL parses any candidate JSON."""
import json

MAX_BATCH_BYTES = 384 * 1024
MAX_BATCH_RECORDS = 100


def queue_verified_import(db, import_id, token, candidate, progress=None):
    """Both import families use the same comparator, staging and DB guards."""
    import subprocess
    import tempfile
    from pathlib import Path
    if 'observations' not in candidate or 'receipt' not in candidate:
        raise ValueError('Rebuild this legacy preview to obtain upstream observations and retrieval evidence.')
    if progress: progress('Verifying source identities and complete dependency groups')
    with tempfile.TemporaryDirectory(prefix='turnright-source-check-') as folder:
        path = Path(folder)/'check.json'
        path.write_text(json.dumps({**candidate,'runId':token,'importId':import_id,'token':token},ensure_ascii=False,allow_nan=False),encoding='utf-8')
        subprocess.run(['node',str(Path(__file__).resolve().parents[1]/'source-check-worker.mjs'),str(path)],check=True,timeout=1100)


def batches(records):
    batch, size, offset = [], 2, 0
    for record in records:
        # Count whitespace too, leaving headroom under the DB's 512 KiB JSONB
        # text limit. UNILAG's largest before/after proposal is about 336 KiB.
        length = len(json.dumps(record, ensure_ascii=False, allow_nan=False).encode('utf-8'))
        if length + 2 > MAX_BATCH_BYTES:
            raise ValueError('An import record exceeds 384 KiB. Simplify this feature before retrying.')
        if batch and (size + length + 2 > MAX_BATCH_BYTES or len(batch) == MAX_BATCH_RECORDS):
            yield offset, batch
            offset += len(batch)
            batch, size = [], 2
        batch.append(record)
        size += length + (2 if len(batch) > 1 else 0)
    if batch:
        yield offset, batch


def queue_import(db, import_id, token, candidate, progress=None):
    sources, proposals = candidate['expectedSources'], candidate['proposals']
    if candidate['summary']['errors']:
        raise ValueError('Repair import errors before review.')
    if not isinstance(sources, list) or not isinstance(proposals, list) or len(sources) > 300000 or len(proposals) > 100000:
        raise ValueError('Import exceeds its record limit.')
    # Preflight every record before changing the job's state. Only references to
    # records are retained; never encode the entire candidate into a DB request.
    parts = [(kind, list(batches(records))) for kind, records in [('source', sources), ('proposal', proposals)]]
    identity = {'import_id': import_id, 'expected_token': token}
    db('rpc/begin_campus_import_queue', 'POST', {**identity, 'source_count': len(sources), 'proposal_count': len(proposals)})
    for kind, chunks in parts:
        for index, (offset, records) in enumerate(chunks):
            db('rpc/stage_campus_import_queue', 'POST', {**identity, 'part_kind': kind, 'start_offset': offset, 'records': records})
            if progress:
                progress(f'Preparing review: {kind} batch {index + 1} of {len(chunks)}')
    if progress:
        progress('Validating the complete campus baseline and queuing changes')
    return db('rpc/finish_campus_import_queue', 'POST', identity)
