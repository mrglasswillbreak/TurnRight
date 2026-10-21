import { useState, type ComponentProps } from 'react';
import { expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { ModelPatternProperties } from '../../src/ModelPatternProperties';
import { emptyAuthoring } from '../../src/model-authoring';
import type { FacadeElement, ModelAuthoring } from '../../src/visual-types';
import type { MapEdit } from '../../src/types';
import { render } from './render';
import { expand, click, fill, choose } from './interact';

it('groups details, saves reusable presets and preserves detached pattern slots', async () => {
  const elements: FacadeElement[] = [
    {
      id: 'a',
      kind: 'window',
      x: 0.2,
      bottom: 1,
      width: 1,
      height: 1,
      depth: 0,
      colour: '#123456',
      count: 1,
      spacing: 0,
    },
    {
      id: 'b',
      kind: 'window',
      x: 0.5,
      bottom: 1,
      width: 1,
      height: 1,
      depth: 0,
      colour: '#123456',
      count: 1,
      spacing: 0,
    },
  ];
  const stamp = () => ({ name: 'Bay', wallLength: 10, elements });
  const ungroup = vi.fn(),
    editPattern = vi.fn(),
    paste = vi.fn(),
    wall = vi.fn(),
    wholeRows = vi.fn();
  function Editor() {
    const [authoring, setAuthoring] = useState<ModelAuthoring>({
      ...emptyAuthoring(),
      patterns: [
        {
          id: 'pattern',
          name: 'Windows',
          wallId: 'wall',
          members: ['a', 'b'],
          seed: [elements[0]],
          slots: ['0:0:0', '0:1:0'],
          rows: 1,
          columns: 2,
          stepX: 2,
          stepY: 0,
        },
      ],
      presets: [{ id: 'preset', ...stamp() }],
    });
    const [selected, setSelected] = useState(['a', 'b']),
      [name, setName] = useState(''),
      [patternId, setPatternId] = useState('');
    const [pattern, setPattern] = useState({
      rows: 1,
      columns: 1,
      stepX: 1,
      stepY: 1,
    });
    const draft: MapEdit = {
      id: 'building',
      kind: 'building',
      geometry: { type: 'Point', coordinates: [3.2, 6.46] },
      properties: { modelAuthoring: authoring },
    };
    const props: ComponentProps<typeof ModelPatternProperties> = {
      workspace: undefined,
      draft,
      authoring,
      activeWall: 'wall',
      elements,
      selected,
      locked: [],
      name,
      setName,
      patternId,
      setPatternId,
      pattern,
      setPattern,
      setSelected,
      before: false,
      setWholeRows: wholeRows,
      setPaste: paste,
      setTargetWall: wall,
      grouped: true,
      ungroupSelection: ungroup,
      stamp,
      editPattern,
      updateElements: (_elements, next) => {
        setAuthoring(next!);
        return true;
      },
      commit: (next) => {
        setAuthoring(next.properties.modelAuthoring!);
        return true;
      },
    };
    return (
      <>
        <ModelPatternProperties {...props} />
        <button onClick={() => setSelected(['a'])}>Select one detail</button>
        <output data-testid="authoring">{JSON.stringify(authoring)}</output>
        <output data-testid="pattern">{JSON.stringify(pattern)}</output>
      </>
    );
  }
  const authoring = () =>
    JSON.parse(
      page.getByTestId('authoring').element().textContent!,
    ) as ModelAuthoring;
  await render(<Editor />);
  await expand('Groups, patterns & presets');
  await fill('Name', '  Main windows  ');
  await click('Group selection');
  expect(authoring().groups[0]).toMatchObject({
    name: 'Main windows',
    wallId: 'wall',
    members: ['a', 'b'],
  });
  await click('Ungroup');
  expect(ungroup).toHaveBeenCalledOnce();
  await click('Save preset');
  expect(authoring().presets).toHaveLength(2);
  expect(authoring().presets[1].elements).toEqual(elements);
  await choose('Pattern', 'pattern');
  expect(wholeRows).toHaveBeenCalledWith(['a', 'b']);
  for (const [label, value] of [
    ['Rows', '2'],
    ['Columns', '3'],
    ['Horizontal step (m)', '1.5'],
    ['Vertical step (m)', '2'],
  ])
    await fill(label, value);
  expect(
    JSON.parse(page.getByTestId('pattern').element().textContent!),
  ).toEqual({ rows: 2, columns: 3, stepX: 1.5, stepY: 2 });
  await click('Update pattern');
  expect(editPattern).toHaveBeenCalledOnce();
  await click('Select one detail');
  await click('Detach detail from pattern');
  expect(authoring().patterns[0]).toMatchObject({
    members: ['b'],
    slots: ['0:1:0'],
    excluded: ['0:0:0'],
  });
  await page
    .getByRole('button', { name: 'Insert preset · Bay' })
    .first()
    .click();
  expect(paste).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Bay', elements }),
  );
  expect(wall).toHaveBeenCalledWith('wall');
});
