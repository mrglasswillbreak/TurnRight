import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { APPEARANCE_CACHE_KEY, createAppearanceStore } from "../src/appearance";
import { getPreference, setPreference } from "../src/offline";

vi.mock("../src/offline", () => ({
  getPreference: vi.fn(async () => null),
  setPreference: vi.fn(async () => {}),
}));

let cache: Map<string, string>;
let systemListeners: Set<() => void>;
let storageListeners: Set<(event: { key: string | null; newValue: string | null }) => void>;
let media: { matches: boolean; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };
let root: { classList: { toggle: ReturnType<typeof vi.fn> }; style: Record<string, string> };
let themeColor: ReturnType<typeof vi.fn>;
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

beforeEach(() => {
  vi.mocked(getPreference).mockReset().mockResolvedValue(null);
  vi.mocked(setPreference).mockReset().mockResolvedValue();
  cache = new Map();
  systemListeners = new Set();
  storageListeners = new Set();
  media = {
    matches: true,
    addEventListener: vi.fn((_event, listener) => systemListeners.add(listener)),
    removeEventListener: vi.fn((_event, listener) => systemListeners.delete(listener)),
  };
  root = { classList: { toggle: vi.fn() }, style: {} };
  themeColor = vi.fn();
  vi.stubGlobal("document", {
    documentElement: root,
    querySelector: () => ({ setAttribute: themeColor }),
  });
  vi.stubGlobal("window", {
    matchMedia: vi.fn(() => media),
    localStorage: {
      getItem: (key: string) => cache.get(key) ?? null,
      setItem: (key: string, value: string) => cache.set(key, value),
    },
    addEventListener: (_event: string, listener: (event: { key: string | null; newValue: string | null }) => void) => storageListeners.add(listener),
    removeEventListener: (_event: string, listener: (event: { key: string | null; newValue: string | null }) => void) => storageListeners.delete(listener),
  });
});
afterEach(() => vi.unstubAllGlobals());

function changeSystem(dark: boolean) {
  media.matches = dark;
  systemListeners.forEach((listener) => listener());
}

describe("device appearance", () => {
  it("starts with the device setting, responds live and cleans up subscriptions", async () => {
    const store = createAppearanceStore(), notify = vi.fn();
    const unsubscribe = store.subscribe(notify), stop = store.start();
    await settle();
    expect(store.getSnapshot()).toEqual({ preference: "system", dark: true });
    changeSystem(false);
    expect(store.getSnapshot()).toEqual({ preference: "system", dark: false });
    expect(root.style.colorScheme).toBe("light");
    expect(themeColor).toHaveBeenLastCalledWith("content", "#ffffff");
    expect(notify).toHaveBeenCalledOnce();
    unsubscribe(); stop();
    expect(systemListeners.size).toBe(0);
    expect(storageListeners.size).toBe(0);
  });

  it("preserves manual overrides across device changes and reopening, then resumes Device", async () => {
    const store = createAppearanceStore();
    store.start();
    await store.setPreference("light");
    changeSystem(false); changeSystem(true);
    expect(store.getSnapshot().dark).toBe(false);
    const reopened = createAppearanceStore();
    expect(reopened.getSnapshot()).toEqual({ preference: "light", dark: false });
    await store.setPreference("system");
    expect(store.getSnapshot()).toEqual({ preference: "system", dark: true });
    expect(setPreference).toHaveBeenLastCalledWith("appearance", "system");
  });

  it.each([true, false])("migrates the explicit legacy dark=%s choice", async (legacy) => {
    vi.mocked(getPreference).mockImplementation(async (key) => key === "dark" ? legacy : null);
    const store = createAppearanceStore();
    store.start(); await settle();
    expect(store.getSnapshot()).toEqual({ preference: legacy ? "dark" : "light", dark: legacy });
    expect(cache.get(APPEARANCE_CACHE_KEY)).toBe(legacy ? "dark" : "light");
  });

  it("restores an IndexedDB appearance when the synchronous cache is missing", async () => {
    vi.mocked(getPreference).mockResolvedValue("light");
    const store = createAppearanceStore();
    store.start(); await settle();
    expect(store.getSnapshot()).toEqual({ preference: "light", dark: false });
    expect(getPreference).not.toHaveBeenCalledWith("dark", null);
  });

  it("does not let slow legacy hydration overwrite a newer user choice", async () => {
    let resolve!: (value: unknown) => void;
    vi.mocked(getPreference).mockImplementation(() => new Promise((done) => { resolve = done; }));
    const store = createAppearanceStore();
    store.start();
    await store.setPreference("light");
    resolve("dark"); await settle();
    expect(store.getSnapshot()).toEqual({ preference: "light", dark: false });
  });

  it("survives blocked storage and missing matchMedia without losing session controls", async () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia;
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.mocked(setPreference).mockRejectedValue(new Error("quota"));
    const store = createAppearanceStore();
    const stop = store.start();
    expect(store.getSnapshot().dark).toBe(false);
    expect(await store.setPreference("dark")).toBe(false);
    expect(store.getSnapshot().dark).toBe(true);
    stop();
  });

  it("syncs tab changes, ignores unrelated preferences and resets to Device on clear", async () => {
    const store = createAppearanceStore();
    store.start(); await settle();
    for (const listener of storageListeners) listener({ key: APPEARANCE_CACHE_KEY, newValue: "light" });
    expect(store.getSnapshot().dark).toBe(false);
    for (const listener of storageListeners) listener({ key: "unrelated", newValue: "dark" });
    expect(store.getSnapshot().dark).toBe(false);
    for (const listener of storageListeners) listener({ key: null, newValue: null });
    expect(store.getSnapshot()).toEqual({ preference: "system", dark: true });
  });

  it("serializes rapid preference writes so the final choice wins", async () => {
    const saved: unknown[] = [];
    vi.mocked(setPreference).mockImplementation(async (_key, value) => {
      await new Promise((resolve) => setTimeout(resolve, value === "dark" ? 15 : 0));
      saved.push(value);
    });
    const store = createAppearanceStore();
    await Promise.all([store.setPreference("dark"), store.setPreference("light"), store.setPreference("system")]);
    expect(saved).toEqual(["dark", "light", "system"]);
    expect(cache.get(APPEARANCE_CACHE_KEY)).toBe("system");
  });

  it.each([
    [null, true, true], [null, false, false], ["light", true, false],
    ["dark", false, true], ["invalid", true, true],
  ])("sets the initial page theme before React for saved=%s device=%s", (saved, device, expected) => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
    const context = {
      document,
      localStorage: { getItem: () => saved },
      window: { matchMedia: () => ({ matches: device }) },
    };
    runInNewContext(script, context);
    expect(root.classList.toggle).toHaveBeenLastCalledWith("dark", expected);
    expect(root.style.colorScheme).toBe(expected ? "dark" : "light");
  });
});
