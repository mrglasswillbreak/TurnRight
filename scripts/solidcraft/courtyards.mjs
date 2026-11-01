import { facadeOpenings } from './openings.mjs';

/** July 2025 courtyard evidence supports low windows and covered walks. */
export function courtyardWalkways(g, courtyards, H, settings) {
  g.setHeight('H0', H);
  for (const [index, ring] of courtyards.entries()) {
    const signed = ring.reduce((sum, a, i) => {
      const b = ring[(i + 1) % ring.length];
      return sum + a[0] * b[1] - b[0] * a[1];
    }, 0);
    for (let edge = 0; edge < ring.length; edge++) {
      const a = ring[edge],
        b = ring[(edge + 1) % ring.length],
        L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 2000) continue;
      const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L],
        n = signed < 0 ? [u[1], -u[0]] : [-u[1], u[0]];
      const wall = {
        a,
        u,
        n,
        angle: (Math.atan2(u[1], u[0]) * 180) / Math.PI,
        inward: signed < 0 ? 'negative' : 'positive',
      };
      const bays = Math.max(1, Math.floor(L / 3000));
      const openings = facadeOpenings(
        g,
        wall,
        L,
        H,
        H / 2,
        bays,
        settings,
        false,
        false,
        0,
      );
      g.recesses(wall, openings, 'structure_wing_0');
      const point = (x, y, z) => [
        a[0] + u[0] * x + n[0] * y,
        a[1] + u[1] * x + n[1] * y,
        z,
      ];
      const p = [
        point(0, 0, H * 0.58),
        point(L, 0, H * 0.58),
        point(L, 1700, H * 0.48),
        point(0, 1700, H * 0.48),
      ];
      for (const triangle of [
        [p[0], p[1], p[2]],
        [p[0], p[2], p[3]],
      ])
        g.roofTriangle(triangle, 'H0', H, settings.roof);
      for (let i = 0; i <= bays; i++) {
        const x = Math.min(L - 160, Math.max(160, (i * L) / bays));
        g.panel(
          wall,
          x,
          0,
          180,
          H * 0.48,
          180,
          1550,
          settings.accent,
          'walkway_column',
          'structure',
        );
        g.panel(
          wall,
          x,
          0,
          350,
          H,
          450,
          180,
          settings.accent,
          'courtyard_fin',
          'structure',
        );
      }
      g.finishStage(`courtyard-${index}-wall-${edge}`);
    }
  }
}
