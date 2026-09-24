import fs from 'node:fs/promises';
import { photoModelProposals } from '../src/photo-model-proposals.ts';
const data = JSON.parse(
  await fs.readFile(process.argv[2] || 'work/photo-model/campus.json', 'utf8'),
);
const proposals = photoModelProposals(data, []);
console.log(
  proposals.map((p) => ({
    name: p.record.name,
    ready: !!p.edit,
    reason: p.reason,
  })),
);
for (const p of proposals)
  if (p.edit) {
    const f = data.map.features.find((f) => f.properties?.id === p.edit.id);
    f.properties = { ...p.edit.properties, id: p.edit.id };
  }
await fs.writeFile(process.argv[3] || 'work/photo-model/candidate.json', JSON.stringify(data));
await fs.writeFile(
  '../data/photo-models/proposals.json',
  JSON.stringify(
    {
      baseline: data.version,
      edits: proposals.filter((p) => p.edit).map((p) => p.edit),
    },
    null,
    2,
  ),
);
