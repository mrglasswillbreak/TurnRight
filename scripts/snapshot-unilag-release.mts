/** Freeze the already accepted UNILAG patch for a fresh application preview. */
import fs from "node:fs/promises";
import { db, allRows, hash } from "./cloud.mjs";
import {
  publishedCampus,
  snapshotHash,
  validateReleaseSnapshot,
} from "../web/server/release-validation";
import { hydrateModelEdits } from "../web/server/model-assets";
import { readPublishedCatalogue } from "../web/scripts/published-campus-catalogue.mjs";
if (process.env.CAMPUS_ID !== "campus-eedb34e0-0310-47a0-afbf-2d2b7e8d9a2a")
  throw Error("UNILAG identity required");
const [features, edits, published] = await Promise.all([
  allRows("source_features"),
  allRows("map_edits"),
  publishedCampus(),
]);
const data = validateReleaseSnapshot(
  { features, edits: await hydrateModelEdits(edits) },
  published,
);
if (
  data.map.features.filter(
    (f) => f.properties?.source === "import:bd74d5cc-2b8d-4d42-977a-00165dc70b7e",
  ).length !== 179
)
  throw Error("Accepted road layer missing");
if (hash(data.graph) !== "12551b2a9daa618d4f6d9eb6db1713a70542e69c9879d09c0c409139e653fb26")
  throw Error("Routing changed since review");
const catalogue = await readPublishedCatalogue(process.env.PUBLISHED_MAP_URL!);
const releaseId = await db("rpc/snapshot_release", "POST", {
  catalogue_hash: catalogue.revision,
  release_summary:
    "UNILAG detail upgrade: 179 reviewed road surfaces, classified landscape, 723 buildings, 116 destinations, credited photographs and architectural evidence. Routing remains unchanged.",
});
const supersedes = process.env.SUPERSEDES_UNILAG_RELEASE;
if (supersedes) {
  if (!/^[a-f0-9-]{36}$/.test(supersedes)) throw Error("Invalid previous release identity");
  await db(`releases?id=eq.${supersedes}&status=eq.preview`, "PATCH", {
    status: "failed",
    error: `Superseded by release ${releaseId}; application performance refinement.`,
  });
}
const report = {
  releaseId,
  supersedes,
  snapshotHash: snapshotHash(features, edits),
  graphHash: hash(data.graph),
  editCount: edits.length,
};
await fs.writeFile("work/unilag-release-receipt.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
