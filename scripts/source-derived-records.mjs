import { recordMap, routingDependencies } from './source-comparison.mjs';
// Conservative legacy adapter. Only source shapes establish feature identities;
// graph IDs and proximity never invent upstream objects or deletion candidates.
export function legacyObservations(records) {
  const nodes = recordMap(records.filter((r) => r.entity === 'node'));
  const edges = new Map();
  for (const r of records)
    if (r.entity === 'edge') {
      const key = r.payload.sourceId;
      edges.set(key, [...(edges.get(key) || []), r]);
    }
  return records
    .filter(
      (r) =>
        r.entity === 'feature' &&
        /^(osm|arcgis|overture):/.test(r.payload.properties?.id || ''),
    )
    .map((r) => {
      const id = r.payload.properties.id,
        provider = id.split(':')[0],
        linked = edges.get(id) || [];
      const dependencies = [
        ...new Set(linked.flatMap((e) => [e.payload.from, e.payload.to])),
      ]
        .map((id) => nodes.get('node:' + id))
        .filter(Boolean);
      return {
        provider,
        collection: `${provider}:${r.payload.properties.kind || 'feature'}`,
        nativeId: id.slice(provider.length + 1),
        featureType: r.payload.properties.kind || 'feature',
        stable: true,
        content: r.payload,
        records: [r, ...linked, ...dependencies],
      };
    });
}

export function attachDerivedRecords(upstream, records) {
  const byRoot = new Map(),
    nodes = recordMap(records.filter((r) => r.entity === 'node'));
  for (const r of records) {
    const root =
      r.entity === 'feature'
        ? r.payload.properties.id
        : r.entity === 'edge'
          ? r.payload.sourceId
          : r.entity === 'place'
            ? r.payload.buildingId || r.payload.id
            : null;
    if (root) byRoot.set(root, [...(byRoot.get(root) || []), r]);
  }
  return upstream.map((o) => {
    const derived = byRoot.get(o.rootId) || [];
    const dependencies = [...new Set(derived.flatMap(routingDependencies))]
      .map((id) => nodes.get(id))
      .filter(Boolean);
    return {
      ...o,
      featureType:
        derived.find((r) => r.entity === 'feature')?.payload.properties.kind ||
        derived[0]?.entity ||
        'unmapped',
      records: [...derived, ...dependencies],
    };
  });
}
