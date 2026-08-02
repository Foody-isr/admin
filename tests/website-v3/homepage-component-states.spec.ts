import type { Browser, FrameLocator, Locator, Page } from '@playwright/test';
import {
  expect,
  openInspectorTab,
  openPublicPage,
  previewFrame,
  publishCurrentDraft,
  selectBuilderPage,
  waitForDraftSaved,
  waitForPreviewReady,
  webBaseURL,
  websiteV3Test,
} from './helpers';

const colors = {
  categoryNormalBg: '#f6e7d8',
  categoryStickyBg: '#14213d',
  ctaTransparentBg: '#102030',
  ctaTransparentText: '#f8fafc',
  ctaTransparentBorder: '#cbd5e1',
  ctaSolidBg: '#f4c95d',
  ctaSolidText: '#172121',
  ctaSolidBorder: '#172121',
  footerBg: '#203040',
  footerText: '#f5efe6',
  highlightCardBg: '#dbeafe',
} as const;

websiteV3Test(
  'homepage and component states persist from iframe draft to public desktop and mobile',
  async ({ browser, builderPage, restaurantSlug }) => {
    await configureHiddenGlobalRestaurantName(builderPage);
    await configureHomepageCtaStates(builderPage);

    const homePreview = previewFrame(builderPage);
    await expectRestaurantName(homePreview, false);
    await expectCtaStates(homePreview);

    await configureOrderHomepage(builderPage);
    await configureCategoryStates(builderPage);
    await configureMenuHighlights(builderPage);
    await configureFooter(builderPage);
    await selectBuilderPage(builderPage, 'Brunch Order');

    const orderPreview = previewFrame(builderPage);
    await expectOrderComponentStates(orderPreview, false);
    await builderPage
      .getByRole('button', { name: 'Aperçu mobile', exact: true })
      .click();
    await waitForPreviewReady(builderPage);
    await expectCategoryStates(previewFrame(builderPage), true);

    await publishCurrentDraft(builderPage);

    const publicPage = await builderPage.context().newPage();
    await publicPage.goto(`${webBaseURL}/r/${restaurantSlug}`);
    await expect(publicPage).toHaveURL(
      new RegExp(`/r/${restaurantSlug}/order(?:[?#]|$)`),
    );
    await expectOrderComponentStates(publicPage);

    await openPublicPage(publicPage, restaurantSlug, 'home');
    await expectRestaurantName(publicPage, false);
    await expectCtaStates(publicPage);

    await expectPublishedMobileStyles(browser, restaurantSlug);
    await publicPage.close();
  },
);

async function configureHiddenGlobalRestaurantName(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Identité du site' }).click();
  await openInspectorTab(page, 'Réglages');
  await page.locator('[data-field-id="site.hide_navbar_name"]').check();
  await waitForDraftSaved(page);
  await waitForPreviewReady(page);
}

async function configureHomepageCtaStates(page: Page): Promise<void> {
  await selectBuilderPage(page, 'Home');
  await openInspectorTab(page, 'Réglages');
  await page
    .locator('[data-field-id="page.appearance_overrides.navbar_style"]')
    .selectOption('overlay');
  await page
    .locator('[data-field-id="page.appearance_overrides.navbar_cta"]')
    .check();
  await page
    .locator(
      '[data-field-id="page.appearance_overrides.navbar_cta.transparent.variant"]',
    )
    .selectOption('outline');
  await fillColor(
    page,
    'page.appearance_overrides.navbar_cta.transparent.bg',
    colors.ctaTransparentBg,
  );
  await fillColor(
    page,
    'page.appearance_overrides.navbar_cta.transparent.text_color',
    colors.ctaTransparentText,
  );
  await fillColor(
    page,
    'page.appearance_overrides.navbar_cta.transparent.border_color',
    colors.ctaTransparentBorder,
  );
  await page
    .locator(
      '[data-field-id="page.appearance_overrides.navbar_cta.solid.variant"]',
    )
    .selectOption('filled');
  await fillColor(
    page,
    'page.appearance_overrides.navbar_cta.solid.bg',
    colors.ctaSolidBg,
  );
  await fillColor(
    page,
    'page.appearance_overrides.navbar_cta.solid.text_color',
    colors.ctaSolidText,
  );
  await fillColor(
    page,
    'page.appearance_overrides.navbar_cta.solid.border_color',
    colors.ctaSolidBorder,
  );
  await waitForDraftSaved(page);
  await waitForPreviewReady(page);
}

