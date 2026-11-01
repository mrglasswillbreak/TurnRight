import { nameboard, blockGlazing } from './entrances.mjs';
import { solidFronts } from './solid-fronts.mjs';

/** Silhouette-bearing frontage parts stay in every published detail level. */
export function distinctiveFront(
  g,
  wall,
  L,
  H,
  floor,
  s,
  front,
  aligned,
  part,
) {
  const { panel, wallProfile } = g;
  solidFronts(g, wall, L, H, s, front);
  if (s.style === 'language' && front)
    blockGlazing(
      g,
      wall,
      L * 0.4,
      floor + 450,
      Math.min(2400, L * 0.1),
      floor * 0.6,
      '#678b9b',
    );
  if (s.style === 'ict' && front) {
    panel(
      wall,
      L / 2,
      H * 0.48,
      L * 0.7,
      200,
      1700,
      650,
      s.accent,
      'entrance_eaves',
      'structure',
    );
    const a = (x, y, z) => [
      wall.a[0] + wall.u[0] * x + wall.n[0] * y,
      wall.a[1] + wall.u[1] * x + wall.n[1] * y,
      z,
    ];
    const p = [
      a(L * 0.15, 1500, H * 0.5),
      a(L * 0.85, 1500, H * 0.5),
      a(L * 0.85, -1400, H * 0.68),
      a(L * 0.15, -1400, H * 0.68),
    ];
    for (const t of [
      [p[0], p[1], p[2]],
      [p[0], p[2], p[3]],
    ])
      g.roofTriangle(t, `H${part}`, H, '#98584a');
    for (const x of [L * 0.08, L * 0.92])
      panel(
        wall,
        x,
        H * 0.75,
        L * 0.15,
        H * 0.3,
        750,
        100,
        s.wall,
        'end_parapet',
        'structure',
      );
  }
  if (s.style === 'radio' && front)
    panel(
      wall,
      L / 2,
      H - 500,
      L * 0.4,
      700,
      180,
      100,
      s.wall,
      'raised_parapet',
      'structure',
    );
  if (s.style === 'sdg' && front) {
    const w = L * 0.92;
    wallProfile(
      wall,
      L / 2,
      H * 0.36,
      [
        [-w / 2, 0],
        [w / 2, 0],
        [w / 2, H * 0.04],
        [-w / 2, H * 0.22],
      ],
      300,
      1800,
      s.accent,
      'sloping_canopy',
    );
    panel(
      wall,
      L / 2,
      H * 0.35,
      w + 250,
      200,
      2100,
      850,
      s.trim,
      'canopy_band',
      'structure',
    );
    for (const x of [L * 0.06, L * 0.94])
      panel(
        wall,
        x,
        0,
        450,
        H * 0.36,
        450,
        1600,
        s.accent,
        'porch_column',
        'structure',
      );
  }
  if (s.style === 'postgrad' && front) {
    const x = L * 0.7,
      radius = 1400;
    const center = [wall.a[0] + wall.u[0] * x, wall.a[1] + wall.u[1] * x];
    const ring = Array.from({ length: 24 }, (_, i) => [
      center[0] + Math.cos((i * Math.PI) / 12) * radius,
      center[1] + Math.sin((i * Math.PI) / 12) * radius,
    ]);
    g.polygon(
      'structure_postgraduate_tower',
      [ring],
      `H${part}*1.45`,
      0,
      s.accent,
    );
    panel(
      wall,
      x,
      600,
      600,
      H * 1.18,
      100,
      1430,
      '#595b4e',
      'tower_recess',
      'structure',
    );
    for (let z = 700; z < H * 1.28; z += 170)
      panel(wall, x, z, 650, 30, 180, 1490, s.trim, 'tower_louvre', 'fine');
    wallProfile(
      wall,
      L * 0.51,
      H * 0.54,
      [
        [-L * 0.17, 0],
        [L * 0.17, 0],
        [L * 0.17, H * 0.75],
      ],
      250,
      180,
      s.accent,
      'triangular_front',
    );
    const r = Math.min(650, H * 0.09),
      circle = Array.from({ length: 32 }, (_, i) => [
        Math.cos((i * Math.PI) / 16) * r,
        Math.sin((i * Math.PI) / 16) * r,
      ]);
    wallProfile(
      wall,
      L * 0.56,
      H * 0.85,
      circle,
      50,
      230,
      s.glass,
      'oculus',
      'facade',
    );
    // The dated front view also shows a lower oculus beside the entrance.
    const entryWidth = s.entryWidth || Math.min(L * 0.32, 7500),
      lowerEdge = L * (s.entryX ?? 0.5) - entryWidth / 2 - 100,
      lowerWidth = Math.min(L * 0.23, lowerEdge),
      lowerX = lowerEdge - r * 1.6;
    wallProfile(
      wall,
      lowerEdge,
      0,
      [
        [-lowerWidth, 0],
        [0, 0],
        [0, H * 0.46],
        [-lowerWidth * 0.55, H * 0.46],
      ],
      250,
      180,
      s.accent,
      'lower_triangular_front',
    );
    wallProfile(
      wall,
      lowerX,
      H * 0.25,
      circle,
      50,
      230,
      s.glass,
      'lower_oculus',
      'facade',
    );
    panel(
      wall,
      lowerX,
      H * 0.25 - r,
      45,
      r * 2,
      40,
      270,
      s.frame,
      'lower_oculus_mullion',
      'fine',
    );
    nameboard(
      g,
      wall,
      L * 0.51,
      H * 0.49,
      L * 0.29,
      'POSTGRADUATE SCHOOL',
      '#2f3330',
      '#eee9d8',
      260,
    );
  }
  if (s.style !== 'student') return;
  if ([21, 29].includes(wall.edge)) {
    const w = L * 0.61,
      h = H * 0.68,
      x = L * (wall.edge === 21 ? 0.65 : 0.35),
      z = H * 0.13;
    panel(
      wall,
      x,
      z - 200,
      w + 500,
      h + 400,
      150,
      100,
      s.accent,
      'motif_frame',
      'structure',
    );
    panel(wall, x, z, w, h, 80, 230, '#bcb49d', 'motif_field');
    for (let a = -w / 2 + 100; a < w / 2; a += 400)
      for (let b = 100; b < h; b += 400)
        panel(
          wall,
          x + a,
          z + b,
          130,
          150,
          45,
          290,
          '#e6dfc9',
          'screen_motif',
          'fine',
        );
  }
  if ([23, 27].includes(wall.edge)) {
    panel(wall, L / 2, 300, L, H * 0.78, 80, 60, s.glass, 'glass');
    for (let x = 0; x < L; x += 900)
      panel(
        wall,
        x,
        300,
        65,
        H * 0.78,
        100,
        150,
        '#bcc1b6',
        'curtain_mullion',
        'fine',
      );
    for (let z = 300; z < H * 0.8; z += 1400)
      panel(
        wall,
        L / 2,
        z,
        L,
        65,
        100,
        150,
        '#bcc1b6',
        'curtain_mullion',
        'fine',
      );
  }
  if (front) {
    panel(
      wall,
      L / 2,
      0,
      L,
      H + 400,
      200,
      100,
      s.accent,
      'entrance_block',
      'structure',
    );
    const door = { x: L / 2, z: 0, width: 5200, height: 4100 };
    panel(
      wall,
      door.x,
      door.z + 100,
      door.width,
      door.height,
      100,
      260,
      '#273b39',
      'entrance_glass',
    );
    for (const x of [door.x - 1750, door.x, door.x + 1750])
      panel(
        wall,
        x,
        100,
        80,
        door.height,
        120,
        350,
        '#b7b4a0',
        'door_frame',
        'fine',
      );
    wallProfile(
      wall,
      L / 2,
      4300,
      [
        [-3200, 0],
        [3200, 0],
        [2500, 450],
        [0, 700],
        [-2500, 450],
      ],
      1600,
      1700,
      s.accent,
      'entrance_canopy',
    );
    nameboard(
      g,
      wall,
      L / 2,
      H - 750,
      L * 0.45,
      'STUDENT ARCADE',
      '#293d55',
      '#eee9d8',
      280,
    );
    for (let step = 0; step < 3; step++)
      panel(
        wall,
        L / 2,
        step * 120,
        5800 - step * 200,
        120,
        1400 - step * 300,
        700 - step * 150,
        s.trim,
        'step',
        'structure',
      );
  }
}
