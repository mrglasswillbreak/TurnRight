import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { archive, repository, sha256 } from './inventory.mjs';

const directory = path.join(repository, 'data/lasu-models');
const read = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const inventory = await read(path.join(directory, 'inventory.json'));
const observations = await read(path.join(directory, 'observations.json'));
const rights = await read(path.join(directory, 'photo-audit.json'));
const baseline = path.join(archive, 'baseline', inventory.baselineVersion);
const data = await read(
  path.join(baseline, 'packages', inventory.baselineVersion, 'campus.json'),
);
const evidenceDir = path.join(directory, 'evidence');
await fs.mkdir(evidenceDir, { recursive: true });
const escape = (text) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const wrap = (text, limit = 145) => {
  const lines = [''];
  for (const word of text.split(/\s+/)) {
    if (lines.at(-1).length + word.length > limit) lines.push('');
    lines[lines.length - 1] += (lines.at(-1) ? ' ' : '') + word;
  }
  return lines;
};
for (const building of inventory.buildings) {
  const bundle = path.join(archive, building.slug),
    notes = observations.buildings[building.id.split(':').at(-1)];
  const feature = data.map.features.find(
    (f) => f.properties?.id === building.id,
  );
  const visual = data.visuals.buildings.find((v) => v.id === building.id);
  const recipe = await read(path.join(bundle, 'recipe.json')).catch(() => null);
  const imported = await read(
    path.join(bundle, 'import-verification.json'),
  ).catch(() => null);
  const rendered = await read(
    path.join(bundle, 'render-verification.json'),
  ).catch(() => null);
  const sourceBytes = await fs
    .readFile(path.join(bundle, 'master.obj'))
    .catch(() => null);
  const importCurrent =
    !!sourceBytes && imported?.objSha256 === sha256(sourceBytes);
  const renderCurrent =
    importCurrent &&
    rendered?.sourceDocumentSha256 === imported?.documentSha256;
  const record = {
    version: 1,
    campus: 'lasu',
    buildingId: building.id,
    name: building.name,
    status: notes.hold
      ? 'identification-hold'
      : importCurrent && renderCurrent
        ? 'model-awaiting-fidelity-and-integration-review'
        : 'audited-awaiting-model',
    baseline: {
      release: inventory.baselineVersion,
      sourceUrl: inventory.sourceUrl,
      campusSha256: inventory.campusSha256,
      confirmation: observations.baselineConfirmation,
      footprintSha256: sha256(JSON.stringify(feature.geometry)),
      preservedAppearanceSha256: sha256(
        JSON.stringify(feature.properties.appearance || {}),
      ),
      mappedHeightMetres: visual.height,
      mappedFloors: visual.floors,
      roofForm: visual.roofForm,
    },
    observations: notes,
    references: building.references.map((photo) => ({
      ...photo,
      audit: rights.records.find((r) => r.photoId === photo.id),
    })),
    reconstruction: recipe
      ? {
          units: recipe.units,
          up: recipe.up,
          geographicAnchor: recipe.origin,
          geographicAxes:
            'X east, Y north; no additional yaw. Footprint vertices are transformed into this local frame.',
          boundsMillimetres: recipe.expectedBounds,
          frontPartAndEdge: recipe.settings.front,
          frontOrientationStatus:
            'Estimated from existing associations; not surveyed.',
          observed: recipe.settings.observed,
          estimated: recipe.settings.estimated,
          sourceSettings: 'data/lasu-models/recipes.json',
          componentCount: recipe.bodies.length,
          nativePatterns: recipe.patterns,
        }
      : null,
    verification: imported
      ? {
          conversionErrorMetres: imported.conversionErrorMetres,
          conversionMeaning:
            'Export/import tolerance only, not survey accuracy.',
          triangles: imported.triangles,
          objSha256: imported.objSha256,
          documentSha256: imported.documentSha256,
          finishing: imported.finishing,
          rendering: rendered,
        }
      : null,
    acceptance: {
      artifactsMatchCurrentMaster: !!renderCurrent,
      architecturalFidelity: 'Pending independent comparison review.',
      publication: 'Not approved or published.',
      physicalDevice: 'Not measured.',
    },
  };
  for (const file of [
    path.join(evidenceDir, building.slug + '.json'),
    path.join(bundle, 'evidence.json'),
  ])
    await fs.writeFile(file, JSON.stringify(record, null, 2));
  if (!renderCurrent) continue;
  const photos = building.references.filter(
    (p) => !p.historical && p.id !== 'commons:198256515',
  );
  const photo =
    building.references.find((p) => p.id === notes.comparisonPhotoId) ||
    photos.find((p) => p.capturedAt === '2026-08-27') ||
    photos[0] ||
    building.references[0];
  const footer = [
    `${photo.id} · ${photo.author} · ${photo.capturedAt || 'Date unknown'}`,
    rights.records.find((r) => r.photoId === photo.id)?.status ===
    'reuse-verified'
      ? `${photo.license} — source credit and URL in evidence.json`
      : 'Observation only — source rights unverified; private comparison sheet',
    'Estimated: metric height, unseen elevations and precise facade-to-footprint alignment.',
    ...(notes.gaps || []).slice(0, 3).map((gap) => 'Unresolved: ' + gap),
    'Not independently accepted or published. Preserve the dated references when reviewing later changes.',
  ].flatMap((line) => wrap(line));
  const footerHeight = footer.length * 26 + 25;
  const layers = [
    {
      input: Buffer.from(
        `<svg width="1600" height="100"><text x="30" y="40" font-family="Arial" font-size="28">${escape(building.name)} — comparison proposal</text><text x="30" y="76" font-family="Arial" font-size="20">Reference left; model right. Orientation and dimensions remain estimated.</text></svg>`,
      ),
      left: 0,
      top: 0,
    },
    {
      input: await sharp(path.join(baseline, photo.assetUrl))
        .resize(780, 650, { fit: 'contain', background: '#faf9f5' })
        .png()
        .toBuffer(),
      left: 10,
      top: 100,
    },
    {
      input: await sharp(
        path.join(
          bundle,
          recipe.referenceDirection
            ? 'renders/reference-front.png'
            : 'renders/oblique-sw.png',
        ),
      )
        .resize(780, 650, { fit: 'contain', background: '#faf9f5' })
        .png()
        .toBuffer(),
      left: 810,
      top: 100,
    },
    {
      input: Buffer.from(
        `<svg width="1600" height="${footerHeight}">${footer.map((line, i) => `<text x="30" y="${26 + i * 26}" font-family="Arial" font-size="18">${escape(line)}</text>`).join('')}</svg>`,
      ),
      left: 0,
      top: 760,
    },
  ];
  await sharp({
    create: {
      width: 1600,
      height: 760 + footerHeight,
      channels: 3,
      background: '#faf9f5',
    },
  })
    .composite(layers)
    .jpeg({ quality: 92 })
    .toFile(path.join(bundle, 'comparison.jpg'));
}
console.log(
  `Evidence dossiers: ${inventory.buildings.length}; current-release baseline confirmed by the user.`,
);
