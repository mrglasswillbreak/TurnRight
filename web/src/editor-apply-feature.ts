import { editedPlaceDetails } from './place-details.js';
import { resolveConnection, edgeMatches } from './editor-topology.js';
import { distance } from './geo.js';
import { resolvePlaceId } from './map-display.js';
import type {
  MapEdit,
  Place,
  Position,
  WalkingAccess,
  ArrivalGuide,
} from './types.js';
import { type EditApplicationContext } from './editor-application-types.js';
export function applyPlaceEdit(
  {
    data,
    warnings,
    buildingId,
  }: Pick<EditApplicationContext, 'data' | 'warnings' | 'buildingId'>,
  edit: MapEdit,
): void {
  const props = edit.properties;

  const previous = data.places.find((p) => p.id === edit.id);
  data.places = data.places.filter((p) => p.id !== edit.id);
  if (!edit.deleted && edit.geometry.type === 'Point') {
    const moved =
      previous &&
      distance(previous.coordinates, edit.geometry.coordinates as Position) > 5;
    data.places.push({
      ...previous,
      ...editedPlaceDetails(props, previous),
      arrival:
        props.arrival !== undefined
          ? structuredClone(props.arrival as ArrivalGuide)
          : previous?.arrival,
      id: edit.id,
      name: String(props.name),
      category: (props.category ||
        previous?.category ||
        'other') as Place['category'],
      landmark:
        typeof props.landmark === 'boolean'
          ? props.landmark
          : previous?.landmark,
      coordinates: edit.geometry.coordinates as Position,
      aliases: String(props.aliases || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      department: String(props.department || ''),
      faculty: String(props.faculty || ''),
      source: 'campus-review',
      sourceId: edit.id,
      graphNode: moved ? undefined : previous?.graphNode,
      buildingId: props.buildingId
        ? buildingId(String(props.buildingId))
        : previous?.buildingId,
      sourceRefs: Array.isArray(props.sourceRefs)
        ? props.sourceRefs.filter((v): v is string => typeof v === 'string')
        : previous?.sourceRefs,
      arrivalKind: moved ? 'unmapped' : previous?.arrivalKind || 'unmapped',
    });
    if (moved)
      warnings.push(
        `${props.name}: location moved; connect an entrance before routing to its new position.`,
      );
  }
}

export function applyBuildingEdit(
  { data }: Pick<EditApplicationContext, 'data'>,
  edit: MapEdit,
): void {
  const props = edit.properties;

  const original = data.map.features.find(
    (f) => f.properties?.id === edit.id && f.properties?.kind === 'building',
  );
  data.map.features = data.map.features.filter(
    (f) => f.properties?.id !== edit.id || f.properties?.kind !== 'building',
  );
  if (!edit.deleted)
    data.map.features.push({
      type: 'Feature',
      id: edit.id,
      geometry: edit.geometry,
      properties: {
        id: edit.id,
        ...original?.properties,
        kind: 'building',
        name: props.name,
        aliases: props.aliases,
        sourceRefs: props.sourceRefs,
        placeId: props.placeId || original?.properties?.placeId,
        height:
          props.heightMode === 'floors'
            ? Number(props.floors) * 3
            : Number(props.height) || 0,
        floors: props.floors,
        heightMode: props.heightMode,
        heightSource: props.heightSource,
        appearance: props.appearance || original?.properties?.appearance,
        buildingTopology:
          props.buildingTopology || original?.properties?.buildingTopology,
        heightEstimated:
          props.heightMode === 'floors' || !!props.heightEstimated,
        source: 'campus-review',
      },
    });
}

export function applyLayerFeatureEdit(
  { data }: Pick<EditApplicationContext, 'data'>,
  edit: MapEdit,
): void {
  const props = edit.properties;

  const original = data.map.features.find((f) => f.properties?.id === edit.id);
  data.map.features = data.map.features.filter(
    (f) => f.properties?.id !== edit.id,
  );
  if (!edit.deleted)
    data.map.features.push({
      type: 'Feature',
      geometry: structuredClone(edit.geometry),
      properties: {
        ...original?.properties,
        ...props,
        id: edit.id,
        kind: edit.kind,
        source: 'campus-review',
      },
    });
}

export function applyEntranceEdit(
  {
    data,
    nodes,
    warnings,
    issue,
    buildingId,
    canonical,
  }: Pick<
    EditApplicationContext,
    'data' | 'nodes' | 'warnings' | 'issue' | 'buildingId' | 'canonical'
  >,
  edit: MapEdit,
): void {
  if (edit.geometry.type !== 'Point') return;
  const props = edit.properties;

  const previousEntrance = data.entrances?.find((e) => e.id === edit.id);
  data.entrances = (data.entrances || []).filter((e) => e.id !== edit.id);
  if (edit.deleted) return;
  const coordinates = edit.geometry.coordinates as Position;
  const placeId = resolvePlaceId(data, String(props.placeId || ''));
  const target = props.connection;
  const linked = target
    ? resolveConnection(data, nodes, target)
    : nodes.get(canonical(String(props.connectTo || '')));
  const node = linked && nodes.get(canonical(linked.id));
  // Typed connections use the exact entrance position. Legacy corrections retain their documented 5 m tolerance.
  const valid =
    node && distance(node.coordinates, coordinates) <= (target ? 0.2 : 5);
  const entrance = {
    arrival:
      props.arrival !== undefined
        ? structuredClone(props.arrival as ArrivalGuide)
        : previousEntrance?.arrival,
    id: edit.id,
    name: String(props.name),
    placeId,
    coordinates,
    buildingId: props.buildingId
      ? buildingId(String(props.buildingId))
      : undefined,
    walkingAccess: (props.access || 'yes') as WalkingAccess,
    source: 'campus-review',
    graphNode: valid ? node.id : undefined,
  };
  if (
    previousEntrance &&
    distance(previousEntrance.coordinates, coordinates) > 0.1 &&
    JSON.stringify(props.arrival) === JSON.stringify(previousEntrance.arrival)
  )
    entrance.arrival = { ...entrance.arrival, needsReview: true };
  if (entrance.arrival?.needsReview)
    warnings.push(
      `${entrance.name}: entrance moved; review its arrival instructions and photographs.`,
    );
  data.entrances.push(entrance);
  if (!data.places.some((p) => p.id === placeId))
    issue(
      `${edit.id}: choose the place served by this entrance.`,
      edit.id,
      'entrance',
      { code: 'entrance-place', field: 'placeId', repair: 'choose-place' },
    );
  if (!valid)
    issue(
      `${edit.id}: entrance needs a connected path at its position (legacy connections must be within 5 m).`,
      edit.id,
      'entrance',
      {
        code: 'entrance-path',
        field: 'connection',
        repair: 'connect-path',
      },
    );
}

export function applyClosureEdit(
  { data, issue }: Pick<EditApplicationContext, 'data' | 'issue'>,
  edit: MapEdit,
): void {
  const props = edit.properties;

  if (edit.kind === 'barrier' && props.vehiclePassable !== undefined) {
    data.closures = data.closures.filter((c) => c.id !== edit.id);
    return;
  }
  const edgeIds = Array.isArray(props.edgeIds)
    ? props.edgeIds.filter((id): id is string => typeof id === 'string')
    : [];
  const missing = edgeIds.filter(
    (id) => !data.graph.edges.some((e) => edgeMatches(e, id)),
  );
  if (!edit.deleted && (!edgeIds.length || missing.length))
    issue(
      `${props.name}: select existing path segments to block.`,
      edit.id,
      edit.kind,
      { field: 'edgeIds', repair: 'review-segment' },
    );
  const bothDirections = new Set(
    data.graph.edges
      .filter((e) => edgeIds.some((id) => edgeMatches(e, id)))
      .map((e) => e.id),
  );
  for (const edge of data.graph.edges.filter((e) => bothDirections.has(e.id)))
    for (const reverse of data.graph.edges.filter(
      (e) => e.from === edge.to && e.to === edge.from,
    ))
      bothDirections.add(reverse.id);
  data.closures = data.closures.filter((c) => c.id !== edit.id);
  if (!edit.deleted)
    data.closures.push({
      id: edit.id,
      edgeIds: [...bothDirections],
      modes:
        props.closureMode === 'driving'
          ? ['driving']
          : props.closureMode === 'walking'
            ? ['walking']
            : undefined,
      reason: String(props.name),
      expectedReopening: props.expectedReopening
        ? String(props.expectedReopening)
        : undefined,
      reopenedAt: props.reopenedAt ? String(props.reopenedAt) : undefined,
    });
}
