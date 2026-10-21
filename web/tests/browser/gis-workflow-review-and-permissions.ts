import { test, expect } from './coverage-fixture';
import type { Map as MapInstance } from 'maplibre-gl';
import type { GisWorkflowFixture } from './gis-workflow.spec';
export function registerReviewAndPermissions(
  fixture: () => GisWorkflowFixture,
): void {
  test('GIS documentation gallery uses the current workspace and an isolated team fixture', async ({
    page,
  }) => {
    test.skip(
      process.env.TURNRIGHT_GIS_SCREENSHOTS !== '1',
      'Opt-in documentation capture only',
    );
    const { reviews, data } = await fixture().setup(page);
    await page.waitForFunction(() => {
      type Hook = { memoizedState?: { current?: MapInstance }; next?: Hook };
      type Fiber = { memoizedState?: Hook; return?: Fiber };
      const el = document.querySelector('.map-canvas');
      const key = Object.keys(el || {}).find((k) =>
        k.startsWith('__reactFiber'),
      );
      let fiber =
        el && key ? (el as unknown as Record<string, Fiber>)[key] : undefined;
      while (fiber) {
        let hook = fiber.memoizedState;
        while (hook) {
          const map = hook.memoizedState?.current;
          if (
            typeof map?.getCanvas === 'function' &&
            typeof map?.project === 'function'
          ) {
            window.editorTestMap = map;
            return map.loaded();
          }
          hook = hook.next;
        }
        fiber = fiber.return;
      }
      return false;
    });
    const nav = page.getByRole('navigation', { name: 'Editor sections' });
    const shot = async (name: string) => {
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(
        (bounds) =>
          window.editorTestMap.fitBounds(bounds, {
            padding: { left: 36, right: 36, top: 45, bottom: 45 },
            pitch: 0,
            bearing: 0,
            duration: 0,
          }),
        data.bounds,
      );
      await expect
        .poll(() => page.evaluate(() => window.editorTestMap.areTilesLoaded()))
        .toBe(true);
      await page
        .locator('.gis-workspace')
        .first()
        .evaluate((e) => {
          e.scrollTop = 0;
        });
      await page.screenshot({
        path: (
          await import('./documentation-capture')
        ).documentationCapturePath(`gis-${name}`),
      });
    };
    await nav.getByRole('button', { name: 'Data', exact: true }).click();
    await expect(page.getByText(/100,000 matching/)).toBeVisible();
    await page
      .getByRole('textbox', { name: 'height', exact: true })
      .first()
      .fill('12');
    await page
      .getByRole('textbox', { name: 'height', exact: true })
      .first()
      .press('Tab');
    await shot('data');
    await nav.getByRole('button', { name: 'Analyze', exact: true }).click();
    await page
      .getByLabel('Result name', { exact: true })
      .fill('Demonstration tree buffers');
    await shot('analyze');
    reviews.push({
      id: '22222222-2222-4222-8222-222222222222',
      summary: 'Demonstration tree survey and buffer review',
      status: 'submitted',
      content_hash: 'a'.repeat(64),
      contributors: ['33333333-3333-4333-8333-333333333333'],
      submitted_by: '33333333-3333-4333-8333-333333333333',
      created_at: '2026-10-05T00:00:00Z',
    });
    await nav.getByRole('button', { name: 'Review', exact: true }).click();
    await page
      .getByRole('button', { name: 'Inspect immutable submission' })
      .click();
    await page.getByText(/^Map validation \(/).click();
    await shot('review');
    reviews[0].status = 'approved';
    await nav.getByRole('button', { name: 'Publish', exact: true }).click();
    await page
      .getByText('Map layout: A4 / A3 PNG and PDF', { exact: true })
      .click();
    await page
      .getByRole('combobox', { name: 'Approved snapshot', exact: true })
      .selectOption('22222222-2222-4222-8222-222222222222');
    await page
      .getByLabel('Release summary', { exact: true })
      .fill('Demonstration campus review');
    await shot('publish');
  });
  test('workspace panes keep Activity in place while phone data panes load', async ({
    page,
  }) => {
    await fixture().setup(page);
    await page
      .getByRole('navigation', { name: 'Editor sections' })
      .getByRole('button', { name: 'Data', exact: true })
      .click();
    await expect(
      page.getByRole('checkbox', { name: 'Select this page' }),
    ).toBeVisible();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let waiting = false;
    await page.route('**/api/admin', async (route) => {
      if (route.request().postDataJSON().action === 'gis-datasets') {
        waiting = true;
        await pending;
      }
      await route.fallback();
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page
      .getByRole('combobox', { name: 'Workspace', exact: true })
      .selectOption('gis-data');
    await expect.poll(() => waiting).toBe(true);
    const trigger = page.getByRole('button', { name: /^Activity/ });
    await expect(trigger).toBeVisible();
    const before = (await trigger.boundingBox())!;
    release();
    await expect(
      page.getByRole('checkbox', { name: 'Select this page' }),
    ).toBeVisible();
    const after = (await trigger.boundingBox())!;
    expect(Math.abs(after.x - before.x)).toBeLessThan(1);
    expect(Math.abs(after.y - before.y)).toBeLessThan(1);
    await page.mouse.click(
      before.x + before.width / 2,
      before.y + before.height / 2,
    );
    await expect(
      page.getByRole('region', { name: 'Builds and processes' }),
    ).toBeVisible();
  });
  test('workspace panes preserve the canvas, restore preferences and dismiss the legend', async ({
    page,
  }, info) => {
    const failures: string[] = [];
    page.on('pageerror', (e) => failures.push(e.message));
    await fixture().setup(page);
    const canvas = await page.locator('.map-canvas').elementHandle();
    await page
      .getByRole('button', { name: 'Close map legend', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Map legend', exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Map legend', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Map legend', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Close map legend', exact: true }),
    ).toBeVisible();
    const retainedCanvas = await page.locator('.map-canvas').elementHandle();
    await page.getByRole('button', { name: /^Activity/ }).click();
    await expect(
      page.getByRole('region', { name: 'Builds and processes' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: /^Activity/ })).toBeFocused();
    await page
      .getByRole('button', { name: 'Focus canvas', exact: true })
      .click();
    await expect(page.locator('.workspace-frame')).toHaveAttribute(
      'data-focus',
      'true',
    );
    const workspaceMenu = page.locator('.editor-header-right .workspace-menu');
    await workspaceMenu.locator('summary').click();
    await workspaceMenu
      .getByRole('button', { name: 'Reset layout', exact: true })
      .click();
    await expect(page.locator('.workspace-frame')).toHaveAttribute(
      'data-focus',
      'false',
    );
    await workspaceMenu.locator('summary').click();

    await page
      .getByRole('navigation', { name: 'Editor sections' })
      .getByRole('button', { name: 'Data', exact: true })
      .click();
    await expect(
      page.getByRole('checkbox', { name: 'Select this page' }),
    ).toBeVisible();
    expect(await retainedCanvas!.evaluate((node) => node.isConnected)).toBe(
      true,
    );
    await page
      .getByRole('separator', { name: 'Resize explorer', exact: true })
      .focus();
    await page.keyboard.press('ArrowRight');
    await page
      .getByRole('button', { name: 'Maximize table', exact: true })
      .click();
    await expect(page.locator('.workspace-frame')).toHaveAttribute(
      'data-maximized',
      'true',
    );
    await page
      .getByRole('button', { name: 'Restore table', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Maximize table', exact: true })
      .click();
    await expect(page.locator('.workspace-canvas')).toHaveAttribute(
      'inert',
      '',
    );
    await page
      .getByRole('button', { name: 'Collapse table and activity', exact: true })
      .click();
    await expect(page.locator('.workspace-canvas')).not.toHaveAttribute(
      'inert',
      '',
    );
    await page
      .getByRole('button', { name: 'Toggle table and activity', exact: true })
      .click();
    await page.screenshot({ path: info.outputPath('data-desktop.png') });
    await page.reload();
    await expect(
      page
        .getByRole('navigation', { name: 'Editor sections' })
        .getByRole('button', { name: 'Data', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await page.setViewportSize({ width: 390, height: 844 });
    // WebKit can finish resizing before the matchMedia listener commits the
    // compact toolbar. Wait for that layout before choosing a click position.
    await expect(page.locator('.workspace-frame')).toHaveAttribute(
      'data-compact',
      'true',
    );
    await expect(
      page.getByRole('combobox', { name: 'Workspace', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: /^Activity/ }).click();
    await expect(
      page.getByRole('region', { name: 'Builds and processes' }),
    ).toBeVisible();
    const activityBounds = (await page.locator('#process-list').boundingBox())!;
    expect(activityBounds.x).toBeGreaterThanOrEqual(0);
    expect(activityBounds.x + activityBounds.width).toBeLessThanOrEqual(390);
    expect(activityBounds.y + activityBounds.height).toBeLessThanOrEqual(844);
    await page.keyboard.press('Escape');
    const tableToggle = page.getByRole('button', {
      name: 'Toggle table and activity',
      exact: true,
    });
    if ((await tableToggle.getAttribute('aria-pressed')) !== 'true')
      await tableToggle.click();
    await expect(
      page.getByRole('checkbox', { name: 'Select this page' }),
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath('data-phone.png') });
    await page.getByLabel('Workspace', { exact: true }).selectOption('map');
    await page
      .getByRole('button', { name: 'Reset layout', exact: true })
      .first()
      .click();
    await expect(
      page.getByRole('button', { name: 'Close map legend', exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath('edit-phone.png') });
    expect(failures).toEqual([]);
    await canvas?.dispose();
    await retainedCanvas?.dispose();
  });
}
