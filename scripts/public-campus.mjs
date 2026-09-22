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
export function publicCampus(value, field = "") {
  if (Array.isArray(value)) return value.map((v) => publicCampus(v, field));
  if (!value || typeof value !== "object") return value;
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
