"""Deterministic local ArcGIS review encoding and timestamps."""

import json
from pathlib import Path


def now():
    # GIS('pro') may initialize the caller's interactive datetime binding.
    # Keep the clock import local so the toolbox and CLI behave identically.
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


def encoded(value):
    return json.dumps(
        value, ensure_ascii=False, allow_nan=False, separators=(",", ":")
    ).encode("utf-8")


def save(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(encoded(value))
    return path
