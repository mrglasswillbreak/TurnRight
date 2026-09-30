/** Final CI cleanup, including an interrupted verification process. */
import { vercelApi } from "./vercel-api.mjs";
if (!process.env.GITHUB_RUN_ID) throw Error("A workflow run identity is required");
const project = await vercelApi(`/v9/projects/${process.env.VERCEL_PROJECT_ID}`);
const run = process.env.CLEANUP_RUN_ID || process.env.GITHUB_RUN_ID;
if (!/^\d+$/.test(run)) throw Error("Invalid cleanup run identity");
const note = `Temporary campus release check ${run}`;
let revoked = 0;
for (const [secret, metadata] of Object.entries(project.protectionBypass || {})) {
  if (metadata?.note !== note) continue;
  console.log(`::add-mask::${secret}`);
  await vercelApi(`/v1/projects/${process.env.VERCEL_PROJECT_ID}/protection-bypass`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revoke: { secret, regenerate: false } }),
  });
  revoked++;
}
console.log(`Preview credential cleanup complete (${revoked} remaining credentials revoked)`);
