import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findRoutes } from "../src/routing";
import type { CampusData } from "../src/types";

const campus: CampusData = JSON.parse(
  readFileSync(new URL("../../data/seed/campus.json", import.meta.url), "utf8"),
);
const clinic = campus.places.find((p) => p.id === "arcgis:Infrastructure:17")!.graphNode!;
const gate = "osm:node:13774055448";

describe("reviewed LASU walking connections", () => {
  it.each([
    ["Faculty of Law", "arcgis:University_Property:6", "lasu-law-driveway-2026-09-09"],
    ["International Library", "arcgis:University_Property:3", "lasu-library-gate-2026-09-09"],
  ])("routes to the %s approach through its confirmed connection", (_name, id, reviewId) => {
    const destination = campus.places.find((p) => p.id === id)!;
    expect(destination.arrivalKind).toBe("mapped-approach");
    const route = findRoutes(campus, clinic, destination.graphNode!)[0];
    const used = campus.graph.edges.filter((edge) => route.edgeIds.includes(edge.id));
    expect(used.some((edge) => edge.accessReviewId === reviewId || edge.accessReviewIds?.includes(reviewId))).toBe(true);
    expect(used.every((edge) => edge.accessible && !edge.geometryBlocked)).toBe(true);
    expect(campus.coverage.fieldVerified).toBe(false);
  });

  it.each([
    ["Law driveway", "arcgis:University_Property:6", "osm:way:591396656"],
    ["Library gate", "arcgis:University_Property:3", gate],
  ])("keeps a closure on the %s effective after its expected reopening date", (_name, id, featureId) => {
    const data = structuredClone(campus);
    const edgeIds = data.graph.edges
      .filter((edge) => edge.sourceId === featureId || edge.from === featureId || edge.to === featureId)
      .map((edge) => edge.id);
    expect(edgeIds.length).toBeGreaterThan(0);
    data.closures.push({ id: "review-test", edgeIds, reason: "Temporary closure", expectedReopening: "2020-01-01" });
    const destination = data.places.find((p) => p.id === id)!.graphNode!;
    expect(() => findRoutes(data, clinic, destination)).toThrow(/No connected walking route/);
  });

  it("retains private source tags and each specific owner review", () => {
    const driveway = campus.map.features.find((f) => f.properties?.id === "osm:way:591396656")!;
    expect(driveway.properties?.sourceTags).toMatchObject({ access: "private", service: "driveway" });
    expect(driveway.properties?.accessReviewId).toBe("lasu-law-driveway-2026-09-09");
    expect(campus.graph.nodes.find((node) => node.id === gate)).toMatchObject({
      sourceTags: { access: "private", barrier: "gate" },
      accessReviewId: "lasu-library-gate-2026-09-09",
    });
  });
});
