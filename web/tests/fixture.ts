import type { CampusData, Position } from "../src/types";
import { distance } from "../src/geo";
export function campusFixture(): CampusData {
  const points: Record<string, Position> = {
    a: [3.2, 6.46],
    b: [3.2005, 6.46],
    c: [3.201, 6.46],
    d: [3.2005, 6.4604],
    isolated: [3.202, 6.462],
  };
  const edges = [
    ["a", "b"],
    ["b", "c"],
    ["a", "d"],
    ["d", "c"],
  ].flatMap(([a, b]) =>
    [
      [a, b],
      [b, a],
    ].map(([from, to]) => ({
      id: from + to,
      from,
      to,
      distance: distance(points[from], points[to]),
      name: from === "a" ? "Library path" : "Science path",
      accessible: true,
      sourceId: from + to,
    })),
  );
  return {
    schemaVersion: 1,
    version: "fixture",
    createdAt: "2026-09-08T00:00:00Z",
    bounds: [
      [3.19, 6.455],
      [3.215, 6.49],
    ],
    boundary: {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [3.19, 6.455],
            [3.215, 6.455],
            [3.215, 6.49],
            [3.19, 6.49],
            [3.19, 6.455],
          ],
        ],
      },
      properties: {},
    },
    map: { type: "FeatureCollection", features: [] },
    places: [
      {
        id: "library",
        name: "Library",
        category: "library",
        coordinates: points.c,
        aliases: [],
        source: "test",
        sourceId: "library",
        graphNode: "c",
        arrivalKind: "entrance",
      },
    ],
    graph: {
      nodes: Object.entries(points).map(([id, coordinates]) => ({ id, coordinates })),
      edges,
    },
    closures: [],
    coverage: {
      fieldVerified: false,
      placeCount: 1,
      routableCount: 1,
      approachCount: 0,
      disconnected: [],
      components: 2,
      notes: [],
    },
    sources: [],
  };
}
