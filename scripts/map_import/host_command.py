"""Least-privilege host invocation of the isolated conversion container."""

import os
from pathlib import Path


def conversion_command(folder, token):
    # TemporaryDirectory is deliberately 0700. Dropping every capability means
    # container root cannot bypass its runner-owned permissions. Match its owner
    # instead of making private uploads world-readable or restoring DAC bypass.
    return [
        "docker",
        "run",
        "--name",
        "campus-import-" + token,
        "--rm",
        "--user",
        f"{os.getuid()}:{os.getgid()}",
        "--network",
        "none",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--read-only",
        "--memory",
        "2g",
        "--cpus",
        "2",
        "--tmpfs",
        "/tmp:rw,size=512m",
        "-v",
        f"{folder}:/work",
        "-v",
        f"{Path(__file__).resolve().parents[1]}:/app:ro",
        os.environ.get("GIS_IMPORT_IMAGE", "turnright-gis-import"),
        "/work",
    ]
