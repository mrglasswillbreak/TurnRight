/** Shared miniature-campus palette; colour never changes route permissions. */
export const campusPalette = {
  light: {
    ground: '#eee9dc',
    campus: '#faf5e8',
    green: '#c0d0ac',
    water: '#a7cbd8',
    land: '#eee4cf',
    roadEdge: '#cec1a6',
    road: '#fff5dd',
    path: '#e3cba6',
    outline: '#968f7f',
    wetland: '#b1c9b5',
    bare: '#ded0b5',
    unpaved: '#d7bea0',
    boundary: '#809b78',
    contact: '#293329',
    barrier: '#b7947e',
    label: '#53616b',
    halo: '#ffffff',
    streetLabel: '#5a6570',
    route: '#085adb',
    routeCase: '#ffffff',
    routeAlternative: '#809ac2',
    selection: '#2563eb',
  },
  dark: {
    ground: '#293e52',
    campus: '#30465b',
    green: '#075d49',
    water: '#203d80',
    land: '#344b61',
    roadEdge: '#3c5268',
    road: '#687f94',
    path: '#8497a8',
    outline: '#58718a',
    wetland: '#285953',
    bare: '#525664',
    unpaved: '#85878d',
    boundary: '#728ba1',
    contact: '#172d43',
    barrier: '#9da7b3',
    label: '#e0e9f3',
    halo: '#203246',
    streetLabel: '#c6d5e6',
    route: '#73b4ff',
    routeCase: '#20354e',
    routeAlternative: '#a1b4ce',
    selection: '#89c6ff',
  },
};

export type MaterialRole = 'wall' | 'roof' | 'window' | 'trim' | 'legacy';
export function meshMaterialRole(
  surfaces?: readonly { role: Exclude<MaterialRole, 'legacy'> }[],
  legacy?: { detail?: boolean; positions: readonly number[] },
): MaterialRole {
  const first = surfaces?.[0]?.role;
  if (first) return surfaces?.every((s) => s.role === first) ? first : 'legacy';
  // Old packages separate solid roofs from walls but have no surface IDs.
  // A solid mesh wholly above ground is a roof; ambiguous/detail meshes retain colour grading.
  if (legacy && !legacy.detail && legacy.positions.length) {
    for (let i = 2; i < legacy.positions.length; i += 3)
      if (legacy.positions[i] <= 0.01) return 'wall';
    return 'roof';
  }
  return 'legacy';
}
const nightBases: Record<MaterialRole, [number, number, number]> = {
  wall: [58, 79, 101],
  roof: [72, 96, 121],
  window: [32, 48, 68],
  trim: [82, 106, 130],
  legacy: [62, 83, 106],
};
/** Render-time grading only. Original swatches and published model colours remain unchanged. */
export function nightMaterial(colour: string, role: MaterialRole = 'legacy') {
  const rgb = /^#[\da-f]{6}$/i.test(colour)
    ? [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16))
    : [160, 160, 160];
  const luma = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  return (
    '#' +
    nightBases[role]
      .map((base, i) =>
        Math.round(
          Math.max(
            0,
            Math.min(255, base + (luma - 150) * 0.1 + (rgb[i] - luma) * 0.12),
          ),
        )
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
const walls = ['#eedcc0', '#e5c8b1', '#cbd8da', '#d7cde0'];
const roofs = ['#b97760', '#778f9e', '#9c8caf', '#829b82'];
export function appearanceColours(properties: Record<string, unknown>) {
  const appearance = properties.appearance as
    | { wallColour?: string; roofColour?: string }
    | undefined;
  let seed = 0;
  for (const c of String(properties.id || ''))
    seed = (Math.imul(seed, 31) + c.charCodeAt(0)) >>> 0;
  const supported =
    Number(properties.height) > 0 || Number(properties.floors) > 0;
  const valid = (colour: unknown): colour is string =>
    typeof colour === 'string' && /^#[0-9a-f]{6}$/i.test(colour);
  return {
    wall: valid(appearance?.wallColour)
      ? appearance.wallColour
      : supported
        ? walls[seed % walls.length]
        : '#d4d5c3',
    roof: valid(appearance?.roofColour)
      ? appearance.roofColour
      : supported
        ? roofs[seed % roofs.length]
        : '#a6b19f',
  };
}
