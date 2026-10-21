/** Untrusted importer input. Comparison must also handle incomplete provenance. */
export interface ObservationRecord {
  id: string;
  entity: string;
  source?: string;
  hash: string;
  payload: { properties?: Record<string, unknown>; [key: string]: unknown };
}
export interface SourceObservation {
  provider: string;
  collection: string;
  nativeId: string;
  featureType: string;
  stable: boolean;
  content: Record<string, unknown>;
  records: ObservationRecord[];
  identity?: string;
  contentHash?: string;
  configurationHash?: string;
  layerIdentity?: string;
  legacy?: boolean;
  evidenceUnavailable?: boolean;
}
export interface ObservationComparison {
  accepted?: SourceObservation[];
  observations?: SourceObservation[];
  records?: ObservationRecord[];
  receipt: {
    configurationHash: string;
    collections?: Array<{
      identity: string;
      complete: boolean;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
  verification?: Record<string, unknown>;
  completeReplacement?: boolean;
}
