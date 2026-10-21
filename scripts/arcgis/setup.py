"""Install pinned analysis dependencies locally, never into ArcGIS Pro's base environment."""

from pathlib import Path
import subprocess
import sys

target = (
    Path(__file__).with_name(".deps")
    / f"cp{sys.version_info.major}{sys.version_info.minor}"
)
# Fixed pip argument vector uses the current trusted interpreter, isolated mode and pinned package names; no shell is invoked.
# nosemgrep: local-runtime.semgrep-rules.python.lang.security.audit.dangerous-subprocess-use-audit
subprocess.run(
    [
        sys.executable,
        "-m",
        "pip",
        "--isolated",
        "install",
        "--no-deps",
        "--only-binary=:all:",
        "--target",
        str(target),
        "shapely==2.1.2",
        "pyproj==3.7.2",
    ],
    check=True,
)
print("Local analysis dependencies:", target)
