import type { Feature, Polygon } from 'geojson';
import type { BuildingVisual } from '../src/visual-types';
import type { DetailedBuildingModel, ModelLod } from '../src/model-lod-types';
import { newModelDocument, type ModelDetailTier } from '../src/model-document';
import { primitive } from '../src/model-primitives';
import { buildingRevision } from '../src/building-visuals';

export function detailFixture() {
  const document = newModelDocument([3.2, 6.46]);
  document.replaceVisual = true;
  document.objects = (['structure', 'facade', 'fine'] as ModelDetailTier[]).map(
    (tier, i) => {
      const object = primitive('box');
      object.id = tier;
      object.detailTier = tier;
      object.transform.position = [i * 0.1, i * 0.1, i * 0.1];
      return object;
    },
  );
  const feature: Feature<Polygon> = {
    type: 'Feature',
    properties: {
      id: 'building',
      kind: 'building',
      floors: 2,
      modelDocument: document,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [3.2, 6.46],
          [3.2002, 6.46],
          [3.2002, 6.4601],
          [3.2, 6.4601],
          [3.2, 6.46],
        ],
      ],
    },
  };
  const visual: BuildingVisual = {
    id: 'building',
    name: 'Building',
    geometryRevision: buildingRevision(feature),
    level: 'detailed',
    height: 6,
    heightKind: 'floor-derived',
    floors: 2,
    roofForm: 'flat',
    wallColour: '#eeddbb',
    roofColour: '#886655',
    confidence: 'observed',
    sources: [],
    observed: [],
    inferred: [],
    needed: [],
  };
  const descriptor: DetailedBuildingModel = {
    version: 1,
    id: visual.id,
    geometryRevision: visual.geometryRevision,
    origin: document.origin,
    bounds: [
      [3.199, 6.459],
      [3.201, 6.461],
    ],
    levels: ([0, 1, 2] as ModelLod[]).map((level) => {
      const sha256 = String(level).repeat(64);
      return {
        level,
        geometricError: [0, 0.1, 1][level],
        triangles: [36, 24, 12][level],
        geometryBytes: 100,
        assets: [
          { url: `/packages/detail-${sha256}.json`, sha256, bytes: 100 },
        ],
      };
    }),
    textures: [],
  };
  return { feature, document, visual, descriptor };
}
