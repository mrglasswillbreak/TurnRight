import { test, expect } from './coverage-fixture';
import { setup } from './editor-fixture';
import { attachMap, clickMap } from './editor-map-helpers';
import { unifiedModelFixture } from './editor-model-helpers';

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
});

test('public building handoff waits for a recovered drawing', async ({
  page,
}) => {
  await setup(page);
  await page.getByRole('button', { name: 'Draw path', exact: true }).click();
  await clickMap(page, [3.2002, 6.4602]);
  await page.waitForTimeout(400);
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/admin?building=library');
  await expect(
    page.getByText('Unfinished drawing recovered', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Finish or discard the recovered drawing/),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Edit model', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Discard drawing', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Edit model', exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/admin$/);
});

test('editor handoff survives a sign-in return and reports unavailable buildings', async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() =>
    sessionStorage.setItem('turnright:editor-building-handoff', 'library'),
  );
  await page.goto('/admin');
  await attachMap(page);
  await expect(
    page
      .getByRole('complementary', { name: 'Feature properties', exact: true })
      .getByRole('heading', { name: 'Library', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Edit model', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('turnright:editor-building-handoff'),
    ),
  ).toBeNull();
  await page.goto('/admin?building=missing');
  await expect(
    page.getByText(/building selected on the public map is unavailable/),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Edit model', exact: true }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(/\/admin$/);
});

test('model file workers round trip GLB glTF OBJ and STL without external requests', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { dialog, server } = await unifiedModelFixture(page, {
    prepareWall: false,
  });
  await dialog.getByRole('button', { name: 'Mesh', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Add primitive', exact: true })
    .click();
  await expect
    .poll(
      () =>
        server.edits().find((e) => e.id === 'library')?.properties.modelDocument
          ?.objects.length,
    )
    .toBe(1);
  const document = server.edits().find((e) => e.id === 'library')!
    .properties.modelDocument!;
  const results = await page.evaluate(async (document) => {
    const { modelFileTask } = await import('/src/model-file-client.ts');
    const source = structuredClone(document),
      canvas = globalThis.document.createElement('canvas');
    canvas.width = canvas.height = 8;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 4, 8);
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(4, 0, 4, 8);
    source.images.push({
      id: 'test-image',
      name: 'Two colours',
      mime: 'image/png',
      data: canvas.toDataURL().split(',')[1],
    });
    source.materials[1].baseMap = 'test-image';
    source.materials[1].roughnessMap = 'test-image';
    source.materials[1].metalnessMap = 'test-image';
    const results = [];
    for (const format of ['glb', 'gltf', 'obj', 'stl'] as const) {
      const files = await modelFileTask(
        {
          kind: 'export',
          document: source,
          options: { format, scale: 1, up: 'z' },
        },
        new AbortController().signal,
      );
      const imported = await modelFileTask(
        { kind: 'import', files, primary: files[0].name },
        new AbortController().signal,
      );
      results.push({
        format,
        faces: imported.faces,
        dimensions: imported.dimensions,
        images: imported.document.images.length,
        pbr: imported.document.materials.some(
          (m: { roughnessMap?: string; metalnessMap?: string }) =>
            m.roughnessMap && m.metalnessMap,
        ),
        missing: imported.missing,
      });
    }
    return results;
  }, document);
  for (const result of results) {
    expect(result.faces).toBe(12);
    expect(
      result.dimensions.every((n: number) => Math.abs(n - 4) < 0.001),
    ).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.images).toBe(
      result.format === 'stl' ? 0 : result.format === 'obj' ? 1 : 2,
    );
    expect(result.pbr).toBe(
      result.format === 'glb' || result.format === 'gltf',
    );
  }
});

