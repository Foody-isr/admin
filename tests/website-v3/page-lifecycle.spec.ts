import { test as playwrightTest } from '@playwright/test';
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

websiteV3Test('content page lifecycle stays connected from draft to public deletion', async ({
  builderPage,
  restaurantId,
  restaurantSlug,
}) => {
  const uniqueText = `Notre histoire E2E ${Date.now()}`;

  await builderPage.locator('[data-field-id="page.create"]').click();
  const dialog = builderPage.getByRole('dialog');
  await dialog.locator('[data-field-id="page.create.title"]').fill('Notre histoire');
  await expect(dialog.locator('[data-field-id="page.create.slug"]')).toHaveValue('notre-histoire');
  await dialog.getByRole('button', { name: 'Créer la page', exact: true }).click();

  await builderPage.locator('[data-field-id="section.create"]').click();
  await builderPage
    .getByRole('button', { name: 'Texte + image', exact: true })
    .click();
  await builderPage.locator('[data-field-id="section.content.title"]').fill(uniqueText);
  await builderPage.locator('[data-field-id="section.content.body"]').fill('Un contenu persistant et publié.');
  await waitForDraftSaved(builderPage);
  await expect(previewFrame(builderPage).locator('[data-section-type="text_and_image"]')).toContainText(uniqueText);

  await builderPage.getByRole('button', { name: 'Aperçu mobile', exact: true }).click();
  await waitForPreviewReady(builderPage);
  await expect(previewFrame(builderPage).locator('[data-section-type="text_and_image"]')).toContainText(uniqueText);

  await builderPage.reload();
  await selectBuilderPage(builderPage, 'Notre histoire');
  await builderPage.getByRole('button', { name: 'Text and image', exact: true }).click();
  await expect(builderPage.locator('[data-field-id="section.content.title"]')).toHaveValue(uniqueText);

  await publishCurrentDraft(builderPage);
  await openPublicPage(builderPage, restaurantSlug, 'notre-histoire');
  await expect(builderPage.locator('[data-section-type="text_and_image"]')).toContainText(uniqueText);

  await builderPage.goto(`/${restaurantId}/website-v3`);
  await selectBuilderPage(builderPage, 'Notre histoire');
  await builderPage.locator('[data-field-id="page.title"]').fill('Notre maison');
  await openInspectorTab(builderPage, 'Réglages');
  await builderPage.locator('[data-field-id="page.slug"]').fill('notre-maison');
  await builderPage.locator('[data-field-id="page.slug"]').blur();
  await publishCurrentDraft(builderPage);

  await builderPage.goto(`${webOrigin()}/r/${restaurantSlug}/notre-histoire`);
  await expect(builderPage.getByRole('heading', { name: '404', exact: true })).toBeVisible();
  await openPublicPage(builderPage, restaurantSlug, 'notre-maison');
  await expect(builderPage.locator('[data-page-title="Notre maison"]')).toBeVisible();

  await builderPage.goto(`/${restaurantId}/website-v3`);
  await selectBuilderPage(builderPage, 'Notre maison');
  builderPage.once('dialog', (confirmation) => confirmation.accept());
  await builderPage.locator('[data-field-id="page.delete"]').click();
  await publishCurrentDraft(builderPage);
  await builderPage.goto(`${webOrigin()}/r/${restaurantSlug}/notre-maison`);
  await expect(builderPage.getByRole('heading', { name: '404', exact: true })).toBeVisible();
});

playwrightTest('builder stays desktop-only on a mobile viewport', async ({ browser }) => {
  const fixture = await import('./helpers').then(({ readWebsiteV3Fixture }) => readWebsiteV3Fixture());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const { loginWebsiteV3Owner } = await import('./helpers');
  await loginWebsiteV3Owner(page, fixture);
  await page.goto(`/${fixture.restaurantId}/website-v3`);
  await expect(page.getByRole('heading', { name: 'Ouvrez le builder sur un écran plus large' })).toBeVisible();
  await expect(page.locator('iframe[title^="Aperçu de "]')).toHaveCount(0);
  await page.close();
});

function webOrigin(): string {
  return 'http://localhost:3000';
}
