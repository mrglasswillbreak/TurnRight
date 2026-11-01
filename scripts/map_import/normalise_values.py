"""Stable import content digests and geographic distance."""

import hashlib
import json
import math


def digest(value, preserve_all_fields=False):
    def stable(v):
        if isinstance(v, list):
            return [stable(x) for x in v]
        if isinstance(v, dict):
            return {
                k: stable(x)
                for k, x in sorted(v.items())
                if preserve_all_fields
                or k not in ("createdAt", "retrievedAt", "checkedAt")
            }
        if isinstance(v, float) and v.is_integer():
            return int(v)
        return v

    return hashlib.sha256(
        json.dumps(
            stable(value), separators=(",", ":"), ensure_ascii=False, allow_nan=False
        ).encode()
    ).hexdigest()


def distance(a, b):
    lat1, lat2 = math.radians(a[1]), math.radians(b[1])
    dlat, dlon = lat2 - lat1, math.radians(b[0] - a[0])
    h = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    )
    return 6371000 * 2 * math.atan2(math.sqrt(h), math.sqrt(max(0, 1 - h)))
