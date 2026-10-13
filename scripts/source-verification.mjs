import https from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { hash, evidenceHash } from "./cloud.mjs";

export function isPublicIPv4(address) {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}

// Independent verification is always uncached, bounded, and outside the campus
// spatial query. Pin the checked public address for the actual HTTPS connection.
export async function publicJson(url) {
  const u = new URL(url);
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443"))
    throw new Error("Verification requires a public HTTPS endpoint");
  const addresses = (await lookup(u.hostname, { all: true })).filter((a) => isIP(a.address) === 4);
  if (!addresses.length || addresses.some((a) => !isPublicIPv4(a.address)))
    throw new Error("Endpoint could not be verified as public IPv4");
  return new Promise((resolve, reject) => {
    const request = https.get(
      u,
      {
        signal: AbortSignal.timeout(20000),
        headers: {
          "Cache-Control": "no-cache, no-store",
          "User-Agent": "TurnRight-source-verification/1",
          Accept: "application/json",
        },
        lookup: (_host, options, done) =>
          options.all
            ? done(null, [addresses[0]])
            : done(null, addresses[0].address, addresses[0].family),
      },
      (response) => {
        const chunks = [];
        let bytes = 0;
        response.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > 8 * 1024 * 1024)
            request.destroy(new Error("Verification response exceeds 8 MiB"));
          else chunks.push(chunk);
        });
        response.on("end", () => {
          const status = response.statusCode;
          if (![200, 404, 410].includes(status))
            return reject(new Error(`Verification failed (${status}); no deletion inferred`));
          try {
            resolve({
              status,
              data: status === 200 ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null,
            });
          } catch {
            reject(new Error("Verification returned invalid JSON"));
          }
        });
        response.on("error", reject);
      },
    );
    request.setTimeout(20000, () => request.destroy(new Error("Verification timed out")));
    request.on("error", reject);
  });
}
export async function verifyMissing(observation, receipt, get = publicJson) {
  const evidence = {
    status: "unverified",
    checkedAt: new Date().toISOString(),
    contentHash: observation.contentHash,
    configurationHash: receipt.configurationHash,
    method: "unavailable",
  };
  try {
    if (observation.provider === "osm") {
      const match = /^(?:osm:)?(node|way|relation)[:/](\d+)$/.exec(observation.nativeId);
      if (!match) return { ...evidence, reason: "Original OSM object identity is unavailable" };
      const [, type, id] = match,
        url = `https://api.openstreetmap.org/api/0.6/${type}/${id}`;
      const current = await get(url + ".json");
      if (
        current.status === 200 &&
        current.data?.elements?.some(
          (e) => e.type === type && String(e.id) === id && e.visible !== false,
        )
      )
        return { ...evidence, status: "present", url, method: "osm-current" };
      const history = await get(url + "/history.json");
      const versions =
        history.data?.elements?.filter(
          (e) => e.type === type && String(e.id) === id && Number.isInteger(e.version),
        ) || [];
      versions.sort((a, b) => b.version - a.version);
      const latest = versions[0];
      if (
        history.status === 200 &&
        latest?.visible === false &&
        latest.version >= (observation.providerVersion || 1)
      )
        return {
          ...evidence,
          status: "verified",
          method: "osm-history",
          url: url + "/history.json",
          revision: latest.version,
          object: {
            type: latest.type,
            id: latest.id,
            version: latest.version,
            visible: false,
            changeset: latest.changeset,
            timestamp: latest.timestamp,
            user: latest.user,
          },
          responseHash: evidenceHash(history.data),
        };
      return {
        ...evidence,
        method: "osm-history",
        url,
        reason: "Current status and retained history do not prove removal",
      };
    }
    if (observation.provider === "arcgis" && observation.queryUrl && observation.layerIdentity) {
      const url = new URL(observation.queryUrl);
      url.search = "";
      url.hash = "";
      const before = await get(url + "?f=json");
      const identity = (m) =>
        hash({
          id: m.id ?? null,
          serviceItemId: m.serviceItemId ?? null,
          fields: m.fields ?? null,
          objectIdField: m.objectIdField || m.objectIdFieldName || null,
        });
      if (
        before.status !== 200 ||
        identity(before.data) !== observation.layerIdentity ||
        !before.data.capabilities?.includes("Query")
      )
        return { ...evidence, reason: "Layer identity or query capabilities changed" };
      const query = new URL(url.toString().replace(/\/$/, "") + "/query");
      query.search = new URLSearchParams({
        f: "json",
        objectIds: String(observation.nativeId),
        returnIdsOnly: "true",
        where: "1=1",
      });
      const result = await get(query);
      const after = await get(url + "?f=json");
      if (
        result.status !== 200 ||
        result.data.error ||
        result.data.exceededTransferLimit ||
        !Array.isArray(result.data.objectIds) ||
        after.status !== 200 ||
        identity(after.data) !== identity(before.data) ||
        hash(before.data.editingInfo || null) !== hash(after.data.editingInfo || null)
      )
        return {
          ...evidence,
          reason: "Independent query was incomplete or layer changed during verification",
        };
      return {
        ...evidence,
        status: result.data.objectIds.length ? "present" : "verified",
        method: "arcgis-object-id",
        url: query.toString(),
        responseHash: evidenceHash(result.data),
        layerIdentity: observation.layerIdentity,
        providerRevision: before.data.editingInfo || null,
        response: { objectIds: result.data.objectIds },
      };
    }
    if (observation.provider === "arcgis" && observation.embedded && observation.layerIdentity) {
      const { itemId, entryId, layerId, nativeField } = observation.embedded;
      if (!/^[a-f0-9]{32}$/i.test(itemId)) return evidence;
      const base =
        observation.embedded.itemUrl ||
        `https://www.arcgis.com/sharing/rest/content/items/${itemId}`;
      const item = new URL(base);
      if (
        !item.pathname.endsWith("/sharing/rest/content/items/" + itemId) ||
        item.search ||
        item.hash
      )
        return { ...evidence, reason: "Original ArcGIS item URL does not match its identity" };
      const url = `${base}/data?f=json&turnrightVerification=${Date.now()}`;
      const response = await get(url);
      const entry = response.data?.operationalLayers?.find((e) => String(e.id) === String(entryId));
      const layer = entry?.featureCollection?.layers?.find(
        (l, i) => String(l.layerDefinition?.id ?? i) === String(layerId),
      );
      const features = layer?.featureSet?.features;
      const candidate = receipt.collections?.find((c) => c.identity === observation.collection);
      if (
        response.status !== 200 ||
        !Array.isArray(features) ||
        layer.featureSet.exceededTransferLimit ||
        hash(layer.layerDefinition || {}) !== observation.layerIdentity ||
        !candidate?.complete ||
        evidenceHash(features) !== candidate.contentHash
      )
        return {
          ...evidence,
          method: "arcgis-embedded",
          reason:
            "Independent embedded collection is incomplete, changed, or has a different schema",
        };
      const ids = features.map((f) => f.attributes?.[nativeField]);
      if (ids.some((id) => id == null) || new Set(ids.map(String)).size !== ids.length)
        return { ...evidence, reason: "Embedded collection lacks stable unique IDs" };
      return {
        ...evidence,
        status: ids.some((id) => String(id) === observation.nativeId) ? "present" : "verified",
        method: "arcgis-embedded",
        url,
        responseHash: evidenceHash(features),
      };
    }
    if (
      observation.provider === "file" &&
      receipt.completeReplacement &&
      observation.stable &&
      receipt.collections?.some((c) => c.identity === observation.collection && c.complete)
    ) {
      return {
        ...evidence,
        status: "verified",
        method: "declared-complete-file",
        responseHash: receipt.contentHash,
      };
    }
    // Complete snapshots cannot be vouched for by their own missing IDs. The
    // second receipt must describe a separate uncached retrieval of this collection.
    const confirmation = receipt.confirmations?.find(
      (c) => c.collection === observation.collection,
    );
    if (
      confirmation?.complete &&
      confirmation.uncached &&
      confirmation.retrievedAt !== receipt.retrievedAt &&
      confirmation.configurationHash === receipt.configurationHash &&
      confirmation.providerRevision === receipt.providerRevision &&
      Array.isArray(confirmation.identities)
    ) {
      return {
        ...evidence,
        status: confirmation.identities.includes(observation.nativeId) ? "present" : "verified",
        method: "independent-snapshot",
        confirmation,
      };
    }
    return { ...evidence, reason: "An independent complete snapshot is required" };
  } catch (error) {
    return { ...evidence, reason: error.message };
  }
}
