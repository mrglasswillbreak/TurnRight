import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { vercelApi, uploadSource, waitForDeployment } from "./vercel-api.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (!process.env.VERCEL_PROJECT_ID || !process.env.VERCEL_ORG_ID)
  throw new Error("Configure the Vercel project secrets first.");
const manifest = JSON.parse(
  await fs.readFile(path.join(root, "web/public/packages/latest.json"), "utf8"),
);
await fs.writeFile(
  path.join(root, "web/release-build.json"),
  JSON.stringify({ version: manifest.version, releaseId: "initial-preview" }),
);
const project = await vercelApi(
  `/v9/projects/${encodeURIComponent(process.env.VERCEL_PROJECT_ID)}`,
);
const files = await uploadSource(root);
const created = await vercelApi("/v13/deployments", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: project.name,
    project: project.id,
    files,
    meta: { turnrightVersion: manifest.version },
    projectSettings: {
      rootDirectory: "web",
      framework: "vite",
      buildCommand: "npm run build",
      outputDirectory: "dist",
      installCommand: "npm ci",
    },
  }),
});
const deployment = await waitForDeployment(created.id),
  url = `https://${deployment.url}`;
console.log(`Review preview: ${url}`);
if (process.env.GITHUB_STEP_SUMMARY)
  await fs.appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `Review the [TurnRight preview](${url}). Production traffic has not been changed.\n`,
  );
