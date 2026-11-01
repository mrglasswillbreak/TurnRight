/** Observed opening arrangements are separate from estimated metric dimensions. */
export function facadeOpenings(
  geometry,
  wall,
  L,
  H,
  floor,
  bays,
  settings,
  front,
  aligned,
  part,
) {
  const { panel } = geometry;
  const spacing = L / bays,
    floors = Math.round(H / floor);
  const entries = [];
  const style = settings.style;
  const arcadeDepth = settings.arcadeDepth || 900;
  if (style === 'student' || (front && style === 'postgrad')) return entries;
  if (style === 'auditorium' && [14, 15, 16, 17, 18].includes(wall.edge))
    return entries;
  if (style === 'veranda' && wall.edge === 4) return entries;
  const custom =
    front && style === 'library'
      ? [1, 2, 3, 4].map((row) => ({
          x: L * (wall.inward === 'positive' ? 0.32 : 0.68),
          z: row * floor + floor * 0.2,
          width: L * 0.24,
          height: floor * 0.5,
          divisions: 4,
        }))
      : front && style === 'hall'
        ? [0.28295, 0.71913].map((x) => ({
            x: L * x,
            z: 500,
            width: 1113,
            height: 2561,
            divisions: 2,
          }))
        : front && style === 'mba'
          ? [0.36, 0.64].map((x) => ({
              x: L * x,
              z: H * 0.62,
              width: 500,
              height: H * 0.25,
              divisions: 1,
            }))
          : null;
  if (custom) entries.push(...custom);
  else {
    const rowCount = style === 'education' ? 1 : floors;
    for (let row = 0; row < rowCount; row++) {
      let z = row * floor + (row === 0 ? 450 : 820);
      let height = Math.min(
        floor - 900,
        settings.heightRatio
          ? floor * settings.heightRatio
          : style === 'theatre'
            ? floor * 0.68
            : floor * 0.6,
      );
      if (style === 'cps') {
        z = H * (row ? 0.78 : 0.12);
        height = H * (row ? 0.13 : 0.25);
      }
      if (style === 'arts') {
        z = H * (row ? 0.76 : 0.16);
        height = H * (row ? 0.13 : 0.18);
      }
      if (style === 'education') {
        z = H * 0.1;
        height = H * 0.42;
      }
      if (style === 'hall') {
        z = H * 0.5;
        height = H * 0.14;
      }
      if (style === 'lawlibrary') {
        z = row * floor + floor * 0.26;
        height = floor * 0.42;
      }
      if (style === 'ict' && aligned) {
        z = H * (row ? 0.65 : 0.12);
        height = H * (row ? 0.2 : 0.27);
      }
      const columns =
        aligned && settings.frontWindowCount ? settings.frontWindowCount : bays;
      const step = L / columns;
      for (let col = 0; col < columns; col++) {
        const x = (col + 0.5) * step;
        if (front && style === 'lawlibrary' && row > 0) {
          const blockX = L * (wall.inward === 'positive' ? 0.44 : 0.56),
            blockWidth = Math.min(2200, L * 0.07);
          if (
            Math.abs(x - blockX) <
            (blockWidth + step * (settings.windowRatio || 0.78)) / 2 + 100
          )
            continue;
        }
        if (
          row === 0 &&
          settings.doors?.some(
            (d) =>
              d.part === part &&
              d.edge === wall.edge &&
              Math.abs(x - L * d.x) <
                d.width / 2 + (step * (settings.windowRatio || 0.78)) / 2,
          )
        )
          continue;
        if (
          front &&
          ((style === 'senate' &&
            (Math.abs(x / L - 0.23) < 0.065 ||
              Math.abs(x / L - 0.77) < 0.065)) ||
            (style === 'library' && Math.abs(x / L - 0.3) < 0.065))
        )
          continue;
        if (aligned && style === 'ict' && row && x / L > 0.17 && x / L < 0.83)
          continue;
        if (
          front &&
          !['senate', 'library', 'theatre', 'cps', 'school'].includes(style) &&
          row === 0 &&
          Math.abs(x - L / 2) <
            (style === 'arts'
              ? Math.min(1600, L * 0.08) / 2 + step * 0.25
              : Math.min(L * 0.17, 5200))
        )
          continue;
        const irregular = style === 'theatre';
        entries.push({
          x,
          z: z + (irregular ? ((col + row * 2) % 3) * 85 : 0),
          width: irregular
            ? (0.24 + ((col * 7 + row * 3) % 5) * 0.09) * step
            : step *
              (style === 'arts' && !row ? 0.5 : settings.windowRatio || 0.78),
          height,
          arcade: style === 'arts' && aligned && row === 0,
        });
      }
    }
  }
  if (style === 'arts' && front)
    entries.push({
      x: L / 2,
      z: 0,
      width: Math.min(1600, L * 0.08),
      height: Math.min(2300, H * 0.38),
      divisions: 2,
      arcade: aligned,
      transom: false,
    });
  if (style === 'arts' && aligned) {
    geometry.recesses(
      wall,
      [{ x: L / 2, z: 0, width: L - 300, height: H * 0.5 }],
      `structure_wing_${part}`,
      arcadeDepth,
    );
    geometry.recesses(
      wall,
      entries.filter((e) => e.arcade),
      `structure_wing_${part}`,
      `${arcadeDepth}+WindowRecessDepth`,
    );
  }
  if (style === 'radio' && front) {
    const size = Math.min(550, H * 0.095),
      rightWindow = wall.inward === 'positive' ? spacing / 2 : L - spacing / 2;
    for (const side of [-1, 1])
      entries.push({
        x: rightWindow + side * size * 0.8,
        z: H * 0.65,
        width: size,
        height: size,
        divisions: 1,
        transom: false,
      });
    entries.push({
      x: L / 2,
      z: H * 0.65,
      width: Math.min(L * 0.23, 5000),
      height: H * 0.07,
      divisions: 3,
      transom: false,
    });
  }
  for (let row = 0; row < floors; row++) {
    if (
      [
        'theatre',
        'cps',
        'arts',
        'language',
        'education',
        'hall',
        'ict',
        'postgrad',
        'student',
      ].includes(style)
    )
      break;
    panel(
      wall,
      L / 2,
      row * floor,
      L,
      settings.bandHeight || 260,
      170,
      70,
      settings.bandColour ||
        (style === 'library' ? settings.wall : settings.accent),
      'spandrel',
    );
  }
  for (const e of entries) {
    const { x, z, width, height } = e;
    const offset = e.arcade ? -arcadeDepth : 0;
    panel(
      wall,
      x,
      z,
      width,
      height,
      35,
      offset - (settings.recessDepth || 350) + 80,
      settings.glass,
      'glass',
    );
    if (style === 'theatre') continue;
    for (const side of [-1, 1])
      panel(
        wall,
        x + (side * width) / 2,
        z - 55,
        80,
        height + 110,
        140,
        offset + 85,
        settings.frame || settings.trim,
        'frame',
        'fine',
      );
    for (const y of [z - 55, z + height])
      panel(
        wall,
        x,
        y,
        width + 80,
        65,
        140,
        offset + 85,
        settings.frame || settings.trim,
        'frame',
        'fine',
      );
    const divisions = e.divisions || settings.windowDivisions || 2;
    for (let d = 1; d < divisions; d++)
      panel(
        wall,
        x - width / 2 + (width * d) / divisions,
        z,
        45,
        height,
        80,
        offset + 55,
        settings.frame || settings.trim,
        'mullion',
        'fine',
      );
    if (e.transom !== false)
      panel(
        wall,
        x,
        z + height * 0.72,
        width,
        40,
        75,
        offset + 55,
        settings.frame || settings.trim,
        'mullion',
        'fine',
      );
    if (settings.louvres || (style === 'arts' && z > H * 0.6))
      for (let y = z + 150; y < z + height; y += 170)
        panel(
          wall,
          x,
          y,
          width,
          30,
          60,
          offset - 50,
          settings.frame || settings.trim,
          'louvre',
          'fine',
        );
  }
  if (style === 'library' && L > 5500)
    for (let col = 0; col <= bays; col++)
      panel(
        wall,
        Math.min(L - 150, Math.max(150, col * spacing)),
        0,
        240,
        `H${part}`,
        350,
        140,
        settings.accent,
        'fin',
      );
  // Arcade openings were cut beyond the recessed rear wall above.
  return entries.filter((e) => !e.arcade);
}
