/** Photographed glazed screens close the front mouths of the two mapped slots. */
export function arcadeGlazing(g, ring, H) {
  for (const [first, last] of [
    [25, 22],
    [29, 26],
  ]) {
    const a = ring[first],
      b = ring[last];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    const wall = {
      a,
      u,
      n: [u[1], -u[0]],
      angle: (Math.atan2(u[1], u[0]) * 180) / Math.PI,
    };
    g.panel(
      wall,
      L / 2,
      300,
      L,
      H * 0.84,
      100,
      0,
      '#83a7b0',
      'glass',
      'structure',
    );
    for (let x = 0; x <= L; x += L / 5)
      g.panel(
        wall,
        x,
        300,
        65,
        H * 0.84,
        120,
        80,
        '#d1d5ca',
        'curtain_mullion',
        'fine',
      );
    for (let z = 300; z <= H * 0.84; z += 1400)
      g.panel(
        wall,
        L / 2,
        z,
        L,
        65,
        120,
        80,
        '#d1d5ca',
        'curtain_mullion',
        'fine',
      );
  }
}
