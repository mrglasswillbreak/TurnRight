/** Replace identical placed boxes with native two-axis body patterns. */
export function patternRecipe(recipe) {
  const sourceBodies = new Map(recipe.bodies.map((b) => [b.name, b]));
  const parameters = new Map(
    recipe.stages
      .flatMap((s) => s.commands)
      .filter((c) => c.command === 'parameters.add')
      .map((c) => [c.params.name, parseFloat(c.params.expression)]),
  );
  const scalar = (value) => {
    if (typeof value === 'number') return value;
    const match = /^(H\d+)\*([\deE.+-]+)$/.exec(value);
    return match ? parameters.get(match[1]) * Number(match[2]) : NaN;
  };
  const rounded = (n) => Math.round(n * 100) / 100;
  const metadata = new Map(sourceBodies),
    sources = {};
  let patterns = 0;
  // A greedy longest arithmetic sequence preserves every original placement.
  const sequences = (items, coordinate) => {
    const remaining = items
        .slice()
        .sort((a, b) => coordinate(a) - coordinate(b)),
      result = [];
    while (remaining.length) {
      const first = remaining[0],
        origin = coordinate(first);
      let best = [first],
        spacing = 0;
      for (const candidate of remaining.slice(1, 65)) {
        const step = coordinate(candidate) - origin;
        if (step < 0.01) continue;
        const run = [first];
        for (let i = 1; i <= remaining.length; i++) {
          const next = remaining.find(
            (v) => Math.abs(coordinate(v) - origin - step * i) < 0.01,
          );
          if (!next) break;
          run.push(next);
        }
        if (run.length > best.length) {
          best = run;
          spacing = step;
        }
      }
      result.push({ items: best, spacing });
      for (const item of best) remaining.splice(remaining.indexOf(item), 1);
    }
    return result;
  };
  const stages = recipe.stages
    .filter((s) => s.name !== 'materials')
    .map((stage) => {
      const groups = new Map(),
        other = [];
      for (let i = 0; i < stage.commands.length; i++) {
        const box = stage.commands[i],
          move = stage.commands[i + 1];
        if (
          box.command !== 'solid.box' ||
          move?.command !== 'solid.move' ||
          move.params.bodies?.[0] !== box.params.body_name ||
          !Number.isFinite(scalar(move.params.translate?.[2]))
        ) {
          other.push(box);
          continue;
        }
        i++;
        const body = sourceBodies.get(box.params.body_name),
          [x, y, z] = move.params.translate;
        const angle = ((move.params.angle || 0) * Math.PI) / 180,
          u = [Math.cos(angle), Math.sin(angle)];
        const key = JSON.stringify([
          box.params.length,
          box.params.width,
          box.params.height,
          box.params.corner,
          move.params.angle,
          rounded(-u[1] * x + u[0] * y),
          body.role,
          body.colour,
          body.tier,
        ]);
        if (!groups.has(key)) groups.set(key, []);
        groups
          .get(key)
          .push({ box, move, body, u, x: u[0] * x + u[1] * y, z: scalar(z) });
      }
      const commands = [];
      for (const items of groups.values()) {
        const rows = new Map();
        for (const item of items) {
          const key = rounded(item.z);
          if (!rows.has(key)) rows.set(key, []);
          rows.get(key).push(item);
        }
        const alignments = new Map();
        for (const row of rows.values())
          for (const run of sequences(row, (p) => p.x)) {
            const first = run.items[0],
              key = JSON.stringify([
                rounded(first.x),
                rounded(run.spacing),
                run.items.length,
              ]);
            if (!alignments.has(key)) alignments.set(key, []);
            alignments.get(key).push({ ...run, z: first.z });
          }
        for (const aligned of alignments.values())
          for (const vertical of sequences(aligned, (p) => p.z)) {
            const row = vertical.items[0],
              seed = row.items[0],
              columns = row.items.length,
              count = columns * vertical.items.length;
            commands.push(seed.box, seed.move);
            if (count === 1) continue;
            const parameter = /^(H\d+)\*/.exec(
              seed.move.params.translate[2],
            )?.[1];
            commands.push({
              command: 'solid.pattern.rectangular',
              params: {
                bodies: [seed.body.name],
                dir1: [...seed.u, 0],
                count1: columns,
                spacing1: row.spacing || 1,
                ...(vertical.items.length > 1
                  ? {
                      dir2: [0, 0, 1],
                      count2: vertical.items.length,
                      spacing2: parameter
                        ? `${parameter}*${vertical.spacing / parameters.get(parameter)}`
                        : vertical.spacing,
                    }
                  : {}),
                name: `pattern_${++patterns}`,
              },
            });
            for (const original of vertical.items.flatMap((r) => r.items))
              metadata.delete(original.body.name);
            for (let column = 0; column < columns; column++)
              for (let r = 0; r < vertical.items.length; r++) {
                const index = column * vertical.items.length + r,
                  name = seed.body.name + (index ? ` (${index + 1})` : '');
                metadata.set(name, { ...seed.body, name });
                sources[name] = vertical.items[r].items[column].body.name;
              }
          }
      }
      return { name: stage.name, commands: [...commands, ...other] };
    });
  const colours = new Map();
  for (const body of metadata.values()) {
    const key = `${body.colour}:${body.role}`;
    if (!colours.has(key)) colours.set(key, { ...body, names: [] });
    colours.get(key).names.push(body.name);
  }
  stages.push({
    name: 'materials',
    commands: [...colours.values()].map((c) => ({
      command: 'appearance.assign',
      params: {
        bodies: c.names,
        color: c.colour,
        pbr: {
          metallic: c.role === 'glass' ? 0.35 : 0,
          roughness: c.role === 'glass' ? 0.2 : 0.78,
          dielectric_ior: 1.5,
        },
      },
    })),
  });
  if (metadata.size !== sourceBodies.size)
    throw new Error('Pattern conversion changed the component count.');
  return {
    ...recipe,
    bodies: [...metadata.values()],
    stages,
    patterns,
    componentSources: sources,
  };
}
