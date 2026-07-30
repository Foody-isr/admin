import {
  expect,
  openInspectorTab,
  openPublicPage,
  previewFrame,
  publishCurrentDraft,
  selectBuilderPage,
  waitForDraftSaved,
  waitForPreviewReady,
  websiteV3Test,
} from './helpers';

websiteV3Test('unpublished drafts remain private and discard restores published state', async ({
  builderPage,
  restaurantSlug,
}) => {
  await selectBuilderPage(builderPage, 'About');
  const original = await builderPage.locator('[data-field-id="page.title"]').inputValue();
  const draft = `Private draft ${Date.now()}`;
  await builderPage.locator('[data-field-id="page.title"]').fill(draft);
  await waitForDraftSaved(builderPage);
  await expect(previewFrame(builderPage).locator('[data-page-title]')).toHaveAttribute('data-page-title', draft);

  const publicPage = await builderPage.context().newPage();
  await openPublicPage(publicPage, restaurantSlug, 'about');
  await expect(publicPage.locator(`[data-page-title="${original}"]`)).toBeVisible();
  await expect(publicPage.getByText(draft)).toHaveCount(0);
  await publicPage.close();

  await builderPage.reload();
  await selectBuilderPage(builderPage, draft);
  await expect(builderPage.locator('[data-field-id="page.title"]')).toHaveValue(draft);
  builderPage.once('dialog', (dialog) => dialog.accept());
  await builderPage.getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(builderPage.getByRole('status')).toContainText('annulées');
  await expect(previewFrame(builderPage).locator('[data-page-title]')).toHaveAttribute('data-page-title', original);
});

websiteV3Test('autosave serializes rapid edits and retries the newest state after failure', async ({
  builderPage,
}) => {
  await selectBuilderPage(builderPage, 'About');
  let inFlight = 0;
  let maxInFlight = 0;
  let delayed = true;
  await builderPage.route('**/website-draft', async (route) => {
    if (route.request().method() !== 'PUT') return route.continue();
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    if (delayed) {
      delayed = false;
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    await route.continue();
    inFlight -= 1;
  });
  const title = builderPage.locator('[data-field-id="page.title"]');
  await title.fill('A');
  await title.fill('AB');
  await title.fill('ABC');
  await waitForDraftSaved(builderPage);
  expect(maxInFlight).toBe(1);
  await builderPage.reload();
  await selectBuilderPage(builderPage, 'ABC');
  await expect(builderPage.locator('[data-field-id="page.title"]')).toHaveValue('ABC');

  let failNext = true;
  await builderPage.route('**/website-draft', async (route) => {
    if (route.request().method() !== 'PUT') return route.continue();
    if (failNext) {
      failNext = false;
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'forced autosave failure' }),
      });
    }
    return route.continue();
  });
  await title.fill('Latest recoverable title');
  await expect(builderPage.getByText('Échec de l’enregistrement', { exact: false })).toBeVisible();
  await expect(title).toHaveValue('Latest recoverable title');
  await builderPage.getByRole('button', { name: 'Réessayer l’enregistrement' }).click();
  await waitForDraftSaved(builderPage);
  await builderPage.reload();
  await selectBuilderPage(builderPage, 'Latest recoverable title');
});

websiteV3Test('invalid commerce associations block publish and recover after correction', async ({
  builderPage,
}) => {
  for (const scenario of [
    { page: 'Brunch Order', field: 'page.settings.menu_ids' },
    { page: 'Office Catering', field: 'page.settings.service_ids' },
  ]) {
    await selectBuilderPage(builderPage, scenario.page);
    await openInspectorTab(builderPage, 'Réglages');
    const field = builderPage.locator(`[data-field-id="${scenario.field}"]`);
    for (const checkbox of await field.locator('input[type="checkbox"]:checked').all()) {
      await checkbox.uncheck();
    }
    await expect(builderPage.getByText('Sélectionnez au moins', { exact: false })).toBeVisible();
    await expect(builderPage.getByText('Échec de l’enregistrement', { exact: false })).toBeVisible();
    let publishRequests = 0;
    const countPublish = (request: import('@playwright/test').Request) => {
      if (request.method() === 'POST' && request.url().endsWith('/website-publish')) publishRequests += 1;
    };
    builderPage.on('request', countPublish);
    await expect(builderPage.getByRole('button', { name: 'Publier', exact: true })).toBeDisabled();
    expect(publishRequests).toBe(0);
    builderPage.off('request', countPublish);
    await field.locator('input[type="checkbox"]').first().check();
    await waitForDraftSaved(builderPage);
  }
});

websiteV3Test('publish failure preserves dirty state and retry publishes the latest draft', async ({
  builderPage,
  restaurantSlug,
}) => {
  await selectBuilderPage(builderPage, 'About');
  const changed = `Publish retry ${Date.now()}`;
  await builderPage.locator('[data-field-id="page.title"]').fill(changed);
  await waitForDraftSaved(builderPage);
  await openInspectorTab(builderPage, 'Réglages');
  const changedSlug = await builderPage.locator('[data-field-id="page.slug"]').inputValue();
  await builderPage.getByRole('button', { name: 'Aperçu ordinateur', exact: true }).click();
  await waitForPreviewReady(builderPage);
  await builderPage.getByRole('button', { name: 'Aperçu mobile', exact: true }).click();
  await waitForPreviewReady(builderPage);

  let failNext = true;
  await builderPage.route('**/website-publish', async (route) => {
    if (failNext) {
      failNext = false;
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'forced publish failure' }),
      });
    }
    return route.continue();
  });
  await builderPage.getByRole('button', { name: 'Publier', exact: true }).click();
  await expect(
    builderPage.getByRole('alert').filter({ hasText: 'forced publish failure' }),
  ).toBeVisible();
  const publicPage = await builderPage.context().newPage();
  await openPublicPage(publicPage, restaurantSlug, 'about');
  await expect(publicPage.getByText(changed)).toHaveCount(0);
  await publicPage.close();

  await publishCurrentDraft(builderPage);
  await openPublicPage(builderPage, restaurantSlug, changedSlug);
  await expect(builderPage.locator(`[data-page-title="${changed}"]`)).toBeVisible();
});
