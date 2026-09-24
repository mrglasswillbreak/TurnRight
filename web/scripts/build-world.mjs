// Explicit, reproducible maintenance build. Normal app builds never fetch imagery.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const out = new URL('../public/world/', import.meta.url);
const lockPath = new URL('../../data/world-sources.json', import.meta.url);
const record = process.argv.includes('--record-sources');
const lock = await fs
  .readFile(lockPath, 'utf8')
  .then(JSON.parse)
  .catch(() => ({}));
const hash = (b) => createHash('sha256').update(b).digest('hex');
const sources = {
  imagery:
    'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography/september/world.topo.200409.3x21600x10800.jpg',
  countries:
    'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson',
  lakes:
    'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_lakes.geojson',
  cities:
    'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_populated_places_simple.geojson',
};
await fs.mkdir(out, { recursive: true });
const assets = [];
async function write(name, bytes) {
  await fs.mkdir(new URL(path.posix.dirname(name) + '/', out), {
    recursive: true,
  });
  await fs.writeFile(new URL(name, out), bytes);
  assets.push({
    url: '/world/' + name,
    bytes: bytes.length,
    sha256: hash(bytes),
  });
}
async function source(key) {
  const response = await fetch(sources[key], {
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`${key}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const sha256 = hash(bytes);
  if (!record && lock[key]?.sha256 !== sha256)
    throw new Error(`Review changed source: ${key}`);
  lock[key] = {
    url: sources[key],
    sha256,
    bytes: bytes.length,
    retrievedAt: lock[key]?.retrievedAt || new Date().toISOString(),
  };
  return bytes;
}
const round = (v) =>
  Array.isArray(v) ? v.map(round) : Math.round(v * 10000) / 10000;
for (const key of ['countries', 'lakes', 'cities']) {
  const data = JSON.parse((await source(key)).toString());
  const features = data.features
    .filter((f) => key !== 'cities' || Number(f.properties.scalerank) <= 3)
    .map(({ geometry, properties: p }) => ({
      type: 'Feature',
      geometry: { ...geometry, coordinates: round(geometry.coordinates) },
      properties:
        key === 'countries'
          ? {
              name: p.NAME_EN,
              labelRank: p.LABELRANK,
              labelX: p.LABEL_X,
              labelY: p.LABEL_Y,
            }
          : key === 'cities'
            ? {
                name: [...p.name].some((c) => c.codePointAt(0) > 255)
                  ? p.name.normalize('NFKD').replace(/\p{M}/gu, '')
                  : p.name,
                sourceName: p.name,
                labelRank: p.scalerank,
              }
            : {},
    }));
  await write(
    `${key}-50m-v5.1.2.geojson`,
    Buffer.from(JSON.stringify({ type: 'FeatureCollection', features })),
  );
}
const { data: pixels, info } = await sharp(await source('imagery'), {
  limitInputPixels: 250000000,
})
  .resize(8192, 4096)
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
// Sample the equirectangular composite into Web Mercator; wrap longitude at the seam.
for (let z = 0; z <= 4; z++) {
  const n = 2 ** z,
    size = n * 512;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const tile = Buffer.alloc(512 * 512 * 3);
      for (let row = 0; row < 512; row++) {
        const lat = Math.atan(
          Math.sinh(Math.PI * (1 - (2 * (y * 512 + row + 0.5)) / size)),
        );
        const sy = (0.5 - lat / Math.PI) * info.height - 0.5;
        const y0 = Math.max(0, Math.min(info.height - 2, Math.floor(sy))),
          fy = sy - y0;
        for (let col = 0; col < 512; col++) {
          const sx = ((x * 512 + col + 0.5) / size) * info.width - 0.5;
          const x0 = (Math.floor(sx) + info.width) % info.width,
            x1 = (x0 + 1) % info.width,
            fx = sx - Math.floor(sx);
          for (let c = 0; c < 3; c++) {
            const a =
              pixels[(y0 * info.width + x0) * 3 + c] * (1 - fx) +
              pixels[(y0 * info.width + x1) * 3 + c] * fx;
            const b =
              pixels[((y0 + 1) * info.width + x0) * 3 + c] * (1 - fx) +
              pixels[((y0 + 1) * info.width + x1) * 3 + c] * fx;
            tile[(row * 512 + col) * 3 + c] = Math.round(a * (1 - fy) + b * fy);
          }
        }
      }
      await write(
        `blue-marble-200409/${z}/${x}/${y}.webp`,
        await sharp(tile, { raw: { width: 512, height: 512, channels: 3 } })
          .webp({ quality: 76, effort: 5 })
          .toBuffer(),
      );
    }
  console.log(`Globe zoom ${z} generated`);
}
// Retain the legacy vector fallback for older app shells.
const legacy = await fs.readFile(new URL('countries-v5.1.2.geojson', out));
assets.push({
  url: '/world/countries-v5.1.2.geojson',
  bytes: legacy.length,
  sha256: hash(legacy),
});
const bytes = assets.reduce((n, a) => n + a.bytes, 0);
if (bytes > 8 * 1024 * 1024) throw new Error(`Globe exceeds 8 MiB: ${bytes}`);
await fs.writeFile(
  lockPath,
  JSON.stringify(
    {
      ...lock,
      credit:
        'NASA Earth Observatory, Blue Marble Next Generation, September 2004, shaded topography; Natural Earth v5.1.2 (public domain)',
      imagerySourceResolution:
        '21600 × 10800, approximately 2 km per source pixel at equator',
      modifications:
        'Reprojected, resampled and WebP compressed. Overview imagery, not current campus photography.',
    },
    null,
    2,
  ) + '\n',
);
await fs.writeFile(
  new URL('manifest.json', out),
  JSON.stringify(
    {
      version: 1,
      bytes,
      assets,
      credit: 'NASA Earth Observatory / Natural Earth',
      imageryDate: '2004-09',
      maxNativeZoom: 4,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `${assets.length} verified world assets: ${(bytes / 1024 / 1024).toFixed(2)} MiB`,
);
