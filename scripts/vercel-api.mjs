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
    "web/scripts",
  ];
  const singles = [
    "web/package.json",
    "web/package-lock.json",
    "web/index.html",
    "web/vite.config.ts",
    "web/vitest.config.ts",
    "web/tsconfig.json",
    "web/tsconfig.functions.json",
    "web/vercel.json",
    "web/release-build.json",
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
export async function waitForDeployment(id, promoting = false, projectId) {
  const deadline = Date.now() + 9 * 60000;
  while (Date.now() < deadline) {
    const deployment = await vercelApi(`/v13/deployments/${encodeURIComponent(id)}`);
    if (["ERROR", "CANCELED"].includes(deployment.readyState))
      throw new Error(`Deployment ${deployment.readyState}`);
    if (
      deployment.readyState === "READY" &&
      (!promoting ||
        (deployment.target === "production" && deployment.aliasAssigned && !deployment.aliasError))
    ) {
      if (!projectId) return deployment;
      const project = await vercelApi(`/v9/projects/${encodeURIComponent(projectId)}`);
      if (project.targets?.production?.id === id) return deployment;
    }
    if (deployment.aliasError) throw new Error("Production domain assignment failed");
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(
    "Vercel deployment verification timed out. Inspect the dashboard before retrying.",
  );
}

// Preview builds need a new production build from their frozen source. The
// promote endpoint only accepts production deployments (and requires a body).
// See vercel/vercel packages/cli/src/commands/promote/request-promote.ts.
export async function publishDeployment(id, { releaseId, operation, onCreated }) {
  const projectId = encodeURIComponent(process.env.VERCEL_PROJECT_ID);
  const deployment = await vercelApi(`/v13/deployments/${encodeURIComponent(id)}`);
  if (deployment.target !== "production") {
    if (operation === "rollback")
      throw new Error("Rollback requires a previously published production deployment");
    const project = await vercelApi(`/v9/projects/${projectId}`);
    // Recover a successful create whose acknowledgement or database receipt was
    // lost. Do not create another deployment if the status check is incomplete.
    const candidates = [];
    let until;
    for (let page = 0; ; page++) {
      const query = new URLSearchParams({
        projectId: project.id,
        target: "production",
        limit: "100",
      });
      if (deployment.createdAt) query.set("since", String(deployment.createdAt));
      if (until) query.set("until", String(until));
      const result = await vercelApi(`/v6/deployments?${query}`);
      candidates.push(
        ...result.deployments.filter(
          (candidate) =>
            candidate.meta?.turnrightPromotion === releaseId &&
            candidate.meta?.turnrightPreview === id,
        ),
      );
      if (!result.pagination?.next) break;
      if (page >= 19 || result.pagination.next === until)
        throw new Error(
          "Publication status could not be fully checked. Inspect Vercel before retrying.",
        );
      until = result.pagination.next;
    }
    if (candidates.length > 1)
      throw new Error(
        "Multiple production builds exist for this release. Inspect Vercel before retrying.",
      );
    let created = candidates[0];
    if (!created) {
      created = await vercelApi("/v13/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deploymentId: id,
          name: project.name,
          project: project.id,
          target: "production",
          meta: { action: "promote", turnrightPromotion: releaseId, turnrightPreview: id },
        }),
      });
    }
    id = created.id || created.uid;
    if (!id)
      throw new Error("Production build returned no deployment ID. Check Vercel before retrying.");
    // Persist before waiting, so retries inspect this production build.
    await onCreated(id);
    return waitForDeployment(id, true, process.env.VERCEL_PROJECT_ID);
  }

  await waitForDeployment(id);
  const project = await vercelApi(`/v9/projects/${projectId}`);
  if (project.targets?.production?.id === id)
    return waitForDeployment(id, true, process.env.VERCEL_PROJECT_ID);
  await vercelApi(
    operation === "rollback"
      ? `/v1/projects/${projectId}/rollback/${encodeURIComponent(id)}`
      : `/v10/projects/${projectId}/promote/${encodeURIComponent(id)}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
  );
  return waitForDeployment(id, true, process.env.VERCEL_PROJECT_ID);
}
