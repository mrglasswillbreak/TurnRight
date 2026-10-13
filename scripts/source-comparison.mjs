import { hash, evidenceHash } from "./cloud.mjs";

export const COMPARATOR_VERSION = "source-observations/1";
export const MAX_GROUP_RECORDS = 1000;
export const identityOf = ({ provider, collection, nativeId }) =>
  JSON.stringify([provider, collection, String(nativeId)]);
const recordMap = (records = []) => new Map(records.map((r) => [r.id, r]));
const routingDependencies = (record) =>
  record?.entity === "edge"
    ? ["node:" + record.payload.from, "node:" + record.payload.to]
    : record?.entity === "place" && record.payload.graphNode
      ? ["node:" + record.payload.graphNode]
      : [];
const partition = (o) => JSON.stringify([o.provider, o.collection, o.featureType]);
const upstreamHash = (o) => evidenceHash(o.content);
const recordFingerprint = (records) =>
  hash([...records].sort((a, b) => a.id.localeCompare(b.id)).map(semanticRecord));
const hasEndpoints = (r) =>
  r.entity === "edge" &&
  ["id", "sourceId", "from", "to"].every(
    (k) => typeof r.payload[k] === "string" && r.payload[k].length > 0,
  );
export function matchRoutingSegments(before, after) {
  const byAncestry = new Map();
  for (const record of after)
    if (hasEndpoints(record))
      for (const ancestor of [record.payload.id, ...(record.payload.parentEdgeIds || [])]) {
        const key = JSON.stringify([
          record.payload.sourceId,
          ancestor,
          record.payload.from,
          record.payload.to,
        ]);
        byAncestry.set(key, [...(byAncestry.get(key) || []), record.id]);
      }
  return before
    .filter((r) => r.entity === "edge")
    .map((record) => {
      const matches = new Set(
        [record.payload.id, ...(record.payload.parentEdgeIds || [])].flatMap(
          (ancestor) =>
            (hasEndpoints(record) &&
              byAncestry.get(
                JSON.stringify([
                  record.payload.sourceId,
                  ancestor,
                  record.payload.from,
                  record.payload.to,
                ]),
              )) ||
            [],
        ),
      );
      return {
        recordId: record.id,
        replacementId: matches.size === 1 ? [...matches][0] : null,
        resolved: matches.size === 1,
      };
    });
}
const semanticRecord = (r) =>
  r
    ? Object.fromEntries(
        ["id", "entity", "source", "payload", "hash", "private_attributes", "gis_metadata"]
          .filter((key) => r[key] !== undefined)
          .map((key) => [key, r[key]]),
      )
    : null;
const recordChange = (before, after) => ({
  id: (after || before).id,
  before: semanticRecord(before),
  after: semanticRecord(after),
  base_hash: before?.hash || null,
});

