/** Entrances retain visible depth and lettering; sizes are explicit estimates. */
export function nameboard(
  g,
  wall,
  x,
  z,
  width,
  text,
  colour,
  background = '#eee9d8',
  offset = 90,
) {
  const height = Math.min(550, width / 10);
  g.panel(
    wall,
    x,
    z,
    width,
    height,
    90,
    offset,
    background,
    'signboard',
    'facade',
  );
  g.lettering(
    wall,
    x,
    z + height * 0.2,
    text,
    Math.min(height * 0.65, width / (text.length * 0.8)),
    colour,
    5,
    offset + 70,
  );
}

function educationPortico(g, wall, x, width, height, H, part, settings) {
  const span = width + 1000,
    front = 2300,
    back = -1200,
    eaves = height + 450,
    rise = Math.min(1200, width * 0.18),
    ridge = Math.max(0, span / 2 - (front - back) / 2);
  const point = (a, b, z) => [
    wall.a[0] + wall.u[0] * (x + a) + wall.n[0] * b,
    wall.a[1] + wall.u[1] * (x + a) + wall.n[1] * b,
    z,
  ];
  const p = [
    point(-span / 2, front, eaves),
    point(span / 2, front, eaves),
    point(span / 2, back, eaves),
    point(-span / 2, back, eaves),
    point(-ridge, (front + back) / 2, eaves + rise),
    point(ridge, (front + back) / 2, eaves + rise),
  ];
  for (const indices of [
    [0, 1, 5],
    [0, 5, 4],
    [1, 2, 5],
    [2, 3, 4],
    [2, 4, 5],
    [3, 0, 4],
  ])
    g.roofTriangle(
      indices.map((i) => p[i]),
      `H${part}*${eaves / H}`,
      eaves,
      settings.roof,
    );
  g.panel(
    wall,
    x,
    height,
    span,
    450,
    front - back,
    (front + back) / 2,
    settings.trim,
    'education_portico_fascia',
    'structure',
  );
  for (const ratio of [-0.5, -1 / 6, 1 / 6, 0.5])
    g.panel(
      wall,
      x + width * ratio,
      0,
      280,
      height,
      350,
      front - 250,
      settings.accent,
      'education_portico_column',
      'structure',
    );
  g.lettering(
    wall,
    x,
    height + 90,
    'FACULTY OF EDUCATION',
    Math.min(290, span / 19),
    '#263c59',
    5,
    front + 30,
  );
}

