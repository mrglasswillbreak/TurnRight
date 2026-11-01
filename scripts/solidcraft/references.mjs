import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { archive, repository } from './inventory.mjs';

const inventory = JSON.parse(
  await fs.readFile(
    path.join(repository, 'data/lasu-models/inventory.json'),
    'utf8',
  ),
);
const baseline = path.join(archive, 'baseline', inventory.baselineVersion);
const audit = JSON.parse(
  await fs.readFile(
    path.join(repository, 'data/lasu-models/photo-audit.json'),
    'utf8',
  ),
);
const data = JSON.parse(
  await fs.readFile(
    path.join(baseline, 'packages', inventory.baselineVersion, 'campus.json'),
    'utf8',
  ),
);
const escape = (s) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
for (const building of inventory.buildings) {
  const directory = path.join(archive, building.slug);
  await fs.mkdir(directory, { recursive: true });
  const photos = data.photos.filter((p) => p.buildingId === building.id);
  const width = 1280,
    height = 64 + Math.ceil(photos.length / 2) * 500;
  const layers = [
    {
      input: Buffer.from(
        // Reference text passes XML escaping; every SVG attribute is a fixed layout value.
        // nosemgrep: local-runtime.semgrep-rules.javascript.lang.security.html-in-template-string
        `<svg width="1280" height="64"><text x="24" y="40" font-family="Arial" font-size="28">${escape(building.name)} — reference review</text></svg>`,
      ),
      top: 0,
      left: 0,
    },
  ];
  for (const [i, photo] of photos.entries()) {
    const rights = audit.records.find((r) => r.photoId === photo.id);
    const top = 64 + Math.floor(i / 2) * 500,
      left = (i % 2) * 640;
    layers.push({
      input: await sharp(path.join(baseline, photo.url))
        .resize(620, 440, { fit: 'contain', background: '#f5f5f3' })
        .png()
        .toBuffer(),
      left: left + 10,
      top,
    });
    layers.push({
      input: Buffer.from(
        // Photo identifiers and credit text pass XML escaping; every SVG attribute is a fixed layout value.
        // nosemgrep: local-runtime.semgrep-rules.javascript.lang.security.html-in-template-string
        `<svg width="630" height="54"><text x="12" y="22" font-family="Arial" font-size="15">${escape(photo.id)}</text><text x="12" y="44" font-family="Arial" font-size="13">${escape(`${photo.capturedAt || 'Date unknown'} · ${photo.author} · ${rights?.status === 'reuse-verified' ? rights.verifiedMetadata.license : 'Observation only; rights unverified'}`).slice(0, 102)}</text></svg>`,
      ),
      left,
      top: top + 440,
    });
  }
  await sharp({ create: { width, height, channels: 3, background: '#faf9f5' } })
    .composite(layers)
    .jpeg({ quality: 88 })
    .toFile(path.join(directory, 'references.jpg'));
}
console.log(`Reference sheets: ${inventory.buildings.length}`);
