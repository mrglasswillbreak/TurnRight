import { act, useState } from 'react';
import { expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { CampusImportMapping } from '../../src/CampusImportMapping';
import type { CampusWorkspaceState } from '../../src/useCampusWorkspace';
import type {
  CampusImport,
  ImportConfiguration,
} from '../../src/map-import-types';
import { render } from './render';
import { choose, click, fill, toggle, setPicker } from './interact';

it('maps renamed sources, units, coordinates and reuse rights into a reviewable preview', async () => {
  const startPhase = vi.fn();
  const previous: ImportConfiguration = {
    layers: [
      {
        layer: 'Old roads',
        identity: 'roads',
        role: 'path',
        idField: 'id',
        widthField: 'width',
      },
    ],
    attribution: 'Survey team',
    license: 'CC0',
    redistributionConfirmed: true,
  };
  const job: CampusImport = {
    id: 'job',
    campus_id: 'campus',
    source_id: 'source',
    status: 'mapping',
    phase: 'inspect',
    run_token: 'run',
    created_at: '',
    updated_at: '',
    configuration: previous,
    summary: {
      warnings: [],
      errors: [],
      duplicates: [],
      features: { type: 'FeatureCollection', features: [] },
      totalFeatures: 10,
      layers: [
        {
          name: 'New roads',
          count: 10,
          requiresCoordinates: true,
          suggestedRole: 'path',
          geometryTypes: ['Point'],
          fields: ['id', 'name', 'height', 'width', 'x', 'y'].map((name) => ({
            name,
          })),
          format: 'CSV',
          exchange: {
            idField: 'id',
            sourceCollection: 'roads',
            sourceCrs: 'EPSG:4326',
            surveyDate: '2026-10-20',
            modifiedAt: 1792454400000,
            rights: previous,
          },
        },
      ],
      counts: { added: 10, modified: 0, removed: 0, skipped: 0 },
    },
  };
  function Editor() {
    const [configuration, setConfiguration] = useState<ImportConfiguration>({
      ...previous,
      layers: [],
    });
    const state = {
      job,
      configuration,
      setConfiguration,
      sources: [{ id: 'source', configuration: previous }],
      busy: false,
      mappedCount: configuration.layers.filter((l) => l.role !== 'skip').length,
      startPhase,
    } as unknown as CampusWorkspaceState;
    return (
      <>
        <CampusImportMapping state={state} />
        <output data-testid="configuration">
          {JSON.stringify(configuration)}
        </output>
      </>
    );
  }
  const config = () =>
    JSON.parse(
      page.getByTestId('configuration').element().textContent!,
    ) as ImportConfiguration;
  await render(<Editor />);
  await expect
    .element(page.getByRole('button', { name: 'Build preview' }))
    .toBeDisabled();
  await choose('Update existing data', 'replace-layer');
  await fill('Existing layer identity', 'roads');
  expect(config().layers[0]).toMatchObject({
    layer: 'New roads',
    identity: 'roads',
    role: 'path',
    idField: 'id',
    widthField: 'width',
  });
  await fill('Source projection', 'EPSG:4326');
  await choose('Walking access', 'yes');
  for (const [label, value] of [
    ['Name', 'name'],
    ['Height', 'height'],
    ['Longitude / X', 'x'],
    ['Latitude / Y', 'y'],
  ])
    await choose(label, value);
  await choose('Height units', 'ft');
  await choose('Width units', 'ft');
  expect(config().layers[0]).toMatchObject({
    walkingAccess: 'yes',
    longitudeField: 'x',
    latitudeField: 'y',
    heightUnit: 'ft',
    widthUnit: 'ft',
  });
  await choose('Import as', 'overlay');
  await setPicker('Colour', '#123456');
  await fill('Opacity', '0.7');
  await fill('Layer order', '12');
  await toggle('Visible');
  await fill('Attribution', 'Campus survey');
  await fill('License / permission', 'CC BY 4.0');
  await toggle(
    'This source permits public and offline redistribution with the stated attribution.',
  );
  expect(config()).toMatchObject({
    refreshMode: 'replace-layer',
    attribution: 'Campus survey',
    license: 'CC BY 4.0',
    redistributionConfirmed: false,
    layers: [{ color: '#123456', opacity: 0.7, order: 12, visible: false }],
  });
  await act(() =>
    page
      .getByLabelText(/^Height/)
      .first()
      .selectOptions('Not mapped'),
  );
  expect(config().layers[0]).not.toHaveProperty('heightField');
  await click('Build preview');
  expect(startPhase).toHaveBeenCalledWith('preview');
  // Mapping a file does not approve publication or change the previous source.
  expect(previous.layers[0]).toEqual({
    layer: 'Old roads',
    identity: 'roads',
    role: 'path',
    idField: 'id',
    widthField: 'width',
  });
});
