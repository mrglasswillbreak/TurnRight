import type { Geometry } from 'geojson';
import OverlayOp from 'jsts/org/locationtech/jts/operation/overlay/OverlayOp.js';
import BufferOp from 'jsts/org/locationtech/jts/operation/buffer/BufferOp.js';
import Polygonizer from 'jsts/org/locationtech/jts/operation/polygonize/Polygonizer.js';
import IsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js';
import InteriorPointArea from 'jsts/org/locationtech/jts/algorithm/InteriorPointArea.js';
import Centroid from 'jsts/org/locationtech/jts/algorithm/Centroid.js';
import type { CampusData, MapEdit } from './types';
import { polygonRings } from './geometry-window';
import { geometryEdits } from './editor-features';
import { squareRing } from './editor-precision';
import { layerIdentity, layerKey } from './campus-layers';
import {
  type GeometryRequest,
  type GeometryResult,
} from './layer-geometry-types.js';
import { createGeometryContext } from './layer-geometry-context.js';
import { regenerateRoadSurfaces } from './layer-road-surfaces.js';
export function runGeometry(
  data: CampusData,
  edits: MapEdit[],
  request: GeometryRequest,
): GeometryResult {
  const context = createGeometryContext(data, edits, request);
  const { transform, reader, writer, read, output, selected, result, lineage } =
    context;
  if (request.operation === 'regenerate')
    return regenerateRoadSurfaces(context);

  if (['square', 'straighten', 'align', 'offset'].includes(request.operation)) {
    const staged = new Map<string, MapEdit>();
    for (const original of selected) {
      const edit = staged.get(layerKey(original.kind, original.id)) || original;
      if (
        !['building', 'path', 'barrier', 'land', 'overlay'].includes(edit.kind)
      )
        throw new Error('Select building, line or surface geometry.');
      const planar = transform(edit.geometry);
      let next = structuredClone(planar);
      const polygons = polygonRings(next);
      if (request.operation === 'square') {
        const ring = polygons[request.part || 0]?.[request.ring || 0];
        if (!ring)
          throw new Error('Select an existing polygon ring to square.');
        polygons[request.part || 0][request.ring || 0] = squareRing(ring);
      } else if (request.operation === 'straighten') {
        const lines =
          next.type === 'LineString'
            ? [next.coordinates]
            : next.type === 'MultiLineString'
              ? next.coordinates
              : [];
        const points = lines[request.part || 0];
        if (!points || points.length < 3)
          throw new Error(
            'Straighten needs a line with at least three vertices.',
          );
        const a = points[0],
          b = points.at(-1)!,
          dx = b[0] - a[0],
          dy = b[1] - a[1],
          norm = dx * dx + dy * dy;
        if (norm < 0.0001)
          throw new Error('The line endpoints must be distinct.');
        let previous = 0;
        for (let i = 1; i < points.length - 1; i++) {
          const t = Math.max(
            0,
            Math.min(
              1,
              ((points[i][0] - a[0]) * dx + (points[i][1] - a[1]) * dy) / norm,
            ),
          );
          if (
            (t - previous) * Math.sqrt(norm) < 0.01 ||
            (1 - t) * Math.sqrt(norm) < 0.01
          )
            throw new Error(
              'Straightening would collapse or reverse connected vertices. Move the endpoints or select a shorter line.',
            );
          points[i] = [a[0] + t * dx, a[1] + t * dy];
          previous = t;
        }
      } else if (request.operation === 'align') {
        if (!Number.isFinite(request.bearing))
          throw new Error('Enter a finite alignment bearing.');
        const points =
          polygons[0]?.[0] ||
          (next.type === 'LineString'
            ? next.coordinates
            : next.type === 'MultiLineString'
              ? next.coordinates[0]
              : []);
        if (points.length < 2) throw new Error('Alignment needs an edge.');
        let axis = 0,
          longest = 0;
        points.slice(1).forEach((b, i) => {
          const a = points[i],
            d = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (d > longest) {
            longest = d;
            axis = Math.atan2(b[1] - a[1], b[0] - a[0]);
          }
        });
        const angle = Math.PI / 2 - (request.bearing! * Math.PI) / 180 - axis;
        const centre = Centroid.getCentroid(read(edit.geometry));
        const visit = (v: unknown): unknown =>
          Array.isArray(v)
            ? typeof v[0] === 'number'
              ? [
                  centre.x +
                    (v[0] - centre.x) * Math.cos(angle) -
                    (v[1] - centre.y) * Math.sin(angle),
                  centre.y +
                    (v[0] - centre.x) * Math.sin(angle) +
                    (v[1] - centre.y) * Math.cos(angle),
                ]
              : v.map(visit)
            : v;
        if (next.type === 'GeometryCollection')
          throw new Error('Align one concrete geometry at a time.');
        next = { ...next, coordinates: visit(next.coordinates) } as Geometry;
      } else {
        if (
          !Number.isFinite(request.distance) ||
          Math.abs(request.distance!) > 100 ||
          !request.distance
        )
          throw new Error(
            'Use an offset above zero and at most 100 metres in either direction.',
          );
        if (!polygons.length)
          throw new Error(
            'Offset currently supports polygons; use numeric parallel construction for lines.',
          );
        const buffered = BufferOp.bufferOp(
          read(edit.geometry),
          request.distance!,
          1,
        );
        const g = writer.write(buffered) as Geometry;
        const rings = polygonRings(g);
        if (
          rings.length !== polygons.length ||
          rings.some((p, i) => p.length !== polygons[i].length)
        )
          throw new Error(
            'Offset would remove or merge a part or hole. Reduce the distance.',
          );
        next = g;
      }
      const shape = reader.read(next);
      const geometry = output(shape, edit.id);
      if (shape.getDimension() !== read(edit.geometry).getDimension())
        throw new Error('Operation changes geometry dimension.');
      result.beforeArea += read(edit.geometry).getArea();
      result.afterArea += shape.getArea();
      for (const change of geometryEdits(edit, geometry, data, [
        ...edits,
        ...staged.values(),
      ])) {
        change.properties = {
          ...change.properties,
          ...(change.id === edit.id ? lineage(change, request.operation) : {}),
        };
        staged.set(layerKey(change.kind, change.id), change);
      }
    }
    result.edits = [...staged.values()];
    if (result.edits.length > 500)
      throw new Error(
        'Connected features exceed the 500-edit transaction limit. Select fewer features.',
      );
    result.report.push(
      `${request.operation}: ${selected.length} selected; ${result.edits.length} affected including connected features. Review all geometry before applying.`,
    );
    return result;
  }

  if (selected.some((e) => !['land', 'overlay'].includes(e.kind)))
    throw new Error(
      'Use the topology-aware path tools for routing edits. These operations support landscape, road surfaces and overlays.',
    );

  const primary = selected[0],
    shapes = selected.map((e) => read(e.geometry));

  result.beforeArea = shapes.reduce((n, g) => n + g.getArea(), 0);

  if (request.operation === 'merge') {
    if (
      selected.length < 2 ||
      selected.some(
        (e) =>
          e.kind !== primary.kind ||
          e.properties.mapLayerId !== primary.properties.mapLayerId,
      )
    )
      throw new Error(
        'Select two or more features of the same kind and layer. The first selected identity is retained.',
      );
    let merged = shapes[0];
    for (const shape of shapes.slice(1))
      merged = OverlayOp.union(merged, shape);
    result.edits = [
      {
        ...primary,
        geometry: output(merged),
        properties: lineage(primary, 'merge'),
      },
      ...selected.slice(1).map((e) => ({
        ...e,
        deleted: true,
        properties: {
          ...e.properties,
          geometryLineage: { operation: 'superseded', survivor: primary.id },
        },
      })),
    ];
  } else if (request.operation === 'split') {
    if (
      selected.length !== 1 ||
      !request.cutter ||
      request.cutter.type !== 'LineString' ||
      !polygonRings(primary.geometry).length
    )
      throw new Error(
        'Select one polygon and supply a line crossing it to split.',
      );
    const shape = shapes[0],
      polygonizer = new Polygonizer();
    polygonizer.add(OverlayOp.union(shape.getBoundary(), read(request.cutter)));
    const iterator = polygonizer.getPolygons().iterator(),
      pieces: Geometry[] = [];
    while (iterator.hasNext()) {
      const p = iterator.next(),
        interior = p
          .getFactory()
          .createPoint(InteriorPointArea.getInteriorPoint(p));
      if (!OverlayOp.intersection(shape, interior).isEmpty()) {
        const cut = OverlayOp.intersection(shape, p);
        if (!cut.isEmpty()) pieces.push(output(cut));
      }
    }
    if (pieces.length < 2)
      throw new Error(
        'The line must cross the polygon completely to produce two or more pieces.',
      );
    result.edits = [
      {
        ...primary,
        deleted: true,
        properties: {
          ...primary.properties,
          geometryLineage: {
            operation: 'superseded',
            children: pieces.map(
              (_, i) =>
                `split:${layerIdentity(JSON.stringify([primary.id, request.cutter])).slice(10)}:${i + 1}`,
            ),
          },
        },
      },
      ...pieces.map((geometry, i) => ({
        ...primary,
        id: `split:${layerIdentity(JSON.stringify([primary.id, request.cutter])).slice(10)}:${i + 1}`,
        geometry,
        properties: lineage(primary, 'split'),
      })),
    ];
  } else if (request.operation === 'hole') {
    if (selected.length !== 1 || request.cutter?.type !== 'Polygon')
      throw new Error('Select one polygon and supply a polygon for the hole.');
    const cutter = read(request.cutter),
      inside = OverlayOp.intersection(shapes[0], cutter);
    if (Math.abs(inside.getArea() - cutter.getArea()) > 0.001)
      throw new Error('The hole must lie wholly within the feature.');
    result.edits = [
      {
        ...primary,
        geometry: output(OverlayOp.difference(shapes[0], cutter)),
        properties: lineage(primary, 'hole'),
      },
    ];
  } else {
    if (selected.length !== 1) throw new Error('Select one feature.');
    const geometry = structuredClone(primary.geometry),
      parts = polygonRings(geometry),
      part = request.part ?? 0,
      ring = request.ring ?? 1;
    if (request.operation === 'remove-hole') {
      if (ring < 1 || !parts[part]?.[ring])
        throw new Error('Choose an existing interior ring.');
      parts[part].splice(ring, 1);
    } else {
      if (
        !['MultiPolygon', 'MultiLineString', 'MultiPoint'].includes(
          geometry.type,
        ) ||
        !('coordinates' in geometry) ||
        geometry.coordinates.length < 2 ||
        !geometry.coordinates[part]
      )
        throw new Error(
          'Choose a part in multipart geometry with at least two parts.',
        );
      geometry.coordinates.splice(part, 1);
    }
    if (!new IsValidOp(reader.read(geometry)).isValid())
      throw new Error('Removing this part would leave invalid geometry.');
    result.edits = [
      {
        ...primary,
        geometry,
        properties: lineage(primary, request.operation),
      },
    ];
  }

  result.afterArea = result.edits
    .filter((e) => !e.deleted)
    .reduce((n, e) => n + read(e.geometry).getArea(), 0);

  result.report.push(
    `${result.edits.filter((e) => !e.deleted).length} output features; ${result.beforeArea.toFixed(2)} → ${result.afterArea.toFixed(2)} m². Original identities and superseded pieces remain in undo history.`,
  );

  return result;
}
export {
  type GeometryRequest,
  type GeometryResult,
} from './layer-geometry-types.js';
