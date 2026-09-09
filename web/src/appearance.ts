import { getPreference, setPreference } from "./offline";

export type Appearance = "system" | "light" | "dark";
export const APPEARANCE_CACHE_KEY = "turnright:appearance";
const isAppearance = (value: unknown): value is Appearance =>
  value === "system" || value === "light" || value === "dark";

function cachedAppearance(): Appearance | null {
  try {
    const value = window.localStorage.getItem(APPEARANCE_CACHE_KEY);
    return isAppearance(value) ? value : null;
  } catch {
    return null;
  }
}

function cacheAppearance(value: Appearance) {
  try {
    window.localStorage.setItem(APPEARANCE_CACHE_KEY, value);
    return true;
  } catch {
    return false;
  }
}

function applyAppearance(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  document.documentElement.style.backgroundColor = dark ? "#202a36" : "#ffffff";
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content", dark ? "#202a36" : "#ffffff",
  );
}

export function createAppearanceStore() {
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  let preference: Appearance = cachedAppearance() ?? "system";
  let snapshot = { preference, dark: preference === "dark" || (preference === "system" && !!media?.matches) };
  let revision = 0;
  let writes = Promise.resolve(true);
  const listeners = new Set<() => void>();

  function update(next: Appearance) {
    preference = next;
    const dark = next === "dark" || (next === "system" && !!media?.matches);
    applyAppearance(dark);
    if (snapshot.preference === next && snapshot.dark === dark) return;
    snapshot = { preference: next, dark };
    listeners.forEach((listener) => listener());
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    start() {
      let stopped = false;
      const initialRevision = revision;
      update(preference);
      const systemChanged = () => update(preference);
      const storageChanged = (event: StorageEvent) => {
        if (event.key !== APPEARANCE_CACHE_KEY && event.key !== null) return;
        revision++;
        update(isAppearance(event.newValue) ? event.newValue : "system");
      };
      if (media?.addEventListener) media.addEventListener("change", systemChanged);
      else media?.addListener(systemChanged);
      window.addEventListener("storage", storageChanged);

      // Preserve explicit choices made before the Device option existed. A
      // missing legacy value is different from a saved choice of light mode.
      if (cachedAppearance() === null) {
        void (async () => {
          const stored = await getPreference<unknown>("appearance", null);
          const legacy = isAppearance(stored) ? null : await getPreference<unknown>("dark", null);
          if (stopped || revision !== initialRevision) return;
          const next = isAppearance(stored) ? stored :
            typeof legacy === "boolean" ? (legacy ? "dark" : "light") : "system";
          update(next);
          cacheAppearance(next);
        })();
      }
      return () => {
        stopped = true;
        if (media?.removeEventListener) media.removeEventListener("change", systemChanged);
        else media?.removeListener(systemChanged);
        window.removeEventListener("storage", storageChanged);
      };
    },
    setPreference(next: Appearance) {
      if (!isAppearance(next)) return Promise.resolve(false);
      revision++;
      update(next);
      const cached = cacheAppearance(next);
      // Serialize writes so rapid choices cannot persist in the wrong order.
      writes = writes.then(async () => {
        try {
          await setPreference("appearance", next);
          return true;
        } catch {
          return cached;
        }
      });
      return writes;
    },
  };
}
