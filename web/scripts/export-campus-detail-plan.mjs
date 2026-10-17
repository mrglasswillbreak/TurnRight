/** Freeze presentation-only changes from a reviewed local detail candidate. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { hash } from '../../scripts/cloud.mjs';
const [campusId, study, output] = process.argv.slice(2);
if (!campusId || !study || !output)
  throw Error(
    'Usage: node scripts/export-campus-detail-plan.mjs CAMPUS_ID STUDY_FOLDER NEW_PLAN_JSON',
  );
const read = async (file) =>
  JSON.parse(await fs.readFile(path.join(study, file), 'utf8'));
const baseline = await read('baseline.json');
const candidate = await read('detail-preview/candidate.json');
const edits = await read('detail-preview/edits.json');
const changes = edits.map((e) => ({
  id: e.id,
  kind: e.kind,
  ...(e.kind !== 'place' ? { geometryHash: hash(e.geometry) } : {}),
  properties:
    e.kind === 'building'
      ? { appearance: e.properties.appearance }
      : e.kind === 'land'
        ? { landClass: e.properties.landClass }
        : e.kind === 'place'
          ? { landmark: e.properties.landmark }
          : (() => {
              throw Error('Unsupported presentation change');
            })(),
}));
const scenery = {
  ...candidate.visuals.scenery,
  regions: candidate.visuals.scenery.regions.map((r) => ({
    ...r,
    geometryHash: hash(
      candidate.map.features.find(
        (f) => String(f.properties?.id) === r.featureId,
      ).geometry,
    ),
  })),
};
const plan = {
  schemaVersion: 1,
  campusId,
  baselineVersion: baseline.version,
  changes,
  scenery,
};
await fs.writeFile(output, JSON.stringify(plan) + '\n', { flag: 'wx' });
console.log(
  JSON.stringify({
    changes: changes.length,
    regions: scenery.regions.length,
    planHash: hash(plan),
  }),
);
