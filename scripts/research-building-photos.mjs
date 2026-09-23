// Reproducible discovery only. This script never approves a building match or reuse rights.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "data/raw/photo-research");
await fs.mkdir(output, { recursive: true });
if (process.argv.includes("--restore-snapshot")) {
  const snapshots = JSON.parse(
    gunzipSync(
      await fs.readFile(path.join(root, "data/photos/research/commons-responses.json.gz")),
    ),
  );
  for (const [file, content] of Object.entries(snapshots)) {
    const target = path.resolve(root, file);
    if (!target.startsWith(path.join(root, "data/raw") + path.sep))
      throw Error("Invalid research snapshot path");
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }
}
const campus = JSON.parse(
  await fs.readFile(path.join(root, "data/raw/published-arrival-campus.json"), "utf8"),
);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const receipts = [];
async function query(params) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({ action: "query", format: "json", ...params });
  url.search = url.search.replaceAll("+", "%20").replaceAll("%28", "(").replaceAll("%29", ")");
  const file = sha(url.href) + ".json",
    target = path.join(output, file);
  let bytes;
  try {
    bytes = await fs.readFile(target);
  } catch {
    await new Promise((r) => setTimeout(r, 1800));
    for (let attempt = 0; attempt < 8; attempt++) {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "TurnRightCampus/1.0 (LASU Ojo offline photograph attribution research)",
        },
        signal: AbortSignal.timeout(30000),
      });
      if (response.ok) {
        bytes = Buffer.from(await response.arrayBuffer());
        break;
      }
      if (response.status !== 429 && response.status < 500)
        throw Error(`Commons ${response.status}: ${url}`);
      console.warn(`Commons ${response.status}; retry ${attempt + 1}`);
      await new Promise((r) =>
        setTimeout(
          r,
          Math.max(5000 * (attempt + 1), Number(response.headers.get("retry-after") || 0) * 1000),
        ),
      );
    }
    if (!bytes) throw Error(`Incomplete Commons download: ${url}`);
    const body = JSON.parse(bytes);
    if (body.error) throw Error(JSON.stringify(body.error));
    await fs.writeFile(target, bytes);
  }
  receipts.push({
    url: url.href,
    file: "data/raw/photo-research/" + file,
    sha256: sha(bytes),
    bytes: bytes.length,
    retrievedAt: (await fs.stat(target)).mtime.toISOString(),
  });
  return JSON.parse(bytes);
}
const category = await query({
  list: "categorymembers",
  cmtitle: "Category:Lagos_State_University",
  cmlimit: "500",
  cmtype: "file",
});
if (category.continue) throw Error("Category pagination required; discovery incomplete.");
const titles = new Set(category.query.categorymembers.map((p) => p.title));
const searchEvidence = new Map();
const prior = JSON.parse(
  await fs.readFile(path.join(root, "data/raw/building-references/index.json"), "utf8"),
);
for (const p of prior) titles.add(p.title);
const referencedTitles = new Set(titles);
function recordSearch(records) {
  for (const record of records) {
    titles.add(record.title);
    const snippets = searchEvidence.get(record.title) || [];
    snippets.push(record.snippet || "");
    searchEvidence.set(record.title, snippets);
  }
}
const buildings = campus.map.features
  .filter((f) => f.properties?.kind === "building")
  .map((f) => {
    const occupants = campus.places.filter(
      (p) =>
        p.buildingId === f.properties.id ||
        p.id === f.properties.placeId ||
        p.id === f.properties.id,
    );
    const names = [
      ...new Set(
        [
          f.properties.name,
          ...(Array.isArray(f.properties.aliases) ? f.properties.aliases : []),
          ...occupants.flatMap((p) => [p.name, ...p.aliases]),
        ].filter((n) => typeof n === "string" && n.trim() && !/^(campus )?building$/i.test(n)),
      ),
    ];
    return { id: f.properties.id, names, occupants: occupants.map((p) => p.id), searches: [] };
  });
