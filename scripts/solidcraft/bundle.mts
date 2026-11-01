import fs from 'node:fs/promises';
import path from 'node:path';
import { archive, repository, sha256, verifiedDownload } from './inventory.mjs';
import { publicCampus } from '../public-campus.mjs';
import { packageDetailedModels } from '../detailed-package.mjs';
import { buildingRevision } from '../../web/src/building-visuals';
import { detailedManifestMatches } from '../../web/src/model-lod';
import type {
  CampusData,
  CampusPackage,
  PackageAsset,
} from '../../web/src/types';

const inventory = JSON.parse(
  await fs.readFile(
    path.join(repository, 'data/lasu-models/inventory.json'),
    'utf8',
  ),
);
const baseline = path.join(archive, 'baseline', inventory.baselineVersion);
const previous: CampusPackage = JSON.parse(
  await fs.readFile(path.join(baseline, 'manifest.json'), 'utf8'),
);
const source: CampusData = JSON.parse(
  await fs.readFile(path.join(baseline, previous.dataUrl), 'utf8'),
);
const draft = structuredClone(source);
const requested = process.argv.slice(2);
const targets = inventory.buildings.filter((b: { id: string; slug: string }) =>
  requested.some((arg) => b.id.endsWith(':' + arg) || b.slug === arg),
);
if (!targets.length)
  throw new Error('Specify building IDs for a private integration bundle.');
const descriptors = [];
for (const building of targets) {
  const directory = path.join(archive, building.slug);
  const imported = JSON.parse(
    await fs.readFile(path.join(directory, 'import-verification.json'), 'utf8'),
  );
  const obj = await fs.readFile(path.join(directory, 'master.obj'));
  if (sha256(obj) !== imported.objSha256)
    throw new Error(
      `${building.slug}: re-import the current CAD export before packaging.`,
    );
  const document = JSON.parse(
    await fs.readFile(path.join(directory, 'turnright.model.json'), 'utf8'),
  );
  if (sha256(JSON.stringify(document)) !== imported.documentSha256)
    throw new Error('The editable source changed after verification.');
  const rendered = JSON.parse(
    await fs.readFile(path.join(directory, 'render-verification.json'), 'utf8'),
  );
  if (
    rendered.sourceDocumentSha256 !== imported.documentSha256 ||
    rendered.glbConversionErrorMetres > 0.01
  )
    throw new Error(
      `${building.slug}: render and verify the current editable document before packaging.`,
    );
  const feature = draft.map.features.find(
    (f) => f.properties?.id === building.id,
  )!;
  feature.properties!.modelDocument = document;
  const descriptor = JSON.parse(
    await fs.readFile(path.join(directory, 'detail-descriptor.json'), 'utf8'),
  );
  if (descriptor.geometryRevision !== buildingRevision(feature))
    throw new Error('Stale detail revision.');
  descriptors.push(descriptor);
  const visual = draft.visuals!.buildings.find((b) => b.id === building.id)!;
  visual.geometryRevision = descriptor.geometryRevision;
  visual.detailRevision = descriptor.detailRevision;
}
const version =
  'lasu-model-campaign-' + sha256(JSON.stringify(descriptors)).slice(0, 16);
const directory = path.join(archive, 'integration', version),
  publicDir = path.join(directory, 'public');
await fs.mkdir(publicDir, { recursive: true });
const assets = new Map<string, PackageAsset>();
async function writeAsset(
  url: string,
  bytes: Buffer,
  contentType = 'application/octet-stream',
) {
  const asset = {
    url,
    bytes: bytes.length,
    sha256: sha256(bytes),
    contentType,
  };
  const prior = assets.get(url);
  if (prior && (prior.sha256 !== asset.sha256 || prior.bytes !== asset.bytes))
    throw new Error('Conflicting immutable asset.');
  if (prior) return;
  const file = path.join(publicDir, decodeURIComponent(url));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, bytes);
  assets.set(url, asset);
}
// Complete the baseline archive without altering any live or working editor release.
for (const asset of previous.assets) await verifiedDownload(asset, baseline);
for (const asset of previous.assets) {
  if (
    asset.url === previous.dataUrl ||
    previous.visuals?.assetUrls.includes(asset.url)
  )
    continue;
  await writeAsset(
    asset.url,
    await fs.readFile(path.join(baseline, decodeURIComponent(asset.url))),
    (asset as PackageAsset & { contentType?: string }).contentType,
  );
}
for (const sector of draft.visuals!.sectors) {
  const payload = JSON.parse(
    await fs.readFile(path.join(baseline, sector.url), 'utf8'),
  );
  for (const model of payload.models || payload.buildings || []) {
    const detail = descriptors.find((d) => d.id === model.id);
    if (detail) {
      model.geometryRevision = detail.geometryRevision;
      model.detailRevision = detail.detailRevision;
    }
  }
  const bytes = Buffer.from(JSON.stringify(payload)),
    digest = sha256(bytes);
  sector.url = `/packages/visual-${digest.slice(0, 16)}/${path.basename(sector.url)}`;
  sector.sha256 = digest;
  sector.bytes = bytes.length;
  await writeAsset(sector.url, bytes, 'application/json');
}
draft.visuals!.bytes = draft.visuals!.sectors.reduce((n, s) => n + s.bytes, 0);
if (draft.visuals!.bytes > 12 * 1024 * 1024)
  throw new Error('Compatible base visuals exceeded their existing cap.');
