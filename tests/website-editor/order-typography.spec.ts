import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DraftStatePayload } from "../../src/lib/website-v3/types";

test("site font sizes and weights are shared by the editor, the published site and the installed app", async ({
  page, context, request,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("foody_restaurant_token", "isolated-ui-fixture");
    localStorage.setItem("foody_restaurant_user", JSON.stringify({ id: 1, full_name: "Demo", role: "manager", email: "demo@foody.test" }));
    localStorage.setItem("foody_restaurant_ids", "[1]");
    localStorage.setItem("foody-admin-locale", "fr");
  });
  await context.route("**/*", route =>
    ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort(),
  );
  const fixture = `http://127.0.0.1:${process.env.FOODY_WEBSITE_EDITOR_API_PORT ?? 18081}/api/v1/restaurants/1`;
  const draft = async (): Promise<DraftStatePayload> => (await (await request.get(fixture + "/website-draft")).json()).state;
  const initial = await draft();
  try {
    const seed = structuredClone(initial);
    const home = seed.pages.find(entry => entry.type === "landing")!;
    for (const entry of seed.pages) entry.is_homepage = entry === home;
    seed.config.typography = { site: { headingFont: "Manrope", bodyFont: "Inter" } };
    seed.config.nav_layout = { mobile_experience: {
      version: 1,
      navigation: { enabled: true, items: [
        { id: "home", target: "home", placement: "bar" },
        { id: "more", target: "more", placement: "bar" },
        { id: "orders", target: "orders", placement: "more" },
      ] },
    } };
    const content = {
      id: 71, section_type: "text", page: home.slug, page_id: home.id, sort_order: 0,
      is_visible: true, layout: "default",
      content: { title: "Les titres du site", body: "Un texte qui suit le design du site." }, settings: {},
    };
    seed.sections = [content, {
      ...content, id: 72, sort_order: 1, content: { title: "Titre personnalisé" },
      settings: { title_size: "sm", title_weight: "bold" },
    }];
    expect((await request.put(fixture + "/website-draft", { data: seed })).ok()).toBe(true);
    expect((await request.post(fixture + "/website-publish")).ok()).toBe(true);

    const openFonts = async () => {
      await page.getByRole("button", { name: "Design du site", exact: true }).click();
      await page.getByRole("button", { name: /^Polices/ }).click();
    };
    await page.goto("/1/website-v3");
    await openFonts();
    const preview = page.frameLocator("iframe");
    const title = preview.getByRole("heading", { name: "Les titres du site" });
    const body = preview.getByText("Un texte qui suit le design du site.", { exact: true });
    const localTitle = preview.getByRole("heading", { name: "Titre personnalisé" });
    await expect(title).toBeVisible();
    const fontSize = (element: Element) => parseFloat(getComputedStyle(element).fontSize);
    const initialTitle = await title.evaluate(fontSize);
    const initialBody = await body.evaluate(fontSize);
    const localSize = await localTitle.evaluate(fontSize);

    const headings = page.getByRole("group", { name: "Titres", exact: true });
    const paragraphs = page.getByRole("group", { name: "Paragraphes", exact: true });
    const size = (group: typeof headings) => group.getByRole("textbox", { name: "Taille du texte (%)" });
    const weight = (group: typeof headings) => group.getByRole("combobox", { name: "Graisse du texte" });
    await size(headings).fill("125");
    await weight(headings).selectOption("600");
    await size(paragraphs).fill("120");
    await weight(paragraphs).selectOption("500");
    await expect(title).toHaveCSS("font-weight", "600");
    await expect(body).toHaveCSS("font-weight", "500");
    await expect.poll(() => title.evaluate(fontSize)).toBeCloseTo(initialTitle * 1.25);
    await expect.poll(() => body.evaluate(fontSize)).toBeCloseTo(initialBody * 1.2);
    await expect(localTitle).toHaveCSS("font-weight", "700");
    expect(await localTitle.evaluate(fontSize)).toBe(localSize);
    await expect.poll(async () => (await draft()).config.typography).toMatchObject({
      site: { headingSizeMult: 1.25, headingWeight: 600, bodySizeMult: 1.2, bodyWeight: 500 },
    });

    await page.reload();
    await openFonts();
    await expect(size(headings)).toHaveValue("125");
    await expect(weight(paragraphs)).toHaveValue("500");
    for (const format of ["Vue téléphone", "Vue ordinateur"]) {
      await page.getByRole("button", { name: "Format de l’aperçu", exact: true }).click();
      await page.getByRole("menuitemradio", { name: format, exact: true }).click();
      await expect(title).toHaveCSS("font-weight", "600");
    }
    const publish = page.getByRole("button", { name: "Publier", exact: true });
    await expect(publish).not.toHaveAttribute("title", /Vérifiez/);
    await publish.click();
    await expect.poll(async () => (await (await request.get(fixture + "/website-draft")).json()).draft_dirty).toBe(false);

    const storefront = await context.newPage();
    const root = "http://localhost:3000/r/atelier-foody";
    await storefront.goto(root + "?lang=fr");
    const theme = storefront.locator("html");
    await expect(theme).toHaveCSS("--site-heading-scale", "1.25");
    await expect(theme).toHaveCSS("--site-body-scale", "1.2");
    await expect(storefront.getByRole("heading", { name: "Les titres du site" })).toHaveCSS("font-weight", "600");
    await expect(storefront.getByText("Un texte qui suit le design du site.", { exact: true })).toHaveCSS("font-weight", "500");
    await storefront.goto(root + "/account/more?lang=fr");
    const more = storefront.locator(".mobile-more");
    await expect(more.getByRole("heading", { name: "Plus", exact: true })).toHaveCSS("font-weight", "600");
    await expect(more.getByRole("link", { name: "Historique" })).toHaveCSS("font-weight", "500");
    const desktopSize = await more.locator("h1").evaluate(fontSize);
    await storefront.setViewportSize({ width: 390, height: 844 });
    expect(await more.locator("h1").evaluate(fontSize)).toBe(desktopSize);
    await storefront.addInitScript(() => Object.defineProperty(navigator, "standalone", { value: true }));
    await storefront.reload();
    await expect(storefront.locator(".mobile-tabbar")).toBeVisible();
    await expect(theme).toHaveCSS("--site-heading-scale", "1.25");
    await expect(theme).toHaveCSS("--site-body-scale", "1.2");
    await expect(more.getByRole("link", { name: "Historique" })).toHaveCSS("font-weight", "500");
    await expect(storefront.locator('.mobile-tabbar [data-mobile-tab="more"]')).toHaveCSS("font-weight", "500");
    await expect.poll(() => more.locator("h1").evaluate(fontSize)).toBe(desktopSize);
  } finally {
    for (const tab of context.pages()) await tab.close();
    expect((await request.put(fixture + "/website-draft", { data: initial })).ok()).toBe(true);
    expect((await request.post(fixture + "/website-publish")).ok()).toBe(true);
  }
});

