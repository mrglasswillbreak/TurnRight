import { expect, test, type Page } from './coverage-fixture';
import type { CampusImportsFixture } from './campus-imports.spec';

async function capture(page: Page, name: string) {
  if (process.env.TURNRIGHT_REDESIGN_SCREENSHOTS === '1' && name === 'mapping')
    await page.screenshot({
      path: (await import('./documentation-capture')).documentationCapturePath(
        'imports',
      ),
    });
  if (process.env.UPDATE_CAMPUS_SCREENSHOTS === 'true')
    await page.screenshot({
      path: `../docs/assets/screenshots/campus-${name}-2026-09-26.png`,
    });
}

export function registerMappingAndRecovery(
  fixture: () => CampusImportsFixture,
): void {
  test('campus imports preserve mappings through rotation and queue only a reviewed preview', async ({
    page,
  }) => {
    const state = await fixture().setup(page);
    await fixture().workspace(page);
    await fixture().fileImport(page);
    const building = page.locator('.import-layer').first();
    await building
      .getByRole('combobox', { name: 'Height', exact: true })
      .selectOption('height');
    await building.getByLabel('Height units').selectOption('ft');
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(building.getByLabel('Height units')).toHaveValue('ft');
    await page.getByRole('button', { name: 'Back to sources' }).click();
    await page
      .getByRole('button', { name: /Campus buildings and paths.*mapping/ })
      .click();
    await expect(building.getByLabel('Height units')).toHaveValue('ft');
    await page
      .getByRole('button', { name: 'Build preview', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Queue for review', exact: true }),
    ).toBeEnabled({ timeout: 15000 });
    const queue = page.getByRole('button', {
      name: 'Queue for review',
      exact: true,
    });
    const submitted = state.calls.find(
      (c) => c.action === 'import-run' && c.payload.phase === 'preview',
    )!.payload.configuration;
    expect(JSON.stringify(submitted)).not.toBe(
      JSON.stringify(state.jobs[0].configuration),
    );
    await page
      .getByLabel('Attribution', { exact: true })
      .fill('Changed credit');
    await expect(queue).toBeDisabled();
    await expect(
      page.getByText('Settings changed since this preview was built.', {
        exact: false,
      }),
    ).toBeVisible();
    await expect(queue).toHaveAttribute(
      'aria-describedby',
      'import-review-blocker',
    );
    await page
      .getByLabel('Attribution', { exact: true })
      .fill(fixture().config.attribution);
    await expect(queue).toBeEnabled();
    state.summary.errors.push('A building boundary needs repair.');
    await page.getByRole('button', { name: 'Back to sources' }).click();
    await page
      .getByRole('button', {
        name: /Campus buildings and paths.*preview/,
      })
      .click();
    await expect(queue).toBeDisabled();
    await expect(
      page.getByText(
        'Resolve the preview errors shown above, then rebuild the preview.',
        {
          exact: true,
        },
      ),
    ).toBeVisible();
    state.summary.errors.length = 0;
    await page.getByRole('button', { name: 'Back to sources' }).click();
    await page
      .getByRole('button', {
        name: /Campus buildings and paths.*preview/,
      })
      .click();
    await expect(queue).toBeEnabled();
    expect(state.calls.some((c) => c.action === 'import-queue')).toBe(false);
    await page
      .getByRole('button', { name: 'Queue for review', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Open source review' }),
    ).toBeVisible();
    expect(state.calls.filter((c) => c.action === 'import-queue')).toHaveLength(
      1,
    );
    expect(state.calls.every((c) => c.campus === 'lasu')).toBe(true);
    const preview = state.calls.find(
      (c) => c.action === 'import-run' && c.payload.phase === 'preview',
    );
    const mappings = (
      preview!.payload.configuration as { layers: { crs?: string }[] }
    ).layers;
    expect(mappings[0].crs).toBeUndefined();
  });
  test('campus imports resume failed uploads and allow selecting the same file again', async ({
    page,
  }, info) => {
    const state = await fixture().setup(page);
    await fixture().workspace(page);
    await fixture().fileImport(page);
    Object.assign(state.jobs[0], {
      status: 'failed',
      phase: 'inspect',
      summary: undefined,
      message:
        'Uploaded file is unavailable. Select the same files to resume the upload, then inspect again.',
    });
    await page.getByRole('button', { name: 'Back to sources' }).click();
    await page
      .getByRole('button', { name: /Campus buildings and paths.*failed/ })
      .click();
    await expect(
      page.getByText('Uploaded file is unavailable.', { exact: false }),
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath('import-resume.png') });
    const file = {
      name: 'Road width.geojson.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({ type: 'FeatureCollection', features: [] }),
      ),
    };
    await page.route('**/__campus-upload', (r) =>
      r.fulfill({ status: 503, json: { error: 'temporary failure' } }),
    );
    await page.locator('input[type=file]').setInputFiles(file);
    await expect(
      page.getByText('Upload was interrupted.', { exact: false }),
    ).toBeVisible();
    await page.unroute('**/__campus-upload');
    await page.route('**/__campus-upload', (r) =>
      r.fulfill({ json: { ok: true } }),
    );
    await page.locator('input[type=file]').setInputFiles(file);
    await expect(
      page.getByText('1 file(s) uploaded. Inspect the layers next.', {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Inspect layers', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Build preview', exact: true }),
    ).toBeEnabled({ timeout: 15000 });
    expect(
      state.calls.filter(
        (c) => c.action === 'import-upload' && c.payload.name === file.name,
      ),
    ).toHaveLength(2);
    expect(state.calls.some((c) => c.action === 'import-queue')).toBe(false);
  });
  test('campus imports restore campus creation and public handoff keeps the campus context', async ({
    page,
  }) => {
    await fixture().setup(page);
    await fixture().workspace(page);
    await page.getByRole('button', { name: 'New campus' }).click();
    await page
      .getByLabel('Campus name', { exact: true })
      .fill('University · East campus');
    await page
      .getByLabel('Boundary GeoJSON', { exact: true })
      .fill(JSON.stringify(fixture().boundary));
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'New campus' }).click();
    await expect(page.getByLabel('Campus name', { exact: true })).toHaveValue(
      'University · East campus',
    );
    await page
      .getByRole('button', { name: 'Create campus', exact: true })
      .click();
    await expect(page).toHaveURL(/campus=university-east-campus/);
    await page.goto('/?campus=north-campus');
    await page
      .getByRole('button', { name: 'Expand card', exact: true })
      .click();
    await expect(
      page.getByRole('link', { name: 'Editor', exact: true }),
    ).toHaveAttribute('href', '/admin?campus=north-campus');
    await page
      .getByRole('button', { name: 'Choose a campus', exact: true })
      .click();
    await page
      .getByRole('searchbox', { name: 'Search published campuses' })
      .fill('LASU');
    await expect(
      page.getByRole('button', { name: 'LASU · Ojo', exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('dialog', { name: 'Choose a campus' })
        .getByRole('button', { name: fixture().north.name, exact: true }),
    ).toHaveCount(0);
  });
  test('campus imports responsive screens and documentation captures', async ({
    page,
  }) => {
    test.setTimeout(process.env.TURNRIGHT_COVERAGE === '1' ? 180000 : 120000);
    await fixture().setup(page, { photo: true });
    await fixture().workspace(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await capture(page, 'workspace');
    await page.getByRole('button', { name: 'New campus' }).click();
    await page
      .getByLabel('Campus name', { exact: true })
      .fill('University · East campus');
    await page
      .getByLabel('Boundary GeoJSON', { exact: true })
      .fill(JSON.stringify(fixture().boundary));
    await page.locator('.campus-content').evaluate((e) => (e.scrollTop = 0));
    await capture(page, 'creation');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page
      .getByRole('button', { name: 'Import data', exact: true })
      .click();
    await page
      .getByLabel('Source name', { exact: true })
      .fill('University GIS buildings');
    await page.getByRole('button', { name: 'ArcGIS', exact: true }).click();
    await page
      .getByLabel('Public ArcGIS URL')
      .fill(
        'https://services.arcgis.com/example/arcgis/rest/services/Campus/FeatureServer',
      );
    await capture(page, 'sources');
    await page
      .getByRole('button', { name: 'Import data', exact: true })
      .click();
    await fixture().fileImport(page);
    await page.locator('.campus-content').evaluate((e) => (e.scrollTop = 0));
    await capture(page, 'mapping');
    await page
      .getByRole('button', { name: 'Build preview', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Queue for review', exact: true }),
    ).toBeEnabled({ timeout: 15000 });
    for (const size of [
      { width: 1280, height: 720 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
      { width: 1024, height: 768 },
      { width: 667, height: 375 },
      { width: 844, height: 390 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(size);
      await expect(
        page.getByRole('button', { name: 'Close campuses' }),
      ).toBeInViewport();
      expect(
        await page
          .locator('.campus-workspace')
          .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      ).toBe(true);
      await page
        .getByRole('button', { name: 'Queue for review', exact: true })
        .scrollIntoViewIfNeeded();
      await expect(
        page.getByRole('button', { name: 'Queue for review', exact: true }),
      ).toBeInViewport();
      if (size.width === 844) await capture(page, 'landscape');
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const zoom of [1.25, 1.5]) {
      await page
        .locator('html')
        .evaluate((e, z) => (e.style.zoom = String(z)), zoom);
      await expect(
        page.getByRole('button', { name: 'Close campuses' }),
      ).toBeInViewport();
      expect(
        await page
          .locator('.campus-workspace')
          .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      ).toBe(true);
    }
    await page.locator('html').evaluate((e) => (e.style.zoom = '1'));
    await page
      .getByRole('button', { name: 'Queue for review', exact: true })
      .scrollIntoViewIfNeeded();
    await capture(page, 'review');
  });
  test('campus imports public switcher and offline documentation captures', async ({
    page,
  }) => {
    await fixture().setup(page, { photo: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page
      .getByRole('button', { name: 'Choose a campus', exact: true })
      .click();
    await capture(page, 'switcher');
    await page.keyboard.press('Escape');
    await page
      .getByRole('button', { name: 'Expand card', exact: true })
      .click();
    await page.getByRole('button', { name: 'Offline', exact: true }).click();
    await capture(page, 'offline');
  });
}
