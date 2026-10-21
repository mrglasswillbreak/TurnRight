import { expect, test } from './coverage-fixture';
import type { CampusImportsFixture } from './campus-imports.spec';
export function registerIsolationAndReview(
  fixture: () => CampusImportsFixture,
): void {
  test('campus imports public chooser stays in the search row without covering navigation', async ({
    page,
  }) => {
    await fixture().setup(page);
    await page.goto('/');
    const chooser = page.getByRole('button', {
      name: 'Choose a campus',
      exact: true,
    });
    for (const size of [
      { width: 1440, height: 900 },
      { width: 1024, height: 768 },
      { width: 844, height: 390 },
      { width: 390, height: 844 },
      { width: 320, height: 568 },
    ]) {
      await page.setViewportSize(size);
      for (const expanded of [false, true]) {
        if (expanded)
          await page
            .getByRole('button', { name: 'Expand card', exact: true })
            .click();
        await expect(chooser).toBeInViewport();
        const box = (await chooser.boundingBox())!;
        const search = (await page
          .getByRole('textbox', { name: 'Search campus' })
          .boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x + box.width).toBeLessThanOrEqual(search.x);
        expect(search.width).toBeGreaterThan(70);
        if (expanded) {
          const navigation = (await page
            .getByRole('navigation', { name: 'Main navigation' })
            .boundingBox())!;
          expect(box.y + box.height).toBeLessThanOrEqual(navigation.y);
        }
        await chooser.click();
        await expect(
          page.getByRole('dialog', { name: 'Choose a campus' }),
        ).toBeVisible();
        await page
          .getByRole('dialog', { name: 'Choose a campus' })
          .getByRole('button', { name: 'LASU · Ojo', exact: true })
          .click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
      }
      await page
        .getByRole('button', { name: 'Collapse card', exact: true })
        .click();
    }
  });
  test('campus imports retain readable headers and fields in light and dark themes', async ({
    page,
  }) => {
    await fixture().setup(page);
    await page.addInitScript(() =>
      localStorage.setItem('turnright:appearance', 'system'),
    );
    await fixture().workspace(page);
    await page
      .getByRole('button', { name: 'Import data', exact: true })
      .click();
    await page
      .getByLabel('Source name', { exact: true })
      .fill('Reference survey');
    for (const colorScheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme });
      await expect(page.locator('html')).toHaveAttribute(
        'style',
        new RegExp(`color-scheme: ${colorScheme}`),
      );
      for (const selector of [
        '.campus-workspace-header',
        '.campus-search input',
        '.import-source-form',
        '.import-source-form input:not([type=checkbox])',
      ]) {
        const contrasts = await page
          .locator(selector)
          .evaluateAll((elements) => {
            const luminance = (value: string) => {
              const channels = value
                .match(/[\d.]+/g)!
                .slice(0, 3)
                .map(Number)
                .map((n) => {
                  const c = n / 255;
                  return c <= 0.04045
                    ? c / 12.92
                    : ((c + 0.055) / 1.055) ** 2.4;
                });
              return (
                channels[0] * 0.2126 +
                channels[1] * 0.7152 +
                channels[2] * 0.0722
              );
            };
            return elements.map((element) => {
              const style = getComputedStyle(element);
              const foreground = luminance(style.color),
                background = luminance(style.backgroundColor);
              return (
                (Math.max(foreground, background) + 0.05) /
                (Math.min(foreground, background) + 0.05)
              );
            });
          });
        expect(contrasts.length).toBeGreaterThan(0);
        for (const contrast of contrasts)
          expect(contrast).toBeGreaterThanOrEqual(4.5);
      }
      await expect(page.getByLabel('Source name', { exact: true })).toHaveValue(
        'Reference survey',
      );
      if (
        colorScheme === 'dark' &&
        process.env.UPDATE_CAMPUS_SCREENSHOTS === 'true'
      )
        await page.screenshot({
          path: '../docs/assets/screenshots/campus-dark-2026-09-26.png',
        });
    }
  });
  test('campus imports save and reopen paths outside LASU after rotation', async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const state = await fixture().setup(page, { outsideLasu: true });
    await page.goto('/admin?campus=north-campus');
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await page
      .getByRole('searchbox', { name: 'Search map features' })
      .fill('OZOLUA');
    await page.getByRole('button', { name: /^OZOLUA RD./ }).click();
    await expect(
      page.getByRole('region', { name: 'Properties', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('combobox', { name: 'Walking access', exact: true })
      .scrollIntoViewIfNeeded();
    await page
      .getByRole('combobox', { name: 'Walking access', exact: true })
      .selectOption('yes');
    await expect
      .poll(() => state.calls.filter((c) => c.action === 'save-edits').length)
      .toBeGreaterThan(0);
    await expect(
      page.getByRole('status').filter({ hasText: /^Saved$/ }),
    ).toBeVisible();
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(
      page.getByRole('combobox', { name: 'Walking access', exact: true }),
    ).toHaveValue('yes');
    await page.screenshot({ path: info.outputPath('unilag-path-saved.png') });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload();
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await page
      .getByRole('searchbox', { name: 'Search map features' })
      .fill('OZOLUA');
    await page.getByRole('button', { name: /^OZOLUA RD./ }).click();
    await expect(
      page.getByRole('combobox', { name: 'Walking access', exact: true }),
    ).toHaveValue('yes');
    await expect(
      page.getByText(
        'All coordinates must be within the LASU Ojo mapping area.',
        { exact: true },
      ),
    ).toHaveCount(0);
    expect(
      state.calls
        .filter((c) => c.action === 'save-edits')
        .every((c) => c.campus === 'north-campus'),
    ).toBe(true);
  });
  test('campus imports wait for background review queueing to finish', async ({
    page,
  }) => {
    const state = await fixture().setup(page);
    await fixture().workspace(page);
    await fixture().fileImport(page);
    await page
      .getByRole('button', { name: 'Build preview', exact: true })
      .click();
    const queue = page.getByRole('button', {
      name: 'Queue for review',
      exact: true,
    });
    await expect(queue).toBeEnabled({ timeout: 15000 });
    let polls = 0;
    await page.route('**/api/admin', async (route) => {
      const payload = route.request().postDataJSON();
      const job = state.jobs[0];
      if (payload.action === 'import-queue') {
        Object.assign(job, {
          status: 'queued',
          phase: 'queue',
          message: 'Waiting for the review worker',
        });
        return route.fulfill({ json: { job } });
      }
      if (payload.action === 'import-get' && job.phase === 'queue') {
        expect(payload.payload.statusOnly).toBe(true);
        Object.assign(job, {
          status: ++polls < 2 ? 'running' : 'reviewed',
          message:
            polls < 2
              ? 'Preparing review batches'
              : 'Changes queued for review',
        });
        return route.fulfill({ json: { job } });
      }
      return route.fallback();
    });
    await queue.click();
    await expect(
      page.getByText(
        'Preparing changes for review. You can leave this screen while the worker finishes.',
      ),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Open source review' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Open source review' }),
    ).toBeVisible({ timeout: 15000 });
    expect(polls).toBe(2);
  });
  test('campus imports reconcile a lost queue response without submitting twice', async ({
    page,
  }) => {
    const state = await fixture().setup(page);
    await fixture().workspace(page);
    await fixture().fileImport(page);
    await page
      .getByRole('button', { name: 'Build preview', exact: true })
      .click();
    const queue = page.getByRole('button', {
      name: 'Queue for review',
      exact: true,
    });
    await expect(queue).toBeEnabled({ timeout: 15000 });
    let submissions = 0;
    await page.route('**/api/admin', async (route) => {
      if (route.request().postDataJSON().action !== 'import-queue')
        return route.fallback();
      submissions++;
      state.jobs[0].status = 'reviewed';
      return route.fulfill({
        status: 504,
        json: { error: 'The request timed out.' },
      });
    });
    await queue.click();
    await expect(
      page.getByRole('button', { name: 'Open source review' }),
    ).toBeVisible();
    expect(submissions).toBe(1);
    await expect(queue).toHaveCount(0);
  });
  test('campus imports edit an overlay and reopen its saved style', async ({
    page,
  }) => {
    const state = await fixture().setup(page, { overlay: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/admin');
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await page
      .getByRole('searchbox', { name: 'Search map features' })
      .fill('Survey area');
    await page.getByRole('button', { name: /^Survey area/ }).click();
    await page.getByLabel('Label', { exact: true }).fill('Reviewed survey');
    await page.getByLabel('Layer order', { exact: true }).fill('8');
    await page.getByLabel('Visible on the map', { exact: true }).uncheck();
    await expect
      .poll(() => state.calls.filter((c) => c.action === 'save-edits').length)
      .toBeGreaterThan(0);
    await expect(
      page.getByRole('status').filter({ hasText: /^Saved$/ }),
    ).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await page
      .getByRole('searchbox', { name: 'Search map features' })
      .fill('Survey area');
    await page.getByRole('button', { name: /^Survey area/ }).click();
    await expect(page.getByLabel('Label', { exact: true })).toHaveValue(
      'Reviewed survey',
    );
    await expect(page.getByLabel('Layer order', { exact: true })).toHaveValue(
      '8',
    );
    await expect(
      page.getByLabel('Visible on the map', { exact: true }),
    ).not.toBeChecked();
  });
  test('campus imports expose vector roles, repair receipts and per-layer sampling', async ({
    page,
  }) => {
    const state = await fixture().setup(page);
    state.summary.repairs = [
      {
        layer: 'Buildings',
        sourceId: '96',
        actions: ['Repaired polygon self-intersection'],
        areaChangePercent: 0.00001,
      },
    ];
    state.summary.sampling = [
      { layer: 'Buildings', shown: 20, total: 24 },
      { layer: 'Footpaths', shown: 18, total: 18 },
    ];
    await fixture().workspace(page);
    await fixture().fileImport(page);
    await expect(
      page.locator('.import-layer').first().getByLabel('Import as'),
    ).toContainText('road-surface');
    await expect(
      page.locator('.import-layer').first().getByLabel('Import as'),
    ).toContainText('overlay');
    await expect(
      page.getByText('Preview is sampled across layers', { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText('Buildings · 96:', { exact: false }),
    ).toBeVisible();
    await page.getByText('Supported vector formats', { exact: true }).click();
    await expect(
      page.getByText('GeoParquet: parquet, geoparquet', { exact: true }),
    ).toBeVisible();
  });
}
