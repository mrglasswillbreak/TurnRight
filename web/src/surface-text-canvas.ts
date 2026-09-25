import type { SurfaceTextRecipe } from './visual-types';

/** Plain text only; fonts and glyphs are rendered locally, including offline. */
export function surfaceTextPixels(recipe: SurfaceTextRecipe) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(32, Math.round(512 * Math.min(1, recipe.aspect)));
  canvas.height = Math.max(32, Math.round(512 / Math.max(1, recipe.aspect)));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Text rendering unavailable');
  const lines = recipe.text.split('\n'),
    weight = recipe.weight === 'bold' ? 700 : 400;
  let size = canvas.height / (lines.length * 1.2);
  context.font = `${weight} ${size}px "Inter Variable", Inter, sans-serif`;
  const widest = Math.max(
    ...lines.map((line) => context.measureText(line).width),
    1,
  );
  size *= Math.min(1, (canvas.width * 0.94) / widest);
  context.font = `${weight} ${size}px "Inter Variable", Inter, sans-serif`;
  context.fillStyle = recipe.colour;
  context.textAlign = recipe.align;
  context.textBaseline = 'middle';
  const x =
    recipe.align === 'left'
      ? canvas.width * 0.03
      : recipe.align === 'right'
        ? canvas.width * 0.97
        : canvas.width / 2;
  lines.forEach((line, i) =>
    context.fillText(
      line,
      x,
      canvas.height / 2 + (i - (lines.length - 1) / 2) * size * 1.2,
    ),
  );
  return context.getImageData(0, 0, canvas.width, canvas.height);
}
