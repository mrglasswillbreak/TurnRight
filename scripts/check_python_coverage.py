"""Coverage contract for the Python import, scheduling and GIS worker runtime."""

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "coverage/python"
ENTRYPOINTS = (
    "scripts/import_map.py",
    "scripts/gis/process.py",
    "scripts/check_map_sources.py",
    "scripts/cleanup_imports.py",
    "scripts/diagnostics.py",
    "scripts/error_monitoring.py",
    "scripts/source_observations.py",
)


def snapshot():
    digest = hashlib.sha256()
    files = sorted(
        [ROOT / "pyproject.toml"]
        + list((ROOT / "scripts").rglob("*.py"))
        + list((ROOT / "scripts").rglob("requirements*.lock"))
    )
    for path in files:
        digest.update(path.relative_to(ROOT).as_posix().encode())
        digest.update(b"\0")
        digest.update(path.read_bytes().replace(b"\r\n", b"\n"))
        digest.update(b"\0")
    return digest.hexdigest()


def check():
    receipt = json.loads((REPORT / "receipt.json").read_text())
    if receipt.get("status") != "passed" or receipt.get("snapshot") != snapshot():
        raise ValueError(
            "Python coverage requires passing tests on the current source and lock snapshot."
        )
    report = json.loads((REPORT / "coverage.json").read_text())
    files = {name.replace("\\", "/"): data for name, data in report["files"].items()}
    scope = sorted(
        set(ENTRYPOINTS)
        | {
            path.relative_to(ROOT).as_posix()
            for path in (ROOT / "scripts/map_import").rglob("*.py")
        }
        | {
            path.relative_to(ROOT).as_posix()
            for path in (ROOT / "scripts/gis").glob("*.py")
            if not path.name.startswith("check_")
        }
    )
    absent = [name for name in scope if name not in files]
    if absent:
        raise ValueError("Coverage omitted worker modules: " + ", ".join(absent))
    totals = {
        key: sum(files[name]["summary"][key] for name in scope)
        for key in (
            "covered_lines",
            "num_statements",
            "covered_branches",
            "num_branches",
        )
    }
    lines = 100 * totals["covered_lines"] / max(1, totals["num_statements"])
    branches = 100 * totals["covered_branches"] / max(1, totals["num_branches"])
    summary = {"files": scope, "totals": totals, "lines": lines, "branches": branches}
    (REPORT / "processing-summary.json").write_text(
        json.dumps(summary, indent=2) + "\n"
    )
    print(
        f"Python processing: {lines:.2f}% lines (required 80%); {branches:.2f}% branches (required 70%)."
    )
    if lines < 80 or branches < 70:
        raise ValueError("Python processing coverage is below the required thresholds.")
    return summary


if __name__ == "__main__":
    check()
