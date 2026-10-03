// node --import tsx scripts/benchmark-campus-processing.mjs PACKAGE_DIR OUTPUT_JSON
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { displayGeometry, buildingPlace } from '../src/map-display.ts';
import { structuralIssues } from '../src/validation.ts';
import { exposedRoads } from '../src/road-surfaces.ts';
const [root, output] = process.argv.slice(2);
if (!root || !output) throw Error('Provide a published package directory and output JSON');
const sample = (fn, n = 7) => Array.from({ length: n }, () => {
  const start = performance.now(); fn(); return performance.now() - start;
});
const reports = [];
for (const entry of JSON.parse(fs.readFileSync(path.join(root, 'campuses.json'), 'utf8')).campuses) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, entry.manifestUrl.replace('/packages/', '')), 'utf8'));
  const text = fs.readFileSync(path.join(root, manifest.dataUrl.replace('/packages/', '')), 'utf8');
  const data = JSON.parse(text), display = displayGeometry(data.map, data.visuals);
  const buildings = data.map.features.filter((f) => f.properties?.kind === 'building');
  const paths = display.features.filter((f) => f.properties?.kind === 'path');
  reports.push({
    version: data.version, coreHash: createHash('sha256').update(text).digest('hex'),
    bytes: Buffer.byteLength(text), features: data.map.features.length, buildings: buildings.length, paths: paths.length,
    allGeometryBytes: Buffer.byteLength(JSON.stringify(display)),
    pathOnlyBytes: Buffer.byteLength(JSON.stringify({ type: 'FeatureCollection', features: paths })),
    parseMs: sample(() => JSON.parse(text)), structuralMs: sample(() => structuralIssues(data)),
    displayMs: sample(() => displayGeometry(data.map, data.visuals)),
    emptySelectionMs: sample(() => buildings.find((f) => buildingPlace(data, f)?.id === '')),
    placeSelectionMs: sample(() => data.places.forEach((p) => buildings.find((f) => buildingPlace(data, f)?.id === p.id))),
    roadClippingMs: sample(() => exposedRoads({ ...display }), 3),
  });
}
fs.writeFileSync(output, JSON.stringify({ runtime: process.version, checkedAt: new Date().toISOString(), reports }, null, 2));
console.log(`Recorded ${reports.length} published campus processing profiles in ${output}`);
