import { type CampusIdentity } from './campus-context';
import type { CampusData } from './types';
import type {
  CampusImport,
  ImportConfiguration,
  ImportLayerMapping,
} from './map-import-types';
import { suggestedImportIdentifier } from './map-import-types';
export type Identity = CampusIdentity & { boundary: CampusData['boundary'] };

export const blank: ImportConfiguration = {
  layers: [],
  attribution: '',
  license: '',
  redistributionConfirmed: false,
};

export const roles: ImportLayerMapping['role'][] = [
  'building',
  'path',
  'place',
  'entrance',
  'barrier',
  'landcover',
  'road-surface',
  'overlay',
  'boundary',
  'skip',
];

export function suggestMappings(job: CampusImport): ImportConfiguration {
  return {
    ...job.configuration,
    layers: (job.summary?.layers || []).map((layer) => {
      const existing = job.configuration.layers.find(
        (l) => l.layer === layer.name,
      );
      const field = (names: string[]) =>
        layer.fields.find(
          (f) =>
            names.includes(f.name.toLowerCase()) ||
            (!!f.alias && names.includes(f.alias.toLowerCase())),
        )?.name;
      return (
        existing || {
          layer: layer.name,
          role: layer.suggestedRole,
          idField: suggestedImportIdentifier(layer),
          nameField: field(['name', 'title', 'building_name']),
          heightField: field(['height', 'building_height', 'height_m']),
          categoryField: field(['category', 'building_category', 'amenity']),
          roadClassField: field(['highway', 'road_class', 'roadtype']),
          surfaceField: field(['surface', 'surface_type']),
          widthField: field(['width', 'road_width']),
          landUseField: field(['landuse', 'land_use', 'natural']),
          vegetationField: field(['vegetation', 'vegetation_type']),
          floorsField: field([
            'floors',
            'building:levels',
            'storeys',
            'levels',
          ]),
        }
      );
    }),
  };
}