test('model import preview adds one undoable object and survives save and reopen', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const { dialog, server } = await unifiedModelFixture(page, {
    prepareWall: false,
  });
  await dialog.getByRole('button', { name: 'Mesh', exact: true }).click();
  await dialog.getByText('Import and export', { exact: true }).click();
  await dialog.getByLabel('Model and companion files').setInputFiles({
    name: 'triangle.obj',
    mimeType: 'text/plain',
    buffer: Buffer.from('o Canopy\nv 0 0 8\nv 4 0 8\nv 0 4 8\nf 1 2 3'),
  });
  await dialog
    .getByRole('button', { name: 'Inspect import', exact: true })
    .click();
  await expect(dialog.getByText(/3 vertices · 1 faces/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Preview on building' }).click();
  await page.screenshot({ path: info.outputPath('model-import-preview.png') });
  await dialog.getByRole('button', { name: 'Add imported model' }).click();
  const doc = () =>
    server.edits().find((e) => e.id === 'library')?.properties.modelDocument;
  await expect.poll(() => doc()?.objects.length).toBe(1);
  expect(doc()!.objects[0].name).toBe('Canopy');
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => doc()?.objects.length || 0).toBe(0);
  await dialog.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect.poll(() => doc()?.objects.length).toBe(1);
  await dialog
    .getByRole('button', { name: 'Back to map', exact: true })
    .click();
  await page.getByRole('button', { name: 'Edit model', exact: true }).click();
  await dialog.getByRole('button', { name: 'Mesh', exact: true }).click();
  await expect(
    dialog.getByRole('combobox', { name: 'Model object', exact: true }),
  ).toContainText('Canopy');
  await dialog.getByText('Import and export', { exact: true }).click();
  await dialog
    .getByRole('combobox', { name: 'Export format', exact: true })
    .selectOption('stl');
  await dialog
    .getByRole('button', { name: 'Prepare export', exact: true })
    .click();
  await expect(
    dialog.getByRole('link', { name: /Download .*stl/ }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('model-export.png') });
});

test('mesh components use the mounted model, commit one command, and undo', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const { dialog, server } = await unifiedModelFixture(page, {
    prepareWall: false,
  });
  await dialog.getByRole('button', { name: 'Mesh', exact: true }).click();
  const canvas = await dialog
    .locator('.photo-model-canvas canvas')
    .elementHandle();
  await dialog
    .getByRole('button', { name: 'Add primitive', exact: true })
    .click();
  const doc = () =>
    server.edits().find((e) => e.id === 'library')?.properties.modelDocument;
  await expect.poll(() => doc()?.objects.length).toBe(1);
  const original = JSON.stringify(doc()!.objects[0].vertices);
  await dialog
    .getByRole('combobox', { name: 'Mesh selection', exact: true })
    .selectOption('face');
  await dialog
    .getByRole('combobox', { name: /^Mesh component/ })
    .selectOption({ index: 1 });
  await dialog
    .getByRole('button', { name: 'Extrude faces', exact: true })
    .click();
  await expect
    .poll(() => JSON.stringify(doc()?.objects[0].vertices))
    .not.toBe(original);
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect
    .poll(() => JSON.stringify(doc()?.objects[0].vertices))
    .toBe(original);
  await dialog.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect
    .poll(() => JSON.stringify(doc()?.objects[0].vertices))
    .not.toBe(original);
  await dialog
    .getByRole('button', { name: 'Edit surface', exact: true })
    .click();
  expect(
    await canvas!.evaluate(
      (el) => el === document.querySelector('.photo-model-canvas canvas'),
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath('mesh-editing.png') });
  await dialog.getByRole('button', { name: 'Orbit', exact: true }).click();
  await dialog
    .getByRole('combobox', { name: 'Mesh selection', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('mesh-orbit.png') });
});

test('campus layer zoom limits survive building presentation changes', async ({
  page,
}) => {
  await setup(page);
  const filter = () =>
    page.evaluate(() =>
      JSON.stringify(window.editorTestMap.getFilter('buildings-3d')),
    );
  await expect.poll(filter).toContain('mapStyle_minZoom');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Building opacity', { exact: true }).fill('0.35');
  await expect.poll(filter).toContain('mapStyle_minZoom');
});
