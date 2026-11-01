import { blockGlazing, nameboard } from './entrances.mjs';

/** Dated photographs establish solid entrance panels rather than repeated windows. */
export function solidFronts(g, wall, L, H, s, front) {
  const { panel } = g;
  if (s.style === 'sdg' && [1, 3, 5].includes(wall.edge)) {
    const outerWidth = Math.min(2800, L * 0.27);
    for (const side of [0, 1]) {
      const outer = (wall.edge === 1 && !side) || (wall.edge === 5 && side),
        width = outer ? outerWidth : 700;
      panel(
        wall,
        side ? L - width / 2 : width / 2,
        0,
        width,
        H,
        250,
        100,
        s.accent,
        'front_pilaster',
        'structure',
      );
    }
    const band = H * 0.025;
    if (wall.edge === 5)
      for (const [row, ratio] of [1, 0.74, 0.46].entries())
        panel(
          wall,
          L - (outerWidth * ratio) / 2,
          H * (0.48 - row * 0.06),
          outerWidth * ratio,
          band,
          110,
          285,
          s.trim,
          'stepped_cream_bar',
          'facade',
        );
    if (wall.edge === 1) {
      for (const z of [H * 0.18, H * 0.65])
        panel(
          wall,
          outerWidth / 2,
          z,
          outerWidth,
          band,
          110,
          285,
          s.trim,
          'cream_outline_horizontal',
          'facade',
        );
      panel(
        wall,
        outerWidth - band / 2,
        H * 0.18,
        band,
        H * 0.47 + band,
        110,
        285,
        s.trim,
        'cream_outline_vertical',
        'facade',
      );
    }
  }
  if (s.style === 'transport' && [17, 21].includes(wall.edge))
    g.wallProfile(
      wall,
      L / 2,
      H,
      [
        [-L / 2, 0],
        [L / 2, 0],
        [0, 1500],
      ],
      180,
      120,
      s.wall,
      'front_gable',
    );
  if (s.style === 'auditorium') {
    panel(
      wall,
      L / 2,
      H * 0.83,
      L,
      H * 0.18,
      160,
      100,
      s.accent,
      'upper_fascia',
      'structure',
    );
    if (front) {
      for (const x of [L * 0.32, L * 0.7])
        blockGlazing(g, wall, x, H * 0.5, L * 0.18, H * 0.24, '#9c9f8b');
    }
  }
  if (s.style === 'radio' && front)
    panel(wall, L / 2, H * 0.78, L, 100, 110, 150, s.accent, 'facade_band');
  if (s.style !== 'veranda' || wall.edge !== 4) return;
  panel(
    wall,
    L / 2,
    H * 0.43,
    L,
    H * 0.57,
    260,
    160,
    s.wall,
    'entrance_tower',
    'structure',
  );
  blockGlazing(g, wall, L / 2, H * 0.67, L * 0.79, H * 0.26, '#a8b7ad', 350);
  nameboard(
    g,
    wall,
    L / 2,
    H * 0.48,
    L * 0.8,
    'LAW CLINIC',
    '#303b38',
    s.wall,
    350,
  );
  g.wallProfile(
    wall,
    L / 2,
    H,
    [
      [-L / 2 - 180, 0],
      [L / 2 + 180, 0],
      [0, 750],
    ],
    180,
    250,
    s.roof,
    'entrance_gable',
  );
}