// All saves/publications are synthetic and remain inside the fixture server.
test("uploaded fonts, inherited menu typography and spacing survive preview, reload and publication", async ({
  page,
  context,
  request,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("foody_restaurant_token", "isolated-ui-fixture");
    localStorage.setItem(
      "foody_restaurant_user",
      JSON.stringify({
        id: 1,
        full_name: "Demo",
        role: "manager",
        email: "demo@foody.test",
      }),
    );
    localStorage.setItem("foody_restaurant_ids", "[1]");
    localStorage.setItem("foody-admin-locale", "fr");
  });
  await context.route("**/*", (route) =>
    ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort(),
  );
  const fontBytes = await readFile(
    join(
      dirname(require.resolve("next/package.json")),
      "dist/next-devtools/server/font/geist-mono-latin.woff2",
    ),
  );
  await context.route("**/fixture-font*.woff2", (route) =>
    route.fulfill({
      body: fontBytes,
      contentType: "font/woff2",
      headers: { "Access-Control-Allow-Origin": "*" },
    }),
  );
  await context.route("**/api/v1/restaurants/1/website-fonts", (route) =>
    route.fulfill({
      json: {
        url: "http://localhost:3000/fixture-font-new.woff2",
        format: "woff2",
        key: "restaurants/1/fonts/fixture.woff2",
      },
    }),
  );
  const draft = async (): Promise<DraftStatePayload> =>
    (
      await (
        await request.get(
          "http://127.0.0.1:18081/api/v1/restaurants/1/website-draft",
        )
      ).json()
    ).state;
  const seed = await draft();
  seed.config.category_banner_style = "text-block";
  seed.config.typography = {
    roles: { categoryTitle: { font: "Owned font", sizeMult: 3, weight: 400 } },
    extraFonts: [
      {
        family: "Owned font",
        category: "custom",
        weights: [300, 400],
        supportsHebrew: false,
        faces: [
          {
            url: "http://localhost:3000/fixture-font-light.woff2",
            weight: 300,
            format: "woff2",
          },
          {
            url: "http://localhost:3000/fixture-font-regular.woff2",
            weight: 400,
            format: "woff2",
          },
        ],
      },
    ],
  };
  seed.sections = [];
  for (const item of seed.pages) item.is_homepage = item.type === "order";
  const order = seed.pages.find((item) => item.type === "order")!;
  order.appearance_overrides = {
    foody_renderer_version: 1,
    website_order: {
      card_style: "filled",
      show_banner: false,
      prompt_on_entry: false,
    },
  };
  await request.put(
    "http://127.0.0.1:18081/api/v1/restaurants/1/website-draft",
    { data: seed },
  );
  await request.post(
    "http://127.0.0.1:18081/api/v1/restaurants/1/website-publish",
  );
  await page.goto("/1/website-v3");
  const preview = page.frameLocator("iframe");
  const heading = preview.locator(".website-order-category h2").first();
  await expect(heading).toHaveCSS("font-family", /Owned font/, {
    timeout: 60_000,
  });
  await expect(heading).toHaveCSS("font-size", "108px");
  await expect(preview.locator(".website-order-navigation")).toHaveAttribute(
    "data-shape",
    "pill",
  );
  await expect
    .poll(() =>
      heading.evaluate(async (el) => {
        await document.fonts.ready;
        return (
          document.fonts.check('400 20px "Owned font"') &&
          getComputedStyle(el).fontFamily.includes("Owned font")
        );
      }),
    )
    .toBe(true);

  await page
    .getByRole("button", { name: "Design du site", exact: true })
    .click();
  await page.getByRole("button", { name: /^Polices/ }).click();
  await expect(page.locator(".sqe-sidebar")).toContainText("Owned font");
  await page
    .getByRole("button", { name: "Importer une police", exact: true })
    .click();
  await page
    .locator('input[type="file"]')
    .setInputFiles({
      name: "New-Regular.woff2",
      mimeType: "font/woff2",
      buffer: fontBytes,
    });
  await page.getByPlaceholder("Nom de la police").fill("New font");
  await page
    .getByLabel("J'ai le droit d'utiliser cette police sur ce site.")
    .check();
  await page
    .getByRole("button", { name: "Importer et utiliser", exact: true })
    .click();
  await expect
    .poll(async () => (await draft()).config.typography)
    .toMatchObject({
      extraFonts: [
        {
          family: "Owned font",
          faces:
            seed.config.typography &&
            (seed.config.typography as { extraFonts: { faces: unknown }[] })
              .extraFonts[0].faces,
        },
        { family: "New font" },
      ],
    });

  await page.reload();
  await page
    .getByRole("button", { name: "Liste des articles", exact: true })
    .click();
  const titleSettings = page
    .locator("details")
    .filter({
      has: page.locator("summary", {
        hasText: "Style des titres de catégories",
      }),
    });
  await titleSettings.locator("summary").click();
  await expect(titleSettings.getByLabel("Taille du texte (%)")).toHaveValue(
    "300",
  );
  await titleSettings
    .getByRole("button", { name: "Owned font", exact: true })
    .click();
  await titleSettings
    .getByRole("button", { name: "New font", exact: true })
    .click();
  await titleSettings.getByLabel("Taille du texte (%)").fill("");
  await titleSettings.getByLabel("Taille du texte (%)").pressSequentially("200");
  await titleSettings.getByLabel("Espace entre les catégories (px)").fill("72");
  await expect(heading).toHaveCSS("font-family", /New font/);
  await expect(heading).toHaveCSS("font-size", "72px");
  expect(await heading.evaluate(async () => (await document.fonts.load('400 20px "New font"', "Kitchen")).length)).toBeGreaterThan(0);
  const categorySettings = page
    .locator("details")
    .filter({
      has: page.locator("summary", { hasText: "Menu des catégories" }),
    });
  await categorySettings.locator("summary").click();
  await categorySettings
    .getByLabel("Espace entre les titres du menu (px)")
    .fill("36");
  await expect(
    preview.locator(".website-order-navigation nav > div").first(),
  ).toHaveCSS("gap", "36px");
  await expect(preview.locator(".website-order-category").first()).toHaveCSS(
    "margin-bottom",
    "72px",
  );
  await expect
    .poll(
      async () =>
        (await draft()).pages.find((item) => item.type === "order")
          ?.appearance_overrides,
    )
    .toMatchObject({
      typography: {
        roles: { categoryTitle: { font: "New font", sizeMult: 2 } },
      },
      website_order: { category_gap: 36, category_spacing: 72 },
    });
  await page.screenshot({path: "test-results/website-editor/font-size-spacing-controls.png"});
  await page.reload();
  await expect(heading).toHaveCSS("font-family", /New font/);
  await expect(heading).toHaveCSS("font-size", "72px");
  await page.screenshot({
    path: "test-results/website-editor/restored-fonts.png",
  });
  await page.getByRole("button", { name: "Liste des articles", exact: true }).click();
  const published = page.waitForResponse(
    (response) =>
      response.url().endsWith("/website-publish") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Publier", exact: true }).click();
  expect((await published).ok()).toBe(true);
  const sidebar = page.getByRole("complementary");
  await expect(sidebar.getByRole("button", { name: "Liste des articles", exact: true })).toBeVisible();
  await expect(sidebar).not.toContainText("Identité de la page");
  await expect(sidebar).not.toContainText("Direction visuelle de la page");

  // Page settings retain their staged Save/Cancel behavior after retiring PageInspector.
  const beforeSettings = await draft();
  await page.getByRole("button", { name: "Paramètres de la page", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Paramètres de la page", exact: true });
  const menuRows = settings.getByRole("group", { name: "Cartes affichées sur cette page" }).locator("label");
  expect(await menuRows.count()).toBeGreaterThan(0);
  expect(await menuRows.evaluateAll((rows) => rows.every((row) => {
    const checkbox = row.querySelector("input")!.getBoundingClientRect();
    const text = row.querySelector("span")!.getBoundingClientRect();
    return Math.abs((checkbox.top + checkbox.height / 2) - (text.top + text.height / 2)) < 1;
  }))).toBe(true);
  await settings.getByRole("textbox", { name: "Nom de la page", exact: true }).fill("Cancelled title");
  await settings.getByRole("group", { name: "Cartes affichées sur cette page" }).getByRole("checkbox").first().uncheck();
  await settings.getByRole("button", { name: "Annuler", exact: true }).click();
  expect((await draft()).pages).toEqual(beforeSettings.pages);

  // Shared selection and the design panel must also reset to the outline.
  for (const context of ["header", "fonts"]) {
    if (context === "header") {
      await page.getByRole("button", { name: "En-tête", exact: true }).click();
    } else {
      await page.getByRole("button", { name: "Design du site", exact: true }).click();
      await page.getByRole("button", { name: /^Polices/ }).click();
    }
    const response = page.waitForResponse((item) =>
      item.url().endsWith("/website-publish") && item.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Publier", exact: true }).click();
    expect((await response).ok()).toBe(true);
    await expect(sidebar.getByRole("button", { name: "Liste des articles", exact: true })).toBeVisible();
    await expect(sidebar).not.toContainText("Direction visuelle de la page");
  }
  await page.screenshot({ path: "test-results/website-editor/publication-current-outline.png" });
  const storefront = await context.newPage();
  for (const [width, language] of [
    [1280, "fr"],
    [375, "fr"],
    [375, "he"],
  ] as const) {
    await storefront.setViewportSize({ width, height: 900 });
    await storefront.goto(
      `http://localhost:3000/r/atelier-foody/order?lang=${language}`,
    );
    const title = storefront.locator(".website-order-category h2").first();
    await expect(title).toHaveCSS("font-family", /New font/);
    await expect(title).toHaveCSS("font-size", "72px");
    await expect(
      storefront.locator(".website-order-navigation nav > div").first(),
    ).toHaveCSS("gap", "36px");
    expect(
      await storefront.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});
