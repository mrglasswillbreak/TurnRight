import type { ModelMesh, RoofText, SurfaceTextRecipe } from './visual-types.js';
import type { Feature } from 'geojson';
import { buildingTopology, polygonsOf } from './building-surfaces.js';

export function roofTextErrors(feature: Feature): string[] {
  const records = feature.properties?.appearance?.roofTexts;
  if (records === undefined) return [];
  if (
    !records ||
    typeof records !== 'object' ||
    Array.isArray(records) ||
    Object.keys(records).length > 100
  )
    return ['Roof text must reference existing wings.'];
  const parts = buildingTopology(feature).parts,
    polygons = polygonsOf(feature.geometry),
    ids = new Set<string>();
  const errors: string[] = [];
  for (const [partId, list] of Object.entries(records)) {
    const index = parts.findIndex((part) => part.id === partId);
    if (index < 0 || !Array.isArray(list) || list.length > 20) {
      errors.push('Each existing wing supports at most 20 roof text labels.');
      continue;
    }
    const polygon = polygons[index];
    for (const label of list as RoofText[]) {
      if (
        !label ||
        typeof label.id !== 'string' ||
        !label.id ||
        label.id.length > 240 ||
        ids.has(label.id) ||
        !validSurfaceText(textRecipe(label)) ||
        ![label.width, label.height, label.rotation].every(Number.isFinite) ||
        label.width <= 0 ||
        label.height <= 0 ||
        label.width > 50 ||
        label.height > 50 ||
        Math.abs(label.rotation) > 360 ||
        !Array.isArray(label.coordinates) ||
        label.coordinates.length !== 2 ||
        !label.coordinates.every(Number.isFinite)
      ) {
        errors.push(
          'Roof text needs valid wording, colour, size, rotation and position.',
        );
        continue;
      }
      ids.add(label.id);
      const k = (Math.PI / 180) * 6371008.8,
        sx = k * Math.cos((label.coordinates[1] * Math.PI) / 180),
        angle = (label.rotation * Math.PI) / 180;
      const corners = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
        [0, 0],
      ].map(([x, y]) => {
        const dx = (x * label.width) / 2,
          dy = (y * label.height) / 2;
        return [
          label.coordinates[0] +
            (dx * Math.cos(angle) - dy * Math.sin(angle)) / sx,
          label.coordinates[1] +
            (dx * Math.sin(angle) + dy * Math.cos(angle)) / k,
        ];
      });
      const inside = (p: number[], ring: number[][]) => {
        let result = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const a = ring[i],
            b = ring[j];
          if (
            a[1] > p[1] !== b[1] > p[1] &&
            p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
          )
            result = !result;
        }
        return result;
      };
      const outline = corners.slice(0, 4);
      const cross = (a: number[], b: number[], c: number[]) =>
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const intersects = (a: number[], b: number[], c: number[], d: number[]) =>
        cross(a, b, c) * cross(a, b, d) < 0 &&
        cross(c, d, a) * cross(c, d, b) < 0;
      const crossesBoundary = polygon.some((ring) =>
        ring
          .slice(0, -1)
          .some((a, i) =>
            outline.some((c, j) =>
              intersects(a, ring[i + 1], c, outline[(j + 1) % 4]),
            ),
          ),
      );
      const coversHole = polygon
        .slice(1)
        .some((ring) => ring.some((point) => inside(point, outline)));
      if (
        crossesBoundary ||
        coversHole ||
        corners.some(
          (p) =>
            !inside(p, polygon[0]) ||
            polygon.slice(1).some((r) => inside(p, r)),
        )
      )
        errors.push(
          'Roof text must fit inside its wing, outside courtyard openings.',
        );
    }
  }
  return errors;
}

export function validSurfaceText(value: unknown): value is SurfaceTextRecipe {
  if (!value || typeof value !== 'object') return false;
  const t = value as SurfaceTextRecipe;
  return (
    typeof t.text === 'string' &&
    !!t.text.trim() &&
    t.text.length <= 160 &&
    t.text.split('\n').length <= 4 &&
    !Array.from(t.text).some(
      (char) => char.charCodeAt(0) < 32 && char !== '\n' && char !== '\t',
    ) &&
    /^#[a-f0-9]{6}$/i.test(t.colour) &&
    ['regular', 'bold'].includes(t.weight) &&
    ['left', 'center', 'right'].includes(t.align) &&
    Number.isFinite(t.aspect) &&
    t.aspect > 0 &&
    t.aspect <= 5000
  );
}

