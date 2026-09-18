export function sheetLimits(
  viewportHeight: number,
  minimum: number,
  topClearance = 32,
  fullHeight = false,
  focusContent = false,
) {
  const max = Math.max(
    80,
    Math.min(
      viewportHeight - (focusContent ? 32 : topClearance),
      viewportHeight * (fullHeight || focusContent ? 1 : 0.88),
    ),
  );
  return { min: Math.min(minimum, max), max };
}

export function clampSheetHeight(height: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(height) ? height : min));
}

export function resizeSheetKey(
  key: string,
  height: number,
  min: number,
  max: number,
) {
  if (key === 'Home') return min;
  if (key === 'End') return max;
  if (key === 'ArrowUp') return clampSheetHeight(height + 32, min, max);
  if (key === 'ArrowDown') return clampSheetHeight(height - 32, min, max);
  return null;
}

export function sheetViewport(
  layoutHeight: number,
  visual?: { height: number; offsetTop: number } | null,
) {
  return {
    height: visual?.height ?? layoutHeight,
    bottom: Math.max(
      0,
      layoutHeight - (visual ? visual.height + visual.offsetTop : layoutHeight),
    ),
  };
}
