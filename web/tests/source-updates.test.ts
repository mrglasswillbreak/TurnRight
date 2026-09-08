import { describe, it, expect } from "vitest";
// @ts-expect-error Shared Node pipeline module intentionally uses plain JavaScript.
import { compareSources, flatten, hash } from "../../scripts/cloud.mjs";
import { campusFixture } from "./fixture";
describe("source updates", () => {
  it("ignores retrieval timestamps and JSON key order", () => {
    expect(hash({ name: "Library", retrievedAt: "today", geometry: [1, 2] })).toBe(
      hash({ geometry: [1, 2], retrievedAt: "yesterday", name: "Library" }),
    );
  });
  it("proposes semantic changes instead of changing approved records", () => {
    const old = flatten(campusFixture());
    const updated = campusFixture();
    updated.places[0].name = "New name";
    const changes = compareSources(old, flatten(updated));
    expect(changes).toHaveLength(1);
    expect(changes[0].status).toBe("pending");
    expect(old.find((r: any) => r.entity === "place").payload.name).toBe("Library");
  });
  it("fails closed on a suspiciously incomplete source result", () => {
    const old = flatten(campusFixture());
    expect(() => compareSources(old, old.slice(0, 2))).toThrow(/20%/);
  });
});
