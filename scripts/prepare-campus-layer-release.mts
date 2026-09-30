/** Add only the reviewed layer patch; freeze publication against the last release,
 * keeping unrelated owner drafts private and guarding the complete live workspace. */
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { db, allRows, hash } from "./cloud.mjs";
import {
  publishedCampus,
  snapshotHash,
  validateReleaseSnapshot,
} from "../web/server/release-validation";
import { hydrateModelEdits } from "../web/server/model-assets";
import { publicCampus } from "./public-campus.mjs";
import { readPublishedCatalogue } from "../web/scripts/published-campus-catalogue.mjs";
import { assembleSources, applyEdits, type SourceRecord } from "../web/src/editor-model";
import { withPublishedVisuals } from "../web/src/editor-visuals";
import type { MapEdit } from "../web/src/types";

const campus = process.env.CAMPUS_ID;
if (!["lasu", "campus-eedb34e0-0310-47a0-afbf-2d2b7e8d9a2a"].includes(campus || ""))
  throw Error("An explicit supported campus is required");
const slug = campus === "lasu" ? "lasu" : "unilag";
const changes = JSON.parse(
  await fs.readFile(`../data/campus-layer-enrichment/${slug}-changes.json`, "utf8"),
);
const [previous, drafts, published] = await Promise.all([
  allRows("source_features"),
  allRows("map_edits"),
  publishedCampus(),
]);
if (published.version !== changes.baselineVersion)
  throw Error("Published campus changed. Review the patch against its new baseline.");
const [last] = await db(
  `releases?status=eq.published&version=eq.${published.version}&order=created_at.desc&limit=1`,
);
if (!last?.snapshot?.features?.length)
  throw Error("The immutable published source snapshot is required.");
const expectedHash = snapshotHash(previous, drafts);
if (process.env.EXPECTED_SNAPSHOT && process.env.EXPECTED_SNAPSHOT !== expectedHash)
  throw Error("Workspace changed since review. Prepare a fresh preview.");
const priorEdits: MapEdit[] = last.snapshot.edits;
const [hydratedCurrent, hydratedPublished] = await Promise.all([
  hydrateModelEdits(drafts),
  hydrateModelEdits(priorEdits),
]);

function patch(input: SourceRecord[], edits: MapEdit[], forRelease: boolean) {
  const records = structuredClone(input),
    index = new Map(records.map((r) => [r.id, r]));
  const meta = records.find((r) => r.entity === "meta")!;
  meta.payload.version = published.version;
  const evaluate = () =>
    forRelease
      ? {
          data: validateReleaseSnapshot({ features: records, edits }, published),
          errors: [] as string[],
        }
      : applyEdits(withPublishedVisuals(assembleSources(records, published), published), edits);
  const beforeResult = evaluate();
  const before = beforeResult.data;
  for (const change of changes.featureUpdates) {
    const record = index.get("feature:" + change.id);
    if (!record) throw Error("Reviewed source identity is missing: " + change.id);
    Object.assign(record.payload.properties, change.properties);
  }
  for (const feature of changes.featureAdds) {
    const id = "feature:" + feature.properties.id;
    if (index.has(id))
      throw Error("Surface patch is already applied or has an identity collision: " + id);
    const record = {
      id,
      entity: "feature" as const,
      source: feature.properties.source,
      payload: feature,
      hash: hash(feature),
    };
    records.push(record);
    index.set(id, record);
  }
  meta.payload.sources = [
    ...meta.payload.sources.filter((s: any) => !changes.sources.some((n: any) => n.id === s.id)),
    ...changes.sources,
  ];
  const afterResult = evaluate();
  const introduced = afterResult.errors.filter((e) => !beforeResult.errors.includes(e));
  if (introduced.length)
    throw Error("The layer patch introduced workspace errors: " + introduced.join("\n"));
  const result = afterResult.data;
  meta.payload.layers = result.layers;
  for (const record of records) record.hash = hash(record.payload);
  if (hash(result.graph) !== hash(before.graph))
    throw Error("Visual patch changed the effective routing graph.");
  for (const field of ["places", "photos", "visuals", "entrances", "closures", "driving"] as const)
    if (hash(result[field] ?? null) !== hash(before[field] ?? null))
      throw Error("Visual patch changed protected content: " + field);
  const surfaces = result.map.features.filter((f) => f.properties?.derivedSurface);
  if (slug === "lasu" && surfaces.length !== 82) throw Error("LASU surface accounting mismatch.");
  if (slug === "unilag") {
    const roads = result.map.features.filter(
      (f) => f.properties?.source === "import:bd74d5cc-2b8d-4d42-977a-00165dc70b7e",
    );
    if (roads.length !== 179 || new Set(roads.map((f) => f.properties?.sourceId)).size !== 179)
      throw Error("UNILAG source accounting mismatch.");
  }
  return { records, index, data: result, graphHash: hash(result.graph) };
}
const current = patch(previous, hydratedCurrent, false),
  release = patch(last.snapshot.features, hydratedPublished, true);
