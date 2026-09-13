import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { applyEdits } from '../src/editor-model';
import { findDuplicateCandidates } from '../src/duplicates';
import { snapTarget } from '../src/editor-features';
import type { CampusData, MapEdit, Position } from '../src/types';

const data: CampusData = JSON.parse(
  readFileSync(
    new URL(
      '../public/packages/lasu-4e4c8008b38b/campus.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const building = data.map.features.find(
  (f) => f.properties?.kind === 'building',
)!;
const metadata: MapEdit[] = [
  {
    id: String(building.properties?.id),
    kind: 'building',
    geometry: building.geometry,
    properties: {
      ...building.properties,
      name: 'Benchmark metadata correction',
    },
  },
];
function measure(label: string, run: () => unknown, count = 7) {
  const times: number[] = [];
  for (let i = 0; i < count; i++) {
    const start = performance.now();
    run();
    times.push(performance.now() - start);
  }
  const warm = times.slice(1).sort((a, b) => a - b);
  const median =
    (warm[Math.floor((warm.length - 1) / 2)] +
      warm[Math.floor(warm.length / 2)]) /
    2;
  console.log(
    JSON.stringify({
      label,
      firstMs: +times[0].toFixed(2),
      warmMedianMs: +median.toFixed(2),
    }),
  );
}
console.log(
  JSON.stringify({
    runtime: process.version,
    fixture: data.version,
    buildings: data.map.features.filter(
      (f) => f.properties?.kind === 'building',
    ).length,
    directedEdges: data.graph.edges.length,
  }),
);
let baseline: { applyEdits: typeof applyEdits } | undefined;
if (process.argv[2]) {
  baseline = (await import(pathToFileURL(process.argv[2]).href)) as {
    applyEdits: typeof applyEdits;
  };
  measure('baseline empty edits', () => baseline!.applyEdits(data, []));
  measure('baseline metadata edit', () => baseline!.applyEdits(data, metadata));
}
measure('indexed empty edits', () => applyEdits(data, []));
measure('indexed metadata edit', () => applyEdits(data, metadata));
measure('duplicate review', () => findDuplicateCandidates(data));
const points = data.graph.nodes.slice(0, 100).map((n) => n.coordinates);
const project = (point: Position) => ({
  x: point[0] * 100000,
  y: point[1] * 100000,
});
measure('100 indexed snap queries', () =>
  points.forEach((p) => snapTarget(data, p, project)),
);
if (baseline) {
  const connections = (value: CampusData) =>
    JSON.stringify(
      value.graph.edges.map((e) => [
        e.id,
        e.from,
        e.to,
        e.accessible,
        e.geometryBlocked,
      ]),
    );
  for (const edits of [[], metadata]) {
    if (
      connections(baseline.applyEdits(data, edits).data) !==
      connections(applyEdits(data, edits).data)
    )
      throw new Error('Directed connectivity or obstruction results changed');
  }
  console.log(
    'Directed connectivity and obstruction results match the baseline for both edit cases.',
  );
}
