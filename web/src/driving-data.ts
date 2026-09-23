import { distance, projectSegment } from './geo.js';
import type {
  CampusData,
  MapEdit,
  Position,
  VehicleRules,
  ParkingConnection,
  TurnRestriction,
} from './types.js';

export function reviewed(review?: VehicleRules['review']): boolean {
  return !!(
    review?.id &&
    typeof review.audience === 'string' &&
    review.audience.trim() &&
    typeof review.summary === 'string' &&
    review.summary.trim() &&
    Number.isFinite(Date.parse(review.confirmedAt))
  );
}
export function vehiclePermitted(rules?: VehicleRules): boolean {
  return (
    !!rules &&
    !rules.conditional &&
    (rules.access === 'yes' ||
      (rules.access === 'reviewed' && reviewed(rules.review)))
  );
}
export function vehicleNodeBlocked(tags: Record<string, string> = {}): boolean {
  if (
    tags.locked === 'yes' ||
    Object.keys(tags).some((k) => k.includes(':conditional'))
  )
    return true;
  const access =
    tags.motorcar ?? tags.motor_vehicle ?? tags.vehicle ?? tags.access;
  if (access && !['yes', 'permissive', 'designated', 'public'].includes(access))
    return true;
  if (
    [
      'bollard',
      'block',
      'wall',
      'fence',
      'hedge',
      'retaining_wall',
      'cycle_barrier',
      'stile',
      'turnstile',
    ].includes(tags.barrier)
  )
    return true;
  return (
    !!tags.barrier &&
    !['yes', 'permissive', 'designated', 'public'].includes(access)
  );
}

/** Reapply per-path vehicle metadata after the topology pass. Direction is relative
 * to the source polyline, never to generated edge IDs or junction ordering. */
export function applyDrivingEdits(data: CampusData, edits: MapEdit[]) {
  if (
    !data.driving &&
    !edits.some(
      (e) =>
        e.properties.vehicle ||
        e.properties.parking ||
        e.properties.turnRestrictions,
    )
  )
    return;
  data.schemaVersion = data.schemaVersion === 3 ? 3 : 2;
  data.driving ||= { version: 1, parking: [], restrictions: [] };
  for (const edit of edits) {
    if (edit.kind === 'place') {
      if (edit.deleted || edit.properties.parking !== undefined)
        data.driving.parking = data.driving.parking.filter(
          (p) => p.id !== edit.id,
        );
      if (!edit.deleted && edit.properties.parking)
        data.driving.parking.push({
          ...(edit.properties.parking as ParkingConnection),
          id: edit.id,
          name: String(edit.properties.name),
        });
    }
    if (
      edit.kind === 'path' &&
      (edit.deleted || edit.properties.turnRestrictions !== undefined)
    ) {
      data.driving.restrictions = data.driving.restrictions.filter(
        (r) => r.fromSourceId !== edit.id,
      );
      if (!edit.deleted)
        data.driving.restrictions.push(
          ...((edit.properties.turnRestrictions as TurnRestriction[]) || []),
        );
    }
  }
  const nodes = new Map(data.graph.nodes.map((n) => [n.id, n]));
  const paths = new Map(
    data.map.features
      .filter((f) => f.properties?.kind === 'path')
      .map((f) => [String(f.properties!.id), f]),
  );
  for (const edit of edits.filter(
    (e) => e.kind === 'barrier' && e.properties.vehiclePassable !== undefined,
  )) {
    if (edit.geometry.type !== 'Point') continue;
    const point = edit.geometry.coordinates as Position;
    for (const node of data.graph.nodes)
      if (
        distance(node.coordinates, point) < 1 &&
        ['gate', 'lift_gate', 'swing_gate'].includes(
          node.sourceTags?.barrier || '',
        )
      )
        node.vehicleReview =
          !edit.deleted && edit.properties.vehiclePassable === true
            ? (edit.properties.vehicleReview as VehicleRules['review'])
            : undefined;
  }
  const blocked = (id: string) =>
    vehicleNodeBlocked(nodes.get(id)?.sourceTags) &&
    !reviewed(nodes.get(id)?.vehicleReview);
  for (const edge of data.graph.edges) {
    const feature = paths.get(edge.sourceId);
    if (!feature || feature.geometry.type !== 'LineString') {
      edge.vehicleAllowed = false;
      continue;
    }
    const rules = feature.properties?.vehicle as VehicleRules | undefined;
    edge.vehicle = rules;
    const a = nodes.get(edge.from),
      b = nodes.get(edge.to);
    if (
      !rules ||
      !a ||
      !b ||
      edge.steps ||
      blocked(edge.from) ||
      blocked(edge.to)
    ) {
      edge.vehicleAllowed = false;
      continue;
    }
    const coordinates = feature.geometry.coordinates as Position[];
    const progress = (point: Position) => {
      let best = Infinity,
        result = 0,
        along = 0;
      for (let i = 1; i < coordinates.length; i++) {
        const projection = projectSegment(
          point,
          coordinates[i - 1],
          coordinates[i],
        );
        const gap = distance(point, projection.point);
        if (gap < best) {
          best = gap;
          result = along + distance(coordinates[i - 1], projection.point);
        }
        along += distance(coordinates[i - 1], coordinates[i]);
      }
      return { value: result, gap: best };
    };
    const from = progress(a.coordinates),
      to = progress(b.coordinates);
    // Closed source rings need a local direction at their seam.
    let forward = to.value > from.value;
    if (
      distance(coordinates[0], coordinates.at(-1)!) < 0.1 &&
      Math.abs(to.value - from.value) > edge.distance * 2
    )
      forward = !forward;
    edge.vehicleAllowed =
      from.gap < 1 &&
      to.gap < 1 &&
      (rules.direction === 'both' ||
        (rules.direction === 'forward') === forward);
  }
}

