import {
  expect,
  openInspectorTab,
  previewFrame,
  selectBuilderPage,
  waitForDraftSaved,
  waitForPreviewReady,
  websiteV3Test,
} from "./helpers";

const fixturePages = [
  { title: "Home", slug: "home", type: "landing", navVisible: true },
  { title: "About", slug: "about", type: "content", navVisible: true },
  {
    title: "Brunch Order",
    slug: "brunch-order",
    type: "order",
    navVisible: true,
  },
  {
    title: "Dinner Order",
    slug: "dinner-order",
    type: "order",
    navVisible: true,
  },
  {
    title: "Office Catering",
    slug: "office-catering",
    type: "catering",
    navVisible: true,
  },
  {
    title: "Celebration Catering",
    slug: "celebration-catering",
    type: "catering",
    navVisible: true,
  },
] as const;

websiteV3Test(
  "desktop preview uses a 1280-pixel viewport with inline page links",
  async ({ builderPage }) => {
    const preview = previewFrame(builderPage);
    await expect.poll(() =>
      preview.locator("html").evaluate(() => window.innerWidth),
    ).toBe(1280);

    for (const page of fixturePages) {
      await expect(
        preview.getByRole("link", { name: page.title, exact: true }),
      ).toBeVisible();
    }
  },
);

websiteV3Test(
  "navigation settings list every fixture page with its visibility state",
  async ({ builderPage }) => {
    await builderPage.getByRole("button", { name: "Identité du site" }).click();
    await openInspectorTab(builderPage, "Réglages");

    const switches = builderPage.locator(
      'input[data-field-id^="site.navigation-page."]',
    );
    await expect(switches).toHaveCount(fixturePages.length);
    const pageRows = builderPage.locator(
      'label:has(input[data-field-id^="site.navigation-page."])',
    );
    await expect(pageRows).toHaveText(
      fixturePages.map((page) => `${page.title}/${page.slug} · ${page.type}`),
    );

    for (const page of fixturePages) {
      const pageRow = pageRows.filter({ hasText: page.title });
      await expect(pageRow).toContainText(`/${page.slug}`);
      await expect(pageRow).toContainText(page.type);

      const pageSwitch = pageRow.locator(
        'input[data-field-id^="site.navigation-page."]',
      );
      if (page.navVisible) {
        await expect(pageSwitch).toBeChecked();
      } else {
        await expect(pageSwitch).not.toBeChecked();
      }
    }
  },
);

websiteV3Test(
  "navigation visibility switches update the preview navbar immediately",
  async ({ builderPage }) => {
    await builderPage.getByRole("button", { name: "Identité du site" }).click();
    await openInspectorTab(builderPage, "Réglages");
    await builderPage
      .getByRole("button", { name: "Aperçu mobile", exact: true })
      .click();
    await waitForPreviewReady(builderPage);

    const aboutRow = builderPage
      .locator('label:has(input[data-field-id^="site.navigation-page."])')
      .filter({ hasText: "About" });
    const aboutSwitch = aboutRow.locator(
      'input[data-field-id^="site.navigation-page."]',
    );
    const preview = previewFrame(builderPage);
    await preview.getByRole("button", { name: "Primary navigation" }).click();
    const aboutLink = preview.getByRole("link", { name: "About", exact: true });

    await expect(aboutLink).toBeVisible();
    await aboutSwitch.uncheck();
    await waitForDraftSaved(builderPage);
    await waitForPreviewReady(builderPage);
    await expect(aboutLink).toBeHidden();

    await aboutSwitch.check();
    await waitForDraftSaved(builderPage);
    await waitForPreviewReady(builderPage);
    await expect(aboutLink).toBeVisible();
  },
);

websiteV3Test(
  "hero overlay navigation changes from transparent resting colors to hover colors",
  async ({ builderPage }) => {
    await builderPage.getByRole("button", { name: "Identité du site" }).click();
    await openInspectorTab(builderPage, "Réglages");

    await builderPage
      .locator('select[data-field-id="site.navbar_style"]')
      .selectOption("overlay");
    await builderPage
      .locator('input[type="text"][data-field-id="site.navbar_color"]')
      .fill("#ffffff");
    await builderPage
      .locator(
        'input[type="text"][data-field-id="site.navbar_overlay_text_color"]',
      )
      .fill("#ffffff");
    await builderPage
      .locator('input[type="text"][data-field-id="site.navbar_text_color"]')
      .fill("#111111");
    await waitForDraftSaved(builderPage);
    await waitForPreviewReady(builderPage);

    const preview = previewFrame(builderPage);
    const navbar = preview.locator("nav").first();
    const homeLink = preview.getByRole("link", { name: "Home", exact: true });

    await expect(navbar).toHaveAttribute("data-navbar-state", "transparent");
    await expect(navbar).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(homeLink).toHaveCSS("color", "rgb(255, 255, 255)");

    await navbar.hover();

    await expect(navbar).toHaveAttribute("data-navbar-state", "solid");
    await expect(navbar).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(homeLink).toHaveCSS("color", "rgb(17, 17, 17)");

    await preview.getByRole("heading", { name: "Website V3 E2E" }).hover();

    await expect(navbar).toHaveAttribute("data-navbar-state", "transparent");
    await expect(navbar).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(homeLink).toHaveCSS("color", "rgb(255, 255, 255)");

    await homeLink.focus();

    await expect(navbar).toHaveAttribute("data-navbar-state", "solid");
    await expect(navbar).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(homeLink).toHaveCSS("color", "rgb(17, 17, 17)");

    await preview
      .getByRole("link", { name: "Order brunch", exact: true })
      .focus();

    await expect(navbar).toHaveAttribute("data-navbar-state", "transparent");
    await expect(navbar).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(homeLink).toHaveCSS("color", "rgb(255, 255, 255)");
  },
);

websiteV3Test(
  "overlay navigation stays solid when a reordered non-hero section renders first",
  async ({ builderPage }) => {
    await builderPage.getByRole("button", { name: "Identité du site" }).click();
    await openInspectorTab(builderPage, "Réglages");

    await builderPage
      .locator('select[data-field-id="site.navbar_style"]')
      .selectOption("overlay");
    await builderPage
      .locator('input[type="text"][data-field-id="site.navbar_color"]')
      .fill("#ffffff");
    await builderPage
      .locator(
        'input[type="text"][data-field-id="site.navbar_overlay_text_color"]',
      )
      .fill("#ffffff");
    await builderPage
      .locator('input[type="text"][data-field-id="site.navbar_text_color"]')
      .fill("#111111");
    await waitForDraftSaved(builderPage);
    await waitForPreviewReady(builderPage);

    await selectBuilderPage(builderPage, "Home");
    await builderPage
      .getByRole("button", { name: "Hero banner", exact: true })
      .click();
    await builderPage
      .locator(
        'button[data-field-id="section.sort_order"][aria-label="Descendre"]',
      )
      .click();
    await waitForDraftSaved(builderPage);
    await waitForPreviewReady(builderPage);

    const preview = previewFrame(builderPage);
    const navbar = preview.locator("nav").first();
    const homeLink = preview.getByRole("link", { name: "Home", exact: true });

    await expect(preview.locator("[data-section-type]").first()).toHaveAttribute(
      "data-section-type",
      "feature_cards",
    );
    await expect(navbar).toHaveAttribute("data-navbar-state", "solid");
    await expect(navbar).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(homeLink).toHaveCSS("color", "rgb(17, 17, 17)");
  },
);