const prior = new Map(priorEdits.map((e) => [`${e.kind}:${e.id}`, hash(e)]));
const excluded = drafts.filter((e) => prior.get(`${e.kind}:${e.id}`) !== hash(e));
const storagePath = `${campus}/${randomUUID()}/campus-layer-release.json`;
const headers = {
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};
const preserved = JSON.stringify({
  previous,
  drafts,
  expectedHash,
  publishedRelease: last.id,
  releaseFeatures: release.records,
  releaseEdits: priorEdits,
});
const url = `${process.env.SUPABASE_URL}/storage/v1/object/campus-imports/${storagePath}`;
const response = await fetch(url, { method: "POST", headers, body: preserved });
if (!response.ok) throw Error("Private rollback preservation failed");
const restored = await fetch(url, { headers });
if (!restored.ok || hash(await restored.json()) !== hash(JSON.parse(preserved)))
  throw Error("Private rollback verification failed");
const report: any = {
  campus,
  slug,
  baselineVersion: published.version,
  publishedRelease: last.id,
  expectedHash,
  storagePath,
  excludedUnpublishedDrafts: excluded.length,
  excludedKinds: excluded.reduce(
    (counts: any, e: any) => ({ ...counts, [e.kind]: (counts[e.kind] || 0) + 1 }),
    {},
  ),
  features: release.data.map.features.length,
  layers: release.data.layers?.items.length,
  graphHash: release.graphHash,
  routingUnchanged: true,
  draftCount: drafts.length,
};
await fs.mkdir("work", { recursive: true });
await fs.writeFile(`work/${slug}-layer-preview.json`, JSON.stringify(publicCampus(release.data)));
if (process.env.APPLY_LAYER_UPGRADE === "true") {
  if (!process.env.EXPECTED_SNAPSHOT) throw Error("A reviewed workspace hash is required");
  const [owner] = await db("admin_users?select=id&limit=1");
  if (!owner) throw Error("Campus owner missing");
  const oldIndex = new Map(previous.map((r) => [r.id, r]));
  const patches = current.records.flatMap((record) => {
    const old = oldIndex.get(record.id),
      base = { id: record.id, entity: record.entity, source: record.source, hash: record.hash };
    if (!old) return [{ ...base, payload: record.payload }];
    if (hash(old.payload) === hash(record.payload)) return [];
    const payload_patch = Object.fromEntries(
      Object.entries(record.payload).filter(
        ([key, value]) =>
          key !== "properties" && JSON.stringify(old.payload[key]) !== JSON.stringify(value),
      ),
    );
    const properties_patch =
      record.entity === "feature"
        ? Object.fromEntries(
            Object.entries(record.payload.properties || {}).filter(
              ([key, value]) =>
                JSON.stringify(old.payload.properties?.[key]) !== JSON.stringify(value),
            ),
          )
        : undefined;
    return [{ ...base, payload_patch, ...(properties_patch ? { properties_patch } : {}) }];
  });
  report.patchCount = patches.length;
  await fs.writeFile(`work/${slug}-layer-receipt.json`, JSON.stringify(report, null, 2));
  if (patches.length) report.reconciliationId = await db(
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
  const [accepted, savedDrafts] = await Promise.all([
    allRows("source_features"),
    allRows("map_edits"),
  ]);
  if (
    accepted.length !== current.records.length ||
    accepted.some((r) => hash(r.payload) !== hash(current.index.get(r.id)?.payload))
  )
    throw Error("Source reconciliation readback failed");
  if (hash(savedDrafts) !== hash(drafts))
    throw Error("Drafts changed during preparation. Review before publication.");
  const catalogue = await readPublishedCatalogue(process.env.PUBLISHED_MAP_URL!);
  report.workspaceHash = snapshotHash(accepted, savedDrafts);
  report.releaseId = randomUUID();
  await fs.writeFile(`work/${slug}-layer-receipt.json`, JSON.stringify(report, null, 2));
  // Return only an acknowledgement; serializing the full snapshot can time out.
  await db("releases", "POST", {
    id: report.releaseId,
    summary: `${slug.toUpperCase()} reviewed campus layers: ${slug === "lasu" ? "82 labelled road-width surfaces and refreshed landscape classification" : "parcel classification corrections and 179 editable road surfaces"}. Routing unchanged. ${excluded.length} unrelated draft changes retained privately.`,
    catalogue_revision: catalogue.revision,
    snapshot: {
      features: release.records,
      edits: priorEdits,
      workspaceHash: report.workspaceHash,
      selection: {
        mode: "reviewed-layer-upgrade",
        publishedRelease: last.id,
        excludedDrafts: excluded.length,
      },
    },
  }, "return=minimal");
  const [created] = await db(`releases?id=eq.${report.releaseId}&select=id,status`);
  if (created?.id !== report.releaseId) throw Error("Release creation readback failed");
}
await fs.writeFile(`work/${slug}-layer-receipt.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
