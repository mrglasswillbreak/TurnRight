import { readFile, writeFile } from 'node:fs/promises';
import { placeBuildingId } from '../src/arrival.ts';
import { campusPhotoIndex } from '../src/campus-photo-index.ts';
import { validateWorkspace } from '../src/editor-validation.ts';
import {
  EditorValidationCache,
  ValidationTransport,
} from '../src/editor-validation-cache.ts';
import { photoEdits } from '../src/photo-workspace.ts';
const data = JSON.parse(await readFile('work/performance-campus.json', 'utf8'));
const buildings = data.map.features.filter(
  (f) => f.properties?.kind === 'building',
);
const time = (fn) => {
  const start = performance.now();
  const value = fn();
  return { ms: performance.now() - start, value };
};
const lookupBefore = [],
  lookupAfter = [],
  fullValidation = [],
  cachedValidation = [],
  replyBytes = [];
const index = time(() => campusPhotoIndex(data));
const edits = photoEdits(data, [], { photos: [data.photos[0]], removeIds: [] });
const cache = new EditorValidationCache(data, 1),
  transport = new ValidationTransport();
transport.encode(cache.validate(edits));
for (let i = 0; i < 5; i++) {
  lookupBefore.push(
    time(() =>
      buildings.map(
        (b) =>
          buildings.find((f) => f.properties?.id === b.properties?.id)
            ?.properties?.name ||
          data.places.find((p) => placeBuildingId(data, p) === b.properties?.id)
            ?.name ||
          'Unnamed building',
      ),
    ).ms,
  );
  lookupAfter.push(
    time(() => buildings.map((b) => index.value.name(b.properties.id))).ms,
  );
  const next = edits.map((e) => ({
    ...e,
    properties: {
      ...e.properties,
      photos: e.properties.photos.map((p) => ({
        ...p,
        caption: `Benchmark ${i}`,
      })),
    },
  }));
  const full = time(() => validateWorkspace(data, next));
  const fast = time(() => transport.encode(cache.validate(next)));
  fullValidation.push(full.ms);
  cachedValidation.push(fast.ms);
  replyBytes.push({
    full: Buffer.byteLength(JSON.stringify(full.value)),
    delta: Buffer.byteLength(JSON.stringify(fast.value)),
  });
}
const result = {
  campus: data.version,
  buildings: buildings.length,
  places: data.places.length,
  indexSetupMs: index.ms,
  lookupBefore,
  lookupAfter,
  fullValidation,
  cachedValidation,
  replyBytes,
};
await writeFile('work/core-performance.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
