"""Worker log envelopes. Payloads, errors and credentials are never accepted."""

import json
import re
import time
from datetime import datetime, timezone


def worker_event(worker, started, succeeded, job_id=None):
    if worker not in ("map-import",):
        raise ValueError("Unknown diagnostic worker")
    event = {
        "event": "worker-completed" if succeeded else "worker-failed",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "durationMs": max(0, round((time.monotonic() - started) * 1000)),
        "worker": worker,
        "status": 200 if succeeded else 500,
    }
    if isinstance(job_id, str) and re.fullmatch(
        r"[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}",
        job_id,
    ):
        event["jobId"] = job_id
    return event


def emit_worker(worker, started, succeeded, job_id=None):
    print(json.dumps(worker_event(worker, started, succeeded, job_id)), flush=True)
