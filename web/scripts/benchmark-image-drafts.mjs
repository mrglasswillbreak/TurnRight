import { chromium } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

// Uses isolated browser storage and fixture bytes, never owner photos or credentials.
await mkdir('work', { recursive: true });
const baseline = execFileSync(
  'git',
  ['show', 'c504979:web/src/photo-local.ts'],
  { encoding: 'utf8' },
)
  .replace("'./campus-context'", "'../src/campus-context'")
  .replaceAll('turnright-local-images', 'audit-baseline-images');
await writeFile('work/audit-photo-local-baseline.ts', baseline);
await writeFile(
  'work/image-storage-bench.html',
  '<!doctype html><title>Isolated image storage benchmark</title>',
);
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    '--host',
    '127.0.0.1',
    '--port',
    '5196',
    '--strictPort',
  ],
  { stdio: 'ignore', windowsHide: true },
);
let browser;
try {
  const deadline = Date.now() + 30000;
  while (true) {
    try {
      if (
        (await fetch('http://127.0.0.1:5196/work/image-storage-bench.html')).ok
      )
        break;
    } catch {}
    if (Date.now() > deadline) throw Error('Benchmark server did not start');
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  browser = await chromium.launch({ headless: true });
  const runs = [];
  for (let run = 0; run < 5; run++) {
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:5196/work/image-storage-bench.html');
    const result = await page.evaluate(async () => {
      const oldPath = '/work/audit-photo-local-baseline.ts',
        newPath = '/src/photo-local.ts',
        recipePath = '/src/photo-edit.ts';
      const [old, next, recipe] = await Promise.all([
        import(oldPath),
        import(newPath),
        import(recipePath),
      ]);
      const data = new Uint8Array(2 * 1024 * 1024);
      for (let offset = 0; offset < data.length; offset += 65536)
        crypto.getRandomValues(data.subarray(offset, offset + 65536));
      const source = new Blob([data], { type: 'image/png' }),
        owner = crypto.randomUUID();
      const first = {
        id: '0',
        owner,
        target: 'building:0',
        filename: 'Fixture',
        source,
        recipe: recipe.defaultPhotoRecipe(),
        metadata: {},
        updated: 0,
      };
      for (let i = 0; i < 8; i++) {
        const p = { ...first, id: String(i), target: `building:${i}` };
        await old.saveLocalPhoto(owner, p);
        await next.saveLocalPhoto(owner, p);
      }
      const samples = {};
      for (const [label, api] of [
        ['before', old],
        ['after', next],
      ]) {
        const start = performance.now();
        const gallery =
          label === 'before'
            ? (await api.localPhotos(owner)).filter(
                (p) => p.target === first.target,
              )
            : await api.localPhotos(owner, first.target);
        const readMs = performance.now() - start,
          writes = [];
        let binaryWriteBytes = 0;
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (value, ...args) {
          binaryWriteBytes +=
            value.sourceBytes?.byteLength || value.bytes?.byteLength || 0;
          return put.call(this, value, ...args);
        };
        try {
          for (let i = 0; i < 20; i++) {
            const changed = { ...first.recipe, quality: 0.5 + i / 100 },
              at = performance.now();
            if (label === 'before')
              await api.saveLocalPhoto(owner, { ...first, recipe: changed });
            else
              await api.updateLocalPhoto(
                owner,
                first.id,
                { recipe: changed },
                true,
              );
            writes.push(performance.now() - at);
          }
        } finally {
          IDBObjectStore.prototype.put = put;
        }
        samples[label] = {
          readMs,
          galleryCount: gallery.length,
          writes,
          binaryWriteBytes,
        };
      }
      return samples;
    });
    runs.push(result);
    await page.close();
  }
  const report = {
    measuredAt: new Date().toISOString(),
    baseline: 'c504979',
    sourceBytes: 2 * 1024 * 1024,
    galleryImages: 8,
    edits: 20,
    runs,
  };
  await writeFile(
    'work/image-storage-performance.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  server.kill();
}
