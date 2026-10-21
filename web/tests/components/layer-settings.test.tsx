import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { LayerSettings } from '../../src/LayerSettings';
import { newLayer } from '../../src/campus-layers';
import type { LayerWorkspaceState } from '../../src/useLayerWorkspace';
import type { CampusLayer, LayerViewState } from '../../src/campus-layer-types';
import { render } from './render';
import {
  button,
  click,
  fill,
  choose,
  toggle,
  expand,
  setPicker,
} from './interact';

function fixture(role: CampusLayer['role'] = 'overlay') {
  const active = newLayer('Notes', role, 'map-layer:notes');
  const folder = newLayer('Survey folder', 'group', 'map-layer:folder');
  const save = vi.fn(),
    onCommit = vi.fn(),
    onZoom = vi.fn(),
    onDraw = vi.fn(),
    onSelect = vi.fn(),
    exportLayer = vi.fn();
  function Editor() {
    const [draft, setDraft] = useState(active),
      [message, setMessage] = useState('');
    const [view, onView] = useState<LayerViewState>({});
    const state = {
      active,
      draft,
      update: (patch: Partial<CampusLayer>) =>
        setDraft((d) => ({ ...d, ...patch })),
      style: (patch: CampusLayer['style']) =>
        setDraft((d) => ({ ...d, style: { ...d.style, ...patch } })),
      items: [active, folder],
      descendants: () => [active.id],
      setMessage,
      save,
      onZoom,
      view,
      onView,
      exportLayer,
      onCommit,
      rows: [
        {
          key: 'overlay:sign',
          id: 'sign',
          kind: 'overlay',
          geometry: { type: 'Point', coordinates: [3.2, 6.46] },
          properties: { name: 'Sign' },
        },
      ],
      layerIssues: new Map([
        [
          active.id,
          [
            {
              message: 'Sign needs review',
              featureKind: 'overlay',
              featureId: 'sign',
            },
          ],
        ],
      ]),
      onSelect,
      onDraw,
    } as unknown as LayerWorkspaceState;
    return (
      <>
        <LayerSettings state={state} />
        <output data-testid="layer">{JSON.stringify(draft)}</output>
        <output>{message}</output>
      </>
    );
  }
  return {
    Editor,
    active,
    save,
    onCommit,
    onZoom,
    onDraw,
    onSelect,
    exportLayer,
  };
}

it('saves presentation rules, duplicates geometry independently, and preserves draft validation', async () => {
  const f = fixture();
  await render(<f.Editor />);
  await fill('Name', 'Survey notes');
  await choose('Folder', 'map-layer:folder');
  await fill('Drawing order', '12');
  await choose('Cartographic band', 'landscape');
  await toggle('Show while editing');
  await toggle('Published visibility');
  await toggle('Include in release');
  await setPicker('color', '#123456');
  await fill('opacity', '0.5');
  await fill('lineWidth', '3');
  await fill('pointSize', '8');
  await fill('minZoom', '10');
  await fill('maxZoom', '20');
  await choose('Point symbol', 'diamond');
  await choose('Label field', 'label');
  await toggle('Show labels');
  await expand('Classification rules (0)');
  await click('Add rule');
  await choose('Rule 1 field', 'surface');
  await fill('Rule 1 value', 'asphalt');
  await setPicker('Rule 1 colour', '#654321');
  await click('Apply layer settings');
  expect(f.save).toHaveBeenLastCalledWith([
    expect.objectContaining({
      name: 'Survey notes',
      parentId: 'map-layer:folder',
      order: 12,
      band: 'landscape',
      editorVisible: false,
      included: false,
      publishedVisible: false,
      style: expect.objectContaining({
        color: '#123456',
        opacity: 0.5,
        symbol: 'diamond',
        labelField: 'label',
      }),
      rules: [
        { field: 'surface', value: 'asphalt', style: { color: '#654321' } },
      ],
    }),
  ]);
  await click('Zoom to layer');
  expect(f.onZoom).toHaveBeenCalledWith(['overlay:sign']);
  await click('Isolate temporarily');
  await expect
    .element(button('Isolate temporarily'))
    .toHaveAttribute('aria-pressed', 'true');
  await click('Isolate temporarily');
  await expect
    .element(button('Isolate temporarily'))
    .toHaveAttribute('aria-pressed', 'false');
  await click('Export GeoJSON');
  expect(f.exportLayer).toHaveBeenCalledOnce();
  await click('Archive layer');
  expect(f.save).toHaveBeenLastCalledWith([
    expect.objectContaining({ archived: true }),
  ]);
  await click('Duplicate layer');
  expect(f.onCommit.mock.calls[0][0]).toEqual([
    expect.objectContaining({ kind: 'layer' }),
    expect.objectContaining({
      id: expect.stringMatching(/^layer-copy:/),
      kind: 'overlay',
      geometry: { type: 'Point', coordinates: [3.2, 6.46] },
      properties: expect.objectContaining({
        geometryLineage: { operation: 'duplicate', parents: ['overlay:sign'] },
      }),
    }),
  ]);
  await expand('Layer issues (1)');
  await click('Sign needs review');
  expect(f.onSelect).toHaveBeenCalledWith('overlay', 'sign');
  await click('Draw point');
  await click('Draw line');
  await click('Draw polygon');
  expect(f.onDraw.mock.calls.map((c) => c[1])).toEqual([
    'Point',
    'LineString',
    'Polygon',
  ]);
  await click('Remove rule 1');
  await fill('opacity', '');
  await click('Reset to campus theme');
  expect(
    JSON.parse(page.getByTestId('layer').element().textContent!),
  ).toMatchObject({ style: {}, rules: [] });
  await fill('Name', '');
  f.save.mockClear();
  await click('Apply layer settings');
  expect(f.save).not.toHaveBeenCalled();
  await expect
    .element(page.getByText('Give this layer a valid identity and name.'))
    .toBeVisible();
});

it('prevents excluding or duplicating core routing layers', async () => {
  const f = fixture('path');
  await render(<f.Editor />);
  await expect
    .element(page.getByLabelText('Include in release'))
    .toBeDisabled();
  await expect.element(button('Duplicate layer')).toBeDisabled();
  await toggle('Lock editing');
  await click('Apply layer settings');
  expect(f.save).toHaveBeenLastCalledWith([
    expect.objectContaining({ included: true, locked: true }),
  ]);
});
