import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { createAppearanceStore } from "./appearance";

export function useAppearance() {
  const [store] = useState(createAppearanceStore);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useLayoutEffect(() => store.start(), [store]);
  return { ...snapshot, setAppearance: store.setPreference };
}