const searchCache = new Map();
for (const b of buildings) {
  for (const name of b.names) {
    const term = name
      .replace(/LASU|Lagos State University/gi, "")
      .trim()
      .replaceAll('"', "");
    const search = `(LASU OR "Lagos State University") "${term}"`;
    let result = searchCache.get(search);
    if (!result) {
      let next = {},
        found = [];
      do {
        const page = await query({
          list: "search",
          srsearch: search,
          srnamespace: "6",
          srlimit: "50",
          ...next,
        });
        found.push(...page.query.search);
        next = page.continue;
      } while (next);
      result = { query: { search: found } };
      searchCache.set(search, result);
    }
    const found = result.query.search.map((p) => p.title);
    b.searches.push({ query: search, titles: found });
    recordSearch(result.query.search);
  }
}
for (const search of [
  '"Lagos State University"',
  "LASU Ojo building",
  "LASU library",
  "LASU Senate",
]) {
  let next = {};
  do {
    const result = await query({
      list: "search",
      srsearch: search,
      srnamespace: "6",
      srlimit: "100",
      ...next,
    });
    recordSearch(result.query.search);
    next = result.continue;
  } while (next);
}
const pages = [];
const excludedFormats = [],
  photographs = [];
for (const title of titles) {
  const context = [title, ...(searchEvidence.get(title) || [])].join(" ").replace(/<[^>]*>/g, "");
  const photograph = /\.(jpe?g|png|webp|tiff?)$/i.test(title);
  // "lasu" also occurs in Polish forest descriptions. Search hits are not building evidence.
  const campusContext =
    referencedTitles.has(title) ||
    /Lagos State University/i.test(context) ||
    /\bLASU\b/.test(context);
  if (photograph && campusContext) photographs.push(title);
  else
    excludedFormats.push({
      title,
      status: "rejected",
      reason: !photograph
        ? "Search returned a document, audio, video or other non-photograph file."
        : "Search false positive: no LASU or Lagos State University context in the returned title or description snippet.",
      snippets: searchEvidence.get(title) || [],
    });
}
// Reuse earlier verified response snapshots even when batch boundaries changed.
const cachedPages = new Map();
for (const file of await fs.readdir(output)) {
  if (!/^[a-f0-9]{64}\.json$/.test(file)) continue;
  const bytes = await fs.readFile(path.join(output, file));
  const body = JSON.parse(bytes);
  for (const page of Object.values(body.query?.pages || {})) {
    if (page.imageinfo && photographs.includes(page.title) && !cachedPages.has(page.title)) {
      cachedPages.set(page.title, page);
      receipts.push({
        file: "data/raw/photo-research/" + file,
        sha256: sha(bytes),
        bytes: bytes.length,
        retrievedAt: (await fs.stat(path.join(output, file))).mtime.toISOString(),
        kind: "cached imageinfo response",
      });
    }
  }
}
pages.push(...cachedPages.values());
const remaining = photographs.filter((title) => !cachedPages.has(title));
console.log(
  JSON.stringify({
    discovered: titles.size,
    photographs: photographs.length,
    cached: cachedPages.size,
    excluded: excludedFormats.length,
    remaining: remaining.length,
  }),
);
for (let i = 0; i < remaining.length; i += 20) {
  const result = await query({
    prop: "imageinfo",
    titles: remaining.slice(i, i + 20).join("|"),
    iiprop: "url|sha1|size|extmetadata",
    iiurlwidth: "1600",
  });
  pages.push(...Object.values(result.query.pages));
}
await fs.writeFile(
  path.join(output, "inventory.json"),
  JSON.stringify(
    {
      publishedVersion: campus.version,
      researchedAt: new Date().toISOString(),
      buildings,
      pages,
      excludedFormats,
      receipts,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    buildings: buildings.length,
    namedBuildings: buildings.filter((b) => b.names.length).length,
    searches: searchCache.size,
    candidates: pages.length,
    receipts: receipts.length,
  }),
);
