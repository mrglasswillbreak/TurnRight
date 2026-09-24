import inventory from '../../data/photo-models/inventory.json';
import type { CampusData, MapEdit } from './types';
import { featureEdit } from './editor-features';
import { validateBuildingStyle } from './building-style-validation';
export function photoModelProposals(data: CampusData, edits: MapEdit[] = []) {
  return inventory.buildings.map((record) => {
    const current = featureEdit(data, 'building', record.buildingId, edits);
    const photos = (data.photos || []).filter(
      (p) =>
        record.photoIds.includes(p.id) &&
        p.buildingId === record.buildingId &&
        inventory.photos.some(
          (source) => source.id === p.id && source.sha256 === p.sha256,
        ),
    );
    if (!current || current.deleted || photos.length !== record.photoIds.length)
      return {
        record,
        reason:
          'The building or approved photographic evidence changed. Review the new source before applying.',
      };
    const appearance = { ...current.properties.appearance };
    const additions = Object.fromEntries(
      Object.entries(record.settings).filter(
        ([key]) =>
          appearance[key as keyof typeof record.settings] === undefined,
      ),
    );
    const evidence = {
      photoIds: record.photoIds,
      observed: record.observed,
      estimated: record.estimated,
      needed: record.needed,
      checkedAt: inventory.checkedAt,
    };
    if (
      !Object.keys(additions).length &&
      JSON.stringify(appearance.photoEvidence) === JSON.stringify(evidence)
    )
      return {
        record,
        reason:
          'Photographic observations are already in the draft or published map.',
      };
    const properties = {
      ...current.properties,
      appearance: { ...appearance, ...additions, photoEvidence: evidence },
    };
    // Previously unknown height only. Existing owner measurements and custom roofs win.
    if (
      record.observedFloors &&
      !Number(current.properties.height) &&
      !current.properties.floors &&
      !current.properties.appearance?.height
    ) {
      Object.assign(properties, {
        floors: record.observedFloors,
        height: record.observedFloors * 3,
        heightMode: 'floors',
        heightEstimated: true,
      });
      for (const [key, value] of Object.entries(record.palette || {}))
        if (!(key in appearance))
          Object.assign(properties.appearance, { [key]: value });
      if (appearance.windows === undefined)
        Object.assign(properties.appearance, { windows: true });
    }
    const edit = { ...current, properties };
    const errors = validateBuildingStyle(edit);
    return errors.length
      ? { record, reason: errors.join(' ') }
      : { record, edit };
  });
}
