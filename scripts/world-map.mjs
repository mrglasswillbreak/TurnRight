// Explicit maintenance command only: ordinary builds use the checked-in asset.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
const source =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_admin_0_countries.geojson';
const expected =
  '6866c877d39cba9c357620878839b336d569f8c662d3cfab4cb1dbe2d39c977f';
const response = await fetch(source, { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error('Natural Earth download failed');
const bytes = Buffer.from(await response.arrayBuffer());
if (createHash('sha256').update(bytes).digest('hex') !== expected)
  throw new Error('Natural Earth source changed; review before updating');
const data = JSON.parse(bytes.toString('utf8'));
const compact =
  JSON.stringify({
    type: 'FeatureCollection',
    features: data.features.map(({ properties: p, geometry }) => ({
      type: 'Feature',
      properties: {
        name: p.NAME_EN,
        labelRank: p.LABELRANK,
        labelX: p.LABEL_X,
        labelY: p.LABEL_Y,
      },
      geometry,
    })),
  }) + '\n';
if (Buffer.byteLength(compact) > 500 * 1024)
  throw new Error('World map exceeds 500 KB budget');
const directory = new URL('../web/public/world/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('countries-v5.1.2.geojson', directory), compact);
console.log(
  `World overview: ${data.features.length} features, ${Buffer.byteLength(compact)} bytes`,
);
