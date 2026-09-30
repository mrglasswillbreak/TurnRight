/** Authenticated preview acceptance. The temporary automation credential never leaves CI. */
import { randomBytes } from "node:crypto";
import { db } from "./cloud.mjs";
import { vercelApi, withDeploymentAccess } from "./vercel-api.mjs";
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
  // Edge protection configuration can take a few seconds to propagate.
  let accessible = false;
  for (let attempt = 0; attempt < 15; attempt++) {
    const probe = await fetch(new URL("/packages/campuses.json", url), {
      headers: { "x-vercel-protection-bypass": secret },
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    if (probe.ok && probe.headers.get("content-type")?.includes("application/json")) {
      accessible = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (!accessible) throw Error("Preview authorization did not become available");
  process.env.VERIFY_ORIGIN = url.origin;
  process.env.VERIFY_BYPASS = secret;
  await import("../web/scripts/verify-campus-detail.mjs");
  const [historical] = await db(
    "releases?status=eq.published&order=published_at.desc&limit=1&select=id,version,deployment_url",
  );
  if (!historical?.version || !historical.deployment_url)
    throw Error("Rollback package record missing");
  const { preservePublished } = await import("../web/scripts/published-assets.mjs");
  await withDeploymentAccess(historical.deployment_url, (headers) =>
    preservePublished(
      "work/rollback-verification",
      historical.deployment_url,
      false,
      historical.version,
      `/packages/${historical.version}/manifest.json`,
      { headers },
    ),
  );
  console.log(
    `Rollback package ${historical.version}: immutable assets verified through the restore transport; no publication or drafts changed`,
  );
} finally {
  delete process.env.VERIFY_BYPASS;
  await update({ revoke: { secret, regenerate: false } });
  console.log("Temporary preview verification credential revoked");
}
