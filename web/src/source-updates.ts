import type { MapChange } from "./types.js";
import type { Geometry } from "geojson";

export interface SourceMapRow {
  id: string;
  revision: number;
  name: string;
  kind: MapChange["kind"];
  before: { geometry: Geometry; simplified: boolean } | null;
  after: { geometry: Geometry; simplified: boolean } | null;
}
export interface SourceMapPage {
  rows: SourceMapRow[];
  total: number;
  asOf: string;
  nextCursor: SourceCursor | null;
}

export interface SourceFilters {
  query?: string;
  source?: string;
  layer?: string;
  featureType?: string;
  kind?: "" | "add" | "modify" | "remove";
  geometry?: "" | "true" | "false";
}
export interface SourceCursor {
  createdAt: string;
  id: string;
}
export interface SourceSummary {
  id: string;
  revision: number;
  sourceId: string;
  sourceName: string;
  kind: MapChange["kind"];
  createdAt: string;
  meta: {
    source: string;
    name: string;
    layer: string;
    featureType: string;
    fields: string[];
    geometryChanged: boolean;
  };
}
export interface SourcePage {
  rows: SourceSummary[];
  total: number;
  nextCursor: SourceCursor | null;
}
export interface SourceOverview {
  ready: boolean;
  counts: Record<string, number>;
  layers: string[];
  featureTypes: string[];
  scheduledOsmEnabled: boolean;
  sources: Array<{
    id: string;
    name: string;
    kind: "file" | "osm" | "arcgis";
    schedule: "manual" | "daily";
    configured: boolean;
    lastSuccess?: string;
    latest?: {
      id: string;
      status: string;
      message?: string;
      updatedAt: string;
    };
    active?: { id: string; status: string; message?: string };
  }>;
  legacy?: {
    status: string;
    message?: string;
    created_at: string;
    completed_at?: string;
  } | null;
}
export interface SourceOperation {
  id: string;
  actor: string;
  accept: boolean | null;
  status: "prepared" | "queued" | "running" | "completed" | "failed" | "cancelled";
  total: number;
  applied: number;
  skipped: number;
  failed: number;
  breakdown: { add: number; modify: number; remove: number; geometry: number };
  message?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}
export interface SourceResult {
  change_id: string;
  name: string;
  kind: string;
  status: string;
  message?: string;
}
export interface SourceHistory {
  operations: SourceOperation[];
  items: SourceResult[];
}
export interface SourceDetail {
  change: MapChange & { review_revision: number };
  overrides: Array<{
    id: string;
    kind: string;
    fields: string[];
    deleted: boolean;
  }>;
}
export const sourceKindLabel = {
  add: "Addition",
  modify: "Change",
  remove: "Removal",
} as const;
export function sourceFieldLabel(key: string) {
  if (key === "geometry") return "Shape or location";
  return key
    .replace(/^properties\./, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase());
}
export function describeSourceChange(row: SourceSummary) {
  const fields = row.meta.fields.map(sourceFieldLabel);
  if (row.kind === "add") return "New source feature";
  if (row.kind === "remove") return "Missing from the latest source snapshot";
  return (
    [
      row.meta.geometryChanged ? "Shape or location changed" : "",
      fields.length
        ? fields.slice(0, 3).join(", ") + (fields.length > 3 ? ` + ${fields.length - 3} more` : "")
        : "",
    ]
      .filter(Boolean)
      .join(" · ") || "Source details changed"
  );
}
export const operationActive = (op: SourceOperation) => ["queued", "running"].includes(op.status);
