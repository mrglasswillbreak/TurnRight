import { db } from "./cloud.mjs";
if (process.env.RELEASE_ID) {
  await db(`releases?id=eq.${process.env.RELEASE_ID}`, "PATCH", {
    error:
      "Release workflow failed; inspect GitHub Actions logs. The previous published map remains active.",
    ...(process.env.RELEASE_OPERATION === "preview" ? { status: "failed" } : {}),
  });
} else if (process.env.JOB_ID) {
  await db(`jobs?id=eq.${process.env.JOB_ID}`, "PATCH", {
    status: "failed",
    message: "Source workflow failed; the last successful dataset is unchanged.",
    completed_at: new Date().toISOString(),
  });
} else {
  await db("jobs", "POST", {
    kind: "import",
    status: "failed",
    message: "Scheduled import failed; check GitHub Actions logs.",
    completed_at: new Date().toISOString(),
  });
}
