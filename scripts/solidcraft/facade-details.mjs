import { entrance, nameboard, blockGlazing } from './entrances.mjs';
import { distinctiveFront } from './fronts.mjs';

/** Features are kept distinct by building, with uncertain placement in the dossier. */
export function facadeDetails(
  g,
  wall,
  L,
  H,
  floor,
  bays,
  s,
  front,
  aligned,
  part,
) {
  const { panel } = g,
    spacing = L / bays;
  const styles = [
    'education',
    'management',
    'lawlibrary',
    'transport',
    'auditorium',
    'mba',
  ];
  if (styles.includes(s.style)) {
    const colour = ['management', 'auditorium'].includes(s.style)
      ? s.wall
      : s.accent;
    for (let i = 0; i <= bays; i++) {
      const x = Math.min(L - 180, Math.max(180, i * spacing));
      if (
        s.style === 'lawlibrary' &&
        front &&
        Math.abs(x - L * (wall.inward === 'positive' ? 0.44 : 0.56)) <
          Math.min(2200, L * 0.07) / 2 + 180
      )
        continue;
      panel(
        wall,
        x,
        0,
        s.style === 'education' ? 440 : 320,
        H + (s.style === 'auditorium' ? 500 : 0),
        s.style === 'education' ? 650 : 380,
        s.style === 'education' ? 300 : 180,
        colour,
        'pilaster',
        'structure',
      );
    }
  }
  if (s.style === 'cps') {
    for (let i = 0; i < bays; i++) {
      const x = (i + 0.5) * spacing;
      panel(
        wall,
        x,
        H * 0.38,
        spacing * (s.windowRatio || 0.58),
        H * 0.39,
        50,
        25,
        s.accent,
        'infill_panel',
      );
    }
    panel(
      wall,
      L / 2,
      H - 130,
      L + 300,
      180,
      550,
      180,
      '#414642',
      'eaves',
      'structure',
    );
  }
  if (s.style === 'management')
    for (let row = 0; row < 3; row++)
      for (let i = 0; i < bays; i++)
        panel(
          wall,
          (i + 0.5) * spacing,
          row * floor + floor * 0.76,
          spacing * 0.72,
          floor * 0.17,
          80,
          35,
          s.accent,
          'red_infill',
        );
  if (s.style === 'school') {
    if (aligned) {
      const width = Math.min(800, L * 0.035);
      panel(
        wall,
        L / 2,
        0,
        width,
        H,
        180,
        70,
        s.accent,
        'central_panel',
        'structure',
      );
      for (let z = 150; z < H; z += 130)
        panel(
          wall,
          L / 2,
          z,
          width * 0.55,
          22,
          45,
          190,
          '#b7b6a4',
          'louvre',
          'fine',
        );
    }
    if (front)
      nameboard(
        g,
        wall,
        L * 0.74,
        floor * 1.08,
        L * 0.45,
        'SCHOOL OF COMMUNICATION',
        '#243c62',
      );
  }
  if (s.style === 'arts' && aligned) {
    for (let i = 0; i <= bays; i++)
      panel(
        wall,
        Math.min(L - 150, Math.max(150, i * spacing)),
        0,
        300,
        H * 0.52,
        500,
        220,
        s.wall,
        'arcade_column',
        'structure',
      );
    panel(
      wall,
      L / 2,
      H * 0.5,
      L,
      H * 0.24,
      160,
      90,
      s.wall,
      'gallery_wall',
      'structure',
    );
    panel(
      wall,
      L / 2,
      H - 500,
      L,
      550,
      300,
      100,
      s.accent,
      'parapet_face',
      'structure',
    );
  }
  if (
    s.style === 'veranda' &&
    (s.galleryEdges?.some(([p, e]) => p === part && e === wall.edge) ||
      (!s.galleryEdges && front))
  ) {
    panel(
      wall,
      L / 2,
      floor - 180,
      L,
      180,
      1800,
      700,
      s.trim,
      'gallery_slab',
      'structure',
    );
    for (let i = 0; i <= bays; i++)
      panel(
        wall,
        Math.min(L - 170, Math.max(170, i * spacing)),
        0,
        300,
        H,
        400,
        1250,
        s.trim,
        'gallery_column',
        'structure',
      );
    for (const z of [floor + 450, floor + 950])
      panel(wall, L / 2, z, L, 45, 45, 1500, '#4b4d4a', 'railing', 'fine');
    for (let x = 300; x < L - 300; x += 600)
      panel(wall, x, floor, 35, 950, 35, 1500, '#4b4d4a', 'baluster', 'fine');
    blockGlazing(
      g,
      wall,
      L * 0.25,
      floor + 150,
      Math.min(3000, L * 0.2),
      floor * 0.72,
      '#a9b9b7',
    );
    nameboard(
      g,
      wall,
      L * 0.25,
      floor - 600,
      Math.min(3000, L * 0.2),
      'LAW CLINIC',
      '#2f3433',
    );
  }
  if (s.style === 'lawlibrary' && aligned) {
    if (front) {
      const width = Math.min(900, L * 0.025);
      for (const x of [L * 0.12, L * 0.88]) {
        panel(
          wall,
          x,
          80,
          width,
          H - 500,
          200,
          480,
          s.trim,
          'louvre_strip_frame',
          'facade',
        );
        panel(
          wall,
          x,
          160,
          width - 160,
          H - 660,
          50,
          610,
          '#777b70',
          'louvre_strip_recess',
          'facade',
        );
        for (let z = 200; z < H - 500; z += 125)
          panel(
            wall,
            x,
            z,
            width - 160,
            30,
            80,
            650,
            s.trim,
            'louvre_strip_slat',
            'fine',
          );
      }
    }
    const blockX = L * (wall.inward === 'positive' ? 0.44 : 0.56),
      blockWidth = Math.min(2200, L * 0.07);
    for (let row = 0; row < 3; row++) {
      const spans =
        front && row > 0
          ? [
              [0, blockX - blockWidth / 2 - 80],
              [blockX + blockWidth / 2 + 80, L],
            ]
          : [[0, L]];
      for (const [left, right] of spans)
        panel(
          wall,
          (left + right) / 2,
          row * floor + floor * 0.75,
          right - left,
          100,
          500,
          200,
          s.accent,
          'sunshade',
          'facade',
        );
    }
    if (front)
      for (const row of [1, 2])
        blockGlazing(
          g,
          wall,
          blockX,
          floor * (row + 0.38),
          blockWidth,
          floor * 0.5,
          '#9caeaa',
        );
  }
  distinctiveFront(g, wall, L, H, floor, s, front, aligned, part);
  const authoredDoor = s.doors?.find(
    (d) => d.part === part && d.edge === wall.edge,
  );
  if (authoredDoor)
    entrance(
      g,
      wall,
      L,
      H,
      {
        ...s,
        entrance: true,
        entryX: authoredDoor.x,
        entryWidth: authoredDoor.width,
        entryHeight: authoredDoor.height,
      },
      part,
    );
  if (!front || ['senate', 'library', 'theatre'].includes(s.style)) return;
  if (s.style === 'arts') {
    nameboard(
      g,
      wall,
      L / 2,
      H * 0.48,
      Math.min(L * 0.48, 14000),
      'DEPARTMENT OF THEATRE ARTS AND MUSIC',
      '#ecd7a0',
      '#294869',
      260,
    );
    return;
  }
  entrance(g, wall, L, H, s, part);
  if (s.style === 'cps')
    nameboard(
      g,
      wall,
      L / 2,
      H * 0.6,
      Math.min(L * 0.35, 5500),
      'CENTRE FOR PLANNING STUDIES',
      '#23425c',
    );
}
