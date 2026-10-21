import { test, expect } from './coverage-fixture';
import { unifiedModelFixture } from './editor-model-helpers';

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
});

test('surface workspace roof and footprint share aligned model and precision controls', async ({
  page,
}, info) => {
  const { server, dialog } = await unifiedModelFixture(page);
  await dialog.getByRole('treeitem', { name: 'Roof', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Create custom roof', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'Edit surface', exact: true })
    .click();
  await expect(dialog.locator('.photo-model-canvas')).toHaveAttribute(
    'data-projection',
    'roof',
  );
  await page.screenshot({ path: info.outputPath('model-roof-surface.png') });
  await dialog
    .getByRole('treeitem', { name: 'Footprint', exact: true })
    .click();
  await expect(dialog.locator('.photo-model-canvas')).toHaveAttribute(
    'data-projection',
    'footprint',
  );
  const before = JSON.stringify(
    server.edits().find((e) => e.id === 'library')!.geometry,
  );
  const vertex = dialog.locator('[data-outline-vertex="0:0:0"]');
  const b = (await vertex.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 - 12, b.y + b.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  await expect
    .poll(() =>
      JSON.stringify(server.edits().find((e) => e.id === 'library')!.geometry),
    )
    .not.toBe(before);
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect
    .poll(() =>
      JSON.stringify(server.edits().find((e) => e.id === 'library')!.geometry),
    )
    .toBe(before);
  await page.screenshot({
    path: info.outputPath('model-footprint-surface.png'),
  });
});

test('surface workspace wall and roof text saves, reopens and rejects invalid placement', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { dialog, wall, server } = await unifiedModelFixture(page);
  await dialog.getByRole('button', { name: 'Add text', exact: true }).click();
  await dialog
    .getByLabel('Surface text', { exact: true })
    .fill('LIBRARY ENTRANCE');
  await dialog.getByLabel('Surface text', { exact: true }).press('Enter');
  await expect
    .poll(() => wall()?.elements.find((e) => e.kind === 'text')?.text)
    .toBe('LIBRARY ENTRANCE');
  await dialog
    .getByRole('button', { name: 'Edit surface', exact: true })
    .click();
  await expect(dialog.locator('.photo-model-canvas')).toHaveAttribute(
    'data-projection',
    'wall',
  );
  await page.screenshot({ path: info.outputPath('wall-lettering.png') });
  await dialog.getByRole('treeitem', { name: 'Roof', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Add roof text', exact: true })
    .click();
  const text = dialog.getByLabel('Roof surface text', { exact: true });
  await text.fill('LIBRARY');
  await text.press('Enter');
  const roofLabels = () =>
    Object.values(
      server.edits().find((e) => e.id === 'library')?.properties.appearance
        ?.roofTexts || {},
    ).flat();
  await expect.poll(() => roofLabels()[0]?.text).toBe('LIBRARY');
  const longitude = roofLabels()[0].coordinates[0];
  await dialog.getByLabel('Text longitude', { exact: true }).fill('2');
  await dialog.getByLabel('Text longitude', { exact: true }).press('Enter');
  await expect(
    dialog
      .getByText(
        'Roof text must fit inside its wing, outside courtyard openings.',
        {
          exact: false,
        },
      )
      .first(),
  ).toBeVisible();
  expect(roofLabels()[0].coordinates[0]).toBe(longitude);
  await dialog
    .getByLabel('Text longitude', { exact: true })
    .fill(String(longitude));
  await dialog.getByLabel('Text longitude', { exact: true }).press('Enter');
  await dialog
    .getByRole('button', { name: 'Duplicate text', exact: true })
    .click();
  await expect.poll(() => roofLabels().length).toBe(2);
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => roofLabels().length).toBe(1);
  await dialog
    .getByRole('treeitem', { name: 'Text · LIBRARY', exact: true })
    .click();
  await page.screenshot({ path: info.outputPath('roof-lettering.png') });
  await dialog
    .getByRole('button', { name: 'Back to map', exact: true })
    .click();
  await page.reload();
  const explorerToggle = page.getByRole('button', {
    name: 'Toggle explorer',
    exact: true,
  });
  await expect(explorerToggle).toBeEnabled();
  if ((await explorerToggle.getAttribute('aria-pressed')) !== 'true')
    await explorerToggle.click();
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByLabel('Search map features').fill('Library');
  await page
    .locator('.editor-feature-list button')
    .filter({
      has: page.locator('.editor-feature-icon.building'),
      hasText: 'Library',
    })
    .first()
    .click();
  await page.getByRole('button', { name: 'Edit model', exact: true }).click();
  await expect(dialog.locator('.photo-model-canvas')).toHaveAttribute(
    'data-projection',
    'orbit',
  );
  await dialog.getByRole('treeitem', { name: 'Roof', exact: true }).click();
  await dialog.getByLabel('Roof text label').selectOption(roofLabels()[0].id);
  await expect(
    dialog.getByLabel('Roof surface text', { exact: true }),
  ).toHaveValue('LIBRARY');
  expect(errors).toEqual([]);
});
