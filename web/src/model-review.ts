import { facadeErrors, facadeMatches, facadeWalls } from './building-facades';
import { modelFeature, placementErrors, wallMetrics } from './model-authoring';
import type { CampusData, MapEdit } from './types';

/** Review is explicit and building-scoped; damaged assignments retain their flags. */
export function reviewModelWalls(
  edit: MapEdit,
  data: CampusData,
  at = new Date().toISOString(),
) {
  const feature = modelFeature(edit);
  const walls = facadeWalls(feature);
  const facades = { ...edit.properties.appearance?.facades };
  const reviewed: string[] = [],
    blocked: { wallId: string; message: string }[] = [];
  for (const [wallId, facade] of Object.entries(facades)) {
    if (
      facade.reviewedAt &&
      !facade.needsReview &&
      facadeMatches(facade, feature)
    )
      continue;
    const label =
      walls.find((w) => w.wallId === wallId)?.label || 'Removed wall';
    try {
      if (!facadeMatches(facade, feature))
        throw new Error('Confirm its wall match first.');
      const metrics = wallMetrics(
        feature,
        wallId,
        data.visuals?.buildings.find((b) => b.id === edit.id),
      );
      const candidate = { ...facade, needsReview: false, reviewedAt: at };
      const isolated = modelFeature({
        ...edit,
        properties: {
          ...edit.properties,
          appearance: {
            ...edit.properties.appearance,
            roofTexts: undefined,
            facades: { [wallId]: candidate },
          },
        },
      });
      const errors = [
        ...placementErrors(
          candidate.elements,
          metrics.length,
          metrics.eaves,
        ).map((e) => e.message),
        ...facadeErrors(isolated, data.photos, true),
      ];
      if (errors.length) throw new Error([...new Set(errors)].join(' '));
      facades[wallId] = candidate;
      reviewed.push(wallId);
    } catch (error) {
      blocked.push({
        wallId,
        message: `${label}: ${(error as Error).message}`,
      });
    }
  }
  return {
    reviewed,
    blocked,
    edit: {
      ...edit,
      properties: {
        ...edit.properties,
        appearance: { ...edit.properties.appearance, facades },
      },
    } as MapEdit,
  };
}
