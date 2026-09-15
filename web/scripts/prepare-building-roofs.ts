import fs from 'node:fs/promises';
import path from 'node:path';
import type { CampusData } from '../src/types';
import { buildingRoofProposals } from '../src/building-roofs';
import { findDuplicateCandidates } from '../src/duplicates';
import { createBuildingModel } from '../src/building-model';
import { resolveBuildingVisual } from '../src/building-surfaces';
import { validBuildingModel } from '../src/building-visuals';
import type { Feature, Polygon, MultiPolygon } from 'geojson';

const input = process.argv[2];
if (!input) throw new Error('Supply a campus.json snapshot to assess.');
const output = process.argv[3] || '../data/candidates/reference-roofs';
const data = JSON.parse(await fs.readFile(input, 'utf8')) as CampusData;
const proposals = buildingRoofProposals(
  data,
  findDuplicateCandidates(data, []),
);
const ready = proposals.filter((p) => p.edit),
  edits = ready.map((p) => p.edit!);
const byId = new Map(edits.map((e) => [e.id, e]));
const candidate = {
  ...data,
  map: {
    ...data.map,
    features: data.map.features.map((f) => {
      const edit = byId.get(String(f.properties?.id));
      if (!edit) return f;
      const changed = { ...f, properties: edit.properties } as Feature<
        Polygon | MultiPolygon
      >;
      const model = createBuildingModel(
        changed,
        resolveBuildingVisual(
          changed,
          data.visuals?.buildings.find((v) => v.id === edit.id),
        ),
      );
      if (!validBuildingModel(model))
        throw new Error(
          `${edit.id}: roof model exceeds integrity or mesh budget limits.`,
        );
      return changed;
    }),
  },
};
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, 'campus.json'), JSON.stringify(candidate));
await fs.writeFile(
  path.join(output, 'roof-edits.json'),
  JSON.stringify({ baselineVersion: data.version, edits }, null, 2),
);
const photo = ready.filter((p) => p.basis === 'photo-form').length;
const clean = (s: string) => s.replaceAll('|', '/').replaceAll('\n', ' ');
await fs.writeFile(
  path.join(output, 'coverage.md'),
  `# Roof coverage\n\nAssessed ${proposals.length} buildings from ${data.version}. ${ready.length} proposed buildings / ${ready.reduce((n, p) => n + p.roofs.length, 0)} wings: ${photo} photo-supported roof forms and ${ready.length - photo} illustrative roofs. All ridge positions are approximate. No footprint or routing changes. Existing custom roofs and confirmed flat/parapet silhouettes retained.\n\n| Building | ID | Result | Detail |\n|---|---|---|---|\n` +
    proposals
      .map(
        (p) =>
          `| ${clean(p.name)} | ${p.id} | ${p.edit ? p.basis : 'Retained'} | ${clean(p.reason || `${p.roofs.length} wing plans; ridge layout and pitch illustrative.`)} |`,
      )
      .join('\n') +
    '\n',
);
console.log({
  assessed: proposals.length,
  proposed: ready.length,
  wings: ready.reduce((n, p) => n + p.roofs.length, 0),
  photo,
  illustrative: ready.length - photo,
  output,
});
console.log(
  proposals.filter(
    (p) =>
      !p.edit &&
      [
        'arcgis:University_Property:54',
        'arcgis:University_Property:78',
        'arcgis:University_Property:103',
      ].includes(p.id),
  ),
);
