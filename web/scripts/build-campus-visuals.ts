import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import type { CampusData, Position } from '../src/types';
import type {
  BuildingVisual,
  VisualCatalogue,
  SectorModels,
} from '../src/visual-types';
import { buildingRevision } from '../src/building-visuals';
import { buildingDisplay, buildingPlace } from '../src/map-display';
import { appearanceColours } from '../src/map-palette';
import { findDuplicateCandidates } from '../src/duplicates';
import { createBuildingModel, footprintAssessment } from './building-model';
import { repairArcGisParts } from '../src/arcgis-rings';

const input = process.argv[2] || '../data/seed/campus.json';
const output = process.argv[3] || '../data/visuals';
const data = JSON.parse(await fs.readFile(input, 'utf8')) as CampusData;
const evidence = JSON.parse(
  await fs.readFile('../data/building-evidence.json', 'utf8'),
);
const hash = (s: string | Buffer) =>
  createHash('sha256').update(s).digest('hex');
const buildings = data.map.features.filter(
  (f): f is Feature<Polygon | MultiPolygon> =>
    f.properties?.kind === 'building' &&
    ['Polygon', 'MultiPolygon'].includes(f.geometry.type),
);
const overlaps = findDuplicateCandidates(data, []).filter(
  (c) => c.kind === 'building',
);
const sectors = new Map<string, SectorModels>();
const catalogue: VisualCatalogue = {
  schemaVersion: 1,
  revision: '',
  bytes: 0,
  buildings: [],
  sectors: [],
  references: evidence.references,
};
for (const sourceFeature of buildings) {
  const repair = repairArcGisParts(sourceFeature);
  const feature = repair
    ? { ...sourceFeature, geometry: repair }
    : sourceFeature;
  const p = feature.properties!,
    id = String(p.id),
    record = evidence.buildings[id];
  const display = buildingDisplay(p),
    colours = appearanceColours(p);
  const polygons =
    feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;
  const points = polygons.flat(2) as Position[];
  const supported = display.kind !== 'illustrative';
  const observedFloors =
    display.kind === 'recorded' ? undefined : record?.floors;
  const height = observedFloors ? observedFloors * 3 : display.metres;
  const level = record?.level || (supported ? 'simplified' : 'extrusion');
  const roof = p.appearance?.roofForm || record?.roofForm || 'flat';
  const visual: BuildingVisual = {
    id,
    placeId: buildingPlace(data, feature)?.id,
    name: p.name || 'Unnamed building',
    geometryRevision: buildingRevision(feature),
    level,
    height,
    heightKind: observedFloors ? 'observed-floors' : display.kind,
    floors:
      observedFloors ||
      (display.kind === 'floor-derived'
        ? Math.round(display.metres / 3)
        : undefined),
    roofForm: roof,
    wallColour: p.appearance?.wallColour || record?.wallColour || colours.wall,
    roofColour: p.appearance?.roofColour || record?.roofColour || colours.roof,
    confidence: p.appearance?.confidence || (record ? 'observed' : 'inferred'),
    sources: [String(p.source), ...(record?.sources || [])],
    observed: [
      'Georeferenced source footprint, including its mapped wings and courtyards.',
      ...(supported ? [display.description] : []),
      ...(record?.observed || []),
    ],
    inferred: [
      ...(level === 'extrusion'
        ? ['Illustrative 6 m height; real height unknown.']
        : display.kind === 'recorded'
          ? []
          : [
              'Floor-derived total height uses 3 m per floor; no surveyed metre height.',
            ]),
      ...(record?.inferred ||
        (supported
          ? [
              'Roof form and material not documented; flat roof is a simplified cap.',
              'Colours are the campus palette, not observed materials.',
            ]
          : [])),
      ...(level === 'detailed'
        ? [
            'Window spacing, trim thickness and hidden elevations are simplified illustrative treatments.',
          ]
        : []),
      ...(p.appearance?.provenance
        ? [`Editor appearance reference: ${p.appearance.provenance}`]
        : []),
    ],
    needed: [
      ...(record?.needed ||
        (supported
          ? ['Dated roof and facade references matched to this footprint.']
          : [
              'Documented floor count or measured height.',
              'Identifiable roof and facade references.',
            ])),
    ],
    footprint: {
      ...footprintAssessment(feature),
      sourceRetrievedAt: data.sources.find((s) => s.id === p.source)
        ?.retrievedAt,
    },
    ...(repair
      ? {
          geometryReview: {
            baselineRevision: buildingRevision(sourceFeature),
            geometry: repair,
            reason:
              'Separate ArcGIS exterior rings were imported as holes. Regroup the original coordinates as separate wings; preserve the ID and entrance associations.',
          },
        }
      : {}),
  };
  if (repair)
    visual.needed.push(
      'Accept the separate-wing geometry correction in the editor before this model can replace its extrusion.',
    );
  const conflicts = overlaps.filter((c) => c.ids.includes(id));
  if (conflicts.length)
    visual.needed.push(
      `Review overlapping source footprints: ${conflicts.flatMap((c) => c.ids.filter((x) => x !== id)).join(', ')}. No routing identities have been merged.`,
    );
  const modelConflict = conflicts.some((c) =>
    c.ids.some((otherId) => {
      if (otherId === id) return false;
      const other = buildings.find((f) => f.properties?.id === otherId);
      return (
        other &&
        (evidence.buildings[otherId] ||
          buildingDisplay(other.properties!).kind !== 'illustrative')
      );
    }),
  );
  if (modelConflict) {
    visual.level = 'extrusion';
    visual.needed.push(
      'Resolve the competing model identity before authoring architectural detail. Existing source extrusion retained.',
    );
  }
  if (
    roof !== 'flat' &&
    (polygons.length !== 1 ||
      polygons[0].length !== 1 ||
      polygons[0][0].length !== 5)
  ) {
    if (!modelConflict) visual.level = 'simplified';
    visual.inferred.push(
      'Compound pitched roof remains a flat cap until the ridge layout can be supported.',
    );
    visual.needed.push(
      'Roof plan or overhead evidence for individual wing ridges.',
    );
  }
  if (visual.level !== 'extrusion') {
    const center: Position = [
      points.reduce((s, p) => s + p[0], 0) / points.length,
      points.reduce((s, p) => s + p[1], 0) / points.length,
    ];
    const sectorId = `sector-${Math.floor((center[0] - data.bounds[0][0]) * 500)}-${Math.floor((center[1] - data.bounds[0][1]) * 500)}`;
    visual.sectorId = sectorId;
    if (!sectors.has(sectorId))
      sectors.set(sectorId, { schemaVersion: 1, id: sectorId, models: [] });
    sectors.get(sectorId)!.models.push(createBuildingModel(feature, visual));
  }
  catalogue.buildings.push(visual);
}
await fs.mkdir(output, { recursive: true });
for (const sector of [...sectors.values()].sort((a, b) =>
  a.id.localeCompare(b.id),
)) {
  const bytes = JSON.stringify(sector),
    digest = hash(bytes),
    file = `${sector.id}-${digest.slice(0, 12)}.json`;
  await fs.writeFile(path.join(output, file), bytes);
  const points = buildings
    .filter((f) => sector.models.some((m) => m.id === f.properties?.id))
    .flatMap((f) =>
      f.geometry.type === 'Polygon'
        ? f.geometry.coordinates.flat()
        : f.geometry.coordinates.flat(2),
    );
  catalogue.sectors.push({
    id: sector.id,
    url: `/packages/visual-${digest.slice(0, 12)}/${file}`,
    sha256: digest,
    bytes: Buffer.byteLength(bytes),
    buildingIds: sector.models.map((m) => m.id),
    bounds: [
      [
        Math.min(...points.map((p) => p[0])),
        Math.min(...points.map((p) => p[1])),
      ],
      [
        Math.max(...points.map((p) => p[0])),
        Math.max(...points.map((p) => p[1])),
      ],
    ],
  });
}
catalogue.bytes = catalogue.sectors.reduce((s, g) => s + g.bytes, 0);
if (catalogue.bytes > 12 * 1024 * 1024)
  throw new Error('Campus model assets exceed 12 MB. Optimize the meshes.');
