import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { db, hash } from "./cloud.mjs";
import {
  compareObservations,
  identityOf,
  legacyObservations,
  COMPARATOR_VERSION,
} from "./source-comparison.mjs";
import { verifyMissing } from "./source-verification.mjs";
import { confirmOverture } from "./source-snapshot-confirmation.mjs";

export function batches(values) {
  const result = [];
  let batch = [],
    bytes = 2,
    offset = 0;
  for (const value of values) {
    const size = Buffer.byteLength(JSON.stringify(value)) + 2;
    if (size > 384 * 1024)
      throw new Error(
        "Source evidence record exceeds 384 KiB. Split or simplify this source; nothing was queued.",
      );
    if (batch.length && (batch.length === 100 || bytes + size > 384 * 1024)) {
      result.push({ offset, records: batch });
      offset += batch.length;
      batch = [];
      bytes = 2;
    }
    batch.push(value);
    bytes += size;
  }
  if (batch.length) result.push({ offset, records: batch });
  return result;
}
// Keep independently reviewable groups available when one source feature exceeds
// a request limit. Only its identity and hashes are retained in the staged view;
// it is explicitly blocked, and the original import artifact stays referenced.
export function boundedComparison(result) {
  const tooLarge = (value) => Buffer.byteLength(JSON.stringify(value)) > 380 * 1024;
  const stub = (r) =>
    r && { id: r.id, entity: r.entity, source: r.source, hash: r.hash, evidenceUnavailable: true };
  const omitted = new Set();
  result.observations = result.observations.map((o) => {
    let changed = false;
    const records = o.records.map((r) => {
      if (!tooLarge(r)) return r;
      changed = true;
      return stub(r);
    });
    const { records: _records, ...header } = o;
    const largeHeader = tooLarge(header);
    if (largeHeader || changed) omitted.add(o.identity);
    return { ...o, records, ...(largeHeader ? { content: null, evidenceUnavailable: true } : {}) };
  });
  result.groups = result.groups.map((g) => {
    let blocked = g.features.some((f) => omitted.has(f.identity));
    const members = g.members.map((m) => {
      if (!tooLarge({ ...m, groupId: g.id })) return m;
      blocked = true;
      return { ...m, before: stub(m.before), after: stub(m.after) };
    });
    const { members: _members, features, ...header } = g;
    const largeHeader =
      tooLarge(header) ||
      tooLarge(
        features.map((f) => ({
          identity: f.identity,
          evidence: f.evidence,
          observation: f.observation && { collection: f.observation.collection },
          accepted: f.accepted && { collection: f.accepted.collection },
        })),
      );
    blocked ||= largeHeader;
    if (!blocked) return g;
    const message =
      "Evidence exceeds the bounded review request. Split or simplify the affected source features and check again; this group cannot be accepted.";
    result.diagnostics.push({ groupId: g.id, classification: "oversized_group", message });
    const scopes = [...new Set(features.map((f) => (f.observation || f.accepted).collection))];
    return {
      ...g,
      members,
      eligible: false,
      blockingReasons: [...g.blockingReasons, message],
      ...(largeHeader
        ? {
            before: stub(g.before),
            after: stub(g.after),
            features: scopes.map((collection) => ({
              identity: "oversized:" + collection,
              classification: g.classification,
              evidence: { status: "unverified" },
              observation: { collection },
              accepted: null,
            })),
            omittedFeatureCount: features.length,
          }
        : {}),
    };
  });
  return result;
}
export async function runSourceCheck(input, transport = db, verify = verifyMissing) {
  const database =
    transport !== db
      ? transport
      : async (...args) => {
          for (let attempt = 0; ; attempt++) {
            try {
              return await db(...args);
            } catch (error) {
              if (
                attempt >= 2 ||
                !(
                  error.name === "TimeoutError" ||
                  error instanceof TypeError ||
                  error.status === 429 ||
                  error.status >= 500 ||
                  ["55P03", "57014"].includes(error.code)
                )
              )
                throw error;
              await delay(500 * (attempt + 1));
            }
          }
        };
  const run_id = input.runId || randomUUID(),
    run_token = input.token || randomUUID();
  const receipt = {
    ...input.receipt,
    completeReplacement: input.completeReplacement === true,
    comparatorVersion: COMPARATOR_VERSION,
  };
  if (!receipt.retrievedAt || !receipt.contentHash || !receipt.configurationHash)
    throw new Error(
      "The original retrieval receipt is required; cached data cannot invent a retrieval time",
    );
  const identity = { run_id, run_token };
  const begun = await database("rpc/source_check_begin", "POST", {
    ...identity,
    source_identity: input.sourceKey,
    check_receipt: receipt,
    import_identity: input.importId || null,
  });
  if (["shadow", "complete"].includes(begun.status)) return begun;
  try {
    async function read(part) {
      const all = [];
      for (let offset = 0; offset < 300000; offset += 1000) {
        const page = await database("rpc/source_check_baseline", "POST", {
          ...identity,
          part,
          page_offset: offset,
        });
        all.push(...page);
        if (page.length < 1000) return all;
      }
      throw new Error("Baseline exceeds its bounded comparison limit");
    }
    const [records, accepted, savedEvidence] = await Promise.all([
      read("records"),
      read("observations"),
      read("evidence"),
    ]);
    if (input.sourceKey === "lasu-enrichment") {
      const retained = new Set(accepted.map((o) => o.identity));
      const byRoot = new Map(input.observations.map((o) => [o.rootId, o]));
      for (const original of legacyObservations(records)) {
        const recovered = byRoot.get(original.records[0]?.payload.properties.id);
        const o = recovered
          ? {
              ...original,
              provider: recovered.provider,
              collection: recovered.collection,
              nativeId: recovered.nativeId,
            }
          : original;
        if (!retained.has(identityOf(o)))
          accepted.push({
            ...o,
            identity: identityOf(o),
            contentHash: hash(o.content),
            legacy: true,
          });
      }
    }
    const observed = new Set(input.observations.map(identityOf));
    const verification = Object.fromEntries(savedEvidence.map((e) => [e.identity, e.value]));
    // Sequential provider requests avoid creating a load spike on public services.
    const confirmations = new Map();
    const verificationDeadline = Date.now() + 600000;
    let verifiedRequests = 0;
    let pendingEvidence = [];
    async function saveEvidence() {
      for (const chunk of batches(pendingEvidence))
        await database("rpc/source_check_evidence", "POST", {
          ...identity,
          records: chunk.records,
        });
      pendingEvidence = [];
    }
    for (const o of accepted)
      if (!observed.has(o.identity)) {
        if (verification[o.identity]) continue;
        if (o.legacy) {
          verification[o.identity] = {
            status: "unverified",
            reason: "Legacy upstream receipt unavailable",
          };
          continue;
        }
        // A declared file replacement needs no request; one Overture confirmation
        // verifies the entire collection. Bound individual public-service calls.
        if (
          Date.now() > verificationDeadline ||
          (!["file", "overture"].includes(o.provider) && verifiedRequests++ >= 300)
        ) {
          verification[o.identity] = {
            status: "unverified",
            reason:
              "Verification budget reached. This check is incomplete for this identity; narrow the source scope or retry a smaller collection.",
          };
        } else if (o.provider === "overture" && verify === verifyMissing) {
          if (!confirmations.has(o.collection))
            confirmations.set(o.collection, await confirmOverture(o.collection, receipt));
          const confirmation = confirmations.get(o.collection);
          verification[o.identity] = {
            ...confirmation.receipt,
            reason: confirmation.reason,
            contentHash: o.contentHash,
            configurationHash: receipt.configurationHash,
            status:
              confirmation.status === "verified"
                ? confirmation.identities.has(o.nativeId)
                  ? "present"
                  : "verified"
                : "unverified",
          };
        } else verification[o.identity] = await verify(o, receipt);
        pendingEvidence.push({ identity: o.identity, value: verification[o.identity] });
        if (pendingEvidence.length >= 100) await saveEvidence();
      }
    await saveEvidence();
    for (const chunk of batches(
      Object.entries(verification).map(([identity, value]) => ({ identity, value })),
    ))
      await database("rpc/source_check_evidence", "POST", { ...identity, records: chunk.records });
    const result = boundedComparison(
      compareObservations({
        accepted,
        records,
        observations: input.observations,
        receipt,
        verification,
        completeReplacement: input.completeReplacement,
      }),
    );
    const parts = {
      observation: result.observations.map(({ records, ...o }) => ({
        ...o,
        recordCount: records.length,
        configurationHash: receipt.configurationHash,
      })),
      record: result.observations.flatMap((o) =>
        o.records.map((record) => ({ identity: o.identity, record })),
      ),
      group: result.groups.map(({ members, features, ...g }) => ({
        ...g,
        features: features.map((f) => ({
          identity: f.identity,
          classification: f.classification,
          evidence: f.evidence,
          observation: f.observation
            ? { identity: f.identity, collection: f.observation.collection }
            : null,
          accepted: f.accepted
            ? {
                identity: f.identity,
                collection: f.accepted.collection,
                contentHash: f.accepted.contentHash,
              }
            : null,
        })),
        memberCount: members.length,
      })),
      member: result.groups.flatMap((g) => g.members.map((m) => ({ ...m, groupId: g.id }))),
    };
    const staged = Object.entries(parts).map(([part, values]) => [part, batches(values)]);
    if (Object.values(parts).some((values) => values.length > 300000))
      throw new Error(
        "Check exceeds the bounded staging limit. Split the source into independent collections.",
      );
    for (const [part, chunks] of staged)
      for (const chunk of chunks)
        await database("rpc/source_check_stage", "POST", {
          ...identity,
          part,
          start_offset: chunk.offset,
          records: chunk.records,
        });
    const findings = result.groups
      .filter((g) => !g.eligible)
      .map((g) => ({
        groupId: g.id,
        classification: g.classification,
        message: g.blockingReasons.join(" "),
      }));
    // Finalization has a 60-second SQL budget. A shorter HTTP deadline can
    // abandon a successful transaction and exhaust retries against its lock.
    return await database(
      "rpc/source_check_finish",
      "POST",
      {
        ...identity,
        counts: Object.fromEntries(
          Object.entries(parts).map(([key, values]) => [key, values.length]),
        ),
        diagnostic_summary: [...findings, ...result.diagnostics].slice(0, 500),
      },
      "return=representation",
      75000,
    );
  } catch (error) {
    await database("rpc/source_check_interrupted", "POST", {
      ...identity,
      reason: error.message,
    }).catch(() => {});
    throw error;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = JSON.parse(await fs.readFile(process.argv[2], "utf8"));
  try {
    if (process.argv.includes("--preview")) {
      const result = compareObservations({
        records: input.expectedSources,
        observations: input.observations,
        receipt: input.receipt,
      });
      input.proposals = result.groups.map(({ members, features, ...g }) => ({
        ...g,
        dependencyCount: members.length,
        featureCount: features.length,
      }));
      input.summary.counts = {
        ...input.summary.counts,
        added: result.groups.filter((g) => g.kind === "add").length,
        modified: result.groups.filter((g) => g.kind === "modify").length,
        removed: result.groups.filter((g) => g.kind === "remove").length,
      };
      await fs.writeFile(process.argv[2], JSON.stringify(input));
    } else console.log(JSON.stringify(await runSourceCheck(input)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
