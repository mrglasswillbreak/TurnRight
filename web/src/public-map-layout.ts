// Keep places, routes and the followed location in the portion of the map
// exposed by the movable public panel, including above the phone keyboard.
export function publicMapPadding(container: HTMLElement) {
  const map = container.getBoundingClientRect();
  const panel = container
    .closest('.app-shell')
    ?.querySelector('.explore-panel')
    ?.getBoundingClientRect();
  const padding = { top: 76, right: 24, bottom: 32, left: 24 };
  if (panel) {
    if (map.width >= 900 && panel.height > 180)
      padding.left = Math.max(24, panel.right - map.left + 20);
    else padding.bottom = Math.max(32, map.bottom - panel.top + 20);
  }
  for (const [a, b, size] of [
    ['left', 'right', map.width],
    ['top', 'bottom', map.height],
  ] as const) {
    const scale = Math.min(
      1,
      Math.max(0, size - 100) / (padding[a] + padding[b]),
    );
    padding[a] *= scale;
    padding[b] *= scale;
  }
  return padding;
}
