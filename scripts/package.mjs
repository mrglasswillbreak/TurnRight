import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { packageVisuals } from "./visual-package.mjs";
import { publicCampus } from './public-campus.mjs';
import { packageGlyphs } from './package-glyphs.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "web/public");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const input = process.env.CAMPUS_INPUT || "data/seed/campus.json";
const data = publicCampus(JSON.parse(await fs.readFile(path.join(root, input), "utf8")));
if (![1, 2].includes(data.schemaVersion) || !data.graph?.edges?.length)
  throw new Error("No valid campus graph to package");
const audioDir = path.join(root, "data/audio");
const files = (await fs.readdir(audioDir)).filter((f) => f.endsWith(".wav")).sort();
if (files.length < 15) throw new Error("Offline audio clips missing. See data/audio/README.md.");
const assets = [],
  audio = {};
async function asset(url, bytes, contentType) {
  const target = path.join(publicDir, decodeURIComponent(url));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes);
  assets.push({ url, sha256: hash(bytes), bytes: bytes.length, contentType });
}
for (const file of files) {
  const bytes = await fs.readFile(path.join(audioDir, file));
  const url = `/audio/${hash(bytes).slice(0, 16)}/${file}`;
  await asset(url, bytes, "audio/wav");
  audio[file.replace(".wav", "")] = url;
}
await packageGlyphs(data, publicDir, asset);
const visuals = await packageVisuals(
  path.resolve(root, process.env.VISUALS_INPUT || "data/visuals"),
  asset,
);
if (process.env.VISUALS_INPUT && !visuals)
  throw new Error("The rebuilt visual catalogue is missing; release packaging stopped.");
if (visuals) data.visuals = visuals.catalogue;
const version = "lasu-" + hash(JSON.stringify({ data, audio })).slice(0, 12);
data.version = version;
const dataUrl = `/packages/${version}/campus.json`;
await asset(dataUrl, Buffer.from(JSON.stringify(data)), "application/json");
await asset(
  `/packages/${version}/audio.json`,
  Buffer.from(JSON.stringify(audio)),
  "application/json",
);
const manifest = {
  schemaVersion: data.driving ? 2 : 1,
  version,
  createdAt: data.createdAt,
  summary:
    process.env.RELEASE_SUMMARY || "LASU Ojo campus · source-derived map and walking approaches",
  dataUrl,
  bytes: assets.reduce((sum, a) => sum + a.bytes, 0),
  assets,
  ...(visuals ? { visuals: visuals.manifest } : {}),
};
const manifestJson = JSON.stringify(manifest, null, 2);
await fs.writeFile(path.join(publicDir, "packages", version, "manifest.json"), manifestJson);
await fs.writeFile(path.join(publicDir, "packages/latest.json"), manifestJson);
await fs.writeFile(
  path.join(root, "data/coverage-report.json"),
  JSON.stringify(data.coverage, null, 2),
);
console.log(
  `Packaged ${version}: ${(manifest.bytes / 1048576).toFixed(2)} MB; ${data.places.length} places, ${data.graph.edges.length} directed path segments.`,
);