// Receipts deliberately never participate in semantic comparisons. The caller
// supplies accepted observations, not yesterday's transformed/published graph.
export function compareObservations({
  accepted = [],
  observations = [],
  records = [],
  receipt,
  verification = {},
  completeReplacement = false,
}) {
  const current = recordMap(records);
  const old = new Map(accepted.map((o) => [o.identity || identityOf(o), o]));
  const next = new Map();
  for (const raw of observations) {
    const o = { ...raw, identity: identityOf(raw), contentHash: upstreamHash(raw) };
    if (next.has(o.identity)) throw new Error("Duplicate upstream identity: " + o.identity);
    if (!o.provider || !o.collection || !o.nativeId)
      throw new Error("Incomplete upstream identity");
    next.set(o.identity, o);
  }
  const partitions = new Map();
  for (const o of old.values()) {
    const p = partition(o),
      count = partitions.get(p) || { before: 0, missing: 0 };
    count.before++;
    if (!next.has(o.identity)) count.missing++;
    partitions.set(p, count);
  }
  const diagnostics = [],
    candidates = [];
  const heldDependencies = new Set();
  for (const o of [...old.values(), ...next.values()]) {
    if (receipt.collections?.some((c) => c.identity === o.collection && c.complete)) continue;
    for (const r of o.records) {
      heldDependencies.add(r.id);
      for (const dependency of routingDependencies(r)) heldDependencies.add(dependency);
    }
  }
  for (const id of new Set([...old.keys(), ...next.keys()])) {
    const before = old.get(id),
      after = next.get(id),
      o = after || before;
    const evidence = verification[id] || { status: "unverified" };
    const collection = receipt.collections?.find((c) => c.identity === o.collection);
    // An unrequested or failed collection cannot supersede that collection's queue.
    if (!collection?.complete) {
      diagnostics.push({
        identity: id,
        classification: "incomplete_collection",
        message: "Collection is incomplete; previous proposals and accepted data retained.",
      });
      continue;
    }
    const changedConfig =
      before &&
      !before.legacy &&
      (before.configurationHash !== receipt.configurationHash ||
        (after &&
          before.layerIdentity &&
          after.layerIdentity &&
          before.layerIdentity !== after.layerIdentity));
    const same = before && after && before.contentHash === after.contentHash;
    if (same && !changedConfig) {
      if (recordFingerprint(before.records) !== recordFingerprint(after.records)) {
        const lineage = matchRoutingSegments(before.records, after.records);
        diagnostics.push({
          identity: id,
          classification: "routing_regeneration",
          matchedSegments: lineage.filter((r) => r.resolved).length,
          unresolvedSegments: lineage.filter((r) => !r.resolved).length,
          message:
            "Unchanged upstream feature; existing routing and corrections retained. Segment matches require ancestry and exact endpoint identities.",
        });
      }
      continue;
    }
    const reasons = [];
    let classification = !after ? "verified_removal" : "upstream_change";
    if (changedConfig) {
      classification = "configuration_change";
      if (!after)
        reasons.push(
          "Boundary, mapping, or importer changed. Missing records cannot establish source deletion.",
        );
    }
    if (!o.stable) {
      classification = "unresolved_identity";
      reasons.push("A stable native identifier is required.");
    }
    if (before && after && before.records.length && !after.records.length) {
      classification = "scope_change";
      reasons.push(
        "The upstream object still exists but is outside the mapped scope or classification.",
      );
    }
    if (before?.legacy) {
      classification = "unresolved_identity";
      reasons.push(
        "Legacy provenance was recovered from exact identities only; an accepted upstream receipt is still required.",
      );
    }
    if (
      !before &&
      after &&
      after.records.some((r) => r.entity === "feature" && current.has(r.id))
    ) {
      classification = "unresolved_identity";
      reasons.push(
        "Legacy accepted observation is unavailable. Recover exact provenance before accepting.",
      );
    }
    if (!after) {
      const counts = partitions.get(partition(o));
      if (counts.missing / counts.before > 0.2)
        diagnostics.push({ identity: id, classification: "partition_loss", ...counts });
      if (evidence.status === "present") {
        classification = "scope_change";
        reasons.push("The original object still exists outside this extract or classification.");
      } else if (
        evidence.status !== "verified" ||
        evidence.contentHash !== before.contentHash ||
        evidence.configurationHash !== receipt.configurationHash
      )
        reasons.push("Absence at the original source has not been independently verified.");
      if (o.provider === "file" && !completeReplacement)
        reasons.push(
          "This upload is additions and changes only. Declare a complete replacement to review removals.",
        );
    }
    const previousRecords = recordMap(before?.records);
    const incoming = recordMap(after?.records);
    const members = [];
    for (const key of new Set([...previousRecords.keys(), ...incoming.keys()])) {
      const was = current.get(key),
        expected = previousRecords.get(key),
        will = incoming.get(key);
      if (
        expected &&
        (expected.hash !== was?.hash ||
          expected.source !== was?.source ||
          hash(expected.payload) !== hash(was?.payload || null))
      )
        reasons.push(
          "Accepted records changed since the observation; reconcile the later correction.",
        );
      if (was?.hash !== will?.hash) members.push(recordChange(was, will));
    }
    // Legacy candidates are inspectable, but never remove derived records whose
    // ancestry wasn't retained. In particular LASU's regenerated edges aren't paths.
    if ((!before || before.legacy) && after) {
      members.length = 0;
      for (const r of after.records) {
        const was = current.get(r.id);
        if (classification === "unresolved_identity" && ["edge", "node"].includes(r.entity))
          continue;
        if (was?.hash !== r.hash) members.push(recordChange(was, r));
      }
    }
    if (!members.length && !changedConfig) continue;
    candidates.push({
      identity: id,
      observation: after ? { ...after, configurationHash: receipt.configurationHash } : null,
      accepted: before || null,
      classification,
      evidence,
      reasons: [...new Set(reasons)],
      members,
    });
  }
  // Union dependency-connected feature changes. Unchanged shared nodes remain
  // owned by every observation, and are not deleted while any owner survives.
  const retained = new Set([...next.values()].flatMap((o) => o.records.map((r) => r.id)));
  for (const c of candidates) c.members = c.members.filter((m) => m.after || !retained.has(m.id));
  const parents = candidates.map((_, i) => i),
    owners = new Map();
  const root = (i) => {
    while (parents[i] !== i) {
      parents[i] = parents[parents[i]];
      i = parents[i];
    }
    return i;
  };
  candidates.forEach((c, i) => {
    for (const m of c.members) {
      const keys = [m.id];
      for (const r of [m.before, m.after]) keys.push(...routingDependencies(r));
      for (const key of keys) {
        if (owners.has(key)) parents[root(i)] = root(owners.get(key));
        else owners.set(key, i);
      }
    }
  });
  const components = new Map();
  candidates.forEach((c, i) => {
    const r = root(i);
    components.set(r, [...(components.get(r) || []), c]);
  });
  const groups = [];
  for (const features of components.values()) {
    const unique = new Map(),
      reasons = features.flatMap((f) => f.reasons);
    for (const f of features)
      for (const m of f.members) {
        if (unique.has(m.id) && hash(unique.get(m.id)) !== hash(m))
          reasons.push("Conflicting changes to a shared dependency.");
        unique.set(m.id, m);
      }
    const members = [...unique.values()].sort((a, b) => a.id.localeCompare(b.id));
    if (!members.length) continue;
    if (
      members.some(
        (m) =>
          heldDependencies.has(m.id) ||
          [m.before, m.after].some((r) =>
            routingDependencies(r).some((dependency) => heldDependencies.has(dependency)),
          ),
      )
    )
      reasons.push(
        "This group shares dependencies with an incomplete collection. Complete that collection before accepting.",
      );
    const changed = new Map(members.map((m) => [m.id, m.after]));
    const exists = (id) => (changed.has(id) ? !!changed.get(id) : current.has(id));
    for (const m of members)
      if (routingDependencies(m.after).some((dependency) => !exists(dependency)))
        reasons.push("Resulting routing graph has missing endpoints.");
    // Existing edges referencing a removed node are checked by the transactional
    // DB graph guard. Avoid copying the whole campus once per feature here.
    if (members.length > MAX_GROUP_RECORDS)
      reasons.push(
        `This connected group exceeds ${MAX_GROUP_RECORDS} records. Split the source into independent collections and check again; no partial group can be applied.`,
      );
    const primary = features
      .flatMap((f) => (f.observation || f.accepted).records)
      .find((r) => r.entity === "feature");
    let representative =
      members.find((m) => (m.after || m.before).entity === "feature") ||
      (primary
        ? recordChange(
            current.get(primary.id),
            features.some((f) => f.observation?.records.some((r) => r.id === primary.id))
              ? primary
              : null,
          )
        : members[0]);
    // A stable upstream feature may receive new derived IDs after remapping.
    // Keep its review anchored to the old record and describe a modification.
    const migrated = features.find(
      (f) =>
        f.accepted?.records.some((r) => r.entity === "feature") &&
        f.observation?.records.some((r) => r.entity === "feature"),
    );
    if (migrated) {
      const was = migrated.accepted.records.find((r) => r.entity === "feature");
      const will = migrated.observation.records.find((r) => r.entity === "feature");
      if (was.id !== will.id)
        representative = { ...recordChange(current.get(was.id), will), id: was.id };
    }
    const id = hash({
      features: features
        .map((f) => [f.identity, f.accepted?.contentHash, f.observation?.contentHash])
        .sort(),
      members,
      configuration: receipt.configurationHash,
    });
    groups.push({
      id,
      source_id: representative.id,
      before: representative.before,
      after: representative.after,
      base_hash: representative.base_hash,
      kind: !representative.before ? "add" : !representative.after ? "remove" : "modify",
      summary: `${features.length} source feature(s), ${members.length} dependent records`,
      classification: [...new Set(features.map((f) => f.classification))].join(","),
      verification: features.some((f) => !f.observation && f.evidence.status !== "verified")
        ? "unverified"
        : "verified",
      blockingReasons: [...new Set(reasons)],
      eligible: reasons.length === 0,
      features,
      members,
    });
  }
  return {
    version: COMPARATOR_VERSION,
    groups,
    observations: [...next.values()],
    diagnostics,
    successfulCollections: (receipt.collections || [])
      .filter((c) => c.complete)
      .map((c) => c.identity),
  };
}

