import type { Geometry } from 'geojson';
import proj4 from 'proj4';
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js';
import GeoJSONWriter from 'jsts/org/locationtech/jts/io/GeoJSONWriter.js';
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js';
import IsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js';
import type { CampusData, MapEdit } from './types';
import { vertexCount } from './geometry-window';
import { featureEdit } from './editor-features';
import { layerKey } from './campus-layers';
import { type DerivedSurface } from './surface-generation';
import {
  type GeometryRequest,
  type GeometryResult,
} from './layer-geometry-types.js';
export function createGeometryContext(
  data: CampusData,
  edits: MapEdit[],
  request: GeometryRequest,
) {
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
  return {
    data,
    edits,
    request,
    transform,
    reader,
    writer,
    read,
    output,
    selected,
    result,
    lineage,
  };
}

export type GeometryEngineContext = ReturnType<typeof createGeometryContext>;