catalogue.revision = hash(JSON.stringify(catalogue)).slice(0, 16);
await fs.writeFile(
  path.join(output, 'catalogue.json'),
  JSON.stringify(catalogue, null, 2),
);
const counts = Object.fromEntries(
  ['detailed', 'simplified', 'extrusion'].map((k) => [
    k,
    catalogue.buildings.filter((b) => b.level === k).length,
  ]),
);
await fs.writeFile(
  path.join(output, 'coverage.md'),
  `# Campus building evidence assessment\n\nAssessed ${buildings.length} buildings from ${data.version}. ${JSON.stringify(counts)}. Model assets: ${catalogue.bytes.toLocaleString()} bytes in ${sectors.size} sectors.\n\nEvery footprint is retained at source scale and orientation; metre heights derived from floor counts remain approximate. Overlaps remain review candidates, never automatic routing merges. Reference photographs are not bundled.\n\n| Building | ID | Treatment | References still needed |\n|---|---|---|---|\n` +
    catalogue.buildings
      .map(
        (b) =>
          `| ${b.name.replaceAll('|', '/')} | ${b.id} | ${b.level} | ${b.needed.join(' ').replaceAll('|', '/')} |`,
      )
      .join('\n') +
    '\n',
);
console.log({
  buildings: buildings.length,
  ...counts,
  sectors: sectors.size,
  bytes: catalogue.bytes,
  revision: catalogue.revision,
});
await fs.writeFile(
  path.join(output, 'reference-sheets.md'),
  '# Building reference sheets\n\nCoordinates, dimensions and orientation come from the georeferenced campus footprint. Bearings describe the longest mapped edge (0–180° from north), not a photographed facade. Width/depth are east–west/north–south bounds. No photograph was used to infer horizontal scale.\n\n' +
    catalogue.buildings
      .map(
        (b) =>
          `## ${b.name} · ${b.id}\n\n- Treatment: ${b.level}; confidence: ${b.confidence}.\n- Footprint: ${b.footprint!.widthMetres} × ${b.footprint!.depthMetres} m bounds; ${b.footprint!.areaSquareMetres} m²; longest edge ${b.footprint!.longestEdgeBearing}°; ${b.footprint!.polygonParts} parts; ${b.footprint!.courtyards} courtyards.\n- Source retrieved: ${b.footprint!.sourceRetrievedAt || 'unknown'} (survey date unknown).\n- Height: ${b.height} m (${b.heightKind}); roof: ${b.roofForm}; wall/roof: ${b.wallColour}/${b.roofColour}.\n- Supported: ${b.observed.join(' ')}\n- Inferred: ${b.inferred.join(' ')}\n- Needed: ${b.needed.join(' ')}\n- References: ${b.sources
            .map((id) => {
              const ref = catalogue.references.find((r) => r.id === id);
              return ref
                ? `[${id}](${ref.url}) · ${ref.author} · ${ref.date} · ${ref.license}`
                : id;
            })
            .join('; ')}\n`,
      )
      .join('\n'),
);
