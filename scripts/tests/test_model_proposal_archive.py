"""The release import must reject unsafe paths and corrupted immutable inputs."""

import hashlib
import importlib.util
import json
import pathlib
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location(
    "model_proposal_archive",
    pathlib.Path(__file__).resolve().parents[1] / "model-proposal-archive.py",
)
archive_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(archive_module)


class ModelProposalArchiveTests(unittest.TestCase):
    def bundle(self, directory, extra=None, corrupt=False):
        models = [{"buildingId": str(i), "slug": f"model-{i}"} for i in range(20)]
        files = {"ASSET-RIGHTS.json": b"{}", "README.txt": b"review proposals"}
        for model in models:
            for suffix in ("turnright.model.json", "evidence.json", "CREDITS.txt"):
                files[f"{model['slug']}/{suffix}"] = b"{}"
        if extra:
            files[extra] = b"bad"
        manifest = {
            "version": 1,
            "proposalCount": 20,
            "models": models,
            "files": [
                {
                    "file": name,
                    "bytes": len(body),
                    "sha256": hashlib.sha256(body).hexdigest(),
                }
                for name, body in files.items()
            ],
        }
        if corrupt:
            files["model-0/turnright.model.json"] = b"[]"
        target = directory / "proposals.zip"
        with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as bundle:
            for name, body in files.items():
                bundle.writestr(name, body)
            bundle.writestr("EXPORT-MANIFEST.json", json.dumps(manifest))
        return target, hashlib.sha256(target.read_bytes()).hexdigest()

    def test_verifies_all_files_but_extracts_only_import_inputs(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            source, digest = self.bundle(root)
            result = archive_module.extract(source, root / "out", digest)
            self.assertEqual(result["proposalCount"], 20)
            self.assertTrue((root / "out/model-0/turnright.model.json").exists())
            self.assertFalse((root / "out/README.txt").exists())

    def test_rejects_unpinned_archive_and_corrupt_payload(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            source, digest = self.bundle(root, corrupt=True)
            with self.assertRaisesRegex(ValueError, "digest differs"):
                archive_module.extract(source, root / "out", "0" * 64)
            with self.assertRaisesRegex(ValueError, "integrity"):
                archive_module.extract(source, root / "out", digest)

    def test_rejects_traversal_before_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            source, digest = self.bundle(root, extra="../outside.txt")
            with self.assertRaisesRegex(ValueError, "Unsafe"):
                archive_module.extract(source, root / "out", digest)
            self.assertFalse((root / "out").exists())
            self.assertFalse((root / "outside.txt").exists())


if __name__ == "__main__":
    unittest.main()
