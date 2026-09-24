import type { MapEdit } from './types.js';
import type { BuildingVisual } from './visual-types.js';
import {
  buildingTopology,
  topologyFits,
  polygonsOf,
  standardRoofSupported,
  roofWidth,
} from './building-surfaces.js';
import { customRoofSurface } from './custom-roof.js';
import { buildingDisplay } from './map-display.js';
import { facadeErrors } from './building-facades.js';
import { authoringErrors } from './model-authoring.js';

export function validateBuildingStyle(
  edit: MapEdit,
  previewVisual?: Pick<BuildingVisual, 'height' | 'partHeights'>,
): string[] {
  if (edit.kind !== 'building') return [];
  const errors: string[] = [],
    appearance = edit.properties.appearance;
  errors.push(...authoringErrors(edit.properties.modelAuthoring));
  errors.push(
    ...facadeErrors({
      type: 'Feature',
      geometry: edit.geometry,
      properties: { ...edit.properties, id: edit.id },
    }),
  );
  const polygon = polygonsOf(edit.geometry);
  // Unfinished previews may use a resolved catalogue height. Applying a roof
  // persists that height; save/release validation still requires saved evidence.
  const inheritedHeight = (index: number) =>
    previewVisual?.partHeights?.[index]?.height ??
    previewVisual?.height ??
    buildingDisplay(edit.properties).metres;
  const stored = edit.properties.buildingTopology;
  if (stored && !topologyFits(edit.geometry, stored))
    return [
      'Building surface identities no longer match the outline. Review surface assignments.',
    ];
  if (
    stored &&
    (!Array.isArray(stored.parts) ||
      stored.parts.length !== polygon.length ||
      stored.parts.some(
        (p, i) =>
          !p ||
          !p.id ||
          !Array.isArray(p.rings) ||
          p.rings.length !== polygon[i].length ||
          p.rings.some(
            (r, j) =>
              !r ||
              !r.id ||
              !Array.isArray(r.vertexIds) ||
              !Array.isArray(r.wallIds) ||
              r.vertexIds.length !== polygon[i][j].length - 1 ||
              r.wallIds.length !== r.vertexIds.length,
          ),
      ))
  )
    return [
      'Building surface identities no longer match the outline. Review surface assignments.',
    ];
  const topology = buildingTopology({
    type: 'Feature',
    geometry: edit.geometry,
    properties: { ...edit.properties, id: edit.id },
  });
  const ids = topology.parts.flatMap((p) => [
    p.id,
    ...p.rings.flatMap((r) => [r.id, ...r.vertexIds, ...r.wallIds]),
  ]);
  if (
    ids.some((id) => typeof id !== 'string' || id.length > 240) ||
    new Set(ids).size !== ids.length
  )
    errors.push('Building surface identities must be unique valid strings.');
  if (topology.issues?.length)
    errors.push(...topology.issues.map((i) => i.message));
  if (
    !appearance ||
    typeof appearance !== 'object' ||
    Array.isArray(appearance)
  )
    return errors;
  const parts = new Set(topology.parts.map((p) => p.id)),
    walls = new Set(
      topology.parts.flatMap((p) => p.rings.flatMap((r) => r.wallIds)),
    );
  for (const key of ['parts', 'walls', 'roofs'] as const) {
    const values = appearance[key];
    if (values === undefined) continue;
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      errors.push(`Building ${key} must contain named surface settings.`);
      continue;
    }
    for (const id of Object.keys(values))
      if (!(key === 'walls' ? walls : parts).has(id))
        errors.push(
          `A ${key} setting refers to a removed surface. Reassign or reset it.`,
        );
  }
  const styles = [
    appearance,
    ...Object.values(appearance.parts || {}),
    ...Object.values(appearance.walls || {}),
  ];
  for (const style of styles) {
    if (!style || typeof style !== 'object' || Array.isArray(style)) {
      errors.push('Surface style must be an object.');
      continue;
    }
    for (const key of [
      'windowFrameDepth',
      'windowWidthRatio',
      'windowHeightRatio',
    ] as const)
      if (
        style[key] !== undefined &&
        (!Number.isFinite(style[key]) ||
          style[key]! < 0.01 ||
          style[key]! > (key === 'windowFrameDepth' ? 0.5 : 0.9))
      )
        errors.push(
          'Window frame dimensions and proportions are outside the supported range.',
        );
    for (const key of [
      'wallColour',
      'roofColour',
      'windowColour',
      'trimColour',
    ] as const)
      if (style[key] !== undefined && !/^#[\da-f]{6}$/i.test(style[key]!))
        errors.push('Surface colours must be six-digit hex colours.');
    if (
      style.heightMode !== undefined &&
      !['metres', 'floors', 'unknown'].includes(style.heightMode)
    )
      errors.push('Choose valid surface height information.');
    if (
      style.confidence !== undefined &&
      !['inferred', 'observed', 'documented'].includes(style.confidence)
    )
      errors.push('Choose valid surface evidence confidence.');
    if (style.windows !== undefined && typeof style.windows !== 'boolean')
      errors.push('Window visibility must be on or off.');
    if (
      style.windowSpacing !== undefined &&
      (!Number.isFinite(style.windowSpacing) ||
        style.windowSpacing < 0.5 ||
        style.windowSpacing > 20)
    )
      errors.push('Window spacing must be between 0.5 and 20 metres.');
    if (
      style.roofPitch !== undefined &&
      (!Number.isFinite(style.roofPitch) ||
        style.roofPitch < 1 ||
        style.roofPitch > 60)
    )
      errors.push('Roof pitch must be between 1 and 60 degrees.');
    if (
      style.roofForm !== undefined &&
      !['flat', 'hip', 'gable'].includes(style.roofForm)
    )
      errors.push('Choose a supported roof form.');
    if (
      style.height !== undefined &&
      (!Number.isFinite(style.height) ||
        style.height <= 0 ||
        style.height > 150)
    )
      errors.push('Wing height must be above zero and at most 150 metres.');
    if (
      style.heightMode === 'floors' &&
      (!Number.isInteger(style.floors) ||
        style.floors! < 1 ||
        style.floors! > 50)
    )
      errors.push('Wing floor count must be between 1 and 50.');
    if (
      style.provenance !== undefined &&
      (typeof style.provenance !== 'string' || style.provenance.length > 2000)
    )
      errors.push('Surface evidence notes must be at most 2000 characters.');
  }
  for (const [index, part] of topology.parts.entries()) {
    const style = { ...appearance, ...appearance.parts?.[part.id] },
      pitch = style.roofPitch;
    if (
      pitch !== undefined &&
      style.roofForm &&
      style.roofForm !== 'flat' &&
      !appearance.roofs?.[part.id]
    ) {
      if (!standardRoofSupported(polygon[index]))
        errors.push(
          'Standard roof pitch needs a convex four-sided wing without courtyards. Use a custom roof plan.',
        );
      else {
        const own = appearance.parts?.[part.id],
          height =
            own?.heightMode === 'floors'
              ? Number(own.floors) * 3
              : own?.heightMode === 'unknown'
                ? 6
                : (own?.height ?? inheritedHeight(index));
        if (
          (roofWidth(polygon[index]) / 2) * Math.tan((pitch * Math.PI) / 180) >=
          height
        )
          errors.push(
            'Roof pitch exceeds the total wing height. Reduce pitch or review the height.',
          );
      }
    }
  }
  for (const [partId, roof] of Object.entries(appearance.roofs || {})) {
    const i = topology.parts.findIndex((p) => p.id === partId);
    if (i < 0) continue;
    const part = appearance.parts?.[partId];
    const height =
      part?.heightMode === 'floors'
        ? Number(part.floors) * 3
        : part?.heightMode === 'unknown'
          ? 6
          : (part?.height ?? inheritedHeight(i));
    const vertices = topology.parts[i].rings.flatMap((r) => r.vertexIds);
    if (roof?.points?.some((p) => p.vertexId && !vertices.includes(p.vertexId)))
      errors.push(
        'A roof point is attached to a removed outline vertex. Reassign or reset the roof attachment.',
      );
    try {
      customRoofSurface(polygon[i], roof, height);
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  return [...new Set(errors)];
}
