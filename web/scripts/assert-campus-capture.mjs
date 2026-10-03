import assert from 'node:assert/strict';
import sharp from 'sharp';

/** Real LASU/UNILAG acceptance: inspect the map, excluding header and controls. */
export async function assertCampusCapture(bytes, name = 'campus capture') {
  const { width, height } = await sharp(bytes).metadata();
  const pixels = await sharp(bytes).extract({
    left: Math.floor(width * 0.2),
    top: Math.floor(height * 0.2),
    width: Math.floor(width * 0.6),
    height: Math.floor(height * 0.4),
  }).removeAlpha().resize(128, 128).raw().toBuffer();
  const colours = new Set();
  for (let i = 0; i < pixels.length; i += 3)
    colours.add((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2]);
  assert(colours.size > 50, `${name}: map capture is blank or missing detail (${colours.size} colours)`);
  return colours.size;
}
