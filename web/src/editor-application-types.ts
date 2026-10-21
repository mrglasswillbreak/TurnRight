import { type ValidationIssue } from './validation.js';
import type { CampusData, GraphNode, MapEdit } from './types.js';
export interface EditApplicationContext {
  data: CampusData;
  nodes: Map<string, GraphNode>;
  warnings: string[];
  issue: (
    message: string,
    featureId: string,
    featureKind: MapEdit['kind'],
    extra?: Partial<ValidationIssue>,
  ) => void;
  buildingId: (id: string) => string;
  canonical: (id: string) => string;
}
