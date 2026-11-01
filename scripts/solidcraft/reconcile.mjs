import fs from 'node:fs/promises';
import path from 'node:path';
import { archive, repository, sha256 } from './inventory.mjs';

const directory = path.join(repository, 'data/lasu-models');
const read = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const inventory = await read(path.join(directory, 'inventory.json'));
const recipes = (await read(path.join(directory, 'recipes.json'))).buildings;
const campusBytes = await fs.readFile(
  path.join(
    archive,
    'baseline',
    inventory.baselineVersion,
    'packages',
    inventory.baselineVersion,
    'campus.json',
  ),
);
if (sha256(campusBytes) !== inventory.campusSha256)
  throw Error('Published editor baseline changed.');
const campus = JSON.parse(campusBytes);
const records = inventory.buildings.map((building) => {
  const feature = campus.map.features.find(
    (f) => f.properties?.id === building.id,
  );
  const appearance = feature.properties.appearance || {};
  const recipe = recipes[building.id];
  return {
    buildingId: building.id,
    name: building.name,
    appearanceSha256: sha256(JSON.stringify(appearance)),
    footprintSha256: sha256(JSON.stringify(feature.geometry)),
    authoredRoofs: Object.keys(appearance.roofs || {}),
    roofTreatment: recipe?.preserveRoof
      ? 'Existing native roof triangulation is retained in SolidCraft, with estimated eaves raised to the proposal wall height.'
      : recipe?.style === 'library'
        ? 'Dated aerial evidence replaces the illustrative flat cap only in the proposal.'
        : recipe?.style === 'sdg'
          ? 'Observed gable is reconstructed over the existing footprint; ridge dimensions remain estimated.'
          : 'Published source appearance remains in the baseline; proposal roof is separately estimated.',
    authoredFacades: Object.entries(appearance.facades || {}).map(
      ([wallId, facade]) => ({
        wallId,
        photoIds: facade.photoIds || [],
        hasTextureCrop: !!facade.texture,
        entrancesAndSigns: (facade.elements || [])
          .filter((e) => ['door', 'text'].includes(e.kind))
          .map(({ id, kind, text, x, bottom, width, height }) => ({
            id,
            kind,
            text,
            x,
            bottom,
            width,
            height,
          })),
      }),
    ),
    proposalEntrance: recipe
      ? {
          front: recipe.front,
          fronts: recipe.fronts,
          doors: recipe.doors,
          estimated: recipe.estimated,
        }
      : null,
    texturePolicy:
      'Published crops remain in the immutable baseline. New photographic textures require a reuse-verified audit entry and a named source crop.',
    geography:
      'Original footprints, routing and destinations remain unchanged; bundle.mts verifies this before writing a private integration fixture.',
  };
});
await fs.writeFile(
  path.join(directory, 'reconciliation.json'),
  JSON.stringify(
    {
      version: 1,
      baseline: inventory.baselineVersion,
      campusSha256: inventory.campusSha256,
      confirmation:
        'User confirmed the published release is current on 2026-11-01.',
      records,
    },
    null,
    2,
  ),
);
console.log(
  `Reconciled ${records.length} photo-linked building appearances against the confirmed published release.`,
);
