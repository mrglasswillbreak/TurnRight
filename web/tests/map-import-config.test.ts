import { expect, it } from 'vitest';
import { importConfiguration, importUrl } from '../server/map-imports';
import {
  sameImportConfiguration,
  suggestedImportIdentifier,
  type ImportConfiguration,
  type ImportLayer,
} from '../src/map-import-types';
it('prefers inspected unique identities to duplicate legacy IDs', () => {
  const layer = {
    name: 'Parcels',
    fields: [
      { name: 'Id', unique: false },
      { name: 'OBJECTID', unique: false },
      { name: 'OBJECTID_1', unique: true },
    ],
  } as ImportLayer;
  expect(suggestedImportIdentifier(layer)).toBe('OBJECTID_1');
  layer.fields = [
    { name: 'Id', unique: false },
    { name: 'OBJECTID', unique: true },
  ];
  expect(suggestedImportIdentifier(layer)).toBe('OBJECTID');
  layer.fields = [{ name: 'Id', unique: false }];
  expect(suggestedImportIdentifier(layer)).toBeUndefined();
  layer.fields = [{ name: 'id' }];
  expect(suggestedImportIdentifier(layer)).toBe('id');
});
it('accepts bounded mappings and rejects duplicate layer roles and credential URLs', () => {
  const configuration = {
    layers: [{ layer: 'Buildings', role: 'building', idField: 'OBJECTID' }],
    attribution: 'University',
    license: 'CC0',
    redistributionConfirmed: true,
  };
  expect(importConfiguration(configuration)).toEqual(configuration);
  expect(() =>
    importConfiguration({
      ...configuration,
      layers: [...configuration.layers, ...configuration.layers],
    }),
  ).toThrow(/one valid role/);
  expect(importUrl('https://services.example.org/FeatureServer/0')).toBe(
    'https://services.example.org/FeatureServer/0',
  );
  for (const url of [
    'http://services.example.org',
    'https://user:password@example.org',
    'https://127.0.0.1/map',
    'https://example.org/?token=secret',
  ])
    expect(() => importUrl(url)).toThrow();
});

it('compares preview configurations after JSONB key reordering and draft recovery', () => {
  const local: ImportConfiguration = {
    layers: [{
      layer: 'Buildings',
      role: 'building',
      idField: 'OBJECTID',
      nameField: 'NAME',
      heightField: undefined,
    }],
    attribution: 'University GIS team',
    license: 'CC0',
    redistributionConfirmed: true,
  };
  const stored: ImportConfiguration = {
    license: 'CC0',
    layers: [{ nameField: 'NAME', idField: 'OBJECTID', role: 'building', layer: 'Buildings' }],
    redistributionConfirmed: true,
    attribution: 'University GIS team',
  };
  expect(JSON.stringify(local)).not.toBe(JSON.stringify(stored));
  expect(sameImportConfiguration(local, stored)).toBe(true);
  expect(sameImportConfiguration(structuredClone(local), stored)).toBe(true);
  expect(sameImportConfiguration(local, {
    ...stored, attribution: 'Different credit',
  })).toBe(false);
  expect(sameImportConfiguration(local, {
    ...stored, license: 'Different permission',
  })).toBe(false);
  expect(sameImportConfiguration(local, {
    ...stored, redistributionConfirmed: false,
  })).toBe(false);
  expect(sameImportConfiguration(local, {
    ...stored, layers: [{ ...stored.layers[0], nameField: 'TITLE' }],
  })).toBe(false);
  expect(sameImportConfiguration(local, {
    ...stored, layers: [{ ...stored.layers[0], role: 'skip' }],
  })).toBe(false);
  expect(sameImportConfiguration(local, {
    ...stored, layers: [{ ...stored.layers[0], crs: 'EPSG:3857' }],
  })).toBe(false);
  const layers: ImportConfiguration = {
    ...local,
    layers: [...local.layers, { layer: 'Paths', role: 'path', walkingAccess: 'private' }],
  };
  expect(sameImportConfiguration(layers, {
    ...layers, layers: [...layers.layers].reverse(),
  })).toBe(false);
  expect(sameImportConfiguration(layers, {
    ...layers, layers: [layers.layers[0], { ...layers.layers[1], walkingAccess: 'yes' }],
  })).toBe(false);
});
