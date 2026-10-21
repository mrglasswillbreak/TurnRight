import { act, useRef, useState } from 'react';
import { expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { useRoofText } from '../../src/use-roof-text';
import { buildingTopology } from '../../src/building-surfaces';
import { customRoofSurface } from '../../src/custom-roof';
import type { MapEdit, Position } from '../../src/types';
import type { RoofText } from '../../src/visual-types';
import { render } from './render';
import { click, fill, blur, choose, setPicker, field } from './interact';

function fixture() {
  const geometry = {
    type: 'Polygon' as const,
    coordinates: [
      [
        [3.2, 6.46],
        [3.2003, 6.46],
        [3.2003, 6.4603],
        [3.2, 6.4603],
        [3.2, 6.46],
      ],
    ],
  };
  const topology = buildingTopology({
    type: 'Feature',
    geometry,
    properties: { id: 'library' },
  });
  const partId = topology.parts[0].id;
  const roof = customRoofSurface(
    geometry.coordinates,
    { eaves: 5, points: [], lines: [] },
    6,
  );
  const applied = vi.fn();
  function Editor() {
    const [edit, setEdit] = useState<MapEdit>({
      id: 'library',
      kind: 'building',
      geometry,
      properties: { name: 'Library', height: 6, topology },
    });
    const [selectedId, onSelect] = useState<string>();
    const svg = useRef<SVGSVGElement>(null);
    const state = useRoofText({
      edit,
      partId,
      roof,
      svg,
      selectedId,
      onSelect,
      project: (p) => [(p[0] - 3.2) * 1e6, (6.4603 - p[1]) * 1e6],
      unproject: (x, y) => [3.2 + x / 1e6, 6.4603 - y / 1e6] as Position,
      onApply: (next) => {
        applied(next);
        setEdit(next);
      },
    });
    return (
      <>
        {state.properties}
        <svg ref={svg} width="320" height="320">
          {state.overlay}
        </svg>
        <output data-testid="labels">
          {JSON.stringify(
            edit.properties.appearance?.roofTexts?.[partId] || [],
          )}
        </output>
        <output data-testid="preview">{JSON.stringify(state.preview)}</output>
        <button onClick={state.cancel}>Cancel drag</button>
      </>
    );
  }
  return { Editor, applied };
}
const labels = () =>
  JSON.parse(page.getByTestId('labels').element().textContent!) as RoofText[];
const drag = (
  element: Element,
  type: string,
  x: number,
  y: number,
  id = 1,
  button = 0,
) =>
  act(() => {
    const bounds = element.closest('svg')!.getBoundingClientRect();
    element.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerId: id,
        button,
        clientX: bounds.left + x,
        clientY: bounds.top + y,
      }),
    );
  });

it('edits, validates, duplicates and deletes roof labels without changing building geometry', async () => {
  const f = fixture();
  await render(<f.Editor />);
  await click('Add roof text');
  expect(labels()).toHaveLength(1);
  const firstId = labels()[0].id;
  await fill('Roof surface text', 'Library');
  await blur('Roof surface text');
  for (const [name, value] of [
    ['Text width (m)', '3'],
    ['Text height (m)', '0.8'],
    ['Text rotation (degrees)', '30'],
  ]) {
    await fill(name, value);
    await blur(name);
  }
  await choose('Roof text weight', 'regular');
  await choose('Roof text alignment', 'left');
  await act(() =>
    (field('Roof text colour').element() as HTMLInputElement).focus(),
  );
  await setPicker('Roof text colour', '#123456');
  await blur('Roof text colour');
  const position = labels()[0].coordinates;
  await fill('Text longitude', String(position[0]));
  await blur('Text longitude');
  await fill('Text latitude', String(position[1]));
  await blur('Text latitude');
  expect(labels()[0]).toMatchObject({
    text: 'Library',
    width: 3,
    height: 0.8,
    rotation: 30,
    colour: '#123456',
    textWeight: 'regular',
    textAlign: 'left',
  });
  await fill('Text width (m)', '0');
  await blur('Text width (m)');
  expect(labels()[0].width).toBe(3);
  await expect
    .element(field('Text width (m)'))
    .toHaveAttribute('aria-invalid', 'true');
  await fill('Text width (m)', '2');
  await blur('Text width (m)');
  await click('Duplicate text');
  expect(labels()).toHaveLength(2);
  expect(labels()[1].id).not.toBe(firstId);
  await fill('Roof surface text', 'Duplicate');
  await blur('Roof surface text');
  expect(labels()[0].text).toBe('Library');
  await choose('Roof text label', firstId);
  await click('Delete text');
  expect(labels().map((t) => t.text)).toEqual(['Duplicate']);
  await choose('Roof text label', labels()[0].id);
  await click('Delete text');
  expect(labels()).toEqual([]);
  expect(f.applied.mock.calls.at(-1)![0].geometry).toEqual(
    f.applied.mock.calls[0][0].geometry,
  );
});

it('previews only the captured pointer, commits a valid drag, and cancels unfinished movement', async () => {
  const f = fixture();
  const view = await render(<f.Editor />);
  await click('Add roof text');
  const element = view.container.querySelector('[data-roof-text]')!;
  vi.spyOn(element, 'setPointerCapture').mockImplementation(() => {});
  const before = structuredClone(labels());
  await drag(element, 'pointerdown', 120, 120);
  await drag(element, 'pointermove', 125, 125, 2);
  expect(page.getByTestId('preview').element().textContent).toBe('null');
  await drag(element, 'pointermove', 125, 125);
  expect(labels()).toEqual(before);
  expect(page.getByTestId('preview').element().textContent).not.toBe('null');
  await drag(element, 'pointerup', 125, 125);
  expect(labels()[0].coordinates[0]).toBeCloseTo(
    before[0].coordinates[0] + 0.000005,
    8,
  );
  const saved = structuredClone(labels());
  await drag(element, 'pointerdown', 125, 125);
  await drag(element, 'pointermove', 130, 130);
  await drag(element, 'pointercancel', 130, 130);
  await drag(element, 'pointerup', 130, 130);
  expect(labels()).toEqual(saved);
  await drag(element, 'pointerdown', 125, 125, 1, 2);
  await drag(element, 'pointermove', 150, 150);
  await drag(element, 'pointerup', 150, 150);
  expect(labels()).toEqual(saved);
});
