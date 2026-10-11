import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const publicDir = new URL('../public/', import.meta.url);
const brandDir = new URL('../../docs/assets/brand/', import.meta.url);
await mkdir(brandDir, { recursive: true });
// Selected B2 geometry shared with BrandMark: the turning route and academic cap.
const mark = (mono = '') =>
  `<path d="M31.5 77V48A14 14 0 0 1 45.5 34H68" fill="none" stroke="${mono || '#72BAFF'}" stroke-width="12" stroke-linecap="round"/><path d="M84 34L60 20L66.5 34L60 48Z" fill="${mono || '#A4D5FF'}" stroke="${mono || '#A4D5FF'}" stroke-width=".8" stroke-linejoin="round"/><g fill="${mono || '#A4D5FF'}"><path d="M49.5 62L64.5 55L79.5 62L64.5 69Z"/><path d="M54.5 68.5L64.5 73.2L74.5 68.5V74.5Q64.5 80.5 54.5 74.5Z"/><path d="M78.8 65V75" fill="none" stroke="${mono || '#A4D5FF'}" stroke-width="2.6" stroke-linecap="round"/></g>`;
const tile = (maskable = false) =>
  `<rect width="100" height="100" rx="${maskable ? 0 : 22}" fill="#202A36"/>${mark()}`;
const svg = (content) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 100 100">${content}</svg>\n`;
const icon = svg(tile());
// The complete mark fits the central 40% radius. Platform masks only crop the
// full-bleed background; there is no second rounded tile or extra scaling.
const maskableIcon = svg(tile(true));
await writeFile(new URL('icon.svg', publicDir), icon);
await writeFile(new URL('favicon.svg', publicDir), icon);
for (const [name, content] of [
  ['symbol', tile()],
  ['symbol-mono', mark('#172C25')],
  ['symbol-reversed', mark('#FFFFFF')],
])
  await writeFile(new URL(`${name}.svg`, brandDir), svg(content));
for (const [name, color, content] of [
  ['wordmark', '#172C25', tile()],
  ['wordmark-mono', '#172C25', mark('#172C25')],
  ['wordmark-reversed', '#FFFFFF', mark('#FFFFFF')],
]) {
  await writeFile(
    new URL(`${name}.svg`, brandDir),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 330 76" role="img" aria-label="TurnRight"><g transform="translate(4 6) scale(.64)">${content}</g><text x="84" y="51" fill="${color}" font-family="Inter,Arial,sans-serif" font-size="43" font-weight="700" letter-spacing="-1.8">TurnRight</text></svg>\n`,
  );
}
for (const size of [16, 32, 192, 512])
  await sharp(Buffer.from(icon))
    .resize(size, size)
    .png()
    .toFile(fileURLToPath(new URL(`icon-${size}.png`, publicDir)));
await sharp(Buffer.from(maskableIcon))
  .resize(180, 180)
  .png()
  .toFile(fileURLToPath(new URL('apple-touch-icon.png', publicDir)));
for (const size of [192, 512])
  await sharp(Buffer.from(maskableIcon))
    .resize(size, size)
    .png()
    .toFile(fileURLToPath(new URL(`icon-maskable-${size}.png`, publicDir)));
