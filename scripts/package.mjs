import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'web/public');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const input = process.env.CAMPUS_INPUT || 'data/seed/campus.json';
const data = JSON.parse(await fs.readFile(path.join(root, input), 'utf8'));
if (data.schemaVersion !== 1 || !data.graph?.edges?.length) throw new Error('No valid campus graph to package');
const audioDir = path.join(root, 'data/audio');
const files = (await fs.readdir(audioDir)).filter(f => f.endsWith('.wav')).sort();
if (files.length < 15) throw new Error('Offline audio clips missing. See data/audio/README.md.');
const assets = [], audio = {};
async function asset(url, bytes, contentType) {
  const target = path.join(publicDir, decodeURIComponent(url));
  await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, bytes);
  assets.push({ url, sha256: hash(bytes), bytes: bytes.length, contentType });
}
for (const file of files) {
  const bytes = await fs.readFile(path.join(audioDir, file));
  const url = `/audio/${hash(bytes).slice(0, 16)}/${file}`;
  await asset(url, bytes, 'audio/wav'); audio[file.replace('.wav', '')] = url;
}
const glyph = await fs.readFile(path.join(publicDir, 'glyphs/Open Sans Semibold/0-255.pbf'));
assets.push({ url: '/glyphs/Open%20Sans%20Semibold/0-255.pbf', sha256: hash(glyph), bytes: glyph.length, contentType: 'application/x-protobuf' });
const version = 'lasu-' + hash(JSON.stringify({ data, audio })).slice(0, 12);
data.version = version;
const dataUrl = `/packages/${version}/campus.json`;
await asset(dataUrl, Buffer.from(JSON.stringify(data)), 'application/json');
await asset(`/packages/${version}/audio.json`, Buffer.from(JSON.stringify(audio)), 'application/json');
const manifest = { schemaVersion: 1, version, createdAt: data.createdAt, summary: process.env.RELEASE_SUMMARY || 'LASU Ojo campus · source-derived map and walking approaches', dataUrl, bytes: assets.reduce((sum, a) => sum + a.bytes, 0), assets };
const manifestJson = JSON.stringify(manifest, null, 2);
await fs.writeFile(path.join(publicDir, 'packages', version, 'manifest.json'), manifestJson);
await fs.writeFile(path.join(publicDir, 'packages/latest.json'), manifestJson);
await fs.writeFile(path.join(root, 'data/coverage-report.json'), JSON.stringify(data.coverage, null, 2));
console.log(`Packaged ${version}: ${(manifest.bytes / 1048576).toFixed(2)} MB; ${data.places.length} places, ${data.graph.edges.length} directed path segments.`);
