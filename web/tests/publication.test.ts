import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error Node-only deployment module.
import { waitForDeployment, vercelApi } from "../../scripts/vercel-api.mjs";
// @ts-expect-error Node-only release asset validation.
import { assetTarget } from "../../scripts/published-assets.mjs";
afterEach(() => vi.unstubAllGlobals());
describe("deployment success gates", () => {
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
