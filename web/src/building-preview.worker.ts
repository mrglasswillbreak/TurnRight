/// <reference lib="webworker" />
import { createBuildingModel } from './building-model';
import { resolveBuildingVisual } from './building-surfaces';
import { buildingRevision, validBuildingModel } from './building-visuals';
import { validateBuildingStyle } from './building-style-validation';
import { detailRevision } from './building-facades';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import type { BuildingVisual } from './visual-types';
self.onmessage = ({
  data,
}: MessageEvent<{
  revision: number;
  features: Feature<Polygon | MultiPolygon>[];
  visuals: BuildingVisual[];
}>) => {
  const results = data.features.map((feature) => {
    const id = String(feature.properties?.id);
    try {
      const visual = resolveBuildingVisual(
        feature,
        data.visuals.find((v) => v.id === id),
      );
      const errors = validateBuildingStyle(
        {
          id,
          kind: 'building',
          geometry: feature.geometry,
          properties: feature.properties || {},
        },
        visual,
      );
      if (errors.length) throw new Error(errors.join(' '));
      visual.geometryRevision = buildingRevision(feature);
      visual.detailRevision = detailRevision(feature);
      const model = createBuildingModel(feature, visual);
      if (!validBuildingModel(model))
        throw new Error(
          'Building model exceeds the supported geometry budget.',
        );
      return { id, model, visual };
    } catch (error) {
      return { id, error: (error as Error).message };
    }
  });
  self.postMessage({ revision: data.revision, results });
};
