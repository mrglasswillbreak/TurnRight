import fs from 'node:fs/promises';
import path from 'node:path';
import { archive, repository, sha256 } from './inventory.mjs';

const read = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const data = path.join(repository, 'data/lasu-models');
const inventory = await read(path.join(data, 'inventory.json'));
const observations = await read(path.join(data, 'observations.json'));
const records = [];
const files = [
  'master.sc',
  'master.obj',
  'master.mtl',
  'master.step',
  'mcp-transcript.json',
  'recipe.json',
  'solidcraft-verification.json',
  'turnright.model.json',
  'model.glb',
  'detail-descriptor.json',
  'import-verification.json',
  'render-verification.json',
  'evidence.json',
  'comparison.jpg',
  'references.jpg',
  'solidcraft-iso.png',
  ...[
    'north',
    'east',
    'south',
    'west',
    'roof',
    'oblique-ne',
    'oblique-sw',
    'reference-front',
  ].map((view) => `renders/${view}.png`),
];
for (const building of inventory.buildings) {
  if (
    typeof building.slug !== 'string' ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(building.slug)
  )
    throw Error('Building slug must contain only lowercase words and digits.');
  const notes = observations.buildings[building.id.split(':').at(-1)];
  if (notes.hold) {
    records.push({
      id: building.id,
      name: building.name,
      slug: building.slug,
      status: 'identification-hold',
      reason: notes.hold,
    });
    continue;
  }
  const directory = path.join(archive, building.slug);
  const native = await read(
    path.join(directory, 'solidcraft-verification.json'),
  );
  const imported = await read(path.join(directory, 'import-verification.json'));
  if (!Number.isSafeInteger(imported.triangles) || imported.triangles < 0)
    throw Error(
      `${building.slug}: triangle count must be a nonnegative integer.`,
    );
  const rendered = await read(path.join(directory, 'render-verification.json'));
  const evidence = await read(path.join(directory, 'evidence.json'));
  const document = await read(path.join(directory, 'turnright.model.json'));
  if (
    !native.parameterCheck.restored ||
    native.parameterCheck.errors?.length ||
    !evidence.acceptance.artifactsMatchCurrentMaster ||
    rendered.sourceDocumentSha256 !== imported.documentSha256 ||
    sha256(JSON.stringify(document)) !== imported.documentSha256
  )
    throw Error(`${building.slug}: bundle stages are inconsistent.`);
  const assets = [];
  for (const file of files) {
    const bytes = await fs.readFile(path.join(directory, file));
    const digest = sha256(bytes);
    if (native.exportHashes?.[file] && native.exportHashes[file] !== digest)
      throw Error(
        `${building.slug}: native export changed after verification.`,
      );
    if (file === 'master.obj' && digest !== imported.objSha256)
      throw Error(`${building.slug}: import is stale.`);
    assets.push({ file, bytes: bytes.length, sha256: digest });
  }
  const descriptor = await read(path.join(directory, 'detail-descriptor.json'));
  for (const asset of [
    ...descriptor.levels.flatMap((level) => level.assets),
    ...descriptor.textures,
  ]) {
    const file = 'render-assets/' + path.basename(asset.url);
    if (assets.some((a) => a.file === file)) continue;
    const bytes = await fs.readFile(path.join(directory, file));
    if (bytes.length !== asset.bytes || sha256(bytes) !== asset.sha256)
      throw Error(`${building.slug}: render asset integrity failure.`);
    assets.push({ file, bytes: bytes.length, sha256: asset.sha256 });
  }
  const credits = descriptor.textures.flatMap(
    (texture) => texture.credits || [],
  );
  await fs.writeFile(
    path.join(directory, 'CREDITS.txt'),
    [
      building.name,
      '',
      'Photographic derivatives embedded in model.glb, the editable TurnRight model and map textures:',
      credits.length
        ? credits
            .map(
              (c) =>
                `${c.author}\n${c.sourceUrl}\n${c.license}: ${c.licenseUrl}\nModifications: ${c.modifications}\nDerivative texture retains the source share-alike licence when applicable.`,
            )
            .join('\n\n')
        : 'No source photograph is embedded. Surface grain is original, deterministic material data.',
      '',
      'Source photographs and comparison sheets are private observational evidence. Their individual reuse status is recorded in evidence.json. Do not redistribute observation-only photographs.',
      '',
      'Architectural dimensions and unseen details remain estimates. These files are review proposals, not surveyed geometry or an approved public release.',
    ].join('\n'),
  );
  const creditBytes = await fs.readFile(path.join(directory, 'CREDITS.txt'));
  assets.push({
    file: 'CREDITS.txt',
    bytes: creditBytes.length,
    sha256: sha256(creditBytes),
  });
  const record = {
    id: building.id,
    name: building.name,
    slug: building.slug,
    status: 'complete-artifact-proposal-awaiting-independent-review',
    componentCount: evidence.reconstruction.componentCount,
    triangles: imported.triangles,
    conversionErrorMetres: imported.conversionErrorMetres,
    glbConversionErrorMetres: rendered.glbConversionErrorMetres,
    assets,
  };
  await fs.writeFile(
    path.join(directory, 'BUNDLE.json'),
    JSON.stringify(record, null, 2),
  );
  records.push(record);
}
const manifest = {
  version: 1,
  baseline: inventory.baselineVersion,
  createdAt: new Date().toISOString(),
  proposalCount: records.filter((r) => r.assets).length,
  identificationHolds: records.filter((r) => !r.assets).length,
  additionalIdentificationGaps: observations.additionalResearchRecords,
  publication: 'Not independently approved or published.',
  records,
};
await fs.writeFile(
  path.join(archive, 'CAMPAIGN.json'),
  JSON.stringify(manifest, null, 2),
);
const escape = (s) =>
  String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('"', '&quot;');
