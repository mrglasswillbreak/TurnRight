import { describe, expect, it } from "vitest";
import { findRoutes, turnKind } from "../src/routing";
import { advanceNavigation, initialNavigation } from "../src/navigation";
import { campusFixture } from "./fixture";
import type { GpsFix } from "../src/types";
describe("walking routes", () => {
  it("finds a shortest route and a genuinely different loop-free alternative", () => {
    const data = campusFixture(),
      routes = findRoutes(data, "a", "c");
    expect(routes[0].nodeIds).toEqual(["a", "b", "c"]);
    expect(routes).toHaveLength(2);
    expect(routes[1].nodeIds).toEqual(["a", "d", "c"]);
    expect(routes[1].distance).toBeGreaterThan(routes[0].distance);
  });
  it("does not use closures even after their expected reopening date", () => {
    const data = campusFixture();
    data.closures = [
      { id: "closure", edgeIds: ["bc"], reason: "Works", expectedReopening: "2020-01-01" },
    ];
    expect(findRoutes(data, "a", "c")[0].nodeIds).toEqual(["a", "d", "c"]);
    data.closures[0].reopenedAt = "2026-09-08";
    expect(findRoutes(data, "a", "c")[0].nodeIds).toEqual(["a", "b", "c"]);
  });
  it("respects access restrictions and directed edges", () => {
    const data = campusFixture();
    data.graph.edges = data.graph.edges.filter((e) => e.id !== "ba" && e.id !== "da");
    expect(() => findRoutes(data, "c", "a")).toThrow(/No connected/);
    data.graph.edges.forEach((e) => {
      if (e.id === "bc") e.accessible = false;
    });
    expect(findRoutes(data, "a", "c")[0].nodeIds).toEqual(["a", "d", "c"]);
  });
  it("never bridges disconnected components or far-away GPS positions", () => {
    const data = campusFixture();
    expect(() => findRoutes(data, "isolated", "c")).toThrow(/No connected/);
    expect(() => findRoutes(data, [0, 0], "c")).toThrow(/too far/);
  });
  it("classifies left/right turns across the north boundary", () => {
    expect(turnKind(90)).toBe("right");
    expect(turnKind(-90)).toBe("left");
    expect(turnKind(-350)).toBe("straight");
    expect(turnKind(179)).toBe("uturn");
  });
});
describe("GPS navigation", () => {
  const route = findRoutes(campusFixture(), "a", "c")[0];
  const fix = (
    timestamp: number,
    coordinates: GpsFix["coordinates"] = [3.2004, 6.46],
    accuracy = 5,
  ): GpsFix => ({ coordinates, accuracy, timestamp, heading: null, speed: 1 });
  it("pauses on poor and stale fixes without advancing", () => {
    const state = advanceNavigation(route, fix(1000), initialNavigation, 1000);
    expect(advanceNavigation(route, fix(2000, [3.201, 6.46], 80), state, 2000).progress).toBe(
      state.progress,
    );
    expect(advanceNavigation(route, fix(1000), state, 20000).quality).toBe("stale");
  });
  it("requires sustained departure before rerouting and resets on recovery", () => {
    let state = advanceNavigation(route, fix(1000, [3.2004, 6.4605]), initialNavigation, 1000);
    expect(state.reroute).toBe(false);
    state = advanceNavigation(route, fix(6000, [3.2004, 6.4605]), state, 6000);
    expect(state.reroute).toBe(false);
    state = advanceNavigation(route, fix(10000, [3.2004, 6.4605]), state, 10000);
    expect(state.reroute).toBe(true);
    state = advanceNavigation(route, fix(11000), state, 11000);
    expect(state.offRouteSince).toBeNull();
  });
  it("requires three distinct accurate fixes to confirm arrival", () => {
    let state = advanceNavigation(route, fix(1000, [3.201, 6.46]), initialNavigation, 1000);
    state = advanceNavigation(route, fix(1000, [3.201, 6.46]), state, 2000);
    expect(state.arrivalFixes).toBe(1);
    state = advanceNavigation(route, fix(3000, [3.201, 6.46]), state, 3000);
    expect(state.arrived).toBe(false);
    state = advanceNavigation(route, fix(4000, [3.201, 6.46]), state, 4000);
    expect(state.arrived).toBe(true);
  });
  it('can resume on another mapped path after a sustained departure', () => {
    const data = campusFixture();
    const alternatePath = data.graph.nodes.find(
      (node) => node.id === 'd',
    )!.coordinates;
    let state = advanceNavigation(
      route,
      fix(1000, alternatePath),
      initialNavigation,
      1000,
    );
    state = advanceNavigation(route, fix(9000, alternatePath), state, 9000);
    expect(state.reroute).toBe(true);
    const updated = findRoutes(data, alternatePath, { placeId: 'library' })[0];
    expect(updated.nodeIds).toEqual(['d', 'c']);
    const resumed = advanceNavigation(
      updated,
      fix(10000, alternatePath),
      initialNavigation,
      10000,
    );
    expect(resumed.reroute).toBe(false);
    expect(resumed.offRouteSince).toBeNull();
    expect(resumed.progress).toBe(0);
  });
  it('does not switch for nearby GPS drift, or count weak fixes as sustained departure', () => {
    let state = advanceNavigation(
      route,
      fix(1000, [3.2004, 6.4601]),
      initialNavigation,
      1000,
    );
    state = advanceNavigation(
      route,
      fix(10000, [3.2004, 6.4601]),
      state,
      10000,
    );
    expect(state.reroute).toBe(false);
    state = advanceNavigation(
      route,
      fix(11000, [3.2004, 6.4605]),
      state,
      11000,
    );
    state = advanceNavigation(
      route,
      fix(20000, [3.2004, 6.4605], 80),
      state,
      20000,
    );
    expect(state.reroute).toBe(false);
    expect(state.offRouteSince).toBeNull();
    state = advanceNavigation(
      route,
      fix(21000, [3.2004, 6.4605]),
      state,
      21000,
    );
    expect(state.reroute).toBe(false);
    expect(state.offRouteSince).toBe(21000);
  });
});
