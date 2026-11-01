import { geometryBuilder } from './primitives.mjs';
import { libraryRoofs, preservedRoof } from './roofs.mjs';
import { facadeDetails } from './facade-details.mjs';
import { facadeOpenings } from './openings.mjs';
import { gableRoof } from './gable-roof.mjs';
import { courtyardWalkways } from './courtyards.mjs';
import { arcadeGlazing } from './arcade-glazing.mjs';
/** Geometry recipes are in local millimetres. Names retain semantic detail tiers. */
export function buildingRecipe(feature, visual, settings, roofModel) {
  const polygons =
    feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;
  const all = polygons.flat(2),
    origin = [
      all.reduce((n, p) => n + p[0], 0) / all.length,
      all.reduce((n, p) => n + p[1], 0) / all.length,
    ];
  const k = (Math.PI / 180) * 6371008.8 * 1000,
    local = (p) => [
      (p[0] - origin[0]) * k * Math.cos((origin[1] * Math.PI) / 180),
      (p[1] - origin[1]) * k,
    ];
  const rings = polygons.map((p) => p.map((r) => r.slice(0, -1).map(local)));
  const geometry = geometryBuilder();
  const {
    stages,
    bodies,
    command,
    finishStage,
    polygon,
    panel,
    diamond,
    recesses,
    lettering,
  } = geometry;
  let expectedVolume = 0;
  let referenceDirection;
  for (const [name, value, comment] of [
    ['RoofSlabThickness', 100, 'Roof shell thickness; estimated, millimetres.'],
    [
      'WindowRecessDepth',
      settings.recessDepth || 350,
      'Recess depth estimated from facade shadows.',
    ],
    ['FrameWidth', 80, 'Estimated external frame width.'],
    ['GlassThickness', 35, 'Simplified glazing assembly thickness.'],
  ])
    command('parameters.add', { name, expression: `${value} mm`, comment });
  const heights = rings.map(
    (_, i) =>
      (settings.heights?.[i] ||
        visual.partHeights?.[i]?.height ||
        (i ? 6 : visual.height)) * 1000,
  );
  for (const [i, shape] of rings.entries()) {
    command('parameters.add', {
      name: `H${i}`,
      expression: `${heights[i]} mm`,
      comment:
        'Existing mapped height; see evidence dossier for estimated dimensions.',
    });
    polygon(`structure_wing_${i}`, shape, `H${i}`, '0', settings.wall);
    const area = (r) =>
      Math.abs(
        r.reduce((n, p, j) => {
          const q = r[(j + 1) % r.length];
          return n + p[0] * q[1] - q[0] * p[1];
        }, 0) / 2,
      );
    expectedVolume +=
      (area(shape[0]) - shape.slice(1).reduce((n, r) => n + area(r), 0)) *
      heights[i];
  }
  finishStage('massing');
  for (const [i, shape] of rings.entries())
    polygon(
      `structure_roof_${i}`,
      shape,
      'RoofSlabThickness',
      `H${i}`,
      settings.roof,
    );
  if (settings.style === 'library')
    libraryRoofs(geometry, rings[0][0], rings[0][1], heights[0], settings.roof);
  else if (settings.style === 'sdg')
    gableRoof(
      geometry,
      rings[0][0],
      settings.front[1],
      heights[0],
      settings.roof,
      settings.wall,
    );
  else if (roofModel)
    preservedRoof(geometry, roofModel, heights, settings.roof);
  finishStage('roofs');
  if (settings.style === 'student') {
    geometry.setHeight('H0', heights[0]);
    arcadeGlazing(geometry, rings[0][0], heights[0]);
    finishStage('front-glazing');
  }
  for (const [part, shape] of rings.entries()) {
    const ring = shape[0],
      H = heights[part],
      floors = part ? Math.max(1, Math.round(H / 3000)) : settings.floors;
    geometry.setHeight(`H${part}`, H);
    const signed = ring.reduce((n, a, i) => {
      const b = ring[(i + 1) % ring.length];
      return n + a[0] * b[1] - b[0] * a[1];
    }, 0);
    for (let edge = 0; edge < ring.length; edge++) {
      const a = ring[edge],
        b = ring[(edge + 1) % ring.length],
        L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 1800) continue;
      const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L],
        n = signed < 0 ? [-u[1], u[0]] : [u[1], -u[0]];
      const wall = {
        a,
        u,
        n,
        part,
        edge,
        angle: (Math.atan2(u[1], u[0]) * 180) / Math.PI,
        inward: signed < 0 ? 'positive' : 'negative',
      };
      const openings = [];
      const front =
        (settings.front?.[0] === part && settings.front?.[1] === edge) ||
        settings.fronts?.some(([p, e]) => p === part && e === edge);
      const frontRing = rings[settings.front[0]][0];
      const frontA = frontRing[settings.front[1]],
        frontB = frontRing[(settings.front[1] + 1) % frontRing.length];
      const frontAngle = Math.atan2(
        frontB[1] - frontA[1],
        frontB[0] - frontA[0],
      );
      const aligned =
        Math.cos((wall.angle * Math.PI) / 180 - frontAngle) > 0.94;
      if (front && part === settings.front[0] && edge === settings.front[1])
        referenceDirection = [
          n[0] + u[0] * 0.3,
          n[1] + u[1] * 0.3,
          settings.referenceElevation ||
            (settings.style === 'senate' ? 0.1 : 0.25),
        ];
      if (front && settings.style === 'library') {
        const previous = ring[(edge + ring.length - 1) % ring.length];
        const length = Math.hypot(a[0] - previous[0], a[1] - previous[1]);
        const tangent = [
          (a[0] - previous[0]) / length,
          (a[1] - previous[1]) / length,
        ];
        const normal =
          signed < 0 ? [-tangent[1], tangent[0]] : [tangent[1], -tangent[0]];
        referenceDirection = [n[0] + normal[0], n[1] + normal[1], 0.18];
      }
      const bays = Math.max(
        1,
        Math.floor(
          L /
            (settings.spacing ||
              (settings.style === 'theatre'
                ? 1900
                : settings.style === 'library'
                  ? 4300
                  : 4200)),
        ),
      );
      const spacing = L / bays,
        floor = H / floors;
      panel(
        wall,
        L / 2,
        `H${part}-180`,
        L,
        280,
        240,
        80,
        settings.parapetColour ||
          (settings.style === 'theatre' ? settings.wall : settings.accent),
        'parapet',
        'structure',
      );
      openings.push(
        ...facadeOpenings(
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
        ),
      );
      if (
        (front && ['senate', 'library', 'theatre'].includes(settings.style)) ||
        (settings.style === 'theatre' &&
          edge === (settings.front[1] + 1) % ring.length)
      ) {
        if (['senate', 'library'].includes(settings.style)) {
          for (const x of settings.style === 'library'
            ? [L * (wall.inward === 'positive' ? 0.7 : 0.3)]
            : [L * 0.23, L * 0.77]) {
            const tower = panel(
              wall,
              settings.style === 'library' ? L / 2 : x,
              500,
              L * (settings.style === 'library' ? 1 : 0.115),
              `H${part}-300`,
              470,
              115,
              settings.trim,
              'tower',
              'structure',
            );
            if (settings.style === 'library')
              recesses(wall, openings, tower, 800, 390);
            for (const z of (settings.style === 'library'
              ? [0.48, 0.64, 0.8]
              : [0.29, 0.53, 0.77]
            ).map((z) => z * H))
              diamond(
                wall,
                x,
                z,
                L * (settings.style === 'library' ? 0.15 : 0.067),
                floor * (settings.style === 'library' ? 0.72 : 1.1),
                settings.accent,
                settings.style === 'library' ? 0.5 : 0,
              );
          }
        }
        const portalX =
            settings.style === 'theatre'
              ? L * (front ? 0.082706742 : 0.58829838)
              : L / 2,
          portalW =
            settings.style === 'theatre'
              ? front
                ? 5000
                : 5064
              : Math.min(L * 0.3, 10000);
        if (front && settings.style === 'theatre') {
          lettering(
            wall,
            L * 0.52,
            H * 0.82,
            'LECTURE THEATRE',
            800,
            settings.trim,
            420,
          );
          for (let col = 3; col < bays - 1; col++)
            for (let step = 0; step < 3; step++)
              panel(
                wall,
                (col + 0.5) * spacing,
                step * 150,
                spacing * 0.7,
                150,
                1100 - step * 260,
                650 - step * 130,
                settings.trim,
                'step',
                'structure',
              );
        }
        if (front && settings.style === 'senate')
          lettering(
            wall,
            L / 2,
            floor * 1.12,
            'BABATUNDE RAJI FASHOLA SENATE BUILDING',
            200,
            '#273a45',
            15,
          );
        panel(
          wall,
          portalX,
          floor * 0.92,
          portalW,
          320,
          2400,
          950,
          settings.style === 'theatre' ? settings.wall : settings.trim,
          'canopy',
          'structure',
        );
        for (const s of [-1, 1])
          panel(
            wall,
            portalX + (s * portalW) / 2,
            0,
            350,
            floor,
            1400,
            550,
            settings.style === 'theatre' ? settings.wall : settings.trim,
            'column',
            'structure',
          );
        if (settings.style === 'theatre') {
          panel(
            wall,
            portalX,
            floor * 0.92 - 30,
            portalW - 350,
            30,
            2300,
            950,
            settings.accent,
            'portal_lining',
            'structure',
          );
          for (const side of [-1, 1])
            panel(
              wall,
              portalX + side * (portalW / 2 - 190),
              0,
              30,
              floor * 0.92,
              1350,
              550,
              settings.accent,
              'portal_lining',
              'structure',
            );
        }
        for (let step = 0; step < 3; step++)
          panel(
            wall,
            portalX,
            step * 140,
            portalW + 1000 - step * 200,
            140,
            1400 - step * 320,
            1000 - step * 160,
            settings.trim,
            'step',
            'structure',
          );
      }
      recesses(wall, openings, `structure_wing_${part}`);
      facadeDetails(
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
      );
      finishStage(`wing-${part}-elevation-${edge}`);
    }
  }
  if (settings.style === 'education')
    courtyardWalkways(geometry, rings[0].slice(1), heights[0], settings);
  geometry.appearances();
  return {
    version: 1,
    id: visual.id,
    origin,
    units: 'mm',
    up: 'z',
    referenceDirection,
    expectedMassingVolume: expectedVolume,
    expectedBounds: {
      min: [
        Math.min(...rings.flat(2).map((p) => p[0])),
        Math.min(...rings.flat(2).map((p) => p[1])),
        0,
      ],
      max: [
        Math.max(...rings.flat(2).map((p) => p[0])),
        Math.max(...rings.flat(2).map((p) => p[1])),
        Math.max(...heights),
      ],
    },
    settings,
    bodies,
    stages,
  };
}
