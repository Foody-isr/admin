import { test, expect } from "@playwright/test";
import type { DraftStatePayload } from "../../src/lib/website-v3/types";

// The API fixture keeps every save and publication in memory.
test("text geometry survives preview, undo, reload and publication on desktop and mobile", async ({
  page,
  context,
  request,
}, testInfo) => {
  test.setTimeout(240_000);
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
  const endpoint = "http://127.0.0.1:18081/api/v1/restaurants/1";
  const draft = async (): Promise<DraftStatePayload> =>
    (await (await request.get(`${endpoint}/website-draft`)).json()).state;
  const seed = await draft();
  seed.sections = [
    {
      id: 8001,
      section_type: "text",
      page: "home",
      page_id: 1,
      sort_order: 0,
      is_visible: true,
      layout: "stacked",
      content: {
        title: "Retrouvez toutes nos pâtisseries cacher",
        body: "Une nouvelle occasion de créer, d’innover et de partager notre passion. ".repeat(
          8,
        ),
        cta_text: "Commander",
        cta_link: "/order",
      },
      settings: {
        color_style: "custom",
        custom_bg: "#fff8ed",
        custom_text: "#d98083",
      },
    },
  ];
  expect(
    (await request.put(`${endpoint}/website-draft`, { data: seed })).ok(),
  ).toBe(true);
  expect((await request.post(`${endpoint}/website-publish`)).ok()).toBe(true);
  await page.goto("/1/website-v3");
  const preview = page.frameLocator('iframe[title="Aperçu de Home"]');
  const section = preview.locator('[data-section-type="text"] section');
  const content = section.locator(":scope > div").last();
  await expect(section).toContainText(
    "Retrouvez toutes nos pâtisseries cacher",
    { timeout: 120_000 },
  );
  await expect(content).toHaveCSS("max-width", "768px");
  await page.getByRole("button", { name: "Texte", exact: true }).click();
  const panel = page.locator("[data-section-panel]");
  const spacing = panel.locator('[data-field-id="section.settings.padding"]');
  const height = panel.locator('[data-field-id="section.settings.height"]');
  const width = panel.locator('[data-field-id="section.settings.width"]');
  await expect(height).toHaveValue("auto");
  await expect(width).toHaveValue("auto");
  for (const [value, pixels] of [
    ["none", 0],
    ["compact", 32],
    ["normal", 64],
    ["spacious", 96],
  ] as const) {
    await spacing.selectOption(value);
    await expect(section).toHaveCSS("padding-top", `${pixels}px`);
    await expect(section).toHaveCSS("padding-bottom", `${pixels}px`);
  }
  for (const [value, pixels] of [
    ["compact", 240],
    ["medium", 400],
    ["tall", 560],
    ["full", 720],
  ] as const) {
    await height.selectOption(value);
    await expect(section).toHaveCSS("min-height", `${pixels}px`);
  }
  for (const [value, pixels] of [
    ["narrow", "640px"],
    ["medium", "960px"],
    ["wide", "1200px"],
    ["full", "none"],
  ]) {
    await width.selectOption(value);
    await expect(content).toHaveCSS("max-width", pixels);
  }
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(width).toHaveValue("wide");
  await expect(content).toHaveCSS("max-width", "1200px");
  await page.getByRole("button", { name: "Rétablir", exact: true }).click();
  await expect(width).toHaveValue("full");
  await panel.getByRole("button", { name: "Côte à côte", exact: true }).click();
  await expect(content.locator(":scope > div")).toHaveCSS(
    "grid-template-columns",
    /\d/,
  );
  await width.selectOption("narrow");
  await height.selectOption("compact");
  await spacing.selectOption("none");
  await expect
    .poll(async () => (await draft()).sections[0])
    .toMatchObject({
      layout: "split",
      settings: { width: "narrow", height: "compact", padding: "none" },
    });
  await page.reload();
  await page.getByRole("button", { name: "Texte", exact: true }).click();
  await expect(width).toHaveValue("narrow");
  await expect(height).toHaveValue("compact");
  await expect(spacing).toHaveValue("none");
  await expect(content).toHaveCSS("max-width", "640px");
  const published = page.waitForResponse(
    (response) =>
      response.url().endsWith("/website-publish") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Publier", exact: true }).click();
  expect((await published).ok()).toBe(true);
  const storefront = await context.newPage();
  await storefront.goto("http://localhost:3000/r/atelier-foody?lang=fr");
  const publicSection = storefront.locator(
    '[data-section-type="text"] section',
  );
  for (const viewport of [1440, 375]) {
    await storefront.setViewportSize({ width: viewport, height: 900 });
    await expect(publicSection).toHaveCSS("min-height", "240px");
    await expect(publicSection).toHaveCSS("padding-top", "0px");
    await expect(publicSection).toHaveCSS(
      "background-color",
      "rgb(255, 248, 237)",
    );
    await expect(publicSection.locator(":scope > div").last()).toHaveCSS(
      "max-width",
      "640px",
    );
    const geometry = await publicSection.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const button = element.querySelector("a")!.getBoundingClientRect();
      return {
        height: box.height,
        buttonBottom: button.bottom - box.top,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(geometry.overflow).toBe(false);
    expect(geometry.buttonBottom).toBeLessThanOrEqual(geometry.height);
    if (viewport === 375) expect(geometry.height).toBeGreaterThan(240);
    await publicSection.screenshot({
      path: testInfo.outputPath(`text-section-${viewport}.png`),
    });
  }
});