async function configureOrderHomepage(page: Page): Promise<void> {
  await selectBuilderPage(page, 'Brunch Order');
  await openInspectorTab(page, 'Réglages');

  const defaultOrder = page.locator('[data-field-id="page.is_default"]');
  await expect(defaultOrder).toBeChecked();
  await page.locator('[data-field-id="page.is_homepage"]').check();
  await expect(defaultOrder).toBeChecked();
  await page
    .locator('[data-field-id="page.appearance_overrides.hide_navbar_name"]')
    .selectOption('show');
  await waitForDraftSaved(page);
  await waitForPreviewReady(page);
}

async function configureCategoryStates(page: Page): Promise<void> {
  await openInspectorTab(page, 'Apparence');
  await fillColor(
    page,
    'page.appearance_overrides.section_colors.categoryBar.bg',
    colors.categoryNormalBg,
  );
  await page
    .locator(
      '[data-field-id="page.appearance_overrides.section_colors.categoryBarSticky"]',
    )
    .check();
  await fillColor(
    page,
    'page.appearance_overrides.section_colors.categoryBarSticky.bg',
    colors.categoryStickyBg,
  );
  await waitForDraftSaved(page);
  await waitForPreviewReady(page);
}

async function configureMenuHighlights(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Menu highlights', exact: true }).click();
  await openInspectorTab(page, 'Contenu');
  const seededItem = page.getByRole('button', {
    name: /Website V3 Shakshuka/,
  });
  await expect(seededItem).toBeVisible();
  await seededItem.click();
  await waitForDraftSaved(page);
  await waitForPreviewReady(page);

  await openInspectorTab(page, 'Apparence');
  await fillColor(page, 'section.settings.card_bg', colors.highlightCardBg);
  await waitForDraftSaved(page);
  await waitForPreviewReady(page);
}

async function configureFooter(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Identité du site' }).click();
  await openInspectorTab(page, 'Contenu');
  await page
    .locator('[data-field-id="site.footer.content.custom_text"]')
    .fill('Website V3 state footer');
  await openInspectorTab(page, 'Apparence');
  await page
    .locator('[data-field-id="site.footer.settings.color_style"]')
    .selectOption('custom');
  await fillColor(page, 'site.footer.settings.custom_bg', colors.footerBg);
  await fillColor(page, 'site.footer.settings.custom_text', colors.footerText);
  await waitForDraftSaved(page);
  await waitForPreviewReady(page);
}

async function expectCtaStates(root: Page | FrameLocator): Promise<void> {
  const navbar = root.locator('nav[data-navbar-state]').first();
  const cta = root.locator('[data-navbar-cta-state]').first();

  await expect(navbar).toHaveAttribute('data-navbar-state', 'transparent');
  await expect(cta).toHaveAttribute('data-navbar-cta-state', 'transparent');
  await expect(cta).toHaveAttribute('data-navbar-cta-variant', 'outline');
  await expect(cta).toHaveCSS('background-color', rgb(colors.ctaTransparentBg));
  await expect(cta).toHaveCSS('color', rgb(colors.ctaTransparentText));
  await expect(cta).toHaveCSS('border-color', rgb(colors.ctaTransparentBorder));

  await navbar.hover();
  await expect(navbar).toHaveAttribute('data-navbar-state', 'solid');
  await expect(cta).toHaveAttribute('data-navbar-cta-state', 'solid');
  await expect(cta).toHaveAttribute('data-navbar-cta-variant', 'filled');
  await expect(cta).toHaveCSS('background-color', rgb(colors.ctaSolidBg));
  await expect(cta).toHaveCSS('color', rgb(colors.ctaSolidText));
  await expect(cta).toHaveCSS('border-color', rgb(colors.ctaSolidBorder));

  await root
    .locator('[data-section-type="hero_banner"]')
    .getByRole('heading')
    .first()
    .hover();
  await expect(navbar).toHaveAttribute('data-navbar-state', 'transparent');
}

