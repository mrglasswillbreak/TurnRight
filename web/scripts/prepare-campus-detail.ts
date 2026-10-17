/** Build local review candidates against an immutable published/accepted snapshot.
 * Never writes to the editor or publishes. Rebase edits through normal review first.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import type { CampusData, MapEdit, Position } from '../src/types';
import type {
  SectorModels,
  VisualCatalogue,
  VisualSector,
} from '../src/visual-types';
import { buildingRevision, validBuildingModel } from '../src/building-visuals';
import { detailRevision } from '../src/building-facades';
import { resolveBuildingVisual } from '../src/building-surfaces';
import { buildingDisplay } from '../src/map-display';
import { featureEdit } from '../src/editor-features';
import { createBuildingModel } from '../src/building-model';
import { presetEdit, type BuildingPreset } from '../src/building-presets';
import { generateScenery, sceneryRevision } from '../src/campus-scenery';
import { repairArcGisParts } from '../src/arcgis-rings';
import { findDuplicateCandidates } from '../src/duplicates';

const [input, output] = process.argv.slice(2);
if (!input || !output)
  throw Error(
    'Usage: node --import tsx scripts/prepare-campus-detail.ts baseline.json NEW_OUTPUT_DIRECTORY',
  );
await fs.mkdir(output, { recursive: false });
const raw = await fs.readFile(input),
  baseline = JSON.parse(raw.toString()) as CampusData,
  data = structuredClone(baseline);
const hash = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');
const origin = process.env.PUBLISHED_MAP_URL || 'https://turnright.vercel.app';
const conflicts = new Set(
  findDuplicateCandidates(data, [])
    .filter((c) => c.kind === 'building')
    .flatMap((c) => c.ids),
);
const edits: MapEdit[] = [],
  report: { id: string; name: string; treatment: string; needed: string[] }[] =
    [];
const previous = new Map(data.visuals?.buildings.map((b) => [b.id, b]));
const catalogue: VisualCatalogue = structuredClone(
  data.visuals || {
    schemaVersion: 1,
    revision: '',
    bytes: 0,
    buildings: [],
    sectors: [],
    references: [],
  },
);
const generated = new Map<string, SectorModels>(),
  changed = new Set<string>();
const palettes: BuildingPreset[] = ['limestone', 'cool', 'terracotta'];
for (const feature of data.map.features) {
  const p = feature.properties || {},
    id = String(p.id);
  if (p.kind === 'land' && !p.landClass) {
    const classifications: Record<string, string> = {
      'green area': 'green',
      'bare surface': 'bare',
      'built up area': 'developed',
      'water body': 'water',
      'water bodies': 'water',
    };
    const landClass =
      classifications[
        String(p.name || '')
          .trim()
          .toLowerCase()
      ];
    if (landClass) {
      p.landClass = landClass;
      edits.push({
        id,
        kind: 'land',
        geometry: feature.geometry,
        properties: structuredClone(p),
      });
    }
  }
  if (p.kind !== 'building') continue;
  const visual = previous.get(id),
    display = buildingDisplay(p);
  const needed = visual?.needed?.length
    ? visual.needed
    : [
        'Dated roof and facade evidence.',
        ...(display.kind === 'illustrative'
          ? ['Measured height or documented floor count.']
          : []),
      ];
  let treatment = 'preserve-authored';
  if (
    !p.modelDocument &&
    !p.authoredModelRevision &&
    !Object.keys(p.appearance || {}).length &&
    visual?.level !== 'detailed'
  ) {
    if (
      !['Polygon', 'MultiPolygon'].includes(feature.geometry.type) ||
      repairArcGisParts(feature) ||
      conflicts.has(id)
    )
      treatment = 'held-geometry-or-duplicate-review';
    else {
      const original = {
        id,
        kind: 'building' as const,
        geometry: feature.geometry,
        properties: p,
      };
      const edit = presetEdit(
        original,
        palettes[parseInt(hash(id).slice(0, 2), 16) % palettes.length],
      );
      edit.properties.appearance = {
        ...edit.properties.appearance,
        windows: false,
        confidence: 'inferred',
      };
      const candidate = { ...feature, properties: edit.properties } as Feature<
        Polygon | MultiPolygon
      >;
      const next = resolveBuildingVisual(candidate, visual);
      next.geometryRevision = buildingRevision(candidate);
      next.detailRevision = detailRevision(candidate);
      next.inferred = [
        ...new Set([
          ...(visual?.inferred || []),
          'Illustrative palette and simplified facade; colour does not assert real materials.',
          ...(display.kind === 'illustrative'
            ? ['Illustrative 6 m height; real height remains unknown.']
            : []),
        ]),
      ];
      next.needed = needed;
      try {
        const model = createBuildingModel(candidate, next);
        if (!validBuildingModel(model))
          throw Error('Generated model failed integrity validation');
        const centre = model.origin;
        const sectorId = `sector-detail-${Math.floor((centre[0] - data.bounds[0][0]) * 500)}-${Math.floor((centre[1] - data.bounds[0][1]) * 500)}`;
        next.sectorId = sectorId;
        if (!generated.has(sectorId))
          generated.set(sectorId, {
            schemaVersion: 1,
            id: sectorId,
            models: [],
          });
        generated.get(sectorId)!.models.push(model);
        changed.add(id);
        previous.set(id, next);
        feature.properties = edit.properties;
        edits.push(edit);
        treatment =
          display.kind === 'illustrative'
            ? 'illustrative-detail-candidate'
            : 'source-height-detail-candidate';
      } catch (error) {
        treatment = 'held-model-validation';
        needed.push(String(error));
      }
    }
  }
  report.push({ id, name: String(p.name || ''), treatment, needed });
}
// Curated identifiers remain regular place edits, subject to the same review as all other metadata.
const names = new Set([
  'lasu international library',
  'lasu senate building',
  'makanjuola lecture theatre',
  'main library',
  'senate building',
  'teslim olawale elias library',
]);
const curated = new Set<string>();
for (const place of data.places) {
  const name = place.name.toLowerCase();
  if (!names.has(name) || curated.has(name)) continue;
  curated.add(name);
  place.landmark = true;
  const edit = featureEdit(data, 'place', place.id, []);
  if (edit)
    edits.push({ ...edit, properties: { ...edit.properties, landmark: true } });
}
const asset = async (
  url: string,
  expected: { sha256: string; bytes: number },
) => {
  const local = path.resolve('public', '.' + url);
  let buffer = await fs.readFile(local).catch(() => null);
  if (
    !buffer ||
    buffer.length !== expected.bytes ||
    hash(buffer) !== expected.sha256
  ) {
    const response = await fetch(new URL(url, origin), {
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) throw Error(`Asset unavailable: ${url}`);
    buffer = Buffer.from(await response.arrayBuffer());
  }
  if (buffer.length !== expected.bytes || hash(buffer) !== expected.sha256)
    throw Error(`Asset integrity failed: ${url}`);
  return buffer;
};
const sectors: VisualSector[] = [];
async function saveSector(sector: SectorModels, bounds: [Position, Position]) {
  if (!sector.models.length) return;
  const body = JSON.stringify(sector),
    sha256 = hash(body),
    filename = `${sector.id}-${sha256.slice(0, 12)}.json`;
  await fs.writeFile(path.join(output, filename), body);
  sectors.push({
    id: sector.id,
    bounds,
    buildingIds: sector.models.map((m) => m.id),
    sha256,
    bytes: Buffer.byteLength(body),
    url: `/packages/visual-${sha256.slice(0, 12)}/${filename}`,
    contentType: 'application/json',
  });
}
for (const sector of catalogue.sectors) {
  const models = JSON.parse(
    (await asset(sector.url, sector)).toString(),
  ) as SectorModels;
  models.models = models.models.filter((m) => !changed.has(m.id));
  await saveSector(models, sector.bounds);
}
for (const sector of generated.values()) {
  const points = sector.models.map((m) => m.origin);
  const margin = 0.002;
  await saveSector(sector, [
    [
      Math.min(...points.map((p) => p[0])) - margin,
      Math.min(...points.map((p) => p[1])) - margin,
    ],
    [
      Math.max(...points.map((p) => p[0])) + margin,
      Math.max(...points.map((p) => p[1])) + margin,
    ],
  ]);
}
for (const texture of [
  ...(catalogue.textures || []),
  ...(catalogue.modelTextures || []),
])
  await fs.writeFile(
    path.join(output, path.basename(texture.url)),
    await asset(texture.url, texture),
  );
catalogue.sectors = sectors;
catalogue.buildings = [...previous.values()];
catalogue.bytes = sectors.reduce((n, s) => n + s.bytes, 0);
catalogue.scenery = {
  version: 1,
  classification: 'illustrative',
  seed: 17102026,
  spacing: 15,
  maxInstances: 1500,
  regions: data.map.features
    .filter(
      (f) =>
        f.properties?.kind === 'land' &&
        f.properties.landClass === 'green' &&
        ['Polygon', 'MultiPolygon'].includes(f.geometry.type),
    )
    .map((f) => ({
      featureId: String(f.properties!.id),
      geometryRevision: sceneryRevision(f.geometry),
      reviewedAt: new Date().toISOString(),
    })),
};
catalogue.revision = hash(JSON.stringify(catalogue)).slice(0, 20);
data.visuals = catalogue;
const scenery = generateScenery(data);
const totalBytes =
  catalogue.bytes +
  [...(catalogue.textures || []), ...(catalogue.modelTextures || [])].reduce(
    (n, s) => n + s.bytes,
    0,
  ) +
  Buffer.byteLength(JSON.stringify(catalogue.scenery));
if (totalBytes > 12 * 1024 * 1024)
  throw Error(`Visual budget exceeded: ${totalBytes}`);
const coverage = {
  schemaVersion: 1,
  baselineVersion: baseline.version,
  baselineSha256: hash(raw),
  buildings: report,
  buildingCount: report.length,
  counts: Object.fromEntries(
    [...new Set(report.map((r) => r.treatment))].map((t) => [
      t,
      report.filter((r) => r.treatment === t).length,
    ]),
  ),
  vegetationRegions: catalogue.scenery.regions.length,
  illustrativeInstances: scenery.length,
  visualBytes: totalBytes,
  landmarks: data.places
    .filter((p) => p.landmark)
    .map((p) => ({ id: p.id, name: p.name })),
  review:
    'Private candidate only. Region review uses accepted source land-use classes, not a new vegetation survey. Rebase against the current private workspace; confirm source rights and release independently.',
};
for (const [file, value] of Object.entries({
  'candidate.json': data,
  'edits.json': edits,
  'catalogue.json': catalogue,
  'coverage.json': coverage,
}))
  await fs.writeFile(path.join(output, file), JSON.stringify(value));
console.log(
  JSON.stringify({
    output,
    buildings: report.length,
    ...coverage.counts,
    vegetationRegions: coverage.vegetationRegions,
    illustrativeInstances: scenery.length,
    visualBytes: totalBytes,
  }),
);
