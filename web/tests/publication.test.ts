import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
// @ts-expect-error Node-only deployment module.
import { waitForDeployment, vercelApi } from "../../scripts/vercel-api.mjs";
// @ts-expect-error Node-only release asset validation.
import { assetTarget } from "../scripts/published-assets.mjs";
afterEach(() => vi.unstubAllGlobals());
describe("deployment success gates", () => {
  it("validates a frozen release with only the frontend deployment directory present", () => {
    const prefix = path.join(tmpdir(), "turnright-build-");
    const deployment = mkdtempSync(prefix);
    try {
      cpSync(new URL("../scripts", import.meta.url), path.join(deployment, "scripts"), { recursive: true });
      mkdirSync(path.join(deployment, "public/packages"), { recursive: true });
      writeFileSync(path.join(deployment, "release-build.json"), JSON.stringify({ version: "lasu-test" }));
      writeFileSync(path.join(deployment, "public/packages/latest.json"), JSON.stringify({ version: "lasu-test" }));
      const env = { ...process.env, VERCEL: "1", SOURCE_REDISTRIBUTION_APPROVED: "true" };
      expect(() => execFileSync(process.execPath, ["scripts/prebuild.mjs"], { cwd: deployment, env, stdio: "pipe" })).not.toThrow();
      writeFileSync(path.join(deployment, "public/packages/latest.json"), JSON.stringify({ version: "lasu-changed" }));
      expect(() => execFileSync(process.execPath, ["scripts/prebuild.mjs"], { cwd: deployment, env, stdio: "pipe" })).toThrow();
    } finally {
      if (!path.resolve(deployment).startsWith(prefix)) throw new Error("Unexpected temporary build directory");
      rmSync(deployment, { recursive: true, force: true });
    }
  });
  it("rejects failed builds instead of treating the returned ID as a release", async () => {
    vi.stubEnv("VERCEL_TOKEN", "test-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ id: "deployment", readyState: "ERROR" })),
    );
    await expect(waitForDeployment("deployment")).rejects.toThrow("ERROR");
    vi.unstubAllEnvs();
  });
  it("rejects production domain assignment errors during publication or rollback", async () => {
    vi.stubEnv("VERCEL_TOKEN", "test-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          readyState: "READY",
          target: "production",
          aliasError: { message: "failed" },
        }),
      ),
    );
    await expect(waitForDeployment("deployment", true)).rejects.toThrow("domain assignment");
    vi.unstubAllEnvs();
  });
  it("requires readiness and domain assignment to report successful promotion", async () => {
    vi.stubEnv("VERCEL_TOKEN", "test-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          readyState: "READY",
          target: "production",
          aliasAssigned: 123,
          url: "example.vercel.app",
        }),
      ),
    );
    expect((await waitForDeployment("deployment", true)).url).toBe("example.vercel.app");
    vi.unstubAllEnvs();
  });
  it("surfaces quota failures and keeps tokens out of the error", async () => {
    vi.stubEnv("VERCEL_TOKEN", "secret-test-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: { message: "Quota exceeded" } }, { status: 429 })),
    );
    await expect(vercelApi("/v13/deployments")).rejects.toThrow("Vercel 429: Quota exceeded");
    vi.unstubAllEnvs();
  });
  it("rejects encoded traversal in a preceding release manifest", () => {
    expect(() => assetTarget("C:/project/web/public", "/packages/%2e%2e/secret")).toThrow(
      "Invalid",
    );
    expect(() => assetTarget("C:/project/web/public", "https://host/secret")).toThrow("Invalid");
  });
});
