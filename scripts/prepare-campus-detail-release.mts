/** Guarded private preparation. Publication remains the normal independent review flow. */
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { allRows, db, hash } from "./cloud.mjs";
import {
  publishedCampus,
  snapshotHash,
  validateReleaseSnapshot,
} from "../web/server/release-validation";
import { hydrateModelEdits } from "../web/server/model-assets";
import { assembleSources, applyEdits, type SourceRecord } from "../web/src/editor-model";
import { withPublishedVisuals } from "../web/src/editor-visuals";
import type { MapEdit } from "../web/src/types";

const campus = process.env.CAMPUS_ID;
if (!["lasu", "campus-eedb34e0-0310-47a0-afbf-2d2b7e8d9a2a"].includes(campus || ""))
  throw Error("Explicit supported campus required");
const slug = campus === "lasu" ? "lasu" : "unilag";
const plan = JSON.parse(await fs.readFile(`../data/campus-detail-enrichment/${slug}.json`, "utf8"));
const published = await publishedCampus();
if (published.version !== plan.baselineVersion || plan.campusId !== campus)
  throw Error("Published baseline changed; regenerate and review the plan");
const previous: SourceRecord[] = await allRows("source_features");
const drafts: MapEdit[] = await allRows("map_edits");
const expectedHash = snapshotHash(previous, drafts);
if (process.env.EXPECTED_SNAPSHOT && process.env.EXPECTED_SNAPSHOT !== expectedHash)
  throw Error("Private workspace changed since preparation");
const hydrated = await hydrateModelEdits(drafts);
const before = validateReleaseSnapshot({ features: previous, edits: hydrated }, published);
const records = structuredClone(previous);
const index = new Map(records.map((r) => [r.id, r]));
const held: { id: string; reason: string }[] = [];
const changed: string[] = [];
// Preserve every saved correction. Source defaults must not replace or hide an editor edit.
const corrected = new Set(drafts.map((e) => `${e.kind}:${e.id}`));
for (const change of plan.changes) {
  const record = index.get(`${change.kind === "place" ? "place" : "feature"}:${change.id}`);
  const effective =
    change.kind === "place"
      ? before.places.find((p) => p.id === change.id)
      : before.map.features.find((f) => f.properties?.id === change.id);
  if (!record || !effective || corrected.has(`${change.kind}:${change.id}`)) {
    held.push({ id: change.id, reason: "missing-or-corrected-source" });
    continue;
  }
  if (change.geometryHash && hash(record.payload.geometry) !== change.geometryHash) {
    held.push({ id: change.id, reason: "changed-footprint" });
    continue;
  }
  const properties = change.kind === "place" ? record.payload : record.payload.properties;
  if (
    change.kind === "building" &&
    (properties.modelDocument ||
      properties.authoredModelRevision ||
      Object.keys(properties.appearance || {}).length)
  ) {
    held.push({ id: change.id, reason: "authored-or-styled" });
    continue;
  }
  if (change.kind === "land" && properties.landClass) {
    held.push({ id: change.id, reason: "existing-land-class" });
    continue;
  }
  // Only presentation fields may cross this bridge. No geometry, dimensions or topology writes.
  const keys = Object.keys(change.properties);
  const allowed =
    change.kind === "building"
      ? ["appearance"]
      : change.kind === "land"
        ? ["landClass"]
        : change.kind === "place"
          ? ["landmark"]
          : [];
  if (keys.some((key) => !allowed.includes(key))) throw Error("Unexpected candidate field");
  Object.assign(properties, change.properties);
  changed.push(record.id);
}
const meta = records.find((r) => r.entity === "meta");
if (!meta) throw Error("Source metadata missing");
const current = applyEdits(
  withPublishedVisuals(assembleSources(records, published), published),
  hydrated,
);
if (current.errors.length) throw Error("Candidate does not validate");
const green = new Map(
  current.data.map.features
    .filter((f) => f.properties?.kind === "land" && f.properties.landClass === "green")
    .map((f) => [String(f.properties!.id), f]),
);
const regions = plan.scenery.regions
  .filter((r: { featureId: string; geometryHash: string }) => {
    const f = green.get(r.featureId);
    return f && hash(f.geometry) === r.geometryHash;
  })
  .map(({ geometryHash, ...r }: { geometryHash: string }) => r);
