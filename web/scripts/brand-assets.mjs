import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
const publicDir = new URL('../public/', import.meta.url);
const brandDir = new URL('../../docs/assets/brand/', import.meta.url);
await mkdir(brandDir, { recursive: true });
// Native SVG geometry shared with BrandMark: the offline tile's grid and route.
const tile = (mono = '') =>
  `<rect width="42" height="42" rx="9" fill="${mono || '#202a36'}"/><path d="M0 14h42M0 29h42M13 0v42M30 0v42" stroke="${mono ? '#ffffff' : '#43535e'}" stroke-opacity="${mono ? '.25' : '1'}" stroke-width="5"/><rect x=".5" y=".5" width="41" height="41" rx="8.5" fill="none" stroke="${mono ? '#ffffff' : '#627582'}" stroke-opacity=".5"/><path d="M13 37V18q0-4 4-4h13" fill="none" stroke="${mono ? '#ffffff' : '#72baff'}" stroke-width="3.2" stroke-linecap="round"/><path d="m37 14-12-6 3 6-3 6Z" fill="${mono ? '#ffffff' : '#a4d5ff'}" stroke="${mono || '#202a36'}" stroke-width="1.4" stroke-linejoin="round"/>`;
const monoTile = (color) =>
  `<rect x="1" y="1" width="40" height="40" rx="8" fill="none" stroke="${color}" stroke-width="2"/><path d="M13 36V18q0-4 4-4h13" fill="none" stroke="${color}" stroke-width="3.2" stroke-linecap="round"/><path d="m37 14-12-6 3 6-3 6Z" fill="${color}"/>`;
const svg = (content, maskable = false) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 42 42">${maskable ? `<rect width="42" height="42" fill="#202a36"/><g transform="translate(6.3 6.3) scale(.7)">${content}</g>` : content}</svg>\n`;
const icon = svg(tile());
await writeFile(new URL('icon.svg', publicDir), icon);
await writeFile(new URL('favicon.svg', publicDir), icon);
for (const [name, content] of [
  ['symbol', tile()],
  ['symbol-mono', monoTile('#172c25')],
  ['symbol-reversed', monoTile('#ffffff')],
])
  await writeFile(new URL(`${name}.svg`, brandDir), svg(content));
for (const [name, color, content] of [
  ['wordmark', '#172c25', tile()],
  ['wordmark-mono', '#172c25', monoTile('#172c25')],
  ['wordmark-reversed', '#ffffff', monoTile('#ffffff')],
]) {
  await writeFile(
    new URL(`${name}.svg`, brandDir),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 330 76" role="img" aria-label="TurnRight"><g transform="translate(4 6) scale(1.524)">${content}</g><text x="84" y="51" fill="${color}" font-family="Inter,Arial,sans-serif" font-size="43" font-weight="700" letter-spacing="-1.8">TurnRight</text></svg>\n`,
  );
}
for (const size of [16, 32, 192, 512])
  await sharp(Buffer.from(icon))
    .resize(size, size)
    .png()
    .toFile(
      new URL(`icon-${size}.png`, publicDir).pathname.replace(/^\/(\w:)/, '$1'),
    );
await sharp(Buffer.from(icon))
  .resize(180, 180)
  .flatten({ background: '#202a36' })
  .png()
  .toFile(
    new URL('apple-touch-icon.png', publicDir).pathname.replace(
      /^\/(\w:)/,
      '$1',
    ),
  );
for (const size of [192, 512])
  await sharp(Buffer.from(svg(tile(), true)))
    .resize(size, size)
    .png()
    .toFile(
      new URL(`icon-maskable-${size}.png`, publicDir).pathname.replace(
        /^\/(\w:)/,
        '$1',
      ),
    );
