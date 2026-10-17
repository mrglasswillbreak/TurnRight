import type { MapEdit } from './types';
import type { BuildingAppearance } from './visual-types';
export const BUILDING_PRESETS = {
  limestone: {
    name: 'Warm limestone',
    style: {
      wallColour: '#ded5bb',
      roofColour: '#9b9584',
      trimColour: '#f1e8d2',
      windowColour: '#526f7a',
    },
  },
  terracotta: {
    name: 'Terracotta and cream',
    style: {
      wallColour: '#e3d5bc',
      roofColour: '#9b6753',
      trimColour: '#f2e7d2',
      windowColour: '#526977',
    },
  },
  cool: {
    name: 'Cool stone',
    style: {
      wallColour: '#ced5d1',
      roofColour: '#73868b',
      trimColour: '#e9eddf',
      windowColour: '#496270',
    },
  },
} as const;
export type BuildingPreset = keyof typeof BUILDING_PRESETS;
/** Appearance only. Recorded dimensions, roofs, photos and individual surfaces survive. */
export function presetEdit(edit: MapEdit, preset: BuildingPreset): MapEdit {
  if (
    edit.kind !== 'building' ||
    edit.properties.modelDocument ||
    edit.properties.authoredModelRevision
  )
    throw new Error(
      'Select generated buildings. Authored models retain their materials.',
    );
  const previous: BuildingAppearance = edit.properties.appearance || {};
  return {
    ...edit,
    properties: {
      ...edit.properties,
      appearance: {
        ...previous,
        ...BUILDING_PRESETS[preset].style,
        provenance: [
          previous.provenance,
          `Illustrative ${BUILDING_PRESETS[preset].name.toLowerCase()} palette; not observed materials.`,
        ]
          .filter(Boolean)
          .join(' ')
          .slice(0, 2000),
      },
    },
  };
}