meta.payload.visuals = {
  ...(current.data.visuals || {
    schemaVersion: 1,
    revision: "",
    bytes: 0,
    buildings: [],
    sectors: [],
    references: [],
  }),
  scenery: { ...plan.scenery, regions },
};
const after = validateReleaseSnapshot({ features: records, edits: hydrated }, published);
for (const key of [
  "graph",
  "entrances",
  "closures",
  "driving",
  "photos",
  "photoOverrides",
] as const)
  if (hash(before[key] ?? null) !== hash(after[key] ?? null))
    throw Error("Protected content changed: " + key);
if (
  hash(before.map.features.map((f) => [f.properties?.id, f.geometry])) !==
  hash(after.map.features.map((f) => [f.properties?.id, f.geometry]))
)
  throw Error("Map geometry changed");
const patches = records.flatMap((record) => {
  const old = previous.find((r) => r.id === record.id)!;
  if (hash(old.payload) === hash(record.payload)) return [];
  record.hash = hash(record.payload);
  const properties_patch =
    record.entity === "feature"
      ? Object.fromEntries(
          Object.entries(record.payload.properties).filter(
            ([k, v]) => hash(v) !== hash(old.payload.properties?.[k] ?? null),
          ),
        )
      : undefined;
  const payload_patch = Object.fromEntries(
    Object.entries(record.payload).filter(
      ([k, v]) => k !== "properties" && hash(v) !== hash(old.payload[k] ?? null),
    ),
  );
  return [
    {
      id: record.id,
      entity: record.entity,
      source: record.source,
      hash: record.hash,
      payload_patch,
      ...(properties_patch ? { properties_patch } : {}),
    },
  ];
});
const report: Record<string, unknown> = {
  campus,
  slug,
  baselineVersion: published.version,
  expectedHash,
  planHash: hash(plan),
  sourcePatches: patches.length,
  presentationChanges: changed.length,
  held,
  regions: regions.length,
  routingUnchanged: true,
  geometryUnchanged: true,
  correctionsPreserved: drafts.length,
  operation: process.env.APPLY_LAYER_UPGRADE === "true" ? "apply" : "prepare",
};
await fs.mkdir("work", { recursive: true });
const reportFile = `work/${slug}-detail-receipt.json`;
await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
if (process.env.APPLY_LAYER_UPGRADE === "true") {
  if (!process.env.EXPECTED_SNAPSHOT) throw Error("Reviewed workspace hash required");
  const [owner] = await db("admin_users?select=id&limit=2");
  if (!owner) throw Error("Original owner identity missing");
  // Store and verify a private rollback copy before the guarded mutation.
  const storagePath = `${campus}/${randomUUID()}/campus-detail-before.json`;
  const body = JSON.stringify({ previous, drafts, expectedHash, planHash: hash(plan) });
  const headers = {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
  const url = `${process.env.SUPABASE_URL}/storage/v1/object/campus-imports/${storagePath}`;
  const stored = await fetch(url, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(60000),
  });
  if (!stored.ok) throw Error("Private rollback copy failed");
  const readback = await fetch(url, { headers, signal: AbortSignal.timeout(60000) });
  if (!readback.ok || hash(await readback.json()) !== hash(JSON.parse(body)))
    throw Error("Rollback readback failed");
  report.storagePath = storagePath;
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
  if (snapshotHash(await allRows("source_features"), await allRows("map_edits")) !== expectedHash)
    throw Error("Workspace changed while preserving backup");
  if (patches.length)
    report.reconciliationId = await db(
      "rpc/apply_additive_source_patch",
      "POST",
      {
        actor: owner.id,
        published_version: published.version,
        expected_sources: previous.map(({ id, source, entity, hash, updated_at }) => ({
          id,
          source,
          entity,
          hash,
          updated_at,
        })),
        patches,
      },
      "return=representation",
      75000,
    );
  const accepted = await allRows("source_features"),
    saved = await allRows("map_edits");
  if (
    accepted.length !== records.length ||
    accepted.some((r: SourceRecord) => hash(r.payload) !== hash(index.get(r.id)?.payload)) ||
    hash(saved) !== hash(drafts)
  )
    throw Error("Apply readback differs; inspect the retained reconciliation before retrying");
  report.workspaceHash = snapshotHash(accepted, saved);
  const review = await db(
    "rpc/gis_submit_review",
    "POST",
    {
      actor: owner.id,
      operation_id: randomUUID(),
      summary: `${slug.toUpperCase()} campus detail: illustrative palettes, reviewed greenery recipes and landmarks. Geometry, routing and saved corrections preserved. New ArcGIS discoveries remain held.`,
    },
    "return=representation",
    75000,
  );
  report.review = { id: review.id, status: review.status, contentHash: review.content_hash };
}
await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, held: held.length }, null, 2));
