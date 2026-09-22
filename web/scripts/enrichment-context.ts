// Read-only owner baseline context. Raw corrections never enter public artifacts.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { allRows } from '../server/backend.js';
import { publishedCampus } from '../server/release-validation.js';
import {
  applyEdits,
  assembleSources,
  type SourceRecord,
} from '../src/editor-model.js';
import type { MapEdit } from '../src/types.js';
const [published, sources, edits] = await Promise.all([
  publishedCampus(),
  allRows('source_features'),
  allRows('map_edits'),
]);
const approved = assembleSources(sources as SourceRecord[], published);
const draft = applyEdits(approved, edits as MapEdit[]);
const counts = (data: typeof published) => ({
  places: data.places.length,
  buildings: data.map.features.filter((f) => f.properties?.kind === 'building')
    .length,
  edges: data.graph.edges.length,
});
await fs.mkdir('../data/raw/enrichment', { recursive: true });
await fs.writeFile(
  '../data/raw/enrichment/owner-context.json',
  JSON.stringify(
    {
      publishedVersion: published.version,
      sourceCount: sources.length,
      correctionCount: edits.length,
      snapshotHash: createHash('sha256')
        .update(JSON.stringify({ sources, edits }))
        .digest('hex'),
      approved: counts(approved),
      draft: counts(draft.data),
      validationIssueCount: draft.errors.length,
      checkedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
console.log(
  'Read approved baseline and owner corrections; private data retained locally.',
);
