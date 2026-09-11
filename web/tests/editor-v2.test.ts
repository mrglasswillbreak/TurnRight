import { describe, expect, it } from "vitest";
import { applyEdits, validateEdit } from "../src/editor-model";
import { featureEdit, geometryEdits, snapTarget } from "../src/editor-features";
import { findRoutes } from "../src/routing";
import { campusFixture } from "./fixture";
import type { CampusData, MapEdit, Position } from "../src/types";

function network() {
  const data = campusFixture();
  data.graph.edges.forEach((e) => { if (["ab", "ba", "bc", "cb"].includes(e.id)) e.sourceId = "road"; });
  data.map.features.push({ type: "Feature", properties: { id: "road", kind: "path", name: "Main walk", walkingAccess: "yes" }, geometry: { type: "LineString", coordinates: data.graph.nodes.slice(0, 3).map((n) => n.coordinates) } });
  return data;
}
function approach(id: string, x: number): MapEdit {
  return { id, kind: "path", geometry: { type: "LineString", coordinates: [[x, 6.4602], [x, 6.46]] }, properties: { name: id, vertexIds: [`${id}:door`, `${id}:end`], connections: [{ vertexId: `${id}:end`, target: { type: "segment", sourceId: "road", from: "a", to: "b", coordinates: [x, 6.46] } }] } };
}
function entrance(id: string, path: MapEdit): MapEdit {
  const coordinates = path.geometry.type === "LineString" ? path.geometry.coordinates[0] as Position : [0, 0] as Position;
  return { id, kind: "entrance", geometry: { type: "Point", coordinates }, properties: { name: id, placeId: "library", connection: { type: "node", nodeId: path.properties.vertexIds![0], coordinates } } };
}
describe("explicit mapping connections", () => {
  it("splits both directions, keeps closures, and reaches the actual entrance", () => {
    const data = network(), path = approach("approach", 3.20025);
    data.closures = [{ id: "closed", reason: "Repairs", edgeIds: ["ab", "ba"] }];
    const result = applyEdits(data, [entrance("West door", path), path]);
    expect(result.errors).toEqual([]);
    const descendants = result.data.graph.edges.filter((e) => e.parentEdgeIds?.some((id) => ["ab", "ba"].includes(id)));
    expect(descendants).toHaveLength(4);
    expect(result.data.closures[0].edgeIds.sort()).toEqual(descendants.map((e) => e.id).sort());
    expect(() => findRoutes(result.data, "a", { placeId: "library" })).toThrow(/No connected/);
    result.data.closures = [];
    const route = findRoutes(result.data, "a", { placeId: "library" })[0];
    expect(route.destinationEntranceId).toBe("West door");
    expect(route.coordinates.at(-1)).toEqual([3.20025, 6.4602]);
    expect(data.graph.nodes).toHaveLength(5);
  });
  it("handles multiple splits and cross-draft references independently of edit order", () => {
    const left = approach("left", 3.20015), right = approach("right", 3.20035);
    const edits = [left, right, entrance("left-door", left), entrance("right-door", right)];
    const a = applyEdits(network(), edits), b = applyEdits(network(), [...edits].reverse());
    expect(a.errors).toEqual([]);
    expect(a.data).toEqual(b.data);
    expect(findRoutes(a.data, "a", { placeId: "library" })[0].destinationEntranceId).toBe("left-door");
    expect(findRoutes(a.data, "c", { placeId: "library" })[0].destinationEntranceId).toBe("right-door");
    expect(findRoutes(a.data, { placeId: "library" }, "a")[0].originEntranceId).toBe("left-door");
  });
  it("does not fall back to an approach when explicit entrances are restricted", () => {
    const path = approach("path", 3.20025), door = entrance("door", path);
    door.properties.access = "private";
    const result = applyEdits(network(), [path, door]);
    expect(result.errors).toEqual([]);
    expect(() => findRoutes(result.data, "a", { placeId: "library" })).toThrow(/no available mapped/);
  });
  it("detects source changes without moving the saved connection", () => {
    const data = network(), path = approach("path", 3.20025);
    data.graph.nodes.find((n) => n.id === "b")!.coordinates[1] += 0.001;
    expect(applyEdits(data, [path]).errors.join()).toContain("target changed");
  });
  it("resolves connections to a new path created later in the input", () => {
    const a = approach("a-path", 3.20025);
    const b: MapEdit = { id: "b-path", kind: "path", geometry: { type: "LineString", coordinates: [[3.20025, 6.4602], [3.2003, 6.4603]] }, properties: { name: "Branch", vertexIds: ["branch-start", "branch-end"], connections: [{ vertexId: "branch-start", target: { type: "node", nodeId: "a-path:door", coordinates: [3.20025, 6.4602] } }] } };
    const result = applyEdits(network(), [b, a]);
    expect(result.errors).toEqual([]);
    expect(findRoutes(result.data, "a", "branch-end")[0].coordinates.at(-1)).toEqual([3.2003, 6.4603]);
  });
  it("preserves a restricted gap through geometry edits", () => {
    const data = network();
    data.graph.edges = data.graph.edges.filter((e) => !["bc", "cb"].includes(e.id));
    // Keep both ends of the missing span represented by adjacent source segments.
    data.graph.edges.find((e) => e.id === "dc")!.sourceId = "road";
    data.graph.edges.find((e) => e.id === "cd")!.sourceId = "road";
    const feature = data.map.features[0];
    feature.geometry = { type: "LineString", coordinates: ["a", "b", "c", "d"].map((id) => data.graph.nodes.find((n) => n.id === id)!.coordinates) };
    const edit = featureEdit(data, "path", "road", [])!;
    if (edit.geometry.type !== "LineString") throw new Error("path");
    edit.geometry.coordinates[0][1] -= 0.0001;
    const result = applyEdits(data, [edit]);
    expect(result.errors).toEqual([]);
    expect(result.data.graph.edges.some((e) => (e.from === "b" && e.to === "c") || (e.from === "c" && e.to === "b"))).toBe(false);
  });
  it("keeps shared junctions together and vertex IDs stable when inserting a vertex", () => {
    const data = network();
    data.map.features.push({ type: "Feature", properties: { id: "dc", kind: "path", name: "Branch" }, geometry: { type: "LineString", coordinates: [data.graph.nodes[3].coordinates, data.graph.nodes[2].coordinates] } });
    const edit = featureEdit(data, "path", "road", [])!;
    if (edit.geometry.type !== "LineString") throw new Error("path");
    const moved: Position = [3.201, 6.4601];
    const changes = geometryEdits(edit, { type: "LineString", coordinates: [edit.geometry.coordinates[0], [3.20025, 6.46], edit.geometry.coordinates[1], moved] }, data, []);
    // An insertion retains the other original IDs; a separate move is an atomic junction command.
    expect(changes[0].properties.vertexIds?.slice(0, 3)).toEqual(["a", expect.any(String), "b"]);
    const onlyMove = geometryEdits(edit, { type: "LineString", coordinates: [edit.geometry.coordinates[0], edit.geometry.coordinates[1], moved] }, data, []);
    expect(onlyMove.some((e) => e.id === "dc")).toBe(true);
    const result = applyEdits(data, onlyMove);
    expect(result.data.graph.nodes.find((n) => n.id === "c")?.coordinates).toEqual(moved);
  });
  it("keeps disconnected entrances visible, but blocks publication validation", () => {
    const result = applyEdits(network(), [{ id: "door", kind: "entrance", geometry: { type: "Point", coordinates: [3.201, 6.4602] }, properties: { name: "Door", placeId: "library" } }]);
    expect(result.data.entrances).toHaveLength(1);
    expect(result.errors.join()).toContain("needs a connected path");
    expect(result.data.entrances![0].graphNode).toBeUndefined();
  });
  it("only snaps within both the screen radius and the ground-distance limit", () => {
    const data = network();
    const project = (p: Position) => ({ x: p[0] * 1e5, y: p[1] * 1e5 });
    expect(snapTarget(data, [3.2002, 6.46002], project)?.target?.type).toBe("segment");
    expect(snapTarget(data, [3.2002, 6.4602], project)).toBeUndefined();
  });
  it("validates typed references and documented floor counts", () => {
    const path = approach("path", 3.2002);
    path.properties.connections = [{ vertexId: "not-a-vertex", target: { type: "node", nodeId: "a", coordinates: [3.2, 6.46] } }];
    expect(validateEdit(path).join()).toContain("Invalid path connection");
    expect(validateEdit({ ...path, properties: { name: "x", heightMode: "floors", floors: 51 } }).join()).toContain("floor count");
  });
});
