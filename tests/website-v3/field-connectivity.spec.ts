import { FIELD_CONTRACTS } from '../../src/components/website-v3/field-contracts';
import {
  assertContractOutput,
  expect,
  mutateContractControl,
  openInspectorTab,
  openPublicPage,
  previewFrame,
  publishCurrentDraft,
  selectBuilderPage,
  waitForDraftSaved,
  waitForPreviewReady,
  websiteV3Test,
} from './helpers';

for (const sourceContract of FIELD_CONTRACTS) {
  if (sourceContract.editor.kind === 'action') continue;

  websiteV3Test(`field ${sourceContract.id} is connected through preview and public render`, async ({
    builderPage,
    restaurantSlug,
    menuIds,
    serviceIds,
  }) => {
    const contract =
      sourceContract.id === 'page.settings.menu_ids'
        ? withTestValue(sourceContract, [menuIds[0]])
        : sourceContract.id === 'page.settings.service_ids'
          ? withTestValue(sourceContract, [serviceIds[0]])
          : sourceContract.id === 'page.title'
            ? withEditor(
                sourceContract,
                { publicSlug: 'about-connected-e2e' },
              )
          : sourceContract;
    expect(contract.testValue, `${contract.id} needs a deterministic testValue`).not.toBeUndefined();

    await selectContractContext(builderPage, contract);
    const { changed } = await mutateContractControl(builderPage, contract);
    if (changed) await waitForDraftSaved(builderPage);

    for (const device of contract.devices) {
      await builderPage.getByRole('button', {
        name: device === 'desktop' ? 'Aperçu ordinateur' : 'Aperçu mobile',
        exact: true,
      }).click();
      await waitForPreviewReady(builderPage);
      await assertContractOutput(previewFrame(builderPage), contract, 'preview');
    }

    await builderPage.reload();
    await selectContractContext(builderPage, contract, true);
    await expectReloadedControl(builderPage, contract);
    if (changed) await publishCurrentDraft(builderPage);
    await openPublicPage(builderPage, restaurantSlug, contract.editor.publicSlug);
    await assertContractOutput(builderPage, contract, 'public');
  });
}

websiteV3Test('page fields stay isolated while site fields inherit across page types', async ({
  builderPage,
  restaurantSlug,
}) => {
  await selectBuilderPage(builderPage, 'About');
  await builderPage.locator('[data-field-id="page.title"]').fill('About isolated');
  await publishCurrentDraft(builderPage);
  await openPublicPage(builderPage, restaurantSlug, 'brunch-order');
  await expect(builderPage.locator('[data-page-title="Brunch Order"]')).toBeVisible();
  await expect(builderPage.getByText('About isolated')).toHaveCount(0);

  await builderPage.goto(`/${await currentRestaurantId(builderPage)}/website-v3`);
  await builderPage.getByRole('button', { name: 'Identité du site' }).click();
  await builderPage.locator('[data-field-id="site.tagline"]').fill('Inherited Website V3 tagline');
  await publishCurrentDraft(builderPage);
  for (const slug of ['', 'brunch-order', 'office-catering']) {
    await openPublicPage(builderPage, restaurantSlug, slug);
    await expect(builderPage.locator('[data-field-site-tagline="Inherited Website V3 tagline"]')).toBeVisible();
  }
});

async function selectContractContext(
  page: import('@playwright/test').Page,
  contract: (typeof FIELD_CONTRACTS)[number],
  afterMutation = false,
): Promise<void> {
  if (contract.editor.scope === 'site') {
    await page.getByRole('button', { name: 'Identité du site' }).click();
  } else {
    await selectBuilderPage(
      page,
      afterMutation && contract.id === 'page.title'
        ? String(contract.testValue)
        : contract.editor.pageTitle,
    );
    if (contract.editor.sectionLabel) {
      await page.getByRole('button', { name: contract.editor.sectionLabel, exact: true }).click();
    }
  }
  await openInspectorTab(page, contract.editor.tab);
  if (contract.editor.prerequisite) {
    const prerequisite = page.locator(`[data-field-id="${contract.editor.prerequisite.id}"]`);
    await prerequisite.selectOption(String(contract.editor.prerequisite.value));
    await waitForDraftSaved(page);
  }
}

async function expectReloadedControl(
  page: import('@playwright/test').Page,
  contract: (typeof FIELD_CONTRACTS)[number],
): Promise<void> {
  const controls = page.locator(`[data-field-id="${contract.id}"]`).filter({ visible: true });
  const control =
    contract.id === 'section.is_visible'
      ? page.locator('input[data-field-id="section.is_visible"]')
      : contract.id === 'section.content.social_links'
      ? controls.first()
      : controls.last();
  const type = await control.getAttribute('type');
  if (Array.isArray(contract.testValue)) {
    await expect(control.locator('input[type="checkbox"]:checked')).toHaveCount(contract.testValue.length);
    return;
  }
  if (type === 'checkbox') {
    if (contract.testValue) await expect(control).toBeChecked();
    else await expect(control).not.toBeChecked();
    return;
  }
  const expected =
    contract.editor.commit === 'blur' && typeof contract.testValue === 'string'
      ? JSON.stringify(JSON.parse(contract.testValue), null, 2)
      : typeof contract.testValue === 'string'
      ? contract.testValue
      : JSON.stringify(contract.testValue, null, 2);
  if (contract.editor.commit === 'blur' && typeof contract.testValue === 'string') {
    expect(JSON.parse(await control.inputValue())).toEqual(JSON.parse(contract.testValue));
    return;
  }
  await expect(control).toHaveValue(expected);
}

async function currentRestaurantId(page: import('@playwright/test').Page): Promise<string> {
  const fixture = await import('./helpers').then(({ readWebsiteV3Fixture }) => readWebsiteV3Fixture());
  return String(fixture.restaurantId);
}

function withTestValue(
  contract: (typeof FIELD_CONTRACTS)[number],
  testValue: number[],
): (typeof FIELD_CONTRACTS)[number] {
  const expected = JSON.stringify(testValue);
  return {
    ...contract,
    testValue,
    preview: { ...contract.preview, expected },
    public: { ...contract.public, expected },
  };
}

function withEditor(
  contract: (typeof FIELD_CONTRACTS)[number],
  editor: Partial<(typeof FIELD_CONTRACTS)[number]['editor']>,
): (typeof FIELD_CONTRACTS)[number] {
  return {
    ...contract,
    editor: { ...contract.editor, ...editor },
  };
}
