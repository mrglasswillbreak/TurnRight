import { collapseExplorer, openEditorSection } from './editor-navigation';
import { test, expect } from './coverage-fixture';
import { contrastFailures } from './contrast';
import { setup } from './editor-fixture';
import {
  attachMap,
  position,
  clickMap,
  focusCampus,
} from './editor-map-helpers';
import {
  openBuildingModel,
  closeBuildingModel,
  unifiedModelFixture,
} from './editor-model-helpers';

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
});

for (const touch of [false, true])
  test(`drawing session protects the first point and restores panels with ${touch ? 'touch' : 'mouse'}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: 'http://127.0.0.1:5183',
      viewport: touch
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
      hasTouch: touch,
      isMobile: touch,
    });
    const page = await context.newPage();
    try {
      const server = await setup(page);
      await focusCampus(page);
      await page
        .getByRole('button', { name: 'Draw path', exact: true })
        .click();
      await expect(page.locator('.editor-explorer')).toHaveClass(/collapsed/);
      await expect(
        page.getByText('Click or tap the map to place the first point.'),
      ).toBeVisible();
      const finish = page.getByRole('button', { name: 'Finish', exact: true });
      await expect(finish).toBeDisabled();
      await expect(
        page.getByRole('button', { name: 'Draw building', exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole('button', { name: 'Compare base', exact: true }),
      ).toBeDisabled();
      const point = await position(page, [3.20015, 6.4601]);
      if (touch) await page.touchscreen.tap(point.x, point.y);
      else await page.mouse.click(point.x, point.y);
      await expect(page.locator('.drawing-progress')).toContainText(
        '1 point placed',
      );
      await expect(finish).toBeDisabled();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              window.editorTestMap
                .queryRenderedFeatures()
                .filter(
                  (f) => /td-/.test(f.layer.id) && f.geometry.type === 'Point',
                ).length,
          ),
        )
        .toBeGreaterThan(0);
      await page
        .getByRole('button', { name: 'Switch to 3D', exact: true })
        .click();
      await expect
        .poll(() => page.evaluate(() => window.editorTestMap.getPitch()))
        .toBeGreaterThan(45);
      await expect(page.locator('.drawing-progress')).toContainText(
        '1 point placed',
      );
      const second = await position(page, [3.2004, 6.46]);
      if (touch) await page.touchscreen.tap(second.x, second.y);
      else await page.mouse.click(second.x, second.y);
      await expect(finish).toBeEnabled();
      await expect(page.locator('.editor-guidance')).toContainText(
        'Connect to',
      );
      await finish.click();
      await expect(page.locator('.editor-explorer')).not.toHaveClass(
        /collapsed/,
      );
      await expect
        .poll(() => server.edits().filter((e) => e.kind === 'path').length)
        .toBe(1);
      expect(
        server.edits().find((e) => e.kind === 'path')?.properties.connections
          ?.length,
      ).toBeGreaterThan(0);
      await page
        .getByRole('button', { name: 'Draw path', exact: true })
        .click();
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(page.locator('.editor-explorer')).not.toHaveClass(
        /collapsed/,
      );
      expect(server.edits().filter((e) => e.kind === 'path')).toHaveLength(1);
    } finally {
      await context.close();
    }
  });

for (const variant of ['dark desktop', 'light desktop', 'dark phone']) {
  test(`readable interface ${variant}: tips, public dialogs and editor panels`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120000);
    if (variant.includes('phone'))
      await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({
      colorScheme: variant.startsWith('dark') ? 'dark' : 'light',
      reducedMotion: 'reduce',
    });
    await setup(page);
    await expect(page.locator('html')).toHaveAttribute(
      'style',
      new RegExp(
        `color-scheme: ${variant.startsWith('dark') ? 'dark' : 'light'}`,
      ),
    );
    const failures: Record<string, string[]> = {};
    const audit = async (name: string) => {
      failures[name] = await contrastFailures(page);
    };
    await audit('editor workspace');
    await page
      .getByRole('button', { name: 'Switch to 3D', exact: true })
      .click();
    await page.getByRole('button', { name: 'Draw path', exact: true }).click();
    await expect(page.locator('.map-detail-status')).toHaveText(
      'Enhanced models paused for map editing',
    );
    await audit('editing tips');
    await page.screenshot({ path: testInfo.outputPath('editing-tips.png') });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    for (const section of [
      'Settings',
      'Sources',
      'Duplicates',
      'Reports',
      'Releases',
    ] as const) {
      if (section === 'Settings')
        await page.getByRole('button', { name: section, exact: true }).click();
      else await openEditorSection(page, section);
      await audit(`editor ${section}`);
    }
    await openEditorSection(page, 'Edit');
    await focusCampus(page);
    if (
      await page.getByRole('button', { name: 'Collapse explorer' }).isVisible()
    )
      await collapseExplorer(page);
    await clickMap(page, [3.20012, 6.46022]);
    await expect(
      page.getByRole('button', { name: 'Edit model', exact: true }),
    ).toBeVisible();
    await audit('building inspector');
    await openBuildingModel(page, 'roof');
    await audit('roof inspector');
    await closeBuildingModel(page);
    await page.getByRole('button', { name: 'Survey', exact: true }).click();
    await expect(page.locator('.survey-sheet')).toBeVisible();
    await audit('survey');
    await page.goto('/');
    await attachMap(page);
    await page
      .getByRole('button', { name: 'Expand card', exact: true })
      .click();
    await audit('public places');
    await page.getByRole('textbox', { name: 'Search campus' }).fill('Library');
    await page
      .getByRole('button', { name: /Library/ })
      .first()
      .click();
    await page.getByRole('heading', { name: 'Library', exact: true }).waitFor();
    await audit('place details');
    await page.getByRole('button', { name: 'Copy link', exact: true }).click();
    await expect(page.locator('.toast')).toBeVisible();
    await audit('toast');
    await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
    await page.getByRole('button', { name: 'Directions', exact: true }).click();
    await page.getByLabel('Starting place').selectOption('gate');
    await expect(
      page.getByRole('button', { name: 'Start walking', exact: true }),
    ).toBeVisible();
    await audit('route details');
    for (const section of ['Settings', 'Offline']) {
      await page.getByRole('button', { name: section, exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await audit(`public ${section}`);
      await page.screenshot({ path: testInfo.outputPath(`${section}.png`) });
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    expect(
      Object.fromEntries(
        Object.entries(failures).filter(([, list]) => list.length),
      ),
    ).toEqual({});
  });
}

test.describe('model workspace touch layouts', () => {
  test.use({ hasTouch: true });
  test('landscape side panel and portrait input survive rotation and keyboard resize', async ({
    page,
  }, info) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 390, height: 844 });
    const { dialog, wall } = await unifiedModelFixture(page);
    await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
    const width = dialog.getByLabel('Width (m)', { exact: true });
    await width.fill('');
    const surface = dialog.getByRole('application', { name: /Wall canvas/ });
    const view = await surface.getAttribute('viewBox');
    const renderer = await dialog
      .locator('.photo-model-canvas canvas')
      .elementHandle();
    for (const viewport of [
      { width: 667, height: 375 },
      { width: 844, height: 390 },
      { width: 1024, height: 768 },
      { width: 1280, height: 591 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(dialog).toHaveClass(/model-landscape/);
      await expect
        .poll(() =>
          dialog.evaluate((el) => {
            const r = el.getBoundingClientRect();
            return [
              Math.round(r.x),
              Math.round(r.y),
              Math.round(r.width),
              Math.round(r.height),
            ];
          }),
        )
        .toEqual([0, 0, viewport.width, viewport.height]);
      const canvas = (await surface.boundingBox())!;
      const panel = (await dialog.locator('.model-inspector').boundingBox())!;
      expect(canvas.height).toBeGreaterThan(120);
      expect(canvas.x + canvas.width).toBeLessThanOrEqual(panel.x + 1);
      expect(panel.width).toBeLessThanOrEqual(320);
      expect((await width.boundingBox())!.width).toBeGreaterThan(80);
      expect(panel.y + panel.height).toBeLessThanOrEqual(viewport.height);
      await expect(width).toHaveValue('');
      await expect(surface).toHaveAttribute('viewBox', view!);
      await expect(
        dialog.getByRole('button', { name: 'Close workspace', exact: true }),
      ).toBeInViewport();
      const tabs = dialog.getByRole('navigation', { name: 'Editing panel' });
      await tabs
        .getByRole('button', { name: 'Structure', exact: true })
        .click();
      await expect(
        dialog.getByRole('complementary', { name: 'Building hierarchy' }),
      ).toBeVisible();
      await expect(dialog.locator('.model-inspector')).toBeHidden();
      await tabs
        .getByRole('button', { name: 'Properties', exact: true })
        .click();
      await expect(width).toHaveValue('');
    }
    expect(await renderer!.evaluate((el) => el.isConnected)).toBe(true);
    await page.screenshot({
      path: info.outputPath('landscape-model-workspace.png'),
    });
    // Simulate the visual viewport exposed by a keyboard without rotating the device.
    await page.evaluate(() => {
      const viewport = window.visualViewport!;
      Object.defineProperty(viewport, 'height', {
        configurable: true,
        value: 300,
      });
      Object.defineProperty(viewport, 'offsetTop', {
        configurable: true,
        value: 20,
      });
      viewport.dispatchEvent(new Event('resize'));
    });
    await expect
      .poll(() =>
        dialog.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return [Math.round(r.y), Math.round(r.height)];
        }),
      )
      .toEqual([20, 300]);
    await width.fill('1.9');
    await width.press('Enter');
    await expect.poll(() => wall()?.elements[0].width).toBe(1.9);
    await page.evaluate(() => {
      Reflect.deleteProperty(window.visualViewport!, 'height');
      Reflect.deleteProperty(window.visualViewport!, 'offsetTop');
      window.visualViewport!.dispatchEvent(new Event('resize'));
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(dialog).not.toHaveClass(/model-landscape/);
    await expect(width).toHaveValue('1.9');
    await expect(dialog.locator('.model-sheet-handle')).toBeVisible();
    await dialog
      .getByRole('button', { name: 'Close workspace', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Edit model', exact: true }),
    ).toBeFocused();
  });
});

test('surface workspace shares renderer, wall edits, tree and selected actions', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { dialog, wall, server } = await unifiedModelFixture(page);
  const canvas = await dialog
    .locator('.photo-model-canvas canvas')
    .elementHandle();
  await dialog.getByRole('button', { name: 'Orbit', exact: true }).click();
  await expect(dialog.locator('.photo-model-canvas')).toHaveAttribute(
    'data-projection',
    'orbit',
  );
  await expect(dialog.locator('.photo-model-preview > output')).toContainText(
    'Estimated dimensions',
  );
  const camera = await dialog
    .locator('.photo-model-canvas')
    .getAttribute('data-camera');
  await dialog
    .getByRole('button', { name: 'Edit surface', exact: true })
    .click();
  await expect(dialog.locator('.photo-model-canvas')).toHaveAttribute(
    'data-projection',
    'wall',
  );
  const detail = dialog.locator('.model-wall-canvas [data-element-id]').first();
  const bounds = (await detail.boundingBox())!;
  const before = wall()!.elements[0].x;
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 + 32,
    bounds.y + bounds.height / 2,
    {
      steps: 6,
    },
  );
  await page.mouse.up();
  await expect.poll(() => wall()!.elements[0].x).toBeGreaterThan(before);
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => wall()!.elements[0].x).toBe(before);
  await dialog.getByRole('button', { name: 'Orbit', exact: true }).click();
  await expect(dialog.locator('.photo-model-canvas')).toHaveAttribute(
    'data-camera',
    camera!,
  );
  expect(
    await canvas!.evaluate(
      (el) => el === document.querySelector('.photo-model-canvas canvas'),
    ),
  ).toBe(true);
  const tree = dialog.getByRole('tree', { name: 'Model structure' });
  await expect(
    tree.getByRole('treeitem', { name: 'Window', exact: true }),
  ).toBeVisible();
  await tree.getByRole('treeitem', { name: 'Window', exact: true }).click();
  await dialog.getByText('Groups, patterns & presets', { exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Group selection', exact: true })
    .click();
  await expect
    .poll(
      () =>
        server.edits().find((e) => e.id === 'library')?.properties
          .modelAuthoring?.groups.length,
    )
    .toBe(1);
  await dialog
    .getByLabel('Selected item actions', { exact: true })
    .getByRole('button', { name: 'Ungroup', exact: true })
    .click();
  await expect
    .poll(
      () =>
        server.edits().find((e) => e.id === 'library')?.properties
          .modelAuthoring?.groups.length,
    )
    .toBe(0);
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect
    .poll(
      () =>
        server.edits().find((e) => e.id === 'library')?.properties
          .modelAuthoring?.groups.length,
    )
    .toBe(1);
  await page.screenshot({ path: info.outputPath('model-tree-orbit.png') });
  await dialog
    .getByRole('button', { name: 'Back to map', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Edit model', exact: true }),
  ).toBeFocused();
  await expect(
    page.getByLabel('Height information', { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('.building-modes')).toHaveCount(0);
  expect(errors).toEqual([]);
});