export function entrance(g, wall, L, H, settings, part) {
  if (
    settings.entrance === false ||
    ['cps', 'school', 'student'].includes(settings.style)
  )
    return;
  const { panel, recesses } = g;
  const width =
    settings.entryWidth ||
    (settings.style === 'hall' ? 11037 : Math.min(L * 0.32, 7500));
  const height =
    settings.entryHeight ||
    (settings.style === 'hall' ? 3800 : Math.min(H * 0.5, 3300));
  const x = L * (settings.entryX ?? 0.5);
  recesses(wall, [{ x, z: 0, width, height }], `structure_wing_${part}`, 1200);
  panel(
    wall,
    x,
    100,
    width - 200,
    height - 100,
    35,
    -1050,
    settings.style === 'postgrad' ? '#323a37' : settings.glass,
    settings.style === 'postgrad' ? 'entrance_shadow' : 'glass',
  );
  if (settings.style === 'postgrad') {
    const bars = Math.max(8, Math.round((width - 200) / 180));
    for (let i = 0; i <= bars; i++)
      panel(
        wall,
        x - (width - 200) / 2 + ((width - 200) * i) / bars,
        100,
        28,
        height - 100,
        45,
        -880,
        settings.trim,
        'entrance_grille',
        'fine',
      );
    for (const z of [height * 0.5, height * 0.84])
      panel(
        wall,
        x,
        z,
        width - 200,
        35,
        45,
        -880,
        settings.trim,
        'entrance_grille',
        'fine',
      );
  }
  for (const side of [-1, 1])
    panel(
      wall,
      x + side * (width / 2 - 60),
      0,
      120,
      height,
      1120,
      -500,
      settings.trim,
      'entrance_reveal',
      'structure',
    );
  panel(
    wall,
    x,
    height - 100,
    width,
    100,
    1120,
    -500,
    settings.trim,
    'entrance_reveal',
    'structure',
  );
  for (let d = 1; d < 4; d++)
    panel(
      wall,
      x - width / 2 + (width * d) / 4,
      100,
      65,
      height - 100,
      85,
      -970,
      settings.frame || settings.trim,
      'door_frame',
      'fine',
    );
  panel(
    wall,
    x,
    height * 0.7,
    width - 200,
    65,
    85,
    -970,
    settings.frame || settings.trim,
    'door_frame',
    'fine',
  );
  for (let step = 0; step < 4; step++)
    panel(
      wall,
      x,
      step * 120,
      width + 700 - step * 100,
      120,
      1600 - step * 300,
      800 - step * 150,
      settings.trim,
      'step',
      'structure',
    );
  if (settings.style === 'hall') {
    nameboard(
      g,
      wall,
      x,
      4400,
      width * 0.4,
      'CBT CENTRE',
      '#eeeeea',
      settings.wall,
    );
    g.lettering(wall, x, 4000, 'LASU', 280, '#eeeeea', 10, 160);
    return;
  }
  if (settings.style === 'education') {
    educationPortico(g, wall, x, width, height, H, part, settings);
    return;
  }
  const canopyColour =
    settings.style === 'management' ? '#e9e6d9' : settings.accent;
  if (!['postgrad', 'ict', 'sdg'].includes(settings.style)) {
    panel(
      wall,
      x,
      height,
      width + 700,
      250,
      2000,
      600,
      canopyColour,
      'canopy',
      'structure',
    );
    for (const side of [-1, 1])
      panel(
        wall,
        x + side * (width / 2 + 250),
        0,
        300,
        height,
        350,
        1200,
        canopyColour,
        'column',
        'structure',
      );
  }
  if (['management', 'transport'].includes(settings.style)) {
    g.wallProfile(
      wall,
      x,
      height + 250,
      [
        [-width / 2 - 350, 0],
        [width / 2 + 350, 0],
        [0, width * 0.25],
      ],
      180,
      1650,
      canopyColour,
      'entrance_pediment',
    );
    nameboard(
      g,
      wall,
      x,
      height + 250,
      width + 500,
      settings.style === 'management'
        ? 'FACULTY OF MANAGEMENT SCIENCES'
        : 'SCHOOL OF TRANSPORT',
      '#253e65',
      canopyColour,
      1700,
    );
  }
  if (settings.style === 'arts')
    nameboard(
      g,
      wall,
      x,
      height + 300,
      Math.min(L * 0.48, 14000),
      'DEPARTMENT OF THEATRE ARTS AND MUSIC',
      '#ecd7a0',
      '#294869',
      260,
    );
  if (settings.style === 'language')
    nameboard(
      g,
      wall,
      x,
      height + 280,
      width + 600,
      'LANGUAGE LABORATORY',
      settings.accent,
    );
  if (settings.style === 'lawlibrary') {
    nameboard(
      g,
      wall,
      x,
      height + 280,
      width + 600,
      'LAW LIBRARY',
      '#eee7d2',
      settings.accent,
      280,
    );
    nameboard(
      g,
      wall,
      L / 2,
      H - 380,
      L * 0.8,
      'TASLIM OLAWALE ELIAS LIBRARY',
      '#eee7d2',
      settings.accent,
      500,
    );
  }
  if (settings.style === 'radio')
    nameboard(
      g,
      wall,
      x,
      H - 700,
      Math.min(L * 0.45, 6000),
      'LASU RADIO',
      '#23425c',
      '#eee9d8',
      280,
    );
}

export function blockGlazing(
  g,
  wall,
  x,
  z,
  width,
  height,
  colour,
  offset = 150,
) {
  g.panel(wall, x, z, width, height, 100, offset, colour, 'glass');
  for (let a = -width / 2; a <= width / 2; a += 250)
    g.panel(
      wall,
      x + a,
      z,
      18,
      height,
      30,
      offset + 70,
      '#c5c8b9',
      'glass_block_joint',
      'fine',
    );
  for (let y = 0; y <= height; y += 250)
    g.panel(
      wall,
      x,
      z + y,
      width,
      18,
      30,
      offset + 70,
      '#c5c8b9',
      'glass_block_joint',
      'fine',
    );
}
