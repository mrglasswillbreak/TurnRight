import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { syntheticPhotoEvidence } from "./photo-source.mjs";

const root = path.resolve(import.meta.dirname, "..");
const catalogue = JSON.parse(
  await fs.readFile(path.join(root, "data/photos/catalogue.json"), "utf8"),
);
const decisions = JSON.parse(
  await fs.readFile(path.join(root, "data/photos/decisions.json"), "utf8"),
);
const inventory = JSON.parse(
  await fs.readFile(path.join(root, "data/raw/photo-research/inventory.json"), "utf8"),
);
const file = path.join(root, "data/photos/research/source-metadata-audit.json");
const previous = await fs
  .readFile(file, "utf8")
  .then(JSON.parse)
  .catch((e) => {
    if (e.code === "ENOENT") return { pages: [] };
    throw e;
  });
const ids = [
  ...new Set([
    ...catalogue.map((p) => p.id.replace(/^commons:/, "")),
    ...inventory.pages
      .filter((p) => decisions[p.title]?.status === "included")
      .map((p) => String(p.pageid)),
    ...previous.pages.map((p) => String(p.pageid)),
  ]),
];
const pages = [],
  receipts = [];
for (let i = 0; i < ids.length; i += 20) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    prop: "imageinfo",
    pageids: ids.slice(i, i + 20).join("|"),
    iiprop: "sha1|url|metadata|commonmetadata|extmetadata",
  });
  const response = await fetch(url, {
    headers: { "User-Agent": "TurnRightCampus/1.0 (photograph source verification)" },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw Error(
      `Source audit incomplete: ${response.status}. Respect Retry-After and retry later.`,
    );
  const body = await response.text(),
    parsed = JSON.parse(body);
  if (parsed.error || !parsed.query?.pages) throw Error("Incomplete source metadata response");
  pages.push(...Object.values(parsed.query.pages));
  receipts.push({
    url: url.href,
    retrievedAt: new Date().toISOString(),
    sha256: createHash("sha256").update(body).digest("hex"),
    body,
  });
}
if (pages.length !== ids.length || pages.some((p) => !p.imageinfo?.[0]?.commonmetadata))
  throw Error("Missing original image metadata");
await fs.writeFile(
  file,
  JSON.stringify({ checkedAt: new Date().toISOString(), pages, receipts }, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    audited: pages.length,
    synthetic: pages.filter((p) => syntheticPhotoEvidence(p.imageinfo[0])).map((p) => p.title),
  }),
);
