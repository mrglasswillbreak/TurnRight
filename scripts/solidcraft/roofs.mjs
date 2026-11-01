/** Roof planes retain explicit estimated ridges; they are native SolidCraft solids. */
export function libraryRoofs(geometry, ring, courtyard, height, colour) {
  const polygonArea = ring.reduce((sum, a, i) => {
    const b = ring[(i + 1) % ring.length];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0);
  // The 2025 aerial shows separate shallow red roof panels over the projecting wings.
  for (const edge of [0, 1, 5, 9, 15, 18, 22, 26, 27, 32]) {
    const a = ring[edge],
      b = ring[(edge + 1) % ring.length],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    const inward = polygonArea < 0 ? [u[1], -u[0]] : [-u[1], u[0]];
    const depth = Math.min(20000, length * 0.85);
    const corners = [
      a,
      b,
      b.map((n, i) => n + inward[i] * depth),
      a.map((n, i) => n + inward[i] * depth),
    ];
    const z = height + 350,
      peak = height + 1500;
    geometry.polygon(
      `structure_roof_plinth_${edge}`,
      [corners],
      350,
      'H0',
      '#8d8a80',
    );
    const r0 = a.map(
      (n, i) => n + u[i] * length * 0.2 + inward[i] * depth * 0.5,
    );
    const r1 = a.map(
      (n, i) => n + u[i] * length * 0.8 + inward[i] * depth * 0.5,
    );
    const p = corners.map((p) => [...p, z]),
      q = [...r0, peak],
      r = [...r1, peak];
    for (const points of [
      [p[0], p[1], r],
      [p[0], r, q],
      [p[1], p[2], r],
      [p[2], p[3], q],
      [p[2], q, r],
      [p[3], p[0], q],
    ])
      geometry.roofTriangle(points, 'H0', height, colour);
  }
  if (!courtyard) return;
  const center = [0, 1].map(
    (i) => courtyard.reduce((n, p) => n + p[i], 0) / courtyard.length,
  );
  const perimeter = courtyard.map((p) =>
    p.map((n, i) => center[i] + (n - center[i]) * 1.12),
  );
  geometry.polygon(
    'structure_roof_atrium_drum',
    [perimeter, courtyard],
    500,
    'H0',
    '#bac3b9',
  );
  for (let i = 0; i < perimeter.length; i++)
    geometry.roofTriangle(
      [
        [...perimeter[i], height + 500],
        [...perimeter[(i + 1) % perimeter.length], height + 500],
        [...center, height + 4000],
      ],
      'H0',
      height,
      '#32a6ac',
    );
}

export function preservedRoof(geometry, model, heights, colour) {
  const eaves = new Map();
  for (const mesh of model.meshes)
    for (const surface of mesh.surfaces || []) {
      if (surface.role !== 'roof') continue;
      const part =
        Number(surface.partId.split(':wing:').at(-1).split(':')[0]) || 0;
      for (const index of mesh.indices.slice(
        surface.start * 3,
        (surface.start + surface.count) * 3,
      ))
        eaves.set(
          part,
          Math.min(
            eaves.get(part) ?? Infinity,
            mesh.positions[index * 3 + 2] * 1000,
          ),
        );
    }
  for (const mesh of model.meshes)
    for (const surface of mesh.surfaces || []) {
      if (surface.role !== 'roof') continue;
      const part =
        Number(surface.partId.split(':wing:').at(-1).split(':')[0]) || 0;
      for (
        let i = surface.start * 3;
        i < (surface.start + surface.count) * 3;
        i += 3
      ) {
        const points = mesh.indices
          .slice(i, i + 3)
          .map((index) =>
            mesh.positions
              .slice(index * 3, index * 3 + 3)
              .map(
                (n, axis) =>
                  n * 1000 + (axis === 2 ? heights[part] - eaves.get(part) : 0),
              ),
          );
        geometry.roofTriangle(points, `H${part}`, heights[part], colour);
      }
    }
}
