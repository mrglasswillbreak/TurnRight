import { expect, it } from 'vitest';
import { patternRecipe } from '../../scripts/solidcraft/patterns.mjs';

it('preserves irregular facade placements and component identities when replacing boxes with CAD patterns', () => {
  const bodies: { name: string; colour: string; role: string; tier: string }[] =
    [];
  const commands: { command: string; params: Record<string, unknown> }[] = [];
  const positions = new Map<string, number[]>();
  for (let floor = 0; floor < 4; floor++)
    for (const column of [0, 1, 3, 4, 6]) {
      const name = `glass-${floor}-${column}`,
        p = [column * 1200, 700, floor * 3000];
      bodies.push({ name, colour: '#aaaaaa', role: 'glass', tier: 'facade' });
      positions.set(name, p);
      commands.push(
        {
          command: 'solid.box',
          params: {
            name,
            body_name: name,
            length: 800,
            width: 40,
            height: 1800,
            corner: [-400, -20, 0],
          },
        },
        {
          command: 'solid.move',
          params: {
            bodies: [name],
            angle: 0,
            translate: [p[0], p[1], `H0*${p[2] / 12000}`],
          },
        },
      );
    }
  const recipe = {
    bodies,
    stages: [
      {
        name: 'parameters',
        commands: [
          {
            command: 'parameters.add',
            params: { name: 'H0', expression: '12000 mm' },
          },
        ],
      },
      { name: 'facade', commands },
    ],
  };
  const result = patternRecipe(recipe);
  expect(result.patterns).toBeGreaterThan(0);
  expect(result.bodies).toHaveLength(bodies.length);
  const actual = new Map<string, number[]>(),
    scalar = (value: number | string) =>
      typeof value === 'number' ? value : 12000 * Number(value.split('*')[1]);
  for (const { command, params } of result.stages.flatMap(
    (stage: (typeof recipe.stages)[number]) => stage.commands,
  )) {
    if (command === 'solid.move')
      actual.set(
        (params.bodies as string[])[0],
        (params.translate as (number | string)[]).map(scalar),
      );
    if (command === 'solid.pattern.rectangular') {
      const name = (params.bodies as string[])[0],
        seed = actual.get(name)!;
      const columns = Number(params.count1),
        rows = Number(params.count2 || 1);
      for (let column = 0; column < columns; column++)
        for (let row = 0; row < rows; row++) {
          const index = column * rows + row,
            copy = index ? `${name} (${index + 1})` : name;
          const dir1 = params.dir1 as number[],
            dir2 = (params.dir2 || [0, 0, 1]) as number[];
          actual.set(
            copy,
            seed.map(
              (n, axis) =>
                n +
                column * dir1[axis] * scalar(params.spacing1 as number) +
                row *
                  dir2[axis] *
                  scalar((params.spacing2 || 0) as number | string),
            ),
          );
        }
    }
  }
  for (const body of result.bodies)
    expect(actual.get(body.name)).toEqual(
      positions.get(result.componentSources[body.name] || body.name),
    );
  expect(new Set(Object.values(result.componentSources)).size).toBe(
    Object.keys(result.componentSources).length,
  );
});
