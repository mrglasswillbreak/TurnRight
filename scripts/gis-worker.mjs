import { db } from "./cloud.mjs";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

const id = process.env.GIS_JOB_ID;
if (!/^[a-f0-9-]{36}$/i.test(id || "")) throw Error("GIS_JOB_ID is required");
let job, directory, child, poll, containerName;
const stopContainer = () =>
  new Promise((resolve) => {
    if (!containerName) return resolve();
    const cleanup = spawn("docker", ["rm", "--force", containerName], {
      windowsHide: true,
      stdio: "ignore",
      timeout: 15000,
    });
    cleanup.on("error", resolve);
    cleanup.on("close", resolve);
  });
try {
  job = await db("rpc/gis_claim_job", "POST", { job_identity: id });
  containerName = `turnright-gis-${job.run_token}`;
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "turnright-gis-"));
  await fs.chmod(directory, 0o777);
  // Keep the output directory owned by the host so cleanup can unlink files
  // written by the unprivileged container UID on Linux bind mounts.
  await fs.mkdir(path.join(directory, "output"));
  await fs.chmod(path.join(directory, "output"), 0o777);
  await fs.writeFile(path.join(directory, "job.json"), JSON.stringify(job), { mode: 0o644 });
  let cancelled = false;
  const stillActive = async () => {
    const [current] = await db(`gis_jobs?id=eq.${id}&select=status,run_token`);
    if (current?.status !== "running" || current.run_token !== job.run_token) {
      cancelled = true;
      await stopContainer();
      child?.kill("SIGTERM");
    }
  };
  poll = setInterval(() => void stillActive().catch(() => {}), 10000);
  let diagnostics = "";
  await new Promise((resolve, reject) => {
    child = spawn(
      "docker",
      [
        "run",
        "--rm",
        "--name",
        containerName,
        "--network",
        "none",
        "--read-only",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--user",
        "65534:65534",
        "--memory",
        "2g",
        "--cpus",
        "2",
        "--pids-limit",
        "64",
        "--tmpfs",
        "/tmp:rw,noexec,nosuid,size=256m",
        "-v",
        `${directory}:/work:rw`,
        "turnright-gis",
        "/work/job.json",
        "/work/output",
      ],
      { windowsHide: true, timeout: 18 * 60000 },
    );
    child.stderr.on("data", (chunk) => {
      diagnostics = (diagnostics + chunk).slice(-12000);
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(Error(cancelled ? "Cancelled" : diagnostics || `Worker exited ${code}`)),
    );
  });
  await stillActive();
  if (cancelled) throw Error("Cancelled");
  const file = path.join(directory, "output/result.json");
  if ((await fs.stat(file)).size > 50 * 1024 * 1024) throw Error("Output exceeds 50 MiB");
  const result = JSON.parse(await fs.readFile(file, "utf8"));
  if (!Array.isArray(result.features) || result.features.length > 100000)
    throw Error("Invalid worker output");
  for (let i = 0; i < result.features.length; i += 100) {
    await stillActive();
    if (cancelled) throw Error("Cancelled");
    await db(
      "gis_job_features",
      "POST",
      result.features
        .slice(i, i + 100)
        .map((feature) => ({ job_id: id, run_token: job.run_token, id: feature.id, feature })),
    );
    await db(`gis_jobs?id=eq.${id}&run_token=eq.${job.run_token}&status=eq.running`, "PATCH", {
      progress: Math.round(
        10 +
          (85 * Math.min(i + 100, result.features.length)) / Math.max(100, result.features.length),
      ),
    });
  }
  if (job.tool === "export") {
    const bytes = await fs.readFile(path.join(directory, "output/export.zip"));
    if (bytes.length > 50 * 1024 * 1024) throw Error("Export exceeds 50 MiB");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const objectPath = `${process.env.CAMPUS_ID}/${id}/${job.run_token}/${sha256}.zip`;
    const response = await fetch(
      `${process.env.SUPABASE_URL}/storage/v1/object/gis-private/${objectPath}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          "Content-Type": "application/octet-stream",
        },
        body: bytes,
        signal: AbortSignal.timeout(60000),
      },
    );
    if (!response.ok) throw Error("Could not store export");
    result.artifact = {
      path: objectPath,
      sha256,
      bytes: bytes.length,
      format: job.request.parameters.format,
    };
  }
  result.count = result.features.length;
  delete result.features;
  const finished = await db("rpc/gis_finish_job", "POST", {
    job_identity: id,
    token: job.run_token,
    result,
  });
  if (!finished) throw Error("Job was cancelled, expired, or its author lost access");
  console.log("GIS job completed");
} catch (error) {
  if (!job)
    await db(`gis_jobs?id=eq.${id}&status=eq.queued`, "PATCH", {
      status: "failed",
      message: String(error.message).slice(0, 12000),
      completed_at: new Date().toISOString(),
    }).catch(() => {});
  if (job)
    await db("rpc/gis_finish_job", "POST", {
      job_identity: id,
      token: job.run_token,
      result: { error: String(error.message).slice(0, 12000) },
    }).catch(() => {});
  console.error(error.message);
  process.exitCode = 1;
} finally {
  clearInterval(poll);
  await stopContainer();
  // Only remove the mkdtemp directory created by this invocation.
  if (
    directory &&
    path.dirname(directory) === os.tmpdir() &&
    path.basename(directory).startsWith("turnright-gis-")
  )
    await fs.rm(directory, { recursive: true, force: true });
}
