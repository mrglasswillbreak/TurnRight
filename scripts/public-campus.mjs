// Public downloads contain attribution and evidence references, not survey history.
const privateKeys = new Set([
  "gisManaged",
  "private_attributes",
  "gis_feature_key",
  "gis_managed",
  "gis_metadata",
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
  "modelDocument",
  "modelDocumentAsset",
  "modelAuthoring",
  "reviewedModelRevision",
  "editorVisible",
  "locked",
  "members",
  "geometryLineage",
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
const photoKeys = new Set([
  "id",
  "buildingId",
  "entranceId",
  "caption",
  "alt",
  "author",
  "sourceUrl",
  "sourceKind",
  "license",
  "licenseUrl",
  "attribution",
  "modifications",
  "capturedAt",
  "checkedAt",
  "historical",
  "width",
  "height",
  "url",
  "sha256",
  "bytes",
]);
const arrivalKeys = new Set([
  "description",
  "restrictions",
  "steps",
  "ramp",
  "surface",
  "doorwayWidthCm",
  "observedAt",
  "evidence",
  "needsReview",
  "photoIds",
]);
export function publicCampus(value, field = "") {
  if (field === "" && value?.layers?.version === 1) value = publishedLayers(value);
  if (Array.isArray(value)) return value.map((v) => publicCampus(v, field));
  if (!value || typeof value !== "object") return value;
  if (field === "photos")
    return Object.fromEntries(Object.entries(value).filter(([key]) => photoKeys.has(key)));
  if (field === "arrival")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => arrivalKeys.has(key))
        .map(([key, v]) => [key, publicCampus(v, key)]),
    );
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

function publishedLayers(data) {
  const core = new Set(["boundary", "path", "building", "place", "entrance", "barrier", "closure"]);
  const items = data.layers.items,
    lookup = new Map(items.map((l) => [l.id, l]));
  const state = (id) => {
    let l = lookup.get(id),
      visible = true,
      included = true;
    const seen = new Set();
    while (l && !seen.has(l.id)) {
      seen.add(l.id);
      visible = visible && !l.archived && l.publishedVisible;
      included = included && l.included;
      l = lookup.get(l.parentId);
    }
    return { visible, included: core.has(lookup.get(id)?.role) || included };
  };
  const properties = (p) => {
    const l = lookup.get(p.mapLayerId);
    if (!l) return p;
    const style = {
      ...l.style,
      ...(l.rules || []).find((r) => String(p[r.field] ?? "") === r.value)?.style,
      ...(typeof p.color === "string" ? { color: p.color } : {}),
      ...(typeof p.opacity === "number" ? { opacity: p.opacity } : {}),
      ...p.layerStyle,
    };
    return {
      ...p,
      visible: p.visible !== false && state(l.id).visible,
      renderStyle: style,
      layerBand: l.band,
      layerOrder: l.order,
      ...(style.labelField ? { label: String(p[style.labelField] || "") } : {}),
    };
  };
  return {
    ...data,
    layers: {
      version: 1,
      items: items
        .filter((l) => state(l.id).included)
        .map((l) => ({
          ...l,
          ...(l.parentId && !state(l.parentId).included ? { parentId: undefined } : {}),
        })),
    },
    map: {
      ...data.map,
      features: data.map.features
        .filter((f) => state(f.properties?.mapLayerId).included)
        .map((f) => ({ ...f, properties: properties(f.properties || {}) })),
    },
    places: data.places.map(properties),
    boundary: { ...data.boundary, properties: properties(data.boundary.properties || {}) },
    entrances: (data.entrances || []).map(properties),
  };
}
