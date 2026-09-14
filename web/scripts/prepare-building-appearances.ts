import fs from 'node:fs/promises';
import path from 'node:path';
import type { CampusData } from '../src/types';
import { buildingReferenceProposals } from '../src/building-references';
import { findDuplicateCandidates } from '../src/duplicates';

const input = process.argv[2];
if (!input) throw new Error('Supply a campus.json snapshot to assess.');
const output = process.argv[3] || '../data/candidates/reference-appearances';
const data = JSON.parse(await fs.readFile(input, 'utf8')) as CampusData;
const proposals = buildingReferenceProposals(
  data,
  findDuplicateCandidates(data, []),
);
const ready = proposals.filter((p) => p.edit);
const edits = ready.map((p) => p.edit!);
const byId = new Map(edits.map((e) => [e.id, e]));
const candidate = {
  ...data,
  map: {
    ...data.map,
    features: data.map.features.map((f) => {
      const edit = byId.get(String(f.properties?.id));
      return edit ? { ...f, properties: edit.properties } : f;
    }),
  },
};
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, 'campus.json'), JSON.stringify(candidate));
await fs.writeFile(
  path.join(output, 'appearance-edits.json'),
  JSON.stringify({ baselineVersion: data.version, edits }, null, 2),
);
const photo = ready.filter((p) => p.basis === 'photograph').length;
const clean = (s: string) => s.replaceAll('|', '/').replaceAll('\n', ' ');
const report =
  `# Building appearance coverage\n\nAssessed ${proposals.length} buildings from ${data.version}. ${ready.length} proposed updates: ${photo} photo references and ${ready.length - photo} illustrative facades. ${proposals.length - ready.length} retained pending evidence or review. No footprint, entrance or routing changes. The owner must review a release before public publication.\n\n| Building | ID | Result | Basis / outstanding work |\n|---|---|---|---|\n` +
  proposals
    .map(
      (p) =>
        `| ${clean(p.name)} | ${p.id} | ${p.edit ? p.basis : 'Retained'} | ${clean(p.reason || p.notes.join(' '))} |`,
    )
    .join('\n') +
  '\n';
await fs.writeFile(path.join(output, 'coverage.md'), report);
console.log({
  assessed: proposals.length,
  proposed: ready.length,
  photo,
  illustrative: ready.length - photo,
  output,
});
