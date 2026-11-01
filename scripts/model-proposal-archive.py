"""Verify a pinned proposal ZIP and extract only bounded, immutable import inputs."""

import hashlib
import json
import pathlib
import re
import stat
import sys
import zipfile


def extract(archive, destination, expected_sha256):
    archive, destination = pathlib.Path(archive), pathlib.Path(destination)
    if not re.fullmatch(r"[a-f0-9]{64}", expected_sha256):
        raise ValueError("A pinned archive SHA256 is required")
    with archive.open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != expected_sha256:
            raise ValueError("Proposal archive digest differs")
    if destination.exists():
        raise ValueError("Import destination must be new")
    with zipfile.ZipFile(archive) as bundle:
        entries = bundle.infolist()
        names = [entry.filename for entry in entries]
        if len(entries) > 2000 or len(set(names)) != len(names):
            raise ValueError("Duplicate or excessive ZIP entries")
        for entry in entries:
            path = pathlib.PurePosixPath(entry.filename)
            if (
                path.is_absolute()
                or ".." in path.parts
                or "\\" in entry.filename
                or ":" in entry.filename
                or str(path) != entry.filename
                or stat.S_ISLNK(entry.external_attr >> 16)
                or entry.is_dir()
                or entry.file_size > 64 * 1024 * 1024
            ):
                raise ValueError("Unsafe or oversized ZIP entry")
        if sum(entry.file_size for entry in entries) > 2 * 1024**3:
            raise ValueError("Expanded archive exceeds 2 GiB")
        manifest_entry = bundle.getinfo("EXPORT-MANIFEST.json")
        if manifest_entry.file_size > 2 * 1024 * 1024:
            raise ValueError("Export manifest exceeds 2 MiB")
        manifest = json.loads(bundle.read(manifest_entry))
        files = manifest["files"]
        indexed = {item["file"]: item for item in files}
        if len(indexed) != len(files) or set(indexed) != set(names) - {
            "EXPORT-MANIFEST.json"
        }:
            raise ValueError("ZIP entries do not match the export manifest")
        models = manifest["models"]
        if (
            manifest.get("version") != 1
            or manifest.get("proposalCount") != 20
            or len(models) != 20
            or len({model["buildingId"] for model in models}) != 20
            or len({model["slug"] for model in models}) != 20
            or any(not re.fullmatch(r"[a-z0-9-]+", m["slug"]) for m in models)
        ):
            raise ValueError("Expected 20 unique LASU model proposals")
        selected = {"ASSET-RIGHTS.json"}
        for model in models:
            for suffix in ("turnright.model.json", "evidence.json", "CREDITS.txt"):
                selected.add(f"{model['slug']}/{suffix}")
        if not selected <= set(indexed):
            raise ValueError("Required model, evidence or rights input is absent")
        destination.mkdir(parents=True)
        # Read every entry, checking its CRC, size and SHA256; only retain import inputs.
        for entry in entries:
            if entry.filename == "EXPORT-MANIFEST.json":
                continue
            expected = indexed[entry.filename]
            if entry.file_size != expected["bytes"]:
                raise ValueError("Manifest byte count differs")
            digest, count = hashlib.sha256(), 0
            target = None
            if entry.filename in selected:
                target_path = destination / entry.filename
                target_path.parent.mkdir(parents=True, exist_ok=True)
                target = target_path.open("xb")
            try:
                with bundle.open(entry) as stream:
                    while chunk := stream.read(1024 * 1024):
                        count += len(chunk)
                        digest.update(chunk)
                        if target:
                            target.write(chunk)
            finally:
                if target:
                    target.close()
            if count != expected["bytes"] or digest.hexdigest() != expected["sha256"]:
                raise ValueError("Manifest asset integrity check failed")
        (destination / "EXPORT-MANIFEST.json").write_bytes(bundle.read(manifest_entry))
    return {"verifiedFiles": len(entries), "proposalCount": len(models)}


if __name__ == "__main__":
    print(json.dumps(extract(*sys.argv[1:])))
