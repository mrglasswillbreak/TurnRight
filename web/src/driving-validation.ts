/** Runtime validation for downloaded source data and untrusted editor properties. */
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown) =>
  typeof v === 'string' && v.length > 0 && v.length <= 4000;
const access = (v: unknown) =>
  ['yes', 'reviewed', 'private', 'no', 'unknown'].includes(String(v));
export function validDrivingReview(v: unknown): boolean {
  return (
    object(v) &&
    text(v.id) &&
    text(v.audience) &&
    text(v.summary) &&
    text(v.confirmedAt) &&
    Number.isFinite(Date.parse(String(v.confirmedAt)))
  );
}
export function validVehicleRules(v: unknown): boolean {
  return (
    object(v) &&
    access(v.access) &&
    ['both', 'forward', 'reverse'].includes(String(v.direction)) &&
    (v.speedKph === undefined ||
      (typeof v.speedKph === 'number' &&
        Number.isFinite(v.speedKph) &&
        v.speedKph > 0 &&
        v.speedKph <= 130)) &&
    ['conditional', 'roundabout', 'parkingAisle'].every(
      (k) => v[k] === undefined || typeof v[k] === 'boolean',
    ) &&
    (v.access !== 'reviewed' || validDrivingReview(v.review))
  );
}
export function validParking(v: unknown): boolean {
  return (
    object(v) &&
    text(v.id) &&
    text(v.name) &&
    ['parking', 'drop-off'].includes(String(v.kind)) &&
    access(v.access) &&
    typeof v.vehicleNodeId === 'string' &&
    typeof v.walkingNodeId === 'string' &&
    (v.access !== 'reviewed' || validDrivingReview(v.review)) &&
    (v.restrictions === undefined || typeof v.restrictions === 'string')
  );
}
export function validTurnRestriction(v: unknown): boolean {
  return (
    object(v) &&
    text(v.id) &&
    text(v.fromSourceId) &&
    text(v.toSourceId) &&
    text(v.viaNodeId) &&
    ['no', 'only'].includes(String(v.kind)) &&
    (v.uTurn === undefined || typeof v.uTurn === 'boolean')
  );
}
export function validDrivingData(v: unknown): boolean {
  return (
    object(v) &&
    v.version === 1 &&
    Array.isArray(v.parking) &&
    v.parking.every(validParking) &&
    Array.isArray(v.restrictions) &&
    v.restrictions.every(validTurnRestriction)
  );
}
