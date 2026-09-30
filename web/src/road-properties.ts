import type { CampusData, MapEdit } from './types';
import { featureEdit } from './editor-features';

/** Width evidence belongs to the source road. Reviewed surface geometry stays unchanged. */
export function propertyEdits(
  data: CampusData,
  drafts: MapEdit[],
  features: MapEdit[],
  key: string,
  value: unknown,
): MapEdit[] {
  const batch = new Map<string, MapEdit>();
  const put = (edit: MapEdit) => batch.set(`${edit.kind}:${edit.id}`, edit);
  for (const source of features) {
    const edit = {
      ...source,
      properties: {
        ...source.properties,
        [key]: value,
        ...(key === 'width' ? { widthEvidence: 'owner' } : {}),
      },
    };
    put(edit);
    if (
      ['width', 'widthEvidence', 'widthSource'].includes(key) &&
      source.properties.derivedSurface
    ) {
      const link = source.properties.derivedSurface as { sourceRoadId: string };
      const road = featureEdit(data, 'path', link.sourceRoadId, drafts);
      if (road)
        put({
          ...road,
          properties: {
            ...road.properties,
            [key]: value,
            ...(key === 'width' ? { widthEvidence: 'owner' } : {}),
          },
        });
    }
  }
  return [...batch.values()];
}
