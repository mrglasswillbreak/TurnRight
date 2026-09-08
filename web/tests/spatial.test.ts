import { describe, it, expect } from "vitest";
import { geometryBlocker } from "../src/spatial";
import { findRoutes } from "../src/routing";
import { campusFixture } from "./fixture";
import type { FeatureCollection } from "geojson";
const map: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { kind: "building", id: "outline" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [3.2004, 6.4599],
            [3.2006, 6.4599],
            [3.2006, 6.4601],
            [3.2004, 6.4601],
            [3.2004, 6.4599],
          ],
        ],
      },
    },
  ],
};
describe("building and barrier conflicts", () => {
  it("detects a path crossing a footprint even when both endpoints are outside", () =>
    expect(geometryBlocker([3.2, 6.46], [3.201, 6.46], map)).toBe("building:outline"));
  it("permits a path alongside an outline", () =>
    expect(geometryBlocker([3.2, 6.4602], [3.201, 6.4602], map)).toBeUndefined());
  it("detects unconnected fence crossings", () => {
    const barrier: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { id: "fence", kind: "barrier" },
          geometry: {
            type: "LineString",
            coordinates: [
              [3.2005, 6.4599],
              [3.2005, 6.4601],
            ],
          },
        },
      ],
    };
    expect(geometryBlocker([3.2, 6.46], [3.201, 6.46], barrier)).toBe("barrier:fence");
  });
  it("routes around a footprint instead of following the conflicting source path", () => {
    const data = campusFixture();
    data.map = map;
    const route = findRoutes(data, "a", "d")[0];
    for (let i = 1; i < route.coordinates.length; i++)
      expect(geometryBlocker(route.coordinates[i - 1], route.coordinates[i], map)).toBeUndefined();
  });
});