await fs.writeFile(
  path.join(archive, 'review.html'),
  // Text is escaped; path slugs and triangle counts are validated above. Views and remaining counts are fixed or computed locally.
  // nosemgrep: local-runtime.semgrep-rules.javascript.lang.security.html-in-template-string
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LASU Ojo model review</title><style>body{font:16px system-ui;max-width:1200px;margin:40px auto;padding:0 20px;background:#f6f4ee;color:#202c31}article{margin:30px 0;background:white;padding:24px;border-radius:12px}img{max-width:100%;height:auto}nav{display:flex;gap:18px;flex-wrap:wrap}a{color:#145875}p{line-height:1.6}small{color:#59635f}</style><h1>LASU Ojo exterior models</h1><p>${manifest.proposalCount} artifact proposals · ${manifest.identificationHolds} identification holds · baseline ${escape(manifest.baseline)}.</p><p>Compare the dated reference with each model, then inspect all elevations and the roof. Dimensions, hidden elevations and some facade assignments remain estimates. Independent review and integration acceptance precede publication.</p><nav><a href="CAMPAIGN.json">Complete inventory and hashes</a><a href="integration/CURRENT.json">Private integration fixture</a></nav>${records.map((r) => `<article><h2>${escape(r.name)}</h2>${r.assets ? `<img loading="lazy" src="${r.slug}/comparison.jpg" alt="Reference and model comparison for ${escape(r.name)}"><nav><a href="${r.slug}/master.sc">SolidCraft master</a><a href="${r.slug}/master.step">STEP</a><a href="${r.slug}/master.obj">OBJ</a><a href="${r.slug}/model.glb">Textured GLB</a><a href="${r.slug}/turnright.model.json">Editable TurnRight model</a><a href="${r.slug}/evidence.json">Evidence and uncertainty</a><a href="${r.slug}/CREDITS.txt">Credits</a></nav><p>${['north', 'east', 'south', 'west', 'roof', 'oblique-ne', 'oblique-sw'].map((v) => `<a href="${r.slug}/renders/${v}.png">${v}</a>`).join(' · ')}</p><small>${r.triangles.toLocaleString()} triangles · model conversion within 1 cm · not independently approved</small>` : `<p>${escape(r.reason)}</p>`}</article>`).join('')}<p>Additional unmatched references are listed in CAMPAIGN.json. Physical-phone validation remains separate from browser viewport measurements.</p></html>`,
);
console.log(
  JSON.stringify({
    proposals: manifest.proposalCount,
    holds: manifest.identificationHolds,
    review: path.join(archive, 'review.html'),
  }),
);
