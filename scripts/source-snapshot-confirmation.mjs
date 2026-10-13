import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evidenceHash } from "./cloud.mjs";
const execute = promisify(execFile);

// The existing downloader validates release asset paths, completeness and bounded
// range reads. A fresh temporary directory deliberately bypasses its local cache.
export async function confirmOverture(collection, receipt) {
  const kind = collection.replace(/^overture:/, "");
  const release = receipt.providerRevision;
  if (
    !["place", "building", "segment", "connector"].includes(kind) ||
    !/^\d{4}-\d{2}-\d{2}\.\d+$/.test(release || "") ||
    receipt.extractBoundary !== "3.190,6.455,3.215,6.489"
  )
    return {
      status: "unverified",
      reason: "A pinned release and comparable extract boundary are required",
    };
  const expected = receipt.collections.find((c) => c.identity === collection);
  if (!expected?.complete || !expected.contentHash)
    return { status: "unverified", reason: "The first collection was incomplete" };
  const directory = await mkdtemp(path.join(tmpdir(), "turnright-confirm-"));
  try {
    const output = path.join(directory, kind + ".geojson");
    await execute(
      process.env.SOURCE_PYTHON || "python",
      [
        fileURLToPath(new URL("./download_overture.py", import.meta.url)),
        "--kind",
        kind,
        "--release",
        release,
        "--output",
        output,
        "--no-cache",
      ],
      { timeout: 300000, maxBuffer: 1024 * 1024, windowsHide: true },
    );
    const bytes = await readFile(output);
    if (bytes.length > 100000000) throw new Error("Confirmation exceeded the collection limit");
    const value = JSON.parse(bytes);
    if (
      value.type !== "FeatureCollection" ||
      !Array.isArray(value.features) ||
      value.features.length > 20000 ||
      evidenceHash(value.features) !== expected.contentHash
    )
      throw new Error("Independent collection differs from the checked snapshot");
    const ids = value.features.map((f) => f.properties?.id || f.id);
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length)
      throw new Error("Confirmation has unresolved identities");
    return {
      status: "verified",
      identities: new Set(ids.map(String)),
      receipt: {
        method: "independent-overture-snapshot",
        providerRevision: release,
        checkedAt: new Date().toISOString(),
        uncached: true,
        complete: true,
        responseHash: expected.contentHash,
      },
    };
  } catch (error) {
    return { status: "unverified", reason: error.message.slice(0, 500) };
  } finally {
    if (
      path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) ||
      !path.basename(directory).startsWith("turnright-confirm-")
    )
      throw new Error("Unexpected confirmation directory");
    await rm(directory, { recursive: true, force: true });
  }
}
