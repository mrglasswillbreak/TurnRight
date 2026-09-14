import type { Feature, Geometry } from 'geojson';
import type {
  BuildingTopology,
  BuildingAppearance,
  BuildingVisual,
  SurfaceStyle,
} from './visual-types.js';
import type { MapEdit } from './types.js';
import { buildingDisplay } from './map-display.js';
import { appearanceColours } from './map-palette.js';

export const polygonsOf = (geometry: Geometry): number[][][][] =>
  geometry.type === 'Polygon'
    ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon'
      ? geometry.coordinates
      : [];
const same = (a: number[], b: number[]) =>
  Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
const fresh = () => crypto.randomUUID();
export function buildingTopology(feature: Feature): BuildingTopology {
  const stored = feature.properties?.buildingTopology as
    | BuildingTopology
    | undefined;
  if (stored) return structuredClone(stored);
  const id = String(feature.properties?.id || feature.id || 'building');
  return {
    parts: polygonsOf(feature.geometry).map((polygon, p) => ({
      id: `${id}:wing:${p}`,
      rings: polygon.map((ring, r) => ({
        id: `${id}:ring:${p}:${r}`,
        vertexIds: ring
          .slice(0, -1)
          .map((_, v) => `${id}:vertex:${p}:${r}:${v}`),
        wallIds: ring.slice(0, -1).map((_, v) => `${id}:wall:${p}:${r}:${v}`),
      })),
    })),
  };
}
export function styleFor(
  appearance: BuildingAppearance = {},
  visual?: BuildingVisual,
  partId?: string,
  wallId?: string,
): SurfaceStyle {
  const { parts, walls, roofs: _roofs, modelId: _model, ...base } = appearance;
  return {
    wallColour: visual?.wallColour || '#eedcc0',
    roofColour: visual?.roofColour || '#b97760',
    windowColour: '#6f9bad',
    trimColour: '#d6c6a8',
    windowSpacing: 4,
    windows: visual?.level === 'detailed',
    roofForm: visual?.roofForm || 'flat',
    confidence: 'inferred',
    ...visual?.defaults,
    ...base,
    ...(partId ? parts?.[partId] : {}),
    ...(wallId ? walls?.[wallId] : {}),
  };
}
export function resolveBuildingVisual(
  feature: Feature,
  previous?: BuildingVisual,
): BuildingVisual {
  const p = feature.properties || {},
    a: BuildingAppearance = p.appearance || {};
  const display = buildingDisplay(p),
    colours = appearanceColours(p);
  const defaults = styleFor({}, previous);
  const style = styleFor(a, previous);
  const heightChanged =
    p.heightMode !== undefined || Number(p.height) > 0 || Number(p.floors) > 0;
  return {
    ...previous,
    id: String(p.id || feature.id),
    name: String(p.name || 'Building'),
    geometryRevision: '',
    defaults,
    level: Object.keys(a).length
      ? style.windows
        ? 'detailed'
        : 'simplified'
      : previous?.level || 'simplified',
    height: heightChanged ? display.metres : previous?.height || display.metres,
    heightKind: heightChanged
      ? display.kind
      : previous?.heightKind || display.kind,
    floors: Number(p.floors) || previous?.floors,
    wallColour: style.wallColour || colours.wall,
    roofColour: style.roofColour || colours.roof,
    roofForm: style.roofForm || 'flat',
    confidence: a.confidence || previous?.confidence || 'inferred',
    sources: previous?.sources || [],
    observed: previous?.observed || [],
    inferred: previous?.inferred || [],
    needed: previous?.needed || [],
    ...(heightChanged ? { partHeights: undefined } : {}),
  };
}
const equalStyle = (a: SurfaceStyle, b: SurfaceStyle) =>
  JSON.stringify(Object.entries(a).sort()) ===
  JSON.stringify(Object.entries(b).sort());
