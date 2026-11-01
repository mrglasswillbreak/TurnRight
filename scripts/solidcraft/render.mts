import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { archive, repository, sha256 } from './inventory.mjs';

const inventory = JSON.parse(
  await fs.readFile(
    path.join(repository, 'data/lasu-models/inventory.json'),
    'utf8',
  ),
);
const targets = inventory.buildings.filter((b: { id: string; slug: string }) =>
  process.argv
    .slice(2)
    .some((arg) => arg === b.slug || b.id.endsWith(':' + arg)),
);
const server = await createServer({
  configFile: false,
  cacheDir: path.join(archive, '.vite-render'),
  root: path.join(repository, 'web'),
  logLevel: 'error',
  optimizeDeps: {
    entries: ['src/model-file-export.ts', 'src/model-render-export.ts'],
  },
  server: {
    host: '127.0.0.1',
    port: 0,
    hmr: false,
    watch: { ignored: ['**/work/**', '**/test-results/**'] },
  },
  plugins: [
    {
      name: 'model-review',
      resolveId(id) {
        if (id === '/__verify.ts')
          return path.join(
            repository,
            'scripts/solidcraft/render-verification.ts',
          );
      },
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url === '/__render') {
            response.setHeader('Content-Type', 'text/html');
            response.end(
              '<!doctype html><title>TurnRight building review</title>',
            );
            return;
          }
          const building = targets.find(
            (b: { slug: string }) => request.url === `/__model/${b.slug}`,
          );
          if (!building) {
            next();
            return;
          }
          response.setHeader('Content-Type', 'application/json');
          void fs
            .readFile(path.join(archive, building.slug, 'turnright.model.json'))
            .then(
              (bytes) => response.end(bytes),
              () => {
                response.statusCode = 404;
                response.end();
              },
            );
        });
      },
    },
  ],
});
await server.listen();
const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});
try {
  for (const building of targets) {
    const directory = path.join(archive, building.slug),
      page = await browser.newPage();
    const recipe = JSON.parse(
      await fs.readFile(path.join(directory, 'recipe.json'), 'utf8'),
    );
    const sourceDocumentSha256 = sha256(
      await fs.readFile(path.join(directory, 'turnright.model.json')),
    );
    await fs.mkdir(path.join(directory, 'renders'), { recursive: true });
    // tsx retains nested function names when serializing a Playwright callback.
    await page.addInitScript('globalThis.__name = (value) => value;');
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) =>
      console.log(building.slug + ': ' + message.text().slice(0, 300)),
    );
    page.setDefaultTimeout(180000);
    await page.exposeFunction(
      'saveArtifact',
      async (name: string, base64: string) => {
        if (
          !/^(model\.glb|renders\/(north|east|south|west|roof|oblique-ne|oblique-sw|reference-front)\.png)$/.test(
            name,
          )
        )
          throw new Error('Invalid artifact name.');
        await fs.writeFile(
          path.join(directory, name),
          Buffer.from(base64, 'base64'),
        );
        console.log(`${building.slug}: ${name}`);
      },
    );
    await page.goto(`${server.resolvedUrls!.local[0]}__render`);
    const result = await page.evaluate(
      async ({ slug, direction }) => {
        // The real application exporter and material renderer run in a browser.
        const [
          { exportModel },
          { createModelRenderExport, MODEL_RENDER_VIEWS },
        ] = await Promise.all([
          import('/src/model-file-export.ts'),
          import('/src/model-render-export.ts'),
        ]);
        const document = await (await fetch(`/__model/${slug}`)).json();
        const save = async (name: string, bytes: ArrayBuffer) => {
          const data = new Uint8Array(bytes);
          let raw = '';
          for (let i = 0; i < data.length; i += 8192)
            raw += String.fromCharCode(...data.subarray(i, i + 8192));
          await (
            window as unknown as {
              saveArtifact: (name: string, data: string) => Promise<void>;
            }
          ).saveArtifact(name, btoa(raw));
        };
        const started = performance.now();
        console.log('Exporting GLB');
        const files = await exportModel(document, {
          format: 'glb',
          scale: 1,
          up: 'y',
        });
        console.log('Checking GLB');
        const verifierPath = '/__verify.ts';
        const { verifyGLB } = await import(verifierPath);
        const error = await verifyGLB(files[0].data, document);
        await save('model.glb', files[0].data);
        const exporter = await createModelRenderExport(document, [], 2400);
        try {
          for (const view of MODEL_RENDER_VIEWS)
            await save(
              `renders/${view}.png`,
              await (await exporter.render(view)).arrayBuffer(),
            );
          if (direction)
            await save(
              'renders/reference-front.png',
              await (await exporter.render('west', direction)).arrayBuffer(),
            );
        } finally {
          exporter.dispose();
        }
        return {
          elapsedMs: performance.now() - started,
          glbConversionErrorMetres: error,
          embeddedTextures: document.images.length,
          userAgent: navigator.userAgent,
          renderer: 'Chromium SwiftShader; not a physical-device benchmark',
        };
      },
      { slug: building.slug, direction: recipe.referenceDirection },
    );
    if (errors.length) throw new Error(errors.join('\n'));
    await fs.writeFile(
      path.join(directory, 'render-verification.json'),
      JSON.stringify({ ...result, sourceDocumentSha256 }, null, 2),
    );
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
