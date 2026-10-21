"""The host launches the isolated converter without loading its native stack."""

from pathlib import Path
import subprocess
import sys
import unittest


class HostDependencyTests(unittest.TestCase):
    def test_host_command_imports_without_site_packages(self):
        result = subprocess.run(
            [
                sys.executable,
                "-S",
                "-c",
                "from import_map import conversion_command; "
                "assert callable(conversion_command)",
            ],
            cwd=Path(__file__).resolve().parents[1],
            capture_output=True,
            text=True,
            timeout=15,
        )
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
