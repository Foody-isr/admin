import {
  expect,
  openInspectorTab,
  previewFrame,
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
