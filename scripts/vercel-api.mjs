import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

// Official API contracts: github.com/vercel/sdk/docs/sdks/{deployments,projects}.
export async function vercelApi(endpoint, options = {}) {
  if (!process.env.VERCEL_TOKEN) throw new Error("VERCEL_TOKEN is missing");
  const url = new URL(endpoint, "https://api.vercel.com");
  if (process.env.VERCEL_ORG_ID?.startsWith("team_"))
    url.searchParams.set("teamId", process.env.VERCEL_ORG_ID);
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}`, ...options.headers },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => null);
    throw new Error(
      `Vercel ${response.status}: ${problem?.error?.message || "deployment request failed; check project quotas and permissions"}`,
    );
  }
  return response.status === 204 ? null : response.json().catch(() => null);
}
export async function uploadSource(root) {
  const files = [];
  // Explicit scope excludes .env, secrets, raw imports, Git history, and dependencies.
  const roots = [
    "web/src",
    "web/api",
    "web/server",
    "web/components",
    "web/lib",
    "web/hooks",
    "web/public",
  ];
  const singles = [
    "web/package.json",
    "web/package-lock.json",
    "web/index.html",
    "web/vite.config.ts",
    "web/vitest.config.ts",
    "web/tsconfig.json",
    "web/vercel.json",
    "web/release-build.json",
    "scripts/prebuild.mjs",
    "scripts/published-assets.mjs",
  ];
  async function walk(relative) {
    for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
      const next = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await walk(next);
      else if (entry.isFile()) files.push(next);
    }
  }
  for (const directory of roots)
    await walk(directory).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  files.push(...singles);
  const result = [];
  for (let i = 0; i < files.length; i += 6) {
    const batch = await Promise.all(
      files.slice(i, i + 6).map(async (file) => {
        const content = await fs.readFile(path.join(root, file)),
          sha = createHash("sha1").update(content).digest("hex");
        await vercelApi("/v2/files", {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Length": String(content.length),
            "x-vercel-digest": sha,
          },
          body: content,
        });
        return { file, sha, size: content.length };
      }),
    );
    result.push(...batch);
  }
  return result;
}
export async function waitForDeployment(id, promoting = false) {
  const deadline = Date.now() + 9 * 60000;
  while (Date.now() < deadline) {
    const deployment = await vercelApi(`/v13/deployments/${encodeURIComponent(id)}`);
    if (["ERROR", "CANCELED"].includes(deployment.readyState))
      throw new Error(`Deployment ${deployment.readyState}`);
    if (
      deployment.readyState === "READY" &&
      (!promoting ||
        (deployment.target === "production" && deployment.aliasAssigned && !deployment.aliasError))
    )
      return deployment;
    if (deployment.aliasError) throw new Error("Production domain assignment failed");
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(
    "Vercel deployment verification timed out. Inspect the dashboard before retrying.",
  );
}
