import { expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BuildingAppearanceEditor } from '../src/BuildingAppearanceEditor';
import type { CampusData, MapEdit } from '../src/types';

it('can render immediately after a selected wing or wall is removed by an outline change', () => {
  const edit: MapEdit = {
    id: 'building',
    kind: 'building',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [3.2, 6.46],
          [3.2002, 6.46],
          [3.2002, 6.4602],
          [3.2, 6.4602],
          [3.2, 6.46],
        ],
      ],
    },
    properties: { height: 12, appearance: { wallColour: '#123456' } },
  };
  for (const selection of [
    { buildingId: edit.id, partId: 'removed-wing', wallId: 'removed-wall' },
    { buildingId: edit.id, partId: 'building:wing:0', wallId: 'removed-wall' },
  ]) {
    const html = renderToStaticMarkup(
      createElement(BuildingAppearanceEditor, {
        edit,
        data: {} as CampusData,
        mode: 'appearance',
        embedded: true,
        selection,
        roofDraft: null,
        onMode() {},
        onSelection() {},
        onRoofDraft() {},
        onApplyRoof() {},
        onEdit() {
          throw new Error(
            'Opening a recovered inspector must not save an edit',
          );
        },
      }),
    );
    expect(html).toContain('#123456');
    expect(html).toContain('Building appearance editor');
  }
});
