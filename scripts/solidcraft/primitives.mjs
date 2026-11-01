/** Small named CAD operations, kept in millimetres and regenerated in SolidCraft. */
export function geometryBuilder() {
  const stages = [],
    bodies = [],
    colors = new Map();
  let commands = [],
    serial = 0,
    heightParameter,
    heightValue;
  const command = (command, params) => commands.push({ command, params });
  const value = (n) => (typeof n === 'number' ? `${Number(n.toFixed(4))}` : n);
  const elevation = (n) =>
    typeof n === 'number' && heightParameter
      ? `${heightParameter}*${n / heightValue}`
      : n;
  const color = (name, colour, role, tier) => {
    bodies.push({ name, colour, role, tier });
    const key = `${colour}:${role}`;
    if (!colors.has(key)) colors.set(key, { colour, role, names: [] });
    colors.get(key).names.push(name);
  };
  const finishStage = (name) => {
    if (commands.length) stages.push({ name, commands });
    commands = [];
  };
  const plane = (wall, x, offset) => ({
    origin: [
      wall.a[0] + wall.u[0] * x + wall.n[0] * offset,
      wall.a[1] + wall.u[1] * x + wall.n[1] * offset,
      0,
    ],
    x_dir: [...wall.u, 0],
    y_dir: [0, 0, 1],
  });
  const loop = (points) =>
    command('sketch.line', {
      points: points.map((p) => p.map(value)),
      closed: true,
      infer: false,
    });
  function polygon(name, shape, height, offset, colour, tier = 'structure') {
    command('sketch.create', { plane: 'XY', offset, name: name + '_profile' });
    for (const ring of shape) loop(ring);
    command('sketch.solve', {});
    command('sketch.finish', {});
    command('solid.extrude', {
      distance: height,
      operation: 'new',
      name,
      body_name: name,
    });
    color(name, colour, name.includes('roof') ? 'roof' : 'wall', tier);
  }
  function panel(
    wall,
    x,
    bottom,
    width,
    height,
    depth,
    offset,
    colour,
    role = 'trim',
    tier = 'facade',
  ) {
    if (width < 5 || depth < 1 || (typeof height === 'number' && height < 5))
      return;
    const name = `${tier}_${role}_${++serial}`;
    command('solid.box', {
      length: role === 'frame' && width === 80 ? 'FrameWidth' : width,
      width: role === 'glass' ? 'GlassThickness' : depth,
      height: elevation(height),
      corner: [
        role === 'frame' && width === 80 ? '-FrameWidth/2' : -width / 2,
        role === 'glass' ? '-GlassThickness/2' : -depth / 2,
        0,
      ],
      operation: 'new',
      name,
      body_name: name,
    });
    command('solid.move', {
      bodies: [name],
      axis: [0, 0, 1],
      angle: wall.angle,
      translate: [
        wall.a[0] + wall.u[0] * x + wall.n[0] * offset,
        wall.a[1] + wall.u[1] * x + wall.n[1] * offset,
        elevation(bottom),
      ],
    });
    color(name, colour, role, tier);
    return name;
  }
  function diamond(wall, x, z, w, h, colour, innerScale = 0) {
    const name = `structure_diamond_${++serial}`;
    command('sketch.create', {
      plane: plane(wall, x, 400),
      name: name + '_profile',
    });
    loop([
      [0, -h / 2],
      [w / 2, 0],
      [0, h / 2],
      [-w / 2, 0],
    ]);
    // A reversed inner contour leaves the cream facade visible through the motif.
    if (innerScale > 0 && innerScale < 1)
      loop([
        [0, (-h * innerScale) / 2],
        [(-w * innerScale) / 2, 0],
        [0, (h * innerScale) / 2],
        [(w * innerScale) / 2, 0],
      ]);
    command('sketch.finish', {});
    command('solid.extrude', {
      distance: 45,
      direction: wall.inward,
      operation: 'new',
      name,
      body_name: name,
    });
    command('solid.move', { bodies: [name], translate: [0, 0, elevation(z)] });
    color(name, colour, 'diamond', 'structure');
  }
  function recesses(
    wall,
    openings,
    body,
    depth = 'WindowRecessDepth',
    offset = 30,
  ) {
    if (!openings.length) return;
    const name = `window_recesses_${++serial}`;
    command('sketch.create', {
      plane: plane(wall, 0, offset),
      name: name + '_profile',
    });
    for (const { x, z, width, height } of openings)
      loop([
        [x - width / 2, elevation(z)],
        [x + width / 2, elevation(z)],
        [x + width / 2, elevation(z + height)],
        [x - width / 2, elevation(z + height)],
      ]);
    command('sketch.finish', {});
    command('solid.extrude', {
      distance: depth,
      direction: wall.inward,
      operation: 'cut',
      targets: [body],
      name,
    });
  }
  function lettering(
    wall,
    x,
    z,
    text,
    height,
    colour,
    spacing = 40,
    offset = 100,
  ) {
    if (!/^[A-Z ]+$/.test(text))
      throw new Error('Named lettering requires connected uppercase glyphs.');
    const name = `fine_sign_${++serial}`,
      count = text.replaceAll(' ', '').length;
    const names = Array.from({ length: count }, (_, i) =>
      i ? `${name} (${i + 1})` : name,
    );
    const facing = plane(wall, x, offset);
    // Text is read from outside; the inward cutting plane reverses its lettering.
    if (wall.inward === 'positive') facing.x_dir = facing.x_dir.map((n) => -n);
    command('sketch.create', { plane: facing, name: name + '_profile' });
    command('sketch.text', {
      text,
      at: [0, elevation(z)],
      height,
      align: 'center',
      font: 'Arial',
      letter_spacing: spacing,
    });
    command('sketch.finish', {});
    command('solid.extrude', {
      distance: 45,
      direction: 'negative',
      operation: 'new',
      name,
      body_name: name,
    });
    for (const body of names) color(body, colour, 'sign', 'fine');
  }
  function appearances() {
    for (const entry of colors.values())
      command('appearance.assign', {
        bodies: entry.names,
        color: entry.colour,
        pbr: {
          metallic: entry.role === 'glass' ? 0.2 : 0,
          roughness: entry.role === 'glass' ? 0.22 : 0.78,
          dielectric_ior: 1.5,
        },
      });
    finishStage('materials');
  }
  function wallProfile(
    wall,
    x,
    z,
    points,
    depth,
    offset,
    colour,
    role,
    tier = 'structure',
  ) {
    const name = `${tier}_${role}_${++serial}`;
    command('sketch.create', {
      plane: plane(wall, x, offset),
      name: name + '_profile',
    });
    loop(points.map(([a, b]) => [a, elevation(b + z)]));
    command('sketch.finish', {});
    command('solid.extrude', {
      distance: depth,
      direction: wall.inward,
      operation: 'new',
      name,
      body_name: name,
    });
    color(name, colour, role, tier);
  }
  function roofTriangle(points, parameter, nominal, colour) {
    const a = points[0];
    let [, b, c] = points;
    const sub = (a, b) => a.map((n, i) => n - b[i]);
    const dot = (a, b) => a.reduce((sum, n, i) => sum + n * b[i], 0);
    const unit = (a) => a.map((n) => n / Math.hypot(...a));
    const cross = (a, b) => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    if (cross(sub(b, a), sub(c, a))[2] < 0) [b, c] = [c, b];
    const u = unit(sub(b, a)),
      n = unit(cross(u, sub(c, a))),
      v = cross(n, u);
    if (!n.every(Number.isFinite)) return;
    const name = `structure_roof_panel_${++serial}`;
    command('sketch.create', {
      plane: { origin: a, x_dir: u, y_dir: v },
      name: name + '_profile',
    });
    loop([
      [0, 0],
      [Math.hypot(...sub(b, a)), 0],
      [dot(sub(c, a), u), dot(sub(c, a), v)],
    ]);
    command('sketch.finish', {});
    command('solid.extrude', {
      distance: 'RoofSlabThickness',
      direction: 'negative',
      operation: 'new',
      name,
      body_name: name,
    });
    command('solid.move', {
      bodies: [name],
      translate: [0, 0, `${parameter}-${nominal}`],
    });
    color(name, colour, 'roof', 'structure');
  }
  return {
    stages,
    bodies,
    command,
    finishStage,
    polygon,
    panel,
    diamond,
    recesses,
    lettering,
    appearances,
    roofTriangle,
    wallProfile,
    setHeight: (name, value) => {
      heightParameter = name;
      heightValue = value;
    },
  };
}