const onSegment = (p: number[], a: number[], b: number[]) => {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    length = dx * dx + dy * dy;
  const t = length ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length : -1;
  return (
    t >= -1e-6 &&
    t <= 1 + 1e-6 &&
    Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) < 1e-11
  );
};
/** Geometry and its surface assignments are returned as one undoable correction. */
export function remapBuildingSurfaces(
  edit: MapEdit,
  geometry: Geometry,
): MapEdit {
  const before = polygonsOf(edit.geometry),
    after = polygonsOf(geometry);
  const old = buildingTopology({
    type: 'Feature',
    geometry: edit.geometry,
    properties: { ...edit.properties, id: edit.id },
  });
  const appearance: BuildingAppearance = structuredClone(
    edit.properties.appearance || {},
  );
  const issues: NonNullable<BuildingTopology['issues']> = [
    ...(old.issues || []),
  ];
  const usedParts = new Set<number>();
  const parts = after.map((polygon, index) => {
    const scores = before.map((part, p) =>
      usedParts.has(p)
        ? -1
        : polygon.flat().filter((q) => part.flat().some((v) => same(q, v)))
            .length,
    );
    let p = scores.indexOf(Math.max(...scores));
    if (scores[p] <= 0)
      p = before.length === after.length && !usedParts.has(index) ? index : -1;
    if (p < 0)
      return buildingTopology({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: polygon },
        properties: { id: fresh() },
      }).parts[0];
    usedParts.add(p);
    const part = old.parts[p],
      usedRings = new Set<number>();
    const rings = polygon.map((closed, ri) => {
      const points = closed.slice(0, -1);
      const scores = before[p].map((ring, r) =>
        usedRings.has(r)
          ? -1
          : points.filter((q) => ring.some((v) => same(q, v))).length,
      );
      let r = scores.indexOf(Math.max(...scores));
      if (scores[r] <= 0) r = polygon.length === before[p].length ? ri : -1;
      if (r < 0 || !part.rings[r])
        return {
          id: fresh(),
          vertexIds: points.map(fresh),
          wallIds: points.map(fresh),
        };
      usedRings.add(r);
      const ring = part.rings[r],
        oldPoints = before[p][r].slice(0, -1),
        used = new Set<number>();
      const matched = points.map((q) => {
        const i = oldPoints.findIndex((v, i) => !used.has(i) && same(v, q));
        if (i >= 0) used.add(i);
        return i;
      });
      const unmatched = matched
        .map((v, i) => (v < 0 ? i : -1))
        .filter((i) => i >= 0);
      const remaining = oldPoints.map((_, i) => i).filter((i) => !used.has(i));
      // Ordinary vertex moves and whole-part translations retain vertex identity.
      if (
        points.length === oldPoints.length &&
        (unmatched.length === 1 || unmatched.length === points.length)
      )
        unmatched.forEach((i, k) => {
          matched[i] = remaining[k];
        });
      const vertexIds = matched.map((i) =>
        i >= 0 ? ring.vertexIds[i] : fresh(),
      );
      const wallIds = points.map((q, i) => {
        const next = (i + 1) % points.length,
          a = matched[i],
          b = matched[next];
        const oldEdge =
          a >= 0 && b >= 0
            ? (a + 1) % oldPoints.length === b
              ? a
              : (b + 1) % oldPoints.length === a
                ? b
                : -1
            : -1;
        if (oldEdge >= 0) return ring.wallIds[oldEdge];
        const split = oldPoints.findIndex(
          (v, j) =>
            onSegment(q, v, oldPoints[(j + 1) % oldPoints.length]) &&
            onSegment(points[next], v, oldPoints[(j + 1) % oldPoints.length]),
        );
        const id = fresh();
        let affected =
          split >= 0
            ? [ring.wallIds[split]]
            : oldPoints.flatMap((v, j) =>
                onSegment(v, q, points[next]) &&
                onSegment(
                  oldPoints[(j + 1) % oldPoints.length],
                  q,
                  points[next],
                )
                  ? [ring.wallIds[j]]
                  : [],
              );
        const ambiguous = !affected.length;
        if (ambiguous)
          affected = ring.wallIds.filter(
            (id) => Object.keys(appearance.walls?.[id] || {}).length,
          );
        const styles = affected.map((w) => appearance.walls?.[w] || {});
        if (
          !ambiguous &&
          styles.length &&
          styles.every((s) => equalStyle(s, styles[0]))
        ) {
          if (Object.keys(styles[0]).length)
            (appearance.walls ||= {})[id] = structuredClone(styles[0]);
        } else if (styles.some((s) => Object.keys(s).length)) {
          issues.push({
            id: fresh(),
            partId: part.id,
            wallId: id,
            message: ambiguous
              ? 'The outline change has ambiguous wall assignments. Reassign a former style or reset to wing defaults.'
              : 'Joined walls had different styles. Choose a style or use the wing defaults.',
            candidates: styles,
          });
        }
        return id;
      });
      return { ...ring, vertexIds, wallIds };
    });
    const roof = appearance.roofs?.[part.id];
    if (roof) {
      const delta = [
        polygon[0][0][0] - before[p][0][0][0],
        polygon[0][0][1] - before[p][0][0][1],
      ];
      const translated =
        polygon.length === before[p].length &&
        polygon.every(
          (ring, r) =>
            ring.length === before[p][r].length &&
            ring.every((q, i) =>
              same(q, [
                before[p][r][i][0] + delta[0],
                before[p][r][i][1] + delta[1],
              ]),
            ),
        );
      for (const point of roof.points) {
        const r = rings.findIndex(
          (r) => point.vertexId && r.vertexIds.includes(point.vertexId),
        );
        if (r >= 0)
          point.coordinates = polygon[r][
            rings[r].vertexIds.indexOf(point.vertexId!)
          ] as [number, number];
        else if (translated)
          point.coordinates = [
            point.coordinates[0] + delta[0],
            point.coordinates[1] + delta[1],
          ];
      }
    }
    return { ...part, rings };
  });
  const wallIds = new Set(
    parts.flatMap((p) => p.rings.flatMap((r) => r.wallIds)),
  );
  const partIds = new Set(parts.map((p) => p.id));
  if (appearance.walls)
    appearance.walls = Object.fromEntries(
      Object.entries(appearance.walls).filter(([id]) => wallIds.has(id)),
    );
  if (appearance.parts)
    appearance.parts = Object.fromEntries(
      Object.entries(appearance.parts).filter(([id]) => partIds.has(id)),
    );
  if (appearance.roofs)
    appearance.roofs = Object.fromEntries(
      Object.entries(appearance.roofs).filter(([id]) => partIds.has(id)),
    );
  return {
    ...edit,
    geometry,
    properties: {
      ...edit.properties,
      appearance,
      buildingTopology: {
        parts,
        issues: issues.filter((i) => partIds.has(i.partId)),
      },
    },
  };
}
