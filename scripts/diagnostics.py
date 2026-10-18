"""Worker log envelopes. Payloads, errors and credentials are never accepted."""
import json
import time
from datetime import datetime, timezone


def worker_event(worker, started, succeeded):
    if worker not in ('map-import',):
        raise ValueError('Unknown diagnostic worker')
    return {
        'event': 'worker-completed' if succeeded else 'worker-failed',
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'durationMs': max(0, round((time.monotonic() - started) * 1000)),
        'worker': worker,
        'status': 200 if succeeded else 500,
    }


def emit_worker(worker, started, succeeded):
    print(json.dumps(worker_event(worker, started, succeeded)), flush=True)
