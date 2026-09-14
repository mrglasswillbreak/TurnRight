import fs from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
const files = (await fs.readdir('dist/assets')).filter((file) =>
  /^campus-model-layer-.*\.js$/.test(file),
);
if (files.length !== 1)
  throw new Error('Expected one lazy campus model renderer chunk');
const bytes = gzipSync(await fs.readFile(`dist/assets/${files[0]}`)).length;
if (bytes > 300 * 1024)
  throw new Error(`Lazy 3D renderer exceeds 300 KB gzip: ${bytes} bytes`);
console.log(
  `Lazy 3D renderer: ${(bytes / 1024).toFixed(1)} KB gzip / 300 KB budget`,
);
