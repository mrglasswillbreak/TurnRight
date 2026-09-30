/** Authenticated preview acceptance. The temporary automation credential never leaves CI. */
import { randomBytes } from "node:crypto";
import { db } from "./cloud.mjs";
import { vercelApi } from "./vercel-api.mjs";
const [release] = await db(`releases?id=eq.${process.env.RELEASE_ID}&select=preview_url,status`);
if (!release?.preview_url || release.status !== "preview")
  throw Error("A ready preview is required");
const url = new URL(release.preview_url);
if (url.protocol !== "https:" || !url.hostname.endsWith(".vercel.app"))
  throw Error("Unexpected preview origin");
const secret = randomBytes(16).toString("hex");
console.log(`::add-mask::${secret}`);
const endpoint = `/v1/projects/${process.env.VERCEL_PROJECT_ID}/protection-bypass`;
const update = (body) =>
  vercelApi(endpoint, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
await update({
  generate: {
    secret,
    note: `Temporary campus release check ${process.env.GITHUB_RUN_ID || "local"}`,
  },
});
try {
  process.env.VERIFY_ORIGIN = url.origin;
  process.env.VERIFY_BYPASS = secret;
  await import("../web/scripts/verify-campus-detail.mjs");
  const [historical] = await db(
    "releases?status=eq.published&order=published_at.desc&limit=1&select=id,version,deployment_url",
  );
  if (!historical?.version || !historical.deployment_url)
    throw Error("Rollback package record missing");
  const { preservePublished } = await import("../web/scripts/published-assets.mjs");
  await preservePublished(
    "work/rollback-verification",
    historical.deployment_url,
    false,
    historical.version,
    `/packages/${historical.version}/manifest.json`,
  );
  console.log(
    `Rollback package ${historical.version}: immutable assets verified through the restore transport; no publication or drafts changed`,
  );
} finally {
  delete process.env.VERIFY_BYPASS;
  await update({ revoke: { secret, regenerate: false } });
  console.log("Temporary preview verification credential revoked");
}
