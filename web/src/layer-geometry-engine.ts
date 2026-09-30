import type { Geometry } from 'geojson';
import proj4 from 'proj4';
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js';
import GeoJSONWriter from 'jsts/org/locationtech/jts/io/GeoJSONWriter.js';
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js';
import OverlayOp from 'jsts/org/locationtech/jts/operation/overlay/OverlayOp.js';
import BufferOp from 'jsts/org/locationtech/jts/operation/buffer/BufferOp.js';
import Polygonizer from 'jsts/org/locationtech/jts/operation/polygonize/Polygonizer.js';
import IsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js';
import InteriorPointArea from 'jsts/org/locationtech/jts/algorithm/InteriorPointArea.js';
import type { CampusData, MapEdit } from './types';
import { vertexCount, polygonRings } from './geometry-window';
import { featureEdit } from './editor-features';
import { layerIdentity, newLayer, layerEdit, layerKey } from './campus-layers';
import {
  roadRevision,
  surfaceWidth,
  SURFACE_GENERATOR,
  type DerivedSurface,
} from './surface-generation';
export interface GeometryRequest {
  operation:
    | 'merge'
    | 'split'
    | 'hole'
    | 'regenerate'
    | 'remove-hole'
    | 'remove-part';
  keys: string[];
  cutter?: Geometry;
  part?: number;
  ring?: number;
  replaceManual?: boolean;
}
export interface GeometryResult {
  edits: MapEdit[];
  report: string[];
  beforeArea: number;
  afterArea: number;
  projection: string;
  repairs: {
    sourceId?: string;
    original: Geometry;
    precision: number;
    areaChangePercent: number;
    vertices: number;
  }[];
}
export function runGeometry(
  data: CampusData,
  edits: MapEdit[],
  request: GeometryRequest,
): GeometryResult {
  const centre = [
      (data.bounds[0][0] + data.bounds[1][0]) / 2,
      (data.bounds[0][1] + data.bounds[1][1]) / 2,
    ],
    zone = Math.max(1, Math.min(60, Math.floor((centre[0] + 180) / 6) + 1));
  const projection = `+proj=utm +zone=${zone}${centre[1] < 0 ? ' +south' : ''} +datum=WGS84 +units=m +no_defs`;
  const project = proj4('EPSG:4326', projection),
    reader = new GeoJSONReader(new GeometryFactory()),
    writer = new GeoJSONWriter();
  const transform = (g: Geometry, inverse = false): Geometry => {
    const visit = (v: unknown): unknown =>
      Array.isArray(v)
        ? typeof v[0] === 'number'
          ? inverse
            ? project.inverse(v as number[])
            : project.forward(v as number[])
          : v.map(visit)
        : v;
    return g.type === 'GeometryCollection'
      ? { ...g, geometries: g.geometries.map((x) => transform(x, inverse)) }
      : ({ ...g, coordinates: visit(g.coordinates) } as Geometry);
  };
  const read = (g: Geometry) => reader.read(transform(g));
  const output = (
    value: ReturnType<typeof read>,
    sourceId?: string,
  ): Geometry => {
    if (value.isEmpty() || !new IsValidOp(value).isValid())
      throw new Error(
        'The operation produced empty or invalid geometry. Nothing has been applied.',
      );
    let g = transform(writer.write(value) as Geometry, true);
    // Nonlinear projection can turn projected tangencies into microscopic
    // geographic crossings. Snap coordinates only when necessary, preserving
    // every component, ring and vertex and verifying both coordinate systems.
    if (!new IsValidOp(reader.read(g)).isValid()) {
      const original = g;
      let repaired = false;
      for (const precision of [12, 11, 10, 9, 8]) {
        const round = (v: unknown): unknown =>
          Array.isArray(v)
            ? v.map(round)
            : typeof v === 'number'
              ? Number(v.toFixed(precision))
              : v;
        if (original.type === 'GeometryCollection') break;
        const candidate = {
          ...original,
          coordinates: round(original.coordinates),
        } as Geometry;
        const geographic = reader.read(candidate),
          projected = read(candidate);
        const areaChangePercent =
          (Math.abs(projected.getArea() - value.getArea()) /
            Math.max(value.getArea(), 1e-12)) *
          100;
        if (
          !geographic.isEmpty() &&
          new IsValidOp(geographic).isValid() &&
          new IsValidOp(projected).isValid() &&
          areaChangePercent <= 1
        ) {
          g = candidate;
          repaired = true;
          result.repairs.push({
            sourceId,
            original,
            precision,
            areaChangePercent,
            vertices: vertexCount(g),
          });
          break;
        }
      }
      if (!repaired)
        throw new Error(
          'Coordinate conversion requires a geometry repair beyond the automatic limits. Original surface retained for review.',
        );
    }
    if (vertexCount(g) > 20000)
      throw new Error(
        'The result exceeds 20,000 vertices. Split it into smaller features before applying.',
      );
    return g;
  };
  const selected = request.keys
    .map((key) => {
      const i = key.indexOf(':');
      return featureEdit(
        data,
        key.slice(0, i) as MapEdit['kind'],
        key.slice(i + 1),
        edits,
      );
    })
    .filter((e): e is MapEdit => !!e && !e.deleted);
  if (!selected.length) throw new Error('Select at least one feature.');
  if (selected.length > 499)
    throw new Error(
      'Select up to 499 features per geometry operation so the layer and feature changes can save atomically.',
    );
  const result: GeometryResult = {
    edits: [],
    report: [],
    beforeArea: 0,
    afterArea: 0,
    projection,
    repairs: [],
  };
  const lineage = (
    edit: MapEdit,
    operation: string,
    parents = selected.map((e) => layerKey(e.kind, e.id)),
  ) => ({
    ...edit.properties,
    geometryLineage: { operation, parents },
    ...(edit.properties.derivedSurface
      ? {
          derivedSurface: {
            ...(edit.properties.derivedSurface as DerivedSurface),
            manual: true,
          },
        }
      : {}),
  });
  if (request.operation === 'regenerate') {
    const sourceIds = new Set(
      selected
        .map((e) =>
          e.kind === 'path'
            ? e.id
            : (e.properties.derivedSurface as DerivedSurface | undefined)
                ?.sourceRoadId,
        )
        .filter(Boolean),
    );
    const roads = data.map.features.filter(
      (f) =>
        f.properties?.kind === 'path' && sourceIds.has(String(f.properties.id)),
    );
    const id = layerIdentity('derived-road-surfaces-v1'),
      layer = newLayer(
        'Estimated and source-width road surfaces',
        'road-surface',
        id,
      );
    const obstacles = data.map.features.filter(
      (f) =>
        ['Polygon', 'MultiPolygon'].includes(f.geometry.type) &&
        (f.properties?.kind === 'building' ||
          (f.properties?.kind === 'land' &&
            (['water', 'wetland'].includes(String(f.properties.landClass)) ||
              (['road', 'sidewalk', 'parking'].includes(
                String(f.properties.landClass),
              ) &&
                !f.properties.derivedSurface)))),
    );
    const generated: ReturnType<typeof read>[] = [];
    for (const f of data.map.features) {
      const link = f.properties?.derivedSurface as DerivedSurface | undefined;
      if (
        link &&
        (!sourceIds.has(link.sourceRoadId) ||
          (link.manual && !request.replaceManual))
      )
        generated.push(read(f.geometry));
    }
    for (const road of roads) {
      const roadId = String(road.properties?.id),
        linked = data.map.features.filter(
          (f) =>
            (f.properties?.derivedSurface as DerivedSurface | undefined)
              ?.sourceRoadId === roadId,
        ),
        old = linked[0];
      const removed = edits.filter(
        (e) =>
          e.kind === 'land' &&
          e.deleted &&
          !e.properties.revertToSource &&
          (e.properties.derivedSurface as DerivedSurface | undefined)
            ?.sourceRoadId === roadId,
      );
      if (removed.length && !request.replaceManual) {
        result.report.push(
          `${roadId}: retained owner removal or superseded surface; replacement requires the explicit replace option.`,
        );
        continue;
      }
      if (
        linked.some((f) => f.properties?.derivedSurface?.manual) &&
        !request.replaceManual
      ) {
        result.report.push(
          `${roadId}: retained manual shape; replacement requires the explicit replace option.`,
        );
        continue;
      }
      if (
        !['LineString', 'MultiLineString'].includes(road.geometry.type) ||
        ['steps', 'construction', 'proposed'].includes(
          String(road.properties?.highway),
        ) ||
        road.properties?.bridge === 'yes' ||
        Number(road.properties?.layer || 0) !== 0
      ) {
        result.report.push(
          `${roadId}: held for review; stairs, grade separation or unsuitable geometry.`,
        );
        continue;
      }
      try {
        const width = surfaceWidth(road.properties || {}),
          source = read(road.geometry);
        let shape = BufferOp.bufferOp(source, width.width / 2, 8);
        const fullArea = shape.getArea();
        shape = OverlayOp.intersection(shape, read(data.boundary.geometry));
        for (const obstacle of obstacles) {
          const o = read(obstacle.geometry);
          if (shape.getEnvelopeInternal().intersects(o.getEnvelopeInternal()))
            shape = OverlayOp.difference(shape, o);
        }
        for (const previous of generated)
          if (
            shape
              .getEnvelopeInternal()
              .intersects(previous.getEnvelopeInternal())
          )
            shape = OverlayOp.difference(shape, previous);
        if (shape.isEmpty()) {
          result.report.push(
            `${roadId}: no surface remains after excluding buildings, water and surveyed surfaces.`,
          );
          continue;
        }
        const geometry = output(shape, roadId),
          surfaceId = String(
            old?.properties?.id ||
              `derived-surface:${layerIdentity(roadId).slice(10)}`,
          );
        const finalShape = read(geometry);
        generated.push(shape);
        const previous = featureEdit(data, 'land', surfaceId, edits);
        result.edits.push({
          ...previous,
          deleted: false,
          id: surfaceId,
          kind: 'land',
          geometry,
          properties: {
            ...previous?.properties,
            name: `${String(road.properties?.name || 'Campus path')} · ${width.evidence === 'illustrative' ? 'estimated' : 'recorded'} width`,
            landClass: 'road',
            mapLayerId: id,
            mapLayerSource: 'derived',
            width: width.width,
            widthEvidence: width.evidence,
            derivedSurface: {
              sourceRoadId: roadId,
              ...width,
              generator: SURFACE_GENERATOR,
              sourceRevision: roadRevision(road),
            },
            ...(road.properties?.surface
              ? { surface: road.properties.surface }
              : {}),
          },
        });
        result.beforeArea += old ? read(old.geometry).getArea() : 0;
        result.afterArea += finalShape.getArea();
        for (const other of linked.slice(1)) {
          const superseded = featureEdit(
            data,
            'land',
            String(other.properties?.id),
            edits,
          );
          if (superseded)
            result.edits.push({
              ...superseded,
              deleted: true,
              properties: {
                ...superseded.properties,
                geometryLineage: {
                  operation: 'superseded',
                  survivor: surfaceId,
                },
              },
            });
        }
        result.report.push(
          `${roadId}: ${width.width} m (${width.evidence}); ${shape.getArea().toFixed(1)} m²; ${(fullArea - shape.getArea()).toFixed(1)} m² excluded. Review intersections before applying.`,
        );
      } catch (error) {
        result.report.push(
          `${roadId}: held for review — ${(error as Error).message}`,
        );
      }
    }
    if (result.edits.length && !data.layers?.items.some((l) => l.id === id))
      result.edits.unshift(layerEdit(layer));
    if (!roads.length)
      result.report.push(
        'No linked source roads were found. Select routing paths or their derived surfaces.',
      );
    if (result.edits.length > 500)
      throw new Error(
        'This operation produces more than 500 changes. Select fewer source roads and preview again.',
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
