"""Run the full Python suite with native drivers and reject skipped or stale evidence."""

import importlib.util
import json
import os
import unittest

import coverage

from check_python_coverage import ROOT, REPORT, check, snapshot


def main():
    os.chdir(ROOT)
    missing = [
        name for name in ("osgeo", "osmium") if importlib.util.find_spec(name) is None
    ]
    if missing:
        raise RuntimeError(
            "Use the pinned Linux GIS test image; missing native drivers: "
            + ", ".join(missing)
        )
    before = snapshot()
    REPORT.mkdir(parents=True, exist_ok=True)
    measured = coverage.Coverage(config_file=str(ROOT / "pyproject.toml"))
    measured.start()
    suite = unittest.TestLoader().discover(str(ROOT / "scripts/tests"))
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    measured.stop()
    measured.save()
    measured.json_report()
    measured.xml_report()
    measured.html_report()
    if not result.wasSuccessful() or result.skipped or result.testsRun == 0:
        raise RuntimeError(
            "Every Python test must pass with native integration enabled; skips cannot satisfy acceptance."
        )
    if before != snapshot():
        raise RuntimeError(
            "Python sources changed during collection; repeat on the final revision."
        )
    (REPORT / "receipt.json").write_text(
        json.dumps(
            {
                "snapshot": before,
                "status": "passed",
                "tests": result.testsRun,
                "skipped": 0,
            }
        )
        + "\n"
    )
    check()


if __name__ == "__main__":
    main()
