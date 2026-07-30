import {
  expect,
  openInspectorTab,
  openPublicPage,
  previewFrame,
  publishCurrentDraft,
  selectBuilderPage,
  waitForDraftSaved,
  websiteV3Test,
  webBaseURL,
} from './helpers';

websiteV3Test('order pages keep menu associations isolated and alias follows explicit default', async ({
  builderPage,
  restaurantSlug,
}) => {
  await selectBuilderPage(builderPage, 'Brunch Order');
  await openInspectorTab(builderPage, 'Réglages');
  await setOnlyAssociation(builderPage, 'page.settings.menu_ids', 'Website V3 Brunch');
  await expect(previewFrame(builderPage).locator('[data-group-id]')).toContainText('Website V3 Brunch Plates');
  await expect(previewFrame(builderPage).getByText('Website V3 Dinner Plates')).toHaveCount(0);

  await selectBuilderPage(builderPage, 'Dinner Order');
  await openInspectorTab(builderPage, 'Réglages');
  await setOnlyAssociation(builderPage, 'page.settings.menu_ids', 'Website V3 Dinner');
  await builderPage.locator('[data-field-id="page.is_default"]').check();
  await publishCurrentDraft(builderPage);

  await openPublicPage(builderPage, restaurantSlug, 'brunch-order');
  await expect(builderPage.getByRole('heading', { name: 'Website V3 Brunch Plates' })).toBeVisible();
  await expect(builderPage.getByText('Website V3 Dinner Plates')).toHaveCount(0);
  await openPublicPage(builderPage, restaurantSlug, 'dinner-order');
  await expect(builderPage.getByRole('heading', { name: 'Website V3 Dinner Plates' })).toBeVisible();
  await expect(builderPage.getByText('Website V3 Brunch Plates')).toHaveCount(0);

  await builderPage.goto(`${webBaseURL}/r/${restaurantSlug}/order`);
  await expect(builderPage).toHaveURL(new RegExp(`/r/${restaurantSlug}/dinner-order(?:[?#]|$)`));
  await builderPage.goto(`${webBaseURL}/r/${restaurantSlug}/brunch-order`);
  await expect(builderPage.getByRole('heading', { name: 'Website V3 Brunch Plates' })).toBeVisible();
});

websiteV3Test('catering pages keep service associations isolated and alias follows explicit default', async ({
  builderPage,
  restaurantSlug,
}) => {
  await selectBuilderPage(builderPage, 'Office Catering');
  await openInspectorTab(builderPage, 'Réglages');
  await setOnlyAssociation(builderPage, 'page.settings.service_ids', 'Website V3 Office Catering');
  await expect(previewFrame(builderPage).locator('[data-catering-service]')).toContainText('Website V3 Office Catering');
  await expect(previewFrame(builderPage).getByText('Website V3 Celebration Catering')).toHaveCount(0);

  await selectBuilderPage(builderPage, 'Celebration Catering');
  await openInspectorTab(builderPage, 'Réglages');
  await setOnlyAssociation(builderPage, 'page.settings.service_ids', 'Website V3 Celebration Catering');
  await builderPage.locator('[data-field-id="page.is_default"]').check();
  await publishCurrentDraft(builderPage);

  await openPublicPage(builderPage, restaurantSlug, 'office-catering');
  await expect(builderPage.getByText('Website V3 Office Catering')).toBeVisible();
  await expect(builderPage.getByText('Website V3 Celebration Catering')).toHaveCount(0);
  await openPublicPage(builderPage, restaurantSlug, 'celebration-catering');
  await expect(builderPage.getByText('Website V3 Celebration Catering')).toBeVisible();
  await expect(builderPage.getByText('Website V3 Office Catering')).toHaveCount(0);

  await builderPage.goto(`${webBaseURL}/r/${restaurantSlug}/catering`);
  await expect(builderPage).toHaveURL(new RegExp(`/r/${restaurantSlug}/celebration-catering(?:[?#]|$)`));
  await builderPage.goto(`${webBaseURL}/r/${restaurantSlug}/office-catering`);
  await expect(builderPage.getByText('Website V3 Office Catering')).toBeVisible();
});

async function setOnlyAssociation(
  page: import('@playwright/test').Page,
  fieldId: string,
  selectedLabel: string,
): Promise<void> {
  const fieldset = page.locator(`[data-field-id="${fieldId}"]`);
  let changed = false;
  for (const checkbox of await fieldset.locator('input[type="checkbox"]').all()) {
    const label = await checkbox.locator('xpath=ancestor::label').innerText();
    const shouldBeChecked = label.includes(selectedLabel);
    if ((await checkbox.isChecked()) !== shouldBeChecked) {
      await checkbox.setChecked(shouldBeChecked);
      changed = true;
    }
  }
  if (changed) await waitForDraftSaved(page);
}