draft.visuals!.detailedModels = descriptors;
draft.visuals!.revision = version;
const detailedGroup = { bytes: 0, assetUrls: [] as string[] };
for (const building of targets) {
  const group = await packageDetailedModels(
    {
      ...draft.visuals,
      detailedModels: descriptors.filter((d) => d.id === building.id),
    },
    path.join(archive, building.slug, 'render-assets'),
    writeAsset,
  );
  if (!group) throw new Error('The requested building has no detail assets.');
  for (const url of group.assetUrls)
    if (!detailedGroup.assetUrls.includes(url)) {
      detailedGroup.assetUrls.push(url);
      detailedGroup.bytes += assets.get(url)!.bytes;
    }
}
draft.version = version;
draft.createdAt = new Date().toISOString();
const data = publicCampus(draft) as CampusData;
const dataUrl = `/packages/${version}/campus.json`;
await writeAsset(
  dataUrl,
  Buffer.from(JSON.stringify(data)),
  'application/json',
);
const manifest: CampusPackage = {
  ...previous,
  version,
  createdAt: draft.createdAt,
  dataUrl,
  summary: 'Private LASU model integration fixture; not reviewed or published.',
  assets: [...assets.values()],
  bytes: [...assets.values()].reduce((n, a) => n + a.bytes, 0),
  visuals: {
    bytes: draft.visuals!.bytes,
    assetUrls: draft.visuals!.sectors.map((s) => s.url),
  },
  detailedModels: detailedGroup,
};
if (!detailedManifestMatches(data, manifest))
  throw new Error('Detail manifest does not match the campus.');
if (
  JSON.stringify(source.graph) !== JSON.stringify(data.graph) ||
  JSON.stringify(source.places) !== JSON.stringify(data.places) ||
  source.map.features.some(
    (f, i) =>
      JSON.stringify(f.geometry) !==
      JSON.stringify(data.map.features[i].geometry),
  )
)
  throw new Error(
    'Integration changed routing, destinations or geographic geometry.',
  );
await fs.mkdir(path.join(publicDir, 'packages', version), { recursive: true });
for (const file of [
  'packages/latest.json',
  `packages/${version}/manifest.json`,
])
  await fs.writeFile(
    path.join(publicDir, file),
    JSON.stringify(manifest, null, 2),
  );
await fs.writeFile(
  path.join(directory, 'editor-proposal.json'),
  JSON.stringify(draft),
);
await fs.writeFile(
  path.join(directory, 'integration-verification.json'),
  JSON.stringify(
    {
      version,
      baseline: source.version,
      buildings: targets.map((b: { id: string }) => b.id),
      baseBytes: manifest.visuals!.bytes,
      detailBytes: detailedGroup.bytes,
      totalBytes: manifest.bytes,
      assets: manifest.assets.length,
      geographicGeometryUnchanged: true,
      routingUnchanged: true,
      destinationsUnchanged: true,
      reviewStatus:
        'Unreviewed private integration fixture. User confirmed that the published release is current on 2026-11-01; the older local seed is preserved.',
    },
    null,
    2,
  ),
);
await fs.writeFile(
  path.join(archive, 'integration', 'CURRENT.json'),
  JSON.stringify({ version, directory }, null, 2),
);
console.log(
  JSON.stringify({
    directory,
    bytes: manifest.bytes,
    assets: assets.size,
    buildings: targets.length,
  }),
);