async function expectOrderComponentStates(
  root: Page | FrameLocator,
  assertSticky = true,
): Promise<void> {
  await expectRestaurantName(root, true);

  await expectCategoryStates(root, assertSticky);

  const highlights = root.locator('[data-section-type="menu_highlights"]').first();
  await expect(highlights).toHaveAttribute(
    'data-field-section-settings-card-bg',
    colors.highlightCardBg,
  );
  const highlightCard = highlights.getByRole('link', {
    name: /Website V3 Shakshuka/,
  });
  await expect(highlightCard).toHaveCSS(
    'background-color',
    rgb(colors.highlightCardBg),
  );

  const footer = root.locator('footer').first();
  await expect(footer).toHaveCSS('background-color', rgb(colors.footerBg));
  await expect(footer).toHaveCSS('color', rgb(colors.footerText));
  await expect(footer.locator('[data-footer-text]')).toContainText(
    'Website V3 state footer',
  );

}

async function expectCategoryStates(
  root: Page | FrameLocator,
  assertSticky: boolean,
): Promise<void> {
  const categoryBar = root.locator('[data-category-bar-state]').first();
  await expect(categoryBar).toHaveAttribute('data-category-bar-state', 'normal');
  await expect(categoryBar).toHaveCSS(
    'background-color',
    rgb(colors.categoryNormalBg),
  );
  if (!assertSticky) return;

  await makeCategoryBarSticky(categoryBar);
  await expect(categoryBar).toHaveAttribute('data-category-bar-state', 'sticky');
  await expect(categoryBar).toHaveCSS(
    'background-color',
    rgb(colors.categoryStickyBg),
  );
}

async function expectPublishedMobileStyles(
  browser: Browser,
  restaurantSlug: string,
): Promise<void> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto(`${webBaseURL}/r/${restaurantSlug}/order`);

  await expectCategoryStates(page, true);
  await expect(
    page
      .locator('[data-section-type="menu_highlights"]')
      .getByRole('link', { name: /Website V3 Shakshuka/ }),
  ).toHaveCSS('background-color', rgb(colors.highlightCardBg));
  await expect(page.locator('footer').first()).toHaveCSS(
    'background-color',
    rgb(colors.footerBg),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);

  await context.close();
}

async function expectRestaurantName(
  root: Page | FrameLocator,
  visible: boolean,
): Promise<void> {
  const name = root
    .locator('nav[data-navbar-state]')
    .first()
    .getByText('Website V3 E2E Restaurant', { exact: true });
  if (visible) {
    await expect(name).toBeVisible();
    return;
  }
  await expect(name).toHaveCount(0);
}

async function fillColor(page: Page, fieldId: string, value: string): Promise<void> {
  const input = page
    .locator(`input[type="text"][data-field-id="${fieldId}"]`)
    .filter({ visible: true })
    .last();
  await expect(input).toBeVisible();
  await input.fill(value);
}

async function makeCategoryBarSticky(categoryBar: Locator): Promise<void> {
  await categoryBar.evaluate((element) => {
    const scrollingElement = document.scrollingElement;
    if (!scrollingElement) throw new Error('Missing document scrolling element.');
    const top = element.getBoundingClientRect().top + scrollingElement.scrollTop;
    scrollingElement.scrollTop = top + element.clientHeight + 160;
  });
}

function rgb(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
}
