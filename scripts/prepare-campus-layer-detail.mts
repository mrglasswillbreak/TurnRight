/** Build the local, reviewable additive release inputs without touching the server. */
import fs from "node:fs/promises";
import { runGeometry } from "../web/src/layer-geometry-engine";
import { bindCampusLayers } from "../web/src/campus-layers";
import { publicCampus } from "./public-campus.mjs";
import { createHash } from "node:crypto";
import type { CampusData } from "../web/src/types";
const read = async (path: string) => JSON.parse(await fs.readFile(path, "utf8"));
const write = async (path: string, value: unknown) =>
  fs.writeFile(path, JSON.stringify(value, null, 2) + "\n");
const raw = "data/raw/lasu-layer-upgrade",
  output = "data/campus-layer-enrichment";
const data: CampusData = await read(`${raw}/lasu-landscape-preview.json`),
  changes = await read(`${output}/lasu-changes.json`);
changes.featureAdds = changes.featureAdds.filter((f: any) => !f.properties.derivedSurface);
changes.sources = changes.sources.filter((s: any) => s.id !== "derived-road-widths");
const paths = data.map.features.filter((f) => f.properties?.kind === "path");
const result = runGeometry(data, [], {
  operation: "regenerate",
  keys: paths.map((f) => `path:${f.properties!.id}`),
});
for (const edit of result.edits) {
  if (edit.kind === "layer") {
    data.layers = {
      version: 1,
      items: [
        edit.properties.layerDefinition as import("../web/src/campus-layer-types").CampusLayer,
      ],
    };
    continue;
  }
  const feature = {
    type: "Feature" as const,
    geometry: edit.geometry,
    properties: {
      ...edit.properties,
      id: edit.id,
      kind: edit.kind,
      source: "derived-road-widths",
      sourceId: (edit.properties.derivedSurface as { sourceRoadId: string }).sourceRoadId,
      importLayer: "LASU estimated road surfaces",
    },
  };
  data.map.features.push(feature);
  changes.featureAdds.push(feature);
}
bindCampusLayers(data, data);
changes.layers = data.layers;
changes.sources.push({
  id: "derived-road-widths",
  name: "LASU road surfaces from reviewed centreline geometry",
  url: "https://github.com/mrglasswillbreak/TurnRight",
  attribution: "TurnRight; source geometry © OpenStreetMap contributors and owner mapping",
  license:
    "Source geometry under its existing attribution; widths illustrative unless explicitly evidenced",
  retrievedAt: "2026-09-30",
});
data.sources.push(changes.sources.at(-1));
await write(`${output}/lasu-changes.json`, changes);
await write(`${raw}/lasu-release-preview.json`, publicCampus(data));
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const report = {
  baselineVersion: changes.baselineVersion,
  sourceRoads: paths.length,
  surfaces: result.edits.filter((e) => e.kind === "land").length,
  evidence: result.edits
    .filter((e) => e.kind === "land")
    .reduce(
      (counts, e) => {
        const key = String(e.properties.widthEvidence);
        counts[key] = (counts[key] || 0) + 1;
        return counts;
      },
      {} as Record<string, number>,
    ),
  areaM2: result.afterArea,
  projection: result.projection,
  routingHash: sha(data.graph),
  roads: result.report,
  layers: data.layers?.items.length,
  repairs: result.repairs.map(({ original, ...diagnostic }) => diagnostic),
};
await write(`${output}/lasu-surface-repairs.json`, result.repairs);
await write(`${output}/lasu-surface-coverage.json`, report);
console.log(
  JSON.stringify(
    { ...report, roads: report.roads.filter((line) => !line.includes(" m (")) },
    null,
    2,
  ),
);
