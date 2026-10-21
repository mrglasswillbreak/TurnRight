import type { CampusData, GraphNode, Place } from './types.js';
export interface SourceIdentity {
  id: string;
  source: string;
  hash: string;
  updated_at?: string;
}

export type SourceRecord = SourceIdentity &
  (
    | { entity: 'meta'; payload: Omit<CampusData, 'map' | 'places' | 'graph'> }
    | { entity: 'feature'; payload: CampusData['map']['features'][number] }
    | { entity: 'place'; payload: Place }
    | { entity: 'node'; payload: GraphNode & { gisManaged?: boolean } }
    | {
        entity: 'edge';
        payload: CampusData['graph']['edges'][number] & {
          gisManaged?: boolean;
        };
      }
  );

export function assembleSources(
  records: SourceRecord[],
  fallback: CampusData,
): CampusData {
  if (!records.length) return structuredClone(fallback);
  const meta = records.find((r) => r.entity === 'meta')?.payload;
  if (!meta)
    throw new Error(
      'Approved source metadata is missing. Bootstrap the sources before publishing.',
    );
  return {
    ...structuredClone(meta),
    map: {
      type: 'FeatureCollection',
      features: records
        .filter((r) => r.entity === 'feature')
        .map((r) => structuredClone(r.payload)),
    },
    places: records
      .filter((r) => r.entity === 'place')
      .map((r) => structuredClone(r.payload)),
    graph: {
      nodes: records
        .filter((r) => r.entity === 'node')
        .map((r) => structuredClone(r.payload)),
      edges: records
        .filter((r) => r.entity === 'edge')
        .map((r) => structuredClone(r.payload)),
    },
  };
}
