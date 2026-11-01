import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const repository = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
export const archive = 'C:/Users/user/Documents/TurnRight-Models/LASU-Ojo';
export const sha256 = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');
export const slug = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const base = 'https://turnright.vercel.app';

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}
export async function verifiedDownload(asset, directory) {
  if (
    !/^\/(packages|audio|glyphs)\//.test(asset.url) ||
    asset.url.includes('..')
  )
    throw new Error('Unexpected source asset path');
  const destination = path.join(directory, decodeURIComponent(asset.url));
  const previous = await fs.readFile(destination).catch(() => null);
  if (previous?.length === asset.bytes && sha256(previous) === asset.sha256)
    return destination;
  const bytes = await get(base + asset.url);
  if (bytes.length !== asset.bytes || sha256(bytes) !== asset.sha256)
    throw new Error(`Source integrity mismatch: ${asset.url}`);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, bytes);
  return destination;
}

export async function inventory() {
  await fs.mkdir(archive, { recursive: true });
  const catalogue = JSON.parse(await get(base + '/packages/campuses.json'));
  const campus = catalogue.campuses.find((c) => c.id === 'lasu');
  const manifest = JSON.parse(await get(base + campus.manifestUrl));
  const baseline = path.join(archive, 'baseline', manifest.version);
  await fs.mkdir(baseline, { recursive: true });
  const core = manifest.assets.find((a) => a.url === manifest.dataUrl);
  const input = await verifiedDownload(core, baseline);
  const data = JSON.parse(await fs.readFile(input, 'utf8'));
  const buildingFeatures = data.map.features.filter(
    (f) => f.properties?.kind === 'building',
  );
  const ids = [...new Set(data.photos.map((p) => p.buildingId))];
  const buildings = ids
    .map((id) => {
      const feature = buildingFeatures.find(
        (f) => String(f.properties.id) === id,
      );
      const photos = data.photos.filter((p) => p.buildingId === id);
      const name = feature?.properties.name || id;
      return {
        id,
        name,
        slug: slug(name),
        campus: 'lasu',
        status: 'reference-review',
        footprintRevision: data.visuals.buildings.find((b) => b.id === id)
          ?.geometryRevision,
        photoIds: photos.map((p) => p.id),
        references: photos.map((p) => ({
          id: p.id,
          caption: p.caption,
          sourceUrl: p.sourceUrl,
          author: p.author,
          license: p.license,
          licenseUrl: p.licenseUrl,
          capturedAt: p.capturedAt || null,
          historical: !!p.historical,
          sha256: p.sha256,
          assetUrl: p.url,
          disposition: /commons\.wikimedia\.org/.test(p.sourceUrl || '')
            ? 'verify-commons-metadata'
            : 'observation-only-pending-rights',
        })),
        uncertainty: [
          'Photo-to-elevation orientation and unseen elevations require evidence review.',
          'Source dimensions are not a field survey.',
        ],
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const photo of data.photos) await verifiedDownload(photo, baseline);
  await fs.writeFile(
    path.join(baseline, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
  );
  const output = {
    version: 1,
    campus: 'lasu',
    baselineVersion: manifest.version,
    sourceUrl: base + campus.manifestUrl,
    campusSha256: core.sha256,
    checkedAt: new Date().toISOString(),
    buildingCount: buildingFeatures.length,
    photoCount: data.photos.length,
    buildings,
  };
  const directory = path.join(repository, 'data/lasu-models');
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, 'inventory.json'),
    JSON.stringify(output, null, 2) + '\n',
  );
  await fs.writeFile(
    path.join(archive, 'inventory.json'),
    JSON.stringify(output, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({
      baseline: manifest.version,
      buildings: buildingFeatures.length,
      candidates: buildings.length,
      photographs: data.photos.length,
      input,
    }),
  );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await inventory();
