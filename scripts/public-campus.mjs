// Public downloads contain attribution and evidence references, not survey history.
const privateKeys = new Set([
  "surveyEvidence",
  "surveyProvenance",
  "reviewerId",
  "reviewer",
  "actor_id",
  "confirmedBy",
  "rawSamples",
  "detailSource",
  "detailCheckedAt",
  "_sourceIssues",
]);
const evidenceKeys = new Set([
  "sourceId",
  "recordId",
  "checkedAt",
  "url",
  "license",
  "release",
  "upstreamRecordId",
  "observedAt",
  "accuracyMetres",
]);
const photoKeys = new Set(['id','buildingId','entranceId','caption','alt','author','sourceUrl','sourceKind','license','licenseUrl','attribution','modifications','capturedAt','checkedAt','historical','width','height','url','sha256','bytes']);
const arrivalKeys = new Set(['description','restrictions','steps','ramp','surface','doorwayWidthCm','observedAt','evidence','needsReview','photoIds']);
export function publicCampus(value, field = "") {
  if (Array.isArray(value)) return value.map((v) => publicCampus(v, field));
  if (!value || typeof value !== "object") return value;
  if (field === 'photos') return Object.fromEntries(Object.entries(value).filter(([key]) => photoKeys.has(key)));
  if (field === 'arrival') return Object.fromEntries(Object.entries(value).filter(([key]) => arrivalKeys.has(key)).map(([key, v]) => [key, publicCampus(v, key)]));
  if (field === "evidence")
    return Object.fromEntries(
      Object.entries(value).map(([key, refs]) => [
        key,
        Array.isArray(refs)
          ? refs.map((ref) =>
              Object.fromEntries(Object.entries(ref).filter(([k]) => evidenceKeys.has(k))),
            )
          : [],
      ]),
    );
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !privateKeys.has(key))
      .map(([key, v]) => [key, publicCampus(v, key)]),
  );
}