export function drivingIssues(data: CampusData): string[] {
  if (!data.driving) return [];
  const issues: string[] = [];
  const nodes = new Map(data.graph.nodes.map((n) => [n.id, n]));
  for (const edge of data.graph.edges) {
    const v = edge.vehicle;
    if (!v) continue;
    if (
      !['yes', 'reviewed', 'private', 'no', 'unknown'].includes(v.access) ||
      !['both', 'forward', 'reverse'].includes(v.direction)
    )
      issues.push(`${edge.sourceId}: invalid driving rules.`);
    if (v.access === 'reviewed' && !reviewed(v.review))
      issues.push(
        `${edge.sourceId}: driving approval needs audience, date, and evidence.`,
      );
    if (
      v.speedKph !== undefined &&
      (!Number.isFinite(v.speedKph) || v.speedKph <= 0 || v.speedKph > 130)
    )
      issues.push(`${edge.sourceId}: invalid driving speed.`);
  }
  for (const p of data.driving.parking) {
    const a = nodes.get(p.vehicleNodeId),
      b = nodes.get(p.walkingNodeId);
    if (!a || !b || distance(a.coordinates, b.coordinates) > 1)
      issues.push(
        `${p.id}: parking must transfer at a mapped shared road/walking node.`,
      );
    if (p.access === 'reviewed' && !reviewed(p.review))
      issues.push(
        `${p.id}: parking approval needs audience, date, and evidence.`,
      );
    if (p.access === 'yes' || p.access === 'reviewed') {
      if (
        !data.graph.edges.some(
          (e) =>
            e.to === p.vehicleNodeId &&
            e.vehicleAllowed &&
            e.vehicle &&
            ['yes', 'reviewed'].includes(e.vehicle.access),
        )
      )
        issues.push(`${p.id}: parking has no permitted vehicle approach.`);
      if (
        !data.graph.edges.some(
          (e) =>
            e.from === p.walkingNodeId && e.accessible && !e.geometryBlocked,
        )
      )
        issues.push(`${p.id}: parking has no walking connection.`);
    }
  }
  for (const r of data.driving.restrictions) {
    if (
      !['no', 'only'].includes(r.kind) ||
      !nodes.has(r.viaNodeId) ||
      !data.graph.edges.some(
        (e) => e.sourceId === r.fromSourceId && e.to === r.viaNodeId,
      ) ||
      !data.graph.edges.some(
        (e) => e.sourceId === r.toSourceId && e.from === r.viaNodeId,
      )
    )
      issues.push(
        `${r.id}: turn restriction has a missing or disconnected road/junction.`,
      );
  }
  return [...new Set(issues)];
}
