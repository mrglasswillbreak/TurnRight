import OverlayOp from 'jsts/org/locationtech/jts/operation/overlay/OverlayOp.js';
import BufferOp from 'jsts/org/locationtech/jts/operation/buffer/BufferOp.js';
import { featureEdit } from './editor-features';
import { layerIdentity, newLayer, layerEdit } from './campus-layers';
import {
  roadRevision,
  surfaceWidth,
  SURFACE_GENERATOR,
  type DerivedSurface,
} from './surface-generation';
import { type GeometryResult } from './layer-geometry-types.js';
import { type GeometryEngineContext } from './layer-geometry-context.js';
export function regenerateRoadSurfaces({
  data,
  edits,
  request,
  read,
  output,
  selected,
  result,
}: GeometryEngineContext): GeometryResult {
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
          shape.getEnvelopeInternal().intersects(previous.getEnvelopeInternal())
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
