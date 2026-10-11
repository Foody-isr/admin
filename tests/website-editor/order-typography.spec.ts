import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DraftStatePayload } from "../../src/lib/website-v3/types";

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
