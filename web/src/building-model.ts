import { roofTextMesh } from './surface-text.js';
import {
  buildingTopology,
  styleFor,
  standardRoofSupported,
} from './building-surfaces.js';
import { customRoofSurface } from './custom-roof.js';
import { detailRevision, facadeMatches } from './building-facades.js';
import { facadeMeshes } from './facade-mesh.js';
import { ShapeUtils, Vector2 } from 'three';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import type {
  BuildingModel,
  BuildingVisual,
  ModelMesh,
} from './visual-types.js';
import type { Position } from './types.js';

const rounded = (n: number) => Math.round(n * 1000) / 1000;
const signedArea = (ring: number[][]) =>
  ring.reduce((sum, a, i) => {
    const b = ring[(i + 1) % ring.length];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0) / 2;

export function footprintAssessment(feature: Feature<Polygon | MultiPolygon>) {
  const polygons =
    feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;
  const points = polygons.flat(2),
    west = Math.min(...points.map((p) => p[0])),
    east = Math.max(...points.map((p) => p[0])),
    south = Math.min(...points.map((p) => p[1])),
    north = Math.max(...points.map((p) => p[1]));
  const yScale = (Math.PI / 180) * 6371008.8,
    xScale = yScale * Math.cos((((south + north) / 2) * Math.PI) / 180);
  let area = 0,
    longest = 0,
    bearing = 0;
  for (const polygon of polygons)
    for (const [index, ring] of polygon.entries()) {
      const local = ring
        .slice(0, -1)
        .map((p) => [(p[0] - west) * xScale, (p[1] - south) * yScale]);
      area += Math.abs(signedArea(local)) * (index === 0 ? 1 : -1);
      if (index === 0)
        for (let i = 0; i < local.length; i++) {
          const a = local[i],
            b = local[(i + 1) % local.length],
            dx = b[0] - a[0],
            dy = b[1] - a[1],
            length = Math.hypot(dx, dy);
          if (length > longest) {
            longest = length;
            bearing = ((Math.atan2(dx, dy) * 180) / Math.PI + 180) % 180;
          }
        }
    }
  return {
    bounds: [
      [west, south],
      [east, north],
    ] as [Position, Position],
    widthMetres: rounded((east - west) * xScale),
    depthMetres: rounded((north - south) * yScale),
    areaSquareMetres: rounded(area),
    longestEdgeBearing: rounded(bearing),
    polygonParts: polygons.length,
    courtyards: polygons.reduce((n, p) => n + p.length - 1, 0),
  };
}
/** Survey footprint in metres; no bounding-box replacement or silhouette enlargement. */
export function createBuildingModel(
  feature: Feature<Polygon | MultiPolygon>,
  visual: BuildingVisual,
  options: { previewUnreviewed?: boolean } = {},
): BuildingModel {
  const polygons =
    feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;
  const all = polygons.flat(2);
  const origin: Position = [
    all.reduce((s, p) => s + p[0], 0) / all.length,
    all.reduce((s, p) => s + p[1], 0) / all.length,
  ];
  const rad = Math.PI / 180,
    radius = 6371008.8;
  const local = (p: number[]): number[] => [
    (p[0] - origin[0]) * rad * radius * Math.cos(origin[1] * rad),
    (p[1] - origin[1]) * rad * radius,
  ];
  const allMeshes = new Map<string, ModelMesh>();
  const detailedMeshes: ModelMesh[] = [];
  const roles = new WeakMap<ModelMesh, 'wall' | 'roof' | 'window' | 'trim'>();
  let scope: { partId: string; wallId?: string } = { partId: '' };
  const topology = buildingTopology(feature);
  const appearance = feature.properties?.appearance || {};
  const surfaceVisual = {
    ...visual,
    partDefaults:
      visual.partDefaults ||
      Object.fromEntries(
        topology.parts.map((part, i) => [
          part.id,
          visual.partHeights?.[i]?.kind === 'illustrative'
            ? { wallColour: '#d4d5c3', roofColour: '#a6b19f', windows: false }
            : {},
        ]),
      ),
  };
  const mesh = (
    colour: string,
    detail = false,
    role: 'wall' | 'roof' | 'window' | 'trim' = 'wall',
  ): ModelMesh => {
    const key = `${colour}:${detail}:${role}`;
    let value = allMeshes.get(key);
    if (!value) {
      value = { positions: [], indices: [], colour, detail, surfaces: [] };
      allMeshes.set(key, value);
      roles.set(value, role);
    }
    return value;
  };
  const face = (m: ModelMesh, points: number[][]) => {
    const first = m.indices.length / 3;
    const start = m.positions.length / 3;
    m.positions.push(...points.flat().map(rounded));
    for (let i = 1; i < points.length - 1; i++)
      m.indices.push(start, start + i, start + i + 1);
    const wallId = roles.get(m) === 'roof' ? undefined : scope.wallId,
      last = m.surfaces!.at(-1);
    if (
      last &&
      last.partId === scope.partId &&
      last.wallId === wallId &&
      last.start + last.count === first
    )
      last.count += points.length - 2;
    else
      m.surfaces!.push({
        start: first,
        count: points.length - 2,
        partId: scope.partId,
        wallId,
        role: roles.get(m)!,
      });
  };
  for (const [partIndex, polygon] of polygons.entries()) {
    const part = visual.partHeights?.[partIndex];
    const partId = topology.parts[partIndex].id;
    scope = { partId };
    const style = styleFor(appearance, surfaceVisual, partId);
    const override = appearance.parts?.[partId];
    const height =
      override?.heightMode === 'floors'
        ? Number(override.floors) * 3
        : override?.heightMode === 'unknown'
          ? 6
          : (override?.height ?? part?.height ?? visual.height);
    if (!Number.isFinite(height) || height <= 0 || height > 150)
      throw new Error('Wing height must be above zero and at most 150 metres.');
    const roofMesh = mesh(style.roofColour!, false, 'roof');
    const custom = appearance.roofs?.[partId];
    const rings = polygon.map((r, index) => {
      const points = r.slice(0, -1).map(local);
      if (signedArea(points) > 0 !== (index === 0)) points.reverse();
      return points;
    });
    const outer = rings[0];
    // Roof rise is an explicitly inferred share of total height, never added above it.
    const pitched =
      !custom && style.roofForm !== 'flat' && standardRoofSupported(polygon);
    const width = Math.min(
      ...outer.map((a, i) =>
        Math.hypot(
          a[0] - outer[(i + 1) % outer.length][0],
          a[1] - outer[(i + 1) % outer.length][1],
        ),
      ),
    );
    const rise = pitched
      ? style.roofPitch === undefined
        ? Math.min(height * 0.18, 1.8)
        : (width / 2) * Math.tan((style.roofPitch * Math.PI) / 180)
      : 0;
    if (rise >= height)
      throw new Error(
        'Roof pitch exceeds the total wing height. Reduce pitch or review the height.',
      );
    const eaves = custom ? custom.eaves : height - rise;
    for (const [ringIndex, ring] of rings.entries())
      for (let i = 0; i < ring.length; i++) {
        // Ring orientation is normalized for triangulation; recover the original wall by its endpoints.
        const original = polygon[ringIndex].slice(0, -1).map(local);
        const wallIndex = original.findIndex((a, j) => {
          const b = original[(j + 1) % original.length],
            x = ring[i],
            y = ring[(i + 1) % ring.length];
          return (
            (Math.hypot(a[0] - x[0], a[1] - x[1]) < 0.001 &&
              Math.hypot(b[0] - y[0], b[1] - y[1]) < 0.001) ||
            (Math.hypot(a[0] - y[0], a[1] - y[1]) < 0.001 &&
              Math.hypot(b[0] - x[0], b[1] - x[1]) < 0.001)
          );
        });
        const wallId =
          topology.parts[partIndex].rings[ringIndex].wallIds[wallIndex];
        scope = { partId, wallId };
        const facade = styleFor(appearance, surfaceVisual, partId, wallId);
        const wallMesh = mesh(facade.wallColour!);
        const windows = mesh(facade.windowColour!, true, 'window'),
          trim = mesh(facade.trimColour!, true, 'trim');
        const a = ring[i],
          b = ring[(i + 1) % ring.length];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (length < 0.01) continue;
        face(wallMesh, [
          [...a, 0],
          [...b, 0],
          [...b, eaves],
          [...a, eaves],
        ]);
        const description = appearance.facades?.[wallId];
        if (
          description &&
          (!description.needsReview || options.previewUnreviewed) &&
          facadeMatches(description, feature)
        ) {
          detailedMeshes.push(
            ...facadeMeshes(
              description,
              original[wallIndex],
              original[(wallIndex + 1) % original.length],
              [(b[1] - a[1]) / length, -(b[0] - a[0]) / length],
              eaves,
              facade.wallColour!,
              facade.trimColour,
            ),
          );
          continue;
        }
        if (!facade.windows) continue;
        const floors =
          override?.floors ||
          part?.floors ||
          visual.floors ||
          Math.max(1, Math.round(height / 3));
        const bays = Math.max(
          1,
          Math.floor(length / (facade.windowSpacing || 4)),
        );
        const dx = (b[0] - a[0]) / length,
          dy = (b[1] - a[1]) / length;
        const point = (t: number, z: number) => [
          a[0] + dx * t + dy * 0.018,
          a[1] + dy * t - dx * 0.018,
          z,
        ];
        const frameElements: import('./visual-types').FacadeElement[] = [];
        for (let floor = 0; floor < floors; floor++) {
          const low = ((floor + 0.3) * eaves) / floors,
            high = Math.min(
              eaves,
              low + ((facade.windowHeightRatio ?? 0.48) * eaves) / floors,
            );
          for (let bay = 0; bay < bays; bay++) {
            const center = ((bay + 0.5) * length) / bays,
              width = Math.min(
                // Keep the legacy cap until an explicit photo-informed ratio exists.
                facade.windowWidthRatio === undefined ? 2.1 : length / bays,
                (length / bays) * (facade.windowWidthRatio ?? 0.6),
              );
            if (facade.windowFrameDepth)
              frameElements.push({
                id: `${floor}-${bay}`,
                kind: 'window',
                x: center / length,
                bottom: low,
                width,
                height: high - low,
                depth: facade.windowFrameDepth,
                count: 1,
                spacing: 0,
                colour: facade.windowColour!,
              });
            face(windows, [
              point(center - width / 2, low),
              point(center + width / 2, low),
              point(center + width / 2, high),
              point(center - width / 2, high),
            ]);
          }
          if (floor > 0)
            face(trim, [
              point(0, (floor * eaves) / floors),
              point(length, (floor * eaves) / floors),
              point(length, (floor * eaves) / floors + 0.11),
              point(0, (floor * eaves) / floors + 0.11),
            ]);
        }
        face(trim, [
          point(0, eaves - 0.16),
          point(length, eaves - 0.16),
          point(length, eaves),
          point(0, eaves),
        ]);
        if (frameElements.length)
          detailedMeshes.push(
            ...facadeMeshes(
              {
                partId,
                wallId,
                wallCoordinates: [],
                photoIds: [],
                confidence: 'inferred',
                notes:
                  'Regularized illustrative window positions; frame proportions informed by photographic evidence.',
                elements: frameElements,
              },
              a,
              b,
              [(b[1] - a[1]) / length, -(b[0] - a[0]) / length],
              eaves,
              facade.wallColour!,
              facade.trimColour,
            ).map((mesh) => ({ ...mesh, minZoom: 19 })),
          );
      }
    scope = { partId };
    if (custom) {
      const roof = customRoofSurface(polygon, custom, height);
      for (const triangle of roof.triangles)
        face(
          roofMesh,
          triangle.map((i) => [...local(roof.points[i]), roof.points[i][2]]),
        );
    } else if (pitched) {
      // Opposite eaves form a ridge aligned with the longer footprint dimension.
      if (
        Math.hypot(outer[1][0] - outer[0][0], outer[1][1] - outer[0][1]) <
        Math.hypot(outer[2][0] - outer[1][0], outer[2][1] - outer[1][1])
      )
        outer.push(outer.shift()!);
      const midpoint = (a: number[], b: number[]) => [
        (a[0] + b[0]) / 2,
        (a[1] + b[1]) / 2,
      ];
      const r0 = midpoint(outer[0], outer[3]),
        r1 = midpoint(outer[1], outer[2]);
      if (style.roofForm === 'hip') {
        const a = [...r0],
          b = [...r1];
        for (let k = 0; k < 2; k++) {
          r0[k] = a[k] * 0.8 + b[k] * 0.2;
          r1[k] = a[k] * 0.2 + b[k] * 0.8;
        }
      }
      face(roofMesh, [
        [...outer[0], eaves],
        [...outer[1], eaves],
        [...r1, height],
        [...r0, height],
      ]);
      face(roofMesh, [
        [...outer[2], eaves],
        [...outer[3], eaves],
        [...r0, height],
        [...r1, height],
      ]);
      const end = (a: number[], b: number[], ridge: number[]) => {
        const original = polygon[0].slice(0, -1).map(local);
        const index = original.findIndex((p, i) => {
          const q = original[(i + 1) % original.length];
          return (
            (Math.hypot(p[0] - a[0], p[1] - a[1]) < 0.001 &&
              Math.hypot(q[0] - b[0], q[1] - b[1]) < 0.001) ||
            (Math.hypot(p[0] - b[0], p[1] - b[1]) < 0.001 &&
              Math.hypot(q[0] - a[0], q[1] - a[1]) < 0.001)
          );
        });
        scope = {
          partId,
          wallId: topology.parts[partIndex].rings[0].wallIds[index],
        };
        const colour = styleFor(
          appearance,
          surfaceVisual,
          partId,
          scope.wallId,
        ).wallColour!;
        face(style.roofForm === 'gable' ? mesh(colour) : roofMesh, [
          [...a, eaves],
          [...b, eaves],
          [...ridge, height],
        ]);
      };
      end(outer[3], outer[0], r0);
      end(outer[1], outer[2], r1);
    } else {
      const vectors = rings.map((r) => r.map((p) => new Vector2(p[0], p[1])));
      const triangles = ShapeUtils.triangulateShape(
        vectors[0],
        vectors.slice(1),
      );
      const points = rings.flat();
      for (const tri of triangles)
        face(
          roofMesh,
          tri.map((i) => [...points[i], height]),
        );
    }
    for (const text of appearance.roofTexts?.[partId] || [])
      detailedMeshes.push(roofTextMesh(text, partId, roofMesh, local));
  }
  return {
    id: visual.id,
    geometryRevision: visual.geometryRevision,
    detailRevision: detailRevision(feature),
    origin,
    meshes: mergeModelMeshes([...allMeshes.values(), ...detailedMeshes]),
  };
}
/** Wall-specific authoring must not imply a draw call per frame or wall. */
export function mergeModelMeshes(meshes: ModelMesh[]): ModelMesh[] {
  const merged = new Map<string, ModelMesh>();
  for (const source of meshes) {
    if (!source.indices.length) continue;
    const key = JSON.stringify([
      source.colour,
      source.detail,
      source.minZoom,
      source.surfaces?.[0]?.role,
      source.texture,
      source.text,
    ]);
    let target = merged.get(key);
    if (!target) {
      target = {
        text: source.text,
        positions: [],
        indices: [],
        colour: source.colour,
        detail: source.detail,
        ...(source.minZoom === undefined ? {} : { minZoom: source.minZoom }),
        surfaces: [],
        ...(source.texture ? { texture: source.texture } : {}),
        ...(source.uvs ? { uvs: [] } : {}),
      };
      merged.set(key, target);
    }
    const vertexOffset = target.positions.length / 3,
      triangleOffset = target.indices.length / 3;
    for (const position of source.positions) target.positions.push(position);
    for (const index of source.indices)
      target.indices.push(index + vertexOffset);
    for (const surface of source.surfaces || [])
      target.surfaces!.push({
        ...surface,
        start: surface.start + triangleOffset,
      });
    if (source.uvs) for (const uv of source.uvs) target.uvs!.push(uv);
  }
  return [...merged.values()];
}
