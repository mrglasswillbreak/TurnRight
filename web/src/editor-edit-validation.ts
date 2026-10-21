import { insideCampusMappingArea, type MappingArea } from './campus-context.js';
import { layerErrors } from './campus-layers.js';
import type { CampusLayer } from './campus-layer-types.js';
import {
  validVehicleRules,
  validParking,
  validTurnRestriction,
  validDrivingReview,
} from './driving-validation.js';
import { detailErrors } from './place-details.js';
import { guideErrors, validPhoto } from './arrival.js';
import { validateBuildingStyle } from './building-style-validation.js';
import type { MapEdit, ConnectionTarget } from './types.js';
import type { Geometry } from 'geojson';
import { walkingAccessValues } from './editor-path-access.js';
export function validateEdit(edit: MapEdit, area?: MappingArea): string[] {
  const errors: string[] = [];
  if (
    !edit ||
    typeof edit.id !== 'string' ||
    edit.id.length > 200 ||
    !/^[\w: .-]+$/.test(edit.id)
  )
    return ['Invalid feature ID.'];
  if (
    ![
      'place',
      'path',
      'building',
      'entrance',
      'barrier',
      'closure',
      'land',
      'overlay',
      'layer',
    ].includes(edit.kind)
  )
    return ['Choose a supported feature type.'];
  if (edit.kind === 'layer') {
    const definition = edit.properties?.layerDefinition as CampusLayer;
    if (edit.deleted && edit.properties.revertToSource !== true)
      return ['Archive layers instead of deleting their history.'];
    if (
      edit.geometry?.type !== 'GeometryCollection' ||
      edit.geometry.geometries.length ||
      definition?.id !== edit.id
    )
      return ['Invalid layer record.'];
    return layerErrors(definition);
  }
  if (
    !edit.geometry ||
    ![
      'Point',
      'MultiPoint',
      'LineString',
      'MultiLineString',
      'Polygon',
      'MultiPolygon',
    ].includes(edit.geometry.type)
  )
    return ['Draw a point, path, or building outline.'];
  if (!edit.properties || typeof edit.properties !== 'object')
    return ['Feature properties are required.'];
  errors.push(...guideErrors(edit.properties.arrival));
  if (
    edit.properties.photos !== undefined &&
    (!['building', 'entrance'].includes(edit.kind) ||
      !Array.isArray(edit.properties.photos) ||
      !edit.properties.photos.every(validPhoto))
  )
    errors.push(
      'Review photograph identity, license, credits and optimized asset before saving.',
    );
  if (edit.kind === 'place') {
    errors.push(...detailErrors(edit.properties));
    for (const field of [
      'subtype',
      'address',
      'phone',
      'website',
      'openingHours',
      'businessStatus',
    ]) {
      const evidence = edit.properties.evidence as
        | import('./types.js').FieldEvidence
        | undefined;
      if (
        edit.properties[field] &&
        edit.properties[field] !== 'unknown' &&
        !evidence?.[field]?.length &&
        !(edit.properties.detailSource && edit.properties.detailCheckedAt)
      )
        errors.push(`Record the source and check date for ${field}.`);
    }
  }
  if (edit.kind === 'path' && edit.geometry.type !== 'LineString')
    errors.push('Walking paths must be lines.');
  if (
    edit.kind === 'path' &&
    edit.properties.access !== undefined &&
    !walkingAccessValues.includes(String(edit.properties.access))
  )
    errors.push('Choose a supported walking access setting.');
  if (
    ['place', 'entrance'].includes(edit.kind) &&
    edit.geometry.type !== 'Point'
  )
    errors.push('Places and entrances must be points.');
  if (
    ['building', 'land'].includes(edit.kind) &&
    !['Polygon', 'MultiPolygon'].includes(edit.geometry.type)
  )
    errors.push('Buildings must be polygons.');
  if (!edit.deleted && typeof edit.properties.name !== 'string')
    errors.push('Give the feature a name or description.');
  const validId = (id: unknown) =>
    typeof id === 'string' && id.length > 0 && id.length <= 4000;
  const validPosition = (p: unknown) =>
    Array.isArray(p) &&
    p.length === 2 &&
    p.every((n) => typeof n === 'number' && Number.isFinite(n));
  const validTarget = (value: unknown) => {
    if (!value || typeof value !== 'object') return false;
    const t = value as ConnectionTarget;
    return (
      validPosition(t.coordinates) &&
      (t.type === 'node'
        ? validId(t.nodeId)
        : t.type === 'segment' &&
          validId(t.sourceId) &&
          validId(t.from) &&
          validId(t.to))
    );
  };
  const props = edit.properties;
  if (
    props.width != null &&
    (!Number.isFinite(Number(props.width)) ||
      Number(props.width) <= 0 ||
      Number(props.width) > 200)
  )
    errors.push('Road width must be greater than zero and at most 200 metres.');
  if (
    props.widthEvidence !== undefined &&
    !['source', 'owner', 'illustrative'].includes(String(props.widthEvidence))
  )
    errors.push('Choose the width evidence.');
  if (
    props.mapLayerId !== undefined &&
    !/^map-layer:[\w.-]{1,100}$/.test(String(props.mapLayerId))
  )
    errors.push('Invalid map layer identity.');
  if (['land', 'overlay'].includes(edit.kind)) {
    if (
      props.color !== undefined &&
      !/^#[0-9a-f]{6}$/i.test(String(props.color))
    )
      errors.push('Layer colour must be a six-digit hex colour.');
    if (
      props.opacity !== undefined &&
      (!Number.isFinite(Number(props.opacity)) ||
        Number(props.opacity) < 0 ||
        Number(props.opacity) > 1)
    )
      errors.push('Layer opacity must be between 0 and 1.');
    if (
      props.order !== undefined &&
      (!Number.isInteger(Number(props.order)) ||
        Math.abs(Number(props.order)) > 1000)
    )
      errors.push('Layer order must be an integer between -1000 and 1000.');
    if (props.visible !== undefined && typeof props.visible !== 'boolean')
      errors.push('Layer visibility must be true or false.');
  }
  if (
    props.autoConnectCrossings !== undefined &&
    typeof props.autoConnectCrossings !== 'boolean'
  )
    errors.push('Choose whether path crossings connect automatically.');
  if (
    props.crossingLevel !== undefined &&
    !['source', 'ground', 'bridge', 'tunnel'].includes(
      String(props.crossingLevel),
    )
  )
    errors.push('Choose a supported crossing level.');
  if (
    props.layer !== undefined &&
    (!Number.isInteger(Number(props.layer)) ||
      Math.abs(Number(props.layer)) > 10)
  )
    errors.push('Path level must be an integer between -10 and 10.');
  if (
    props.mergedInto !== undefined &&
    (!['place', 'building'].includes(edit.kind) ||
      !edit.deleted ||
      !validId(props.mergedInto) ||
      props.mergedInto === edit.id)
  )
    errors.push(
      'A merge must remove a place or building in favour of another valid ID.',
    );
  if (
    props.duplicateKeepSeparate !== undefined &&
    (!Array.isArray(props.duplicateKeepSeparate) ||
      props.duplicateKeepSeparate.length > 2000 ||
      !props.duplicateKeepSeparate.every(validId))
  )
    errors.push('Invalid duplicate review decision.');
  if (
    props.vertexIds !== undefined &&
    (!Array.isArray(props.vertexIds) ||
      !props.vertexIds.every(validId) ||
      new Set(props.vertexIds).size !== props.vertexIds.length ||
      edit.geometry.type !== 'LineString' ||
      props.vertexIds.length !== edit.geometry.coordinates.length)
  )
    errors.push('Path vertex identities must match its coordinates.');
  if (
    props.connections !== undefined &&
    (!Array.isArray(props.connections) ||
      props.connections.length > 2000 ||
      !props.connections.every(
        (c) =>
          c &&
          validId(c.vertexId) &&
          validTarget(c.target) &&
          props.vertexIds?.includes(c.vertexId),
      ))
  )
    errors.push('Invalid path connection reference.');
  if (props.vehicle !== undefined && !validVehicleRules(props.vehicle))
    errors.push('Complete the vehicle rules and driving approval evidence.');
  if (props.parking && !validParking(props.parking))
    errors.push('Complete the parking details and approval evidence.');
  if (
    props.turnRestrictions !== undefined &&
    (!Array.isArray(props.turnRestrictions) ||
      !props.turnRestrictions.every(validTurnRestriction))
  )
    errors.push('Complete each turn restriction.');
  if (
    props.vehiclePassable === true &&
    !validDrivingReview(props.vehicleReview)
  )
    errors.push('Complete the gate driving approval evidence.');
  if (props.connection !== undefined && !validTarget(props.connection))
    errors.push('Invalid entrance connection reference.');
  if (
    edit.kind === 'entrance' &&
    props.access !== undefined &&
    !walkingAccessValues.includes(String(props.access))
  )
    errors.push('Choose a supported walking access setting.');
  if (
    props.footDirection !== undefined &&
    !['both', 'forward', 'reverse'].includes(String(props.footDirection))
  )
    errors.push('Choose a supported walking direction.');
  if (
    props.heightMode === 'floors' &&
    (!Number.isInteger(Number(props.floors)) ||
      Number(props.floors) < 1 ||
      Number(props.floors) > 50)
  )
    errors.push('Documented floor count must be between 1 and 50.');
  const geometry = edit.geometry as Exclude<
    Geometry,
    { type: 'GeometryCollection' }
  >;
  const positions: number[][] = [];
  function walk(value: unknown) {
    if (!Array.isArray(value) || !value.length) {
      errors.push('Empty geometry.');
      return;
    }
    if (typeof value[0] === 'number') positions.push(value);
    else value.forEach(walk);
  }
  walk(geometry.coordinates);
  const vertexLimit = ['land', 'overlay'].includes(edit.kind) ? 20000 : 2000;
  if (positions.length > vertexLimit)
    errors.push(
      `A single ${edit.kind} edit is limited to ${vertexLimit.toLocaleString('en-US')} vertices.`,
    );
  if (positions.some((p) => !insideCampusMappingArea(p, area)))
    errors.push(
      area
        ? 'All coordinates must be within the selected campus mapping area (including its 500 m approach buffer).'
        : 'Use finite WGS84 longitude/latitude coordinates.',
    );
  if (geometry.type === 'LineString' && positions.length < 2)
    errors.push('A path needs at least two points.');
  if (
    (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') &&
    (geometry.type === 'Polygon'
      ? geometry.coordinates
      : geometry.coordinates.flat()
    ).some(
      (r) => r.length < 4 || JSON.stringify(r[0]) !== JSON.stringify(r.at(-1)),
    )
  )
    errors.push('Building outlines must be closed polygons.');
  if (
    edit.properties.height !== undefined &&
    (!Number.isFinite(Number(edit.properties.height)) ||
      Number(edit.properties.height) < 0 ||
      Number(edit.properties.height) > 150)
  )
    errors.push('Building height must be between 0 and 150 metres.');
  const appearance = edit.properties.appearance;
  if (appearance !== undefined) {
    if (
      !appearance ||
      typeof appearance !== 'object' ||
      Array.isArray(appearance)
    )
      errors.push('Building appearance must be an object.');
    else {
      for (const colour of [appearance.wallColour, appearance.roofColour])
        if (colour !== undefined && !/^#[0-9a-f]{6}$/i.test(colour))
          errors.push('Appearance colours must be six-digit hex colours.');
      if (
        appearance.roofForm !== undefined &&
        !['flat', 'hip', 'gable'].includes(appearance.roofForm)
      )
        errors.push('Choose a supported roof form.');
      if (
        appearance.confidence !== undefined &&
        !['documented', 'observed', 'inferred'].includes(appearance.confidence)
      )
        errors.push('Choose appearance evidence confidence.');
      if (
        appearance.provenance !== undefined &&
        (typeof appearance.provenance !== 'string' ||
          appearance.provenance.length > 2000)
      )
        errors.push('Appearance provenance must be at most 2000 characters.');
      if (
        appearance.modelId !== undefined &&
        (typeof appearance.modelId !== 'string' ||
          appearance.modelId.length > 200)
      )
        errors.push('Model identity is too long.');
    }
  }
  return [...new Set([...errors, ...validateBuildingStyle(edit)])];
}
