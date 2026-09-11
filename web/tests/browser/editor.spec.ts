import { test, expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { campusFixture } from "../fixture";
import type { CampusData, MapEdit, Position } from "../../src/types";

function browserCampus(): CampusData {
  const data = campusFixture();
  data.graph.edges = data.graph.edges.filter((e) => ["ab", "ba", "bc", "cb"].includes(e.id)).map((e) => ({ ...e, sourceId: "road" }));
  data.places[0] = { ...data.places[0], coordinates: [3.20025, 6.4603], arrivalKind: "mapped-approach", approachDistance: 30, graphNode: "b" };
  data.places.push({ ...data.places[0], id: "gate", name: "Main gate", coordinates: [3.2, 6.46], graphNode: "a", category: "gate" });
  data.map.features = [
    { type: "Feature", properties: { id: "road", name: "Main walk", kind: "path", walkingAccess: "yes" }, geometry: { type: "LineString", coordinates: data.graph.nodes.slice(0, 3).map((n) => n.coordinates) } },
    { type: "Feature", properties: { id: "library", name: "Library", kind: "building", height: 15 }, geometry: { type: "Polygon", coordinates: [[[3.2001, 6.4602], [3.2004, 6.4602], [3.2004, 6.4604], [3.2001, 6.4604], [3.2001, 6.4602]]] } },
    { type: "Feature", properties: { id: "unknown-building", name: "New lecture hall", kind: "building", height: 0 }, geometry: { type: "Polygon", coordinates: [[[3.20065, 6.4602], [3.2008, 6.4602], [3.2008, 6.4604], [3.20065, 6.4604], [3.20065, 6.4602]]] } },
  ];
  return data;
}
async function setup(page: Page) {
  let edits: MapEdit[] = [];
  let revision = 0;
  const receipts = new Map<string, MapEdit[]>();
  const campus = browserCampus(), bytes = JSON.stringify(campus);
  const user = { id: "owner", aud: "authenticated", role: "authenticated", email: "owner@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  await page.addInitScript(({ user }) => {
    localStorage.setItem("sb-editor-test-auth-token", JSON.stringify({ access_token: "test-token", token_type: "bearer", refresh_token: "test-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, user }));
  }, { user });
  await page.route("https://editor-test.supabase.co/**", (route) => route.fulfill({ json: { user } }));
  await page.route("**/packages/latest.json", (route) => route.fulfill({ json: { schemaVersion: 1, version: "fixture", createdAt: campus.createdAt, summary: "Test campus", dataUrl: "/packages/fixture/campus.json", bytes: Buffer.byteLength(bytes), assets: [{ url: "/packages/fixture/campus.json", sha256: createHash("sha256").update(bytes).digest("hex"), bytes: Buffer.byteLength(bytes) }] } }));
  await page.route("**/packages/fixture/campus.json", (route) => route.fulfill({ body: bytes, contentType: "application/json" }));
  await page.route("**/api/admin", async (route) => {
    const { action, payload } = route.request().postDataJSON();
    if (action === "state") return route.fulfill({ json: { edits, reports: [], changes: [], jobs: [], releases: [] } });
    if (action === "sources") return route.fulfill({ json: { features: [] } });
    if (action === "save-edits") {
      if (receipts.has(payload.operationId)) return route.fulfill({ json: receipts.get(payload.operationId) });
      for (const item of payload.edits) {
        const previous = edits.find((e) => e.id === item.edit.id && e.kind === item.edit.kind);
        if ((previous?.updated_at || null) !== item.expectedUpdatedAt) return route.fulfill({ status: 409, json: { error: "Draft changed in another session" } });
      }
      const saved = payload.edits.map(({ edit }: { edit: MapEdit }) => ({ ...edit, updated_at: new Date(Date.UTC(2026, 8, 11, 12, 0, revision++)).toISOString() }));
      saved.forEach((edit: MapEdit) => { edits = [...edits.filter((e) => !(e.id === edit.id && e.kind === edit.kind)), edit]; });
      receipts.set(payload.operationId, saved);
      return route.fulfill({ json: saved });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/admin");
  await expect(page.getByRole("button", { name: "Draw path", exact: true })).toBeEnabled();
  await attachMap(page);
  return { edits: () => edits, campus };
}
// Read the actual MapLibre instance from the mounted React ref. No map, renderer,
// geometry controller, or pointer event is mocked or replaced by this test.
async function attachMap(page: Page) {
  await page.waitForFunction(() => {
    const element = document.querySelector(".map-canvas") as HTMLElement & Record<string, unknown>;
    const key = Object.keys(element || {}).find((k) => k.startsWith("__reactFiber"));
    let fiber = key && element[key] as any;
    while (fiber) {
      let hook = fiber.memoizedState;
      while (hook) {
        const value = hook.memoizedState?.current;
        if (value?.getCanvas && value?.project) { (window as any).editorTestMap = value; return value.loaded(); }
        hook = hook.next;
      }
      fiber = fiber.return;
    }
    return false;
  });
}
async function position(page: Page, coordinates: Position) {
  return page.evaluate((coordinates) => {
    const map = (window as any).editorTestMap;
    const p = map.project(coordinates), rect = map.getCanvas().getBoundingClientRect();
    return { x: rect.left + p.x, y: rect.top + p.y };
  }, coordinates);
}
async function clickMap(page: Page, coordinates: Position) {
  const p = await position(page, coordinates);
  await page.mouse.click(p.x, p.y);
}
async function focusCampus(page: Page) {
  await page.evaluate(() => (window as any).editorTestMap.jumpTo({ center: [3.2003, 6.4602], zoom: 19, bearing: 0, pitch: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 } }));
  await expect.poll(() => page.evaluate(() => (window as any).editorTestMap.isMoving())).toBe(false);
}

for (const threeD of [false, true]) test(`map two entrances and their approaches in ${threeD ? "3D" : "2D"}, save and reload`, async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  const server = await setup(page);
  await focusCampus(page);
  if (threeD) { await page.getByRole("button", { name: "3D", exact: true }).click(); await expect.poll(() => page.evaluate(() => (window as any).editorTestMap.getPitch())).toBeGreaterThan(45); }
  await page.getByRole("button", { name: "Collapse explorer" }).click();
  for (const [i, x] of [3.20018, 3.20033].entries()) {
    // Select the existing building surface, then use its entrance action.
    await clickMap(page, [3.20012, 6.46022]);
    await expect(page.getByRole("complementary", { name: "Feature properties" })).toBeVisible();
    await page.getByRole("complementary", { name: "Feature properties" }).getByRole("button", { name: "Add entrance", exact: true }).click();
    await clickMap(page, [x, 6.4602]);
    const inspector = page.getByRole("complementary", { name: "Feature properties" });
    await expect(inspector.getByRole("button", { name: "Draw connecting path" })).toBeVisible();
    await inspector.getByLabel("Name", { exact: true }).fill(`Library entrance ${i + 1}`);
    await inspector.getByRole("button", { name: "Draw connecting path" }).click();
    await clickMap(page, [x, 6.46]);
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await expect(inspector.getByText("Path connections", { exact: true })).toBeVisible();
    await expect.poll(() => server.edits().filter((e) => e.kind === "path").length).toBe(i + 1);
  }
  expect(server.edits().filter((e) => e.kind === "entrance" && e.properties.connection)).toHaveLength(2);
  await expect(page.locator(".editor-save-state")).toHaveText("Saved");
  const camera = await page.evaluate(() => { const m = (window as any).editorTestMap; return [m.getCenter().lng, m.getCenter().lat, m.getZoom(), m.getPitch()]; });
  await page.getByRole("button", { name: "Compare base", exact: true }).click();
  await page.getByRole("button", { name: "Back to draft", exact: true }).click();
  expect(await page.evaluate(() => { const m = (window as any).editorTestMap; return [m.getCenter().lng, m.getCenter().lat, m.getZoom(), m.getPitch()]; })).toEqual(camera);
  await page.reload(); await attachMap(page);
  await page.getByRole("button", { name: "Test route", exact: true }).click();
  await page.getByLabel("Test route From").selectOption("gate");
  await page.getByLabel("Test route To").selectOption("library");
  await page.getByRole("button", { name: "Preview route", exact: true }).click();
  await expect(page.getByText(/Arrive at Library entrance 1/)).toBeVisible();
  await page.screenshot({ path: `test-results/editor-${threeD ? "3d" : "2d"}.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("recovers unfinished geometry and preserves it when switching 2D/3D", async ({ page }) => {
  await setup(page); await focusCampus(page);
  await page.getByRole("button", { name: "Draw path", exact: true }).click();
  await clickMap(page, [3.2005, 6.4601]); await clickMap(page, [3.2006, 6.4601]);
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(page.locator(".editor-save-state")).toHaveText("Saved locally");
  await page.reload(); await attachMap(page);
  await expect(page.getByText("Unfinished drawing recovered")).toBeVisible();
  await page.getByRole("button", { name: "Resume drawing" }).click();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Feature properties" })).toBeVisible();
});

test("supports dark appearance and small-screen review", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await setup(page);
  await page.screenshot({ path: "test-results/editor-dark.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "3D", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sources", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Source review" })).toBeVisible();
  await page.screenshot({ path: "test-results/editor-mobile.png" });
});
