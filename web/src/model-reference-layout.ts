export const referenceFits = (width: number, height: number) =>
  width >= 720 && height >= 320;

export function referenceModelWidth(width: number, fraction: number) {
  return Math.max(420, Math.min(width - 292, width * fraction));
}