export function textRecipe(text: {
  text?: string;
  colour: string;
  width: number;
  height: number;
  textWeight?: 'regular' | 'bold';
  textAlign?: 'left' | 'center' | 'right';
}): SurfaceTextRecipe {
  return {
    text: text.text || '',
    colour: text.colour,
    weight: text.textWeight || 'bold',
    align: text.textAlign || 'center',
    aspect: text.width / text.height,
  };
}

/** Sample only this wing's roof. Courtyards and points outside the roof are rejected. */
export function roofElevation(
  mesh: ModelMesh,
  partId: string,
  x: number,
  y: number,
): number | undefined {
  for (const surface of mesh.surfaces || []) {
    if (
      surface.partId !== partId ||
      surface.role !== 'roof' ||
      surface.elementId
    )
      continue;
    for (let t = surface.start; t < surface.start + surface.count; t++) {
      const p = [0, 1, 2].map((i) =>
        mesh.positions.slice(
          mesh.indices[t * 3 + i] * 3,
          mesh.indices[t * 3 + i] * 3 + 3,
        ),
      );
      const [a, b, c] = p;
      const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(den) < 1e-10) continue;
      const u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / den;
      const v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / den;
      if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6)
        return u * a[2] + v * b[2] + (1 - u - v) * c[2];
    }
  }
}

/** Clip lettering to each roof triangle so it follows ridges and valleys exactly. */
export function roofTextMesh(
  text: RoofText,
  partId: string,
  roof: ModelMesh,
  local: (p: number[]) => number[],
): ModelMesh {
  const m: ModelMesh = {
    positions: [],
    indices: [],
    uvs: [],
    colour: '#ffffff',
    detail: true,
    text: textRecipe(text),
    surfaces: [],
  };
  const [cx, cy] = local(text.coordinates),
    angle = (text.rotation * Math.PI) / 180,
    cos = Math.cos(angle),
    sin = Math.sin(angle);
  // Work in the lettering's local plane, carrying the roof elevation through clipping.
  const clip = (
    points: number[][],
    axis: number,
    edge: number,
    sign: number,
  ) => {
    const result: number[][] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length],
        insideA = (a[axis] - edge) * sign >= -1e-9,
        insideB = (b[axis] - edge) * sign >= -1e-9;
      if (insideA) result.push(a);
      if (insideA !== insideB) {
        const t = (edge - a[axis]) / (b[axis] - a[axis]);
        result.push(a.map((v, j) => v + (b[j] - v) * t));
      }
    }
    return result;
  };
  for (const surface of roof.surfaces || []) {
    if (
      surface.partId !== partId ||
      surface.role !== 'roof' ||
      surface.elementId
    )
      continue;
    for (let t = surface.start; t < surface.start + surface.count; t++) {
      let points = [0, 1, 2].map((i) => {
        const v = roof.indices[t * 3 + i] * 3,
          dx = roof.positions[v] - cx,
          dy = roof.positions[v + 1] - cy;
        return [
          dx * cos + dy * sin,
          -dx * sin + dy * cos,
          roof.positions[v + 2],
        ];
      });
      points = clip(
        clip(
          clip(clip(points, 0, -text.width / 2, 1), 0, text.width / 2, -1),
          1,
          -text.height / 2,
          1,
        ),
        1,
        text.height / 2,
        -1,
      );
      if (points.length < 3) continue;
      const start = m.positions.length / 3;
      for (const [x, y, z] of points) {
        m.positions.push(
          cx + x * cos - y * sin,
          cy + x * sin + y * cos,
          z + 0.035,
        );
        m.uvs!.push(x / text.width + 0.5, y / text.height + 0.5);
      }
      for (let i = 1; i < points.length - 1; i++)
        m.indices.push(start, start + i, start + i + 1);
    }
  }
  if (!m.indices.length)
    throw new Error(
      'Roof text must fit entirely on its roof, outside courtyard openings.',
    );
  m.surfaces!.push({
    start: 0,
    count: m.indices.length / 3,
    partId,
    role: 'roof',
    elementId: text.id,
  });
  return m;
}
