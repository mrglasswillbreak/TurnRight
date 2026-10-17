import { createHash } from 'node:crypto';

// Presentation metadata may change; these fields describe the navigation,
// geometry and source relationships that the campus-detail release preserves.
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
const sorted = (items) =>
  [...(items || [])].sort((a, b) =>
    String(a.id ?? a.properties?.id).localeCompare(
      String(b.id ?? b.properties?.id),
    ),
  );

export function packageInvariants(data) {
  const fields = {
    geometry: sorted(data.map.features).map((feature) => ({
      id: feature.id ?? feature.properties?.id,
      geometry: feature.geometry,
    })),
    boundary: data.boundary,
    graph: {
      ...data.graph,
      nodes: sorted(data.graph.nodes),
      edges: sorted(data.graph.edges),
    },
    entrances: sorted(data.entrances),
    photos: sorted(data.photos),
    closures: sorted(data.closures),
    driving: data.driving ?? null,
    accessPolicy: data.accessPolicy ?? null,
    places: sorted(data.places).map(({ landmark, ...place }) => place),
  };
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      createHash('sha256')
        .update(JSON.stringify(canonical(value)))
        .digest('hex'),
    ]),
  );
}
