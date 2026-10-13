import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { allRows, db, flatten, hash, evidenceHash } from "./cloud.mjs";
import { attachDerivedRecords } from "./source-comparison.mjs";
import { runSourceCheck } from "./source-check-worker.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let jobId = process.env.JOB_ID;
let checkMessage = "Approved source baseline initialized.";
try {
  if (!jobId) {
    const [job] = await db("jobs", "POST", { kind: "import", status: "running" });
    jobId = job.id;
  } else await db(`jobs?id=eq.${jobId}`, "PATCH", { status: "running" });
  const bootstrap = process.argv.includes("--bootstrap");
  const data = JSON.parse(
    await fs.readFile(
      path.join(
        root,
        bootstrap ? "data/seed/campus.json" : "data/candidates/enrichment/campus.json",
      ),
      "utf8",
    ),
  );
  const candidate = flatten(data),
    previous = await allRows("source_features");
  if (bootstrap) {
    if (previous.length)
      throw new Error("Sources already initialized; bootstrap cannot overwrite them.");
    await db("rpc/bootstrap_sources", "POST", { records: candidate });
  } else {
    if (!previous.length)
      throw new Error("Run the documented one-time bootstrap before source checks.");
    const upstream = JSON.parse(
      await fs.readFile(path.join(root, "data/candidates/enrichment/observations.json"), "utf8"),
    );
    const observations = attachDerivedRecords(upstream.observations, candidate);
    const coverage = JSON.parse(
      await fs.readFile(path.join(root, "data/candidates/enrichment/coverage.json"), "utf8"),
    );
    const snapshots = data.sourceSnapshots || [];
    if (!snapshots.length || snapshots.some((s) => !s.retrievedAt))
      throw new Error(
        "Original source retrieval receipts are missing. Refresh the upstream downloads.",
      );
    // Retained snapshots carry the retrieval times. Filesystem modification time
    // and check time are not substitutes for evidence of source retrieval.
    const receipt = {
      url: "https://github.com/mrglasswillbreak/TurnRight/actions/workflows/source-update.yml",
      retrievedAt: snapshots
        .map((s) => s.retrievedAt)
        .filter(Boolean)
        .sort()[0],
      contentHash: evidenceHash(observations.map((o) => o.content)),
      configurationHash: hash({ bounds: data.bounds, importer: "lasu-enrichment/2" }),
      boundary: data.bounds,
      importerVersion: "lasu-enrichment/2",
      snapshots,
      providerRevision: coverage.overtureRelease,
      extractBoundary: "3.190,6.455,3.215,6.489",
      collections: upstream.collections,
    };
    const result = await runSourceCheck({ sourceKey: "lasu-enrichment", observations, receipt });
    checkMessage =
      result.status === "shadow"
        ? "Shadow comparison saved. Proposal generation remains disabled during rollout."
        : "Source comparison saved. Verified groups await review; uncertain groups remain blocked.";
    console.log(`Source comparison saved (${result.status}).`);
  }
  await db(`jobs?id=eq.${jobId}`, "PATCH", {
    status: "succeeded",
    message: checkMessage,
    completed_at: new Date().toISOString(),
  });
  console.log(checkMessage);
} catch (error) {
  if (jobId)
    await db(`jobs?id=eq.${jobId}`, "PATCH", {
      status: "failed",
      message: error.message,
      completed_at: new Date().toISOString(),
    }).catch(() => {});
  console.error(error.message);
  process.exitCode = 1;
}
