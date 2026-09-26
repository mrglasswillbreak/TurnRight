import { createHash } from "node:crypto";
const scopedTables = new Set(['source_features','map_edits','map_changes','edit_history','reports','jobs','releases','editor_operations','surveys','survey_revisions','survey_chunks','baseline_reconciliations','source_field_reviews','building_media','model_assets','campus_sources','campus_imports','campus_import_assets']);
export async function db(route, method = "GET", body, prefer = "return=representation") {
  const campus = process.env.CAMPUS_ID || 'lasu';
  const table = route.split('?')[0];
  if (scopedTables.has(table)) {
    const query = new URLSearchParams(route.split('?')[1] || '');
    query.set('campus_id', `eq.${campus}`);
    route = `${table}?${query}`;
    if (method === 'POST') {
      const scoped = row => ({...row,campus_id:campus});
      body = Array.isArray(body) ? body.map(scoped) : scoped(body);
    }
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("Supabase job secrets are not configured");
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${route}`, {
    method,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: prefer,
      'X-TurnRight-Campus': campus,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(data?.message || `Database request failed (${response.status})`);
  return data;
}
export async function allRows(table) {
  const all = [];
  for (let offset = 0; offset < 300000; offset += 1000) {
    const page = await db(`${table}?select=*&order=id&limit=1000&offset=${offset}`);
    all.push(...page);
    if (page.length < 1000) return all;
  }
  throw new Error("Campus dataset exceeds expected bounds");
}
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((k) => !["createdAt", "retrievedAt", "checkedAt"].includes(k))
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
}
export const hash = (value) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
export function flatten(data) {
  const records = [];
  const add = (entity, id, payload, source) =>
    records.push({ id: `${entity}:${id}`, entity, source, payload, hash: hash(payload) });
  const { places, map, graph, ...meta } = data;
  add("meta", "campus", meta, "combined");
  places.forEach((p) => add("place", p.id, p, p.source));
  map.features.forEach((f) =>
    add("feature", String(f.properties.id), f, f.properties.source || "campus"),
  );
  graph.nodes.forEach((n) => add("node", n.id, n, "osm"));
  graph.edges.forEach((e) => add("edge", e.id, e, "osm"));
  return records;
}
export function compareSources(previous, candidate) {
  if (candidate.length < previous.length * 0.8)
    throw new Error(
      "Import removed more than 20% of records. Retain the previous snapshot and inspect the source manually.",
    );
  const old = new Map(previous.map((r) => [r.id, r])),
    next = new Map(candidate.map((r) => [r.id, r])),
    changes = [];
  for (const id of new Set([...old.keys(), ...next.keys()])) {
    const before = old.get(id) || null,
      after = next.get(id) || null;
    if (before?.hash === after?.hash) continue;
    const kind = !before ? "add" : !after ? "remove" : "modify";
    changes.push({
      id: hash({ id, before: before?.hash, after: after?.hash }),
      source_id: id,
      kind,
      before,
      after,
      base_hash: before?.hash || null,
      status: "pending",
      summary: `${kind}: ${after?.payload?.name || after?.payload?.properties?.name || before?.payload?.name || id}`,
    });
  }
  return changes;
}

// Owner-controlled metadata may live in the reconciled baseline as well as edits.
// A source refresh must not erase parking, closures, retained identities or models.
export function preserveReviewedMetadata(previous, candidate) {
  const ids = new Set(candidate.map((r) => r.id));
  const ownerFeatures = new Set(
    previous
      .filter(
        (r) =>
          r.entity === "feature" &&
          (r.source === "campus-review" || r.payload.properties?.source === "campus-review"),
      )
      .map((r) => r.payload.properties.id),
  );
  const ownerEdges = previous.filter(
    (r) => r.entity === "edge" && ownerFeatures.has(r.payload.sourceId),
  );
  const ownerNodes = new Set(ownerEdges.flatMap((r) => [r.payload.from, r.payload.to]));
  for (const record of previous) {
    if (
      !ids.has(record.id) &&
      (record.source === "campus-review" ||
        record.payload.source === "campus-review" ||
        (record.entity === "feature" && ownerFeatures.has(record.payload.properties.id)) ||
        (record.entity === "edge" && ownerFeatures.has(record.payload.sourceId)) ||
        (record.entity === "node" && ownerNodes.has(record.payload.id)))
    )
      candidate.push(structuredClone(record));
  }
  const old = previous.find((r) => r.entity === "meta")?.payload;
  const meta = candidate.find((r) => r.entity === "meta");
  if (!old || !meta) return candidate;
  // This identifies the public baseline whose owner corrections were reviewed,
  // not the import's candidate hash. Keep it until an explicit reconciliation.
  // Published release versions are assigned from the immutable release snapshot.
  meta.payload.version = old.version;
  for (const key of ["visuals", "photos", "photoOverrides", "entrances", "closures", "placeIdAliases", "buildingIdAliases"])
    if (old[key] !== undefined) meta.payload[key] = structuredClone(old[key]);
  if (old.schemaVersion === 3) meta.payload.schemaVersion = 3;
  if (old.driving) {
    meta.payload.schemaVersion = old.schemaVersion === 3 ? 3 : 2;
    meta.payload.driving = {
      ...meta.payload.driving,
      parking: structuredClone(old.driving.parking || []),
      restrictions: [
        ...(meta.payload.driving?.restrictions || []),
        ...(old.driving.restrictions || []).filter(
          (r) =>
            !r.id.startsWith("osm:") &&
            !(meta.payload.driving?.restrictions || []).some((n) => n.id === r.id),
        ),
      ],
    };
  }
  meta.hash = hash(meta.payload);
  for (const record of candidate) {
    const previousRecord = previous.find((r) => r.id === record.id);
    if (record.entity === 'place' && previousRecord?.payload.arrival) {
      record.payload.arrival = structuredClone(previousRecord.payload.arrival);
      record.hash = hash(record.payload);
    }
  }
  return candidate;
}
