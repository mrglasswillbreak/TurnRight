/** Deliberately permits incomplete records used to exercise importer rejection. */
export interface SourceFixtureRecord {
  id: string;
  entity: string;
  source: string;
  hash: string;
  payload: { properties?: Record<string, unknown>; [key: string]: unknown };
}
export interface SourceFixtureObservation {
  provider: string;
  collection: string;
  nativeId: string;
  featureType: string;
  stable: boolean;
  content: Record<string, unknown>;
  records: SourceFixtureRecord[];
  contentHash?: string;
  configurationHash?: string;
  identity?: string;
  legacy?: boolean;
  evidenceUnavailable?: boolean;
}
export interface ComparisonMember {
  before?: SourceFixtureRecord;
  after?: SourceFixtureRecord;
}
export interface ComparisonFeature {
  observation?: SourceFixtureObservation;
  accepted?: SourceFixtureObservation;
}
export interface ComparisonGroup {
  source_id: string;
  kind: string;
  classification: string;
  eligible: boolean;
  features: ComparisonFeature[];
  members: ComparisonMember[];
}
