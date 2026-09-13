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
  },
  dark: {
    ground: '#182727',
    campus: '#243632',
    green: '#3b5645',
    water: '#375e70',
    land: '#34473e',
    roadEdge: '#57665b',
    road: '#9c9a7c',
    path: '#958568',
    outline: '#a1ab9c',
  },
};
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
