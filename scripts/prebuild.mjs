import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { preservePublished } from "./published-assets.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (process.env.VERCEL && process.env.SOURCE_REDISTRIBUTION_APPROVED !== "true")
  throw new Error(
    "ArcGIS redistribution permission is unconfirmed. Complete the source-rights check in docs/DEPLOYMENT.md before deployment.",
  );
const release = await fs
  .readFile(path.join(root, "web/release-build.json"), "utf8")
  .then(JSON.parse)
  .catch(() => null);
if (release) {
  const manifest = JSON.parse(
    await fs.readFile(path.join(root, "web/public/packages/latest.json"), "utf8"),
  );
  if (manifest.version !== release.version)
    throw new Error("Frozen release manifest changed during deployment");
} else if (process.env.PUBLISHED_MAP_URL) {
  const manifest = await preservePublished(
    path.join(root, "web/public"),
    process.env.PUBLISHED_MAP_URL,
    true,
  );
  console.log(`Preserved published campus package ${manifest.version} for this code build.`);
}
