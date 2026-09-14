import { db } from "./cloud.mjs";
import { pathToFileURL } from "node:url";

export async function recordFailure(env = process.env, database = db) {
  if (env.RELEASE_ID) {
    const route = `releases?id=eq.${encodeURIComponent(env.RELEASE_ID)}`;
    const [release] = await database(`${route}&select=error`);
    // release.mts saves the specific failure first. The workflow's final fallback
    // must not erase it, including after a partially completed publication.
    await database(route, "PATCH", {
      error:
        release?.error ||
        "Release workflow failed before completion. Check GitHub Actions and Vercel status before retrying.",
      ...(env.RELEASE_OPERATION === "preview" ? { status: "failed" } : {}),
    });
  } else if (env.JOB_ID) {
    await database(`jobs?id=eq.${env.JOB_ID}`, "PATCH", {
      status: "failed",
      message: "Source workflow failed; the last successful dataset is unchanged.",
      completed_at: new Date().toISOString(),
    });
  } else {
    await database("jobs", "POST", {
      kind: "import",
      status: "failed",
      message: "Scheduled import failed; check GitHub Actions logs.",
      completed_at: new Date().toISOString(),
    });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await recordFailure();
