import { orderedPathNodes } from './editor-topology.js';
import { distance, projectSegment } from './geo.js';
import type { GraphNode, MapEdit, Position, WalkingAccess } from './types.js';
import { pathWalkingAccess } from './editor-path-access.js';
import { type EditApplicationContext } from './editor-application-types.js';
export function applyPathEdit(
  {
    data,
    nodes,
    issue,
  }: Pick<EditApplicationContext, 'data' | 'nodes' | 'issue'>,
  edit: MapEdit,
): void {
  const props = edit.properties;

  const originalFeature = data.map.features.find(
    (f) => f.properties?.id === edit.id && f.properties?.kind === 'path',
  );
  const originalEdges = data.graph.edges.filter((e) => e.sourceId === edit.id);
  const orderedOriginal = orderedPathNodes(data, edit.id);
  const access = (props.access ??
    (originalFeature || data.graph.edges.some((e) => e.sourceId === edit.id)
      ? pathWalkingAccess(data, edit.id)
      : 'yes')) as WalkingAccess;
  const changedAccess =
    props.access !== undefined && access !== pathWalkingAccess(data, edit.id);
  const pathProperties = {
    ...originalFeature?.properties,
    highway: props.highway ?? originalFeature?.properties?.highway,
    surface: props.surface ?? originalFeature?.properties?.surface,
    width:
      props.width !== undefined
        ? props.width
        : originalFeature?.properties?.width,
    widthEvidence:
      props.widthEvidence ?? originalFeature?.properties?.widthEvidence,
    widthSource: props.widthSource ?? originalFeature?.properties?.widthSource,
    widthUnit: props.widthUnit ?? originalFeature?.properties?.widthUnit,
    mapLayerId: props.mapLayerId ?? originalFeature?.properties?.mapLayerId,
    mapLayerSource:
      props.mapLayerSource ??
      originalFeature?.properties?.mapLayerSource ??
      originalFeature?.properties?.source,
    layerStyle: props.layerStyle ?? originalFeature?.properties?.layerStyle,
    vehicle: props.vehicle ?? originalFeature?.properties?.vehicle,
    id: edit.id,
    kind: 'path',
    name: props.name,
    source: 'campus-review',
    ...(props.surveyProvenance
      ? { surveyProvenance: 'Reviewed walking survey' }
      : {}),
    walkingAccess: access,
    autoConnectCrossings:
      props.autoConnectCrossings ??
      originalFeature?.properties?.autoConnectCrossings,
    crossingLevel:
      props.crossingLevel ?? originalFeature?.properties?.crossingLevel,
    layer: props.layer ?? originalFeature?.properties?.layer,
    bridge: props.bridge ?? originalFeature?.properties?.bridge,
    tunnel: props.tunnel ?? originalFeature?.properties?.tunnel,
    accessReviewId:
      access === 'campus'
        ? originalFeature?.properties?.accessReviewId
        : undefined,
    footDirection:
      props.footDirection ||
      originalFeature?.properties?.footDirection ||
      'both',
  };
  // Metadata-only changes must preserve junction IDs, gaps at restricted gates,
  // and closure edge references. Rebuilding the full displayed line can reopen gaps.
  if (
    !edit.deleted &&
    originalFeature &&
    JSON.stringify(originalFeature.geometry) ===
      JSON.stringify(edit.geometry) &&
    pathProperties.footDirection ===
      (originalFeature.properties?.footDirection || 'both') &&
    !props.connections?.length &&
    !props.connectStart &&
    !props.connectEnd &&
    data.graph.edges.some((e) => e.sourceId === edit.id)
  ) {
    data.graph.edges = data.graph.edges.map((e) =>
      e.sourceId === edit.id
        ? {
            ...e,
            name: String(props.name),
            accessible:
              (access === 'yes' || access === 'campus') &&
              (changedAccess || e.accessible),
            walkingAccess: changedAccess ? access : e.walkingAccess || access,
            accessReviewId: access === 'campus' ? e.accessReviewId : undefined,
            steps:
              props.steps === null
                ? undefined
                : props.steps === undefined
                  ? e.steps
                  : !!props.steps,
          }
        : e,
    );
    originalFeature.properties = pathProperties;
    return;
  }
  const originalNodeIds = new Set(
    data.graph.edges
      .filter((e) => e.sourceId === edit.id)
      .flatMap((e) => [e.from, e.to]),
  );
  const originalNodes = [...originalNodeIds]
    .map((id) => nodes.get(id)!)
    .filter(Boolean);
  data.graph.edges = data.graph.edges.filter((e) => e.sourceId !== edit.id);
  data.map.features = data.map.features.filter(
    (f) => f.properties?.id !== edit.id,
  );
  if (edit.deleted || edit.geometry.type !== 'LineString') return;
  const drawn = edit.geometry.coordinates as Position[];
  // Preserve only this path's established junctions that still lie on the edited geometry.
  // Other crossing paths are joined in the shared topology pass below.
  const points: Position[] = [];
  for (let i = 0; i < drawn.length - 1; i++) {
    points.push(drawn[i]);
    points.push(
      ...originalNodes
        // Replaying a saved edit against its published result must not add
        // the old position of a vertex already represented by the edit.
        .filter(
          (node) =>
            !props.vertexIds?.includes(node.id) &&
            !drawn.some((point) => distance(point, node.coordinates) < 0.2),
        )
        .map((node) => ({
          node,
          projection: projectSegment(node.coordinates, drawn[i], drawn[i + 1]),
        }))
        .filter(
          ({ projection }) =>
            projection.distance < 0.2 &&
            projection.t > 0.001 &&
            projection.t < 0.999,
        )
        .sort((a, b) => a.projection.t - b.projection.t)
        .map(({ node }) => node.coordinates),
    );
  }
  points.push(drawn[drawn.length - 1]);
  const sequence: GraphNode[] = [];
  points.forEach((point) => {
    const drawnIndex = drawn.findIndex((p) => distance(p, point) < 0.05);
    const stableId =
      drawnIndex >= 0 ? props.vertexIds?.[drawnIndex] : undefined;
    const original =
      originalNodes.find((n) => n.id === stableId) ||
      originalNodes.find((n) => distance(n.coordinates, point) < 0.2);
    const node: GraphNode = {
      ...original,
      id: stableId || original?.id || `${edit.id}:vertex:${drawnIndex}`,
      coordinates: point,
    };
    nodes.set(node.id, node);
    sequence.push(node);
  });
  if (sequence.length !== points.length) return;
  const gaps: [number, number][] = [];
  let lostRestriction = false;
  for (let i = 1; i < orderedOriginal.length; i++) {
    const a = orderedOriginal[i - 1],
      b = orderedOriginal[i];
    if (
      originalEdges.some(
        (e) =>
          (e.from === a.id && e.to === b.id) ||
          (e.from === b.id && e.to === a.id),
      )
    )
      continue;
    const start = sequence.findIndex((n) => n.id === a.id),
      end = sequence.findIndex((n) => n.id === b.id);
    if (start < 0 || end < 0 || end < start) lostRestriction = true;
    else gaps.push([start, end]);
  }
  if (lostRestriction)
    issue(
      `${props.name}: retain the vertices on either side of a restricted gate gap.`,
      edit.id,
      'path',
      { field: 'geometry', repair: 'review-segment' },
    );
  for (let i = 1; i < sequence.length; i++) {
    if (lostRestriction || gaps.some(([a, b]) => i > a && i <= b)) continue;
    const a = sequence[i - 1],
      b = sequence[i],
      length = distance(a.coordinates, b.coordinates);
    if (length < 0.2) {
      issue(
        `${props.name}: duplicate adjacent path vertices.`,
        edit.id,
        'path',
        { field: 'geometry', repair: 'review-segment' },
      );
      continue;
    }
    const positions = new Map(sequence.map((n, index) => [n.id, index]));
    const inherited = originalEdges.filter((e) => {
      const start = positions.get(e.from),
        end = positions.get(e.to);
      return (
        start !== undefined &&
        end !== undefined &&
        Math.min(start, end) < i &&
        Math.max(start, end) >= i
      );
    });
    // Deleting an ordinary intermediate vertex inherits restrictions/closures from that original span.
    if (!inherited.length && originalEdges.length) {
      const left = sequence
        .slice(0, i)
        .reverse()
        .find((n) => originalNodeIds.has(n.id));
      const right = sequence.slice(i).find((n) => originalNodeIds.has(n.id));
      const lo = orderedOriginal.findIndex((n) => n.id === left?.id),
        hi = orderedOriginal.findIndex((n) => n.id === right?.id);
      if (lo >= 0 && hi >= lo)
        inherited.push(
          ...originalEdges.filter((e) => {
            const f = orderedOriginal.findIndex((n) => n.id === e.from),
              t = orderedOriginal.findIndex((n) => n.id === e.to);
            return f >= lo && f <= hi && t >= lo && t <= hi;
          }),
        );
    }
    for (const [from, to] of pathProperties.vehicle
      ? [
          [a, b],
          [b, a],
        ]
      : (props.footDirection || pathProperties.footDirection) === 'forward'
        ? [[a, b]]
        : props.footDirection === 'reverse'
          ? [[b, a]]
          : [
              [a, b],
              [b, a],
            ]) {
      // Replacing an unchanged-direction section retains each original directed span.
      const directionChanged =
        props.footDirection !== undefined &&
        props.footDirection !==
          (originalFeature?.properties?.footDirection || 'both');
      if (!pathProperties.vehicle && !directionChanged && inherited.length) {
        const wanted = from.id === a.id ? 1 : -1;
        const permitted = inherited.some((e) => {
          const f = orderedOriginal.findIndex((n) => n.id === e.from),
            t = orderedOriginal.findIndex((n) => n.id === e.to);
          return f >= 0 && t >= 0 && Math.sign(t - f) === wanted;
        });
        if (!permitted) continue;
      }
      data.graph.edges.push({
        ...inherited[0],
        parentEdgeIds: [
          ...new Set(
            inherited.flatMap((e) => [e.id, ...(e.parentEdgeIds || [])]),
          ),
        ],
        id: `${edit.id}:${from.id}>${to.id}`,
        from: from.id,
        to: to.id,
        distance: length,
        name: String(props.name),
        accessible:
          (access === 'yes' || access === 'campus') &&
          (pathProperties.footDirection === 'both' ||
            (pathProperties.footDirection === 'forward') ===
              (from.id === a.id)) &&
          (changedAccess || inherited.every((e) => e.accessible)),
        walkingAccess:
          !changedAccess && inherited.some((e) => !e.accessible)
            ? inherited.find((e) => !e.accessible)?.walkingAccess || 'private'
            : access,
        steps:
          props.steps === null
            ? undefined
            : props.steps === undefined
              ? inherited.some((e) => e.steps === true)
                ? true
                : inherited.length && inherited.every((e) => e.steps === false)
                  ? false
                  : undefined
              : !!props.steps,
        sourceId: edit.id,
      });
    }
  }
  data.map.features.push({
    type: 'Feature',
    id: edit.id,
    properties: { ...pathProperties, vertexIds: sequence.map((n) => n.id) },
    geometry: {
      type: 'LineString',
      coordinates: sequence.map((n) => n.coordinates),
    },
  });
}