// Conservative legacy adapter. Only source shapes establish feature identities;
// graph IDs and proximity never invent upstream objects or deletion candidates.
export function legacyObservations(records) {
  const nodes = recordMap(records.filter((r) => r.entity === "node"));
  const edges = new Map();
  for (const r of records)
    if (r.entity === "edge") {
      const key = r.payload.sourceId;
      edges.set(key, [...(edges.get(key) || []), r]);
    }
  return records
    .filter(
      (r) =>
        r.entity === "feature" && /^(osm|arcgis|overture):/.test(r.payload.properties?.id || ""),
    )
    .map((r) => {
      const id = r.payload.properties.id,
        provider = id.split(":")[0],
        linked = edges.get(id) || [];
      const dependencies = [...new Set(linked.flatMap((e) => [e.payload.from, e.payload.to]))]
        .map((id) => nodes.get("node:" + id))
        .filter(Boolean);
      return {
        provider,
        collection: `${provider}:${r.payload.properties.kind || "feature"}`,
        nativeId: id.slice(provider.length + 1),
        featureType: r.payload.properties.kind || "feature",
        stable: true,
        content: r.payload,
        records: [r, ...linked, ...dependencies],
      };
    });
}

export function attachDerivedRecords(upstream, records) {
  const byRoot = new Map(),
    nodes = recordMap(records.filter((r) => r.entity === "node"));
  for (const r of records) {
    const root =
      r.entity === "feature"
        ? r.payload.properties.id
        : r.entity === "edge"
          ? r.payload.sourceId
          : r.entity === "place"
            ? r.payload.buildingId || r.payload.id
            : null;
    if (root) byRoot.set(root, [...(byRoot.get(root) || []), r]);
  }
  return upstream.map((o) => {
    const derived = byRoot.get(o.rootId) || [];
    const dependencies = [...new Set(derived.flatMap(routingDependencies))]
      .map((id) => nodes.get(id))
      .filter(Boolean);
    return {
      ...o,
      featureType:
        derived.find((r) => r.entity === "feature")?.payload.properties.kind ||
        derived[0]?.entity ||
        "unmapped",
      records: [...derived, ...dependencies],
    };
  });
}
