import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { db, allRows } from "./cloud.mjs";
import { publishedCampus, snapshotHash, validateReleaseSnapshot } from '../web/server/release-validation';
import { preservePublished } from "../web/scripts/published-assets.mjs";
import { vercelApi, uploadSource, waitForDeployment } from "./vercel-api.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  web = path.join(root, "web");
const id = process.env.RELEASE_ID,
  operation = process.env.RELEASE_OPERATION || "preview";
if (
  !id ||
  !process.env.VERCEL_TOKEN ||
  !process.env.VERCEL_PROJECT_ID ||
  !process.env.VERCEL_ORG_ID
)
  throw new Error("Release/Vercel workflow secrets are missing");
try {
  const [release] = await db(`releases?id=eq.${encodeURIComponent(id)}`);
  if (!release) throw new Error("Release not found");
  if (operation === "preview") {
    if (release.status !== "queued") throw new Error("Only queued releases can be built");
    await db(`releases?id=eq.${id}`, "PATCH", { status: "building", error: null });
    if (!release.snapshot.features.length)
      throw new Error("No approved source baseline. Run bootstrap first.");
    const data = validateReleaseSnapshot(release.snapshot, await publishedCampus());
    data.createdAt = new Date().toISOString();
    await fs.writeFile(path.join(root, "data/release-input.json"), JSON.stringify(data));
    execFileSync(process.execPath, [path.join(root, "scripts/package.mjs")], {
      cwd: root,
      env: {
        ...process.env,
        CAMPUS_INPUT: "data/release-input.json",
        RELEASE_SUMMARY: release.summary,
      },
      stdio: "inherit",
    });
    const previous = await db(
      "releases?status=eq.published&order=published_at.desc&limit=1&select=deployment_url",
    );
    if (previous[0]?.deployment_url)
      await preservePublished(path.join(web, "public"), previous[0].deployment_url);
    const manifest = JSON.parse(
      await fs.readFile(path.join(web, "public/packages/latest.json"), "utf8"),
    );
    await fs.writeFile(
      path.join(web, "release-build.json"),
      JSON.stringify({ version: manifest.version, releaseId: id }),
    );
    const project = await vercelApi(
      `/v9/projects/${encodeURIComponent(process.env.VERCEL_PROJECT_ID!)}`,
    );
    const files = await uploadSource(root);
    const created = await vercelApi("/v13/deployments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: project.name,
        project: project.id,
        files,
        meta: { turnrightRelease: id, turnrightVersion: manifest.version },
        projectSettings: {
          rootDirectory: "web",
          framework: "vite",
          buildCommand: "npm run build",
          outputDirectory: "dist",
          installCommand: "npm ci",
        },
      }),
    });
    // Save the deployment ID early so a timed-out build can be inspected without guessing.
    await db(`releases?id=eq.${id}`, "PATCH", {
      deployment_id: created.id,
      version: manifest.version,
    });
    const deployment = await waitForDeployment(created.id);
    const url = `https://${deployment.url}`;
    await db(`releases?id=eq.${id}`, "PATCH", { status: "preview", preview_url: url });
    console.log(`Preview ready: ${url}`);
  } else if (operation === "publish" || operation === "rollback") {
    if (operation === "publish" && release.status !== "preview")
      throw new Error("Review a ready preview first");
    if (operation === "rollback" && release.status !== "published")
      throw new Error("Rollback requires a previously published release");
    if (!release.deployment_id) throw new Error("Deployment is missing");
    if(operation==='publish') {
      validateReleaseSnapshot(release.snapshot,await publishedCampus());
      const [features,edits]=await Promise.all([allRows('source_features'),allRows('map_edits')]);
      if(snapshotHash(release.snapshot.features,release.snapshot.edits)!==snapshotHash(features,edits)) throw new Error('Preview is stale. Create a fresh reviewed preview.');
    }
    await vercelApi(
      `/v10/projects/${encodeURIComponent(process.env.VERCEL_PROJECT_ID!)}/promote/${encodeURIComponent(release.deployment_id)}`,
      { method: "POST" },
    );
    const deployment = await waitForDeployment(release.deployment_id, true);
    await db(`releases?id=eq.${id}`, "PATCH", {
      status: "published",
      deployment_url: `https://${deployment.url}`,
      published_at: new Date().toISOString(),
      error: null,
    });
    console.log("Production release and domain assignment verified.");
  } else throw new Error("Unknown release operation");
} catch (error) {
  const message = (error as Error).message;
  await db(
    `releases?id=eq.${id}`,
    "PATCH",
    operation === "preview" ? { status: "failed", error: message } : { error: message },
  ).catch(() => {});
  console.error(message);
  process.exitCode = 1;
}
