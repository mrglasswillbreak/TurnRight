import { expect, it } from 'vitest';
import { importConfiguration, importUrl } from '../server/map-imports';
import {
  suggestedImportIdentifier,
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
