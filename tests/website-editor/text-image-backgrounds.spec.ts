import { test, expect } from "@playwright/test";
import type { DraftStatePayload } from "../../src/lib/website-v3/types";

// All writes stay in the synthetic API. No real restaurant is modified.
test("text and image backgrounds survive autosave, reload and publication on desktop and mobile", async ({
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
  await context.route("**/__text-image-fixture/cake.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="500" viewBox="0 0 600 500"><g fill="none" stroke="#d98083" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"><path d="M140 220 L400 140 L460 220 Z M140 220 V365 Q300 390 460 365 V220 M140 270 Q300 290 460 270 M140 320 Q300 340 460 320"/><path d="M320 155 C270 145 285 95 320 110 C350 80 380 135 340 155 Z M320 110 Q315 65 345 60"/></g></svg>',
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
  seed.sections = [
    {
      id: 8001,
      section_type: "text_and_image",
      page: "home",
      page_id: 1,
      sort_order: 0,
      is_visible: true,
      layout: "split_right",
      content: {
        title: "À propos",
        body: "Bienvenue à votre table",
        image_url: "http://localhost:3003/__text-image-fixture/cake.svg",
      },
      settings: {
        color_style: "custom",
        custom_bg: "#fff8ed",
        custom_text: "#d98083",
        image_fit: "contain",
        padding: "normal",
      },
    },
  ];
  expect(
    (
      await request.put(
        "http://127.0.0.1:18081/api/v1/restaurants/1/website-draft",
        { data: seed },
      )
    ).ok(),
  ).toBe(true);
  expect(
    (
      await request.post(
        "http://127.0.0.1:18081/api/v1/restaurants/1/website-publish",
      )
    ).ok(),
  ).toBe(true);

  await page.goto("/1/website-v3");
  const preview = page.frameLocator('iframe[title="Aperçu de Home"]');
  await expect(preview.getByText("À propos", { exact: true })).toBeVisible({
    timeout: 120_000,
  });
  await page
    .getByRole("button", { name: "Texte et image", exact: true })
    .click();
  const panel = page.locator("[data-section-panel]");
  const textColor = panel.locator(
    'input[type="text"][data-field-id="section.settings.text_bg_color"]',
  );
  const imageColor = panel.locator(
    'input[type="text"][data-field-id="section.settings.image_bg_color"]',
  );
  await expect(textColor).toHaveValue("");
  await expect(imageColor).toHaveValue("");
  await textColor.fill("#ffffff");
  await textColor.press("Enter");
  await imageColor.fill("#fff8ed");
  await imageColor.press("Enter");
  const previewText = preview.locator(".website-text-image-copy");
  const previewImage = preview.locator(".website-text-image-media");
  await expect(previewText).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(previewImage).toHaveCSS(
    "background-color",
    "rgb(255, 248, 237)",
  );
  await expect(previewText).toHaveCSS("color", "rgb(217, 128, 131)");
  await expect
    .poll(async () => (await draft()).sections[0].settings)
    .toMatchObject({
      text_bg_color: "#ffffff",
      image_bg_color: "#fff8ed",
      color_style: "custom",
    });

  await textColor.fill("invalid");
  await textColor.press("Enter");
  await expect(panel.getByRole("alert")).toBeVisible();
  expect((await draft()).sections[0].settings.text_bg_color).toBe("#ffffff");
  await textColor.fill("#ffffff");
  await textColor.press("Enter");
  await expect(panel.getByRole("alert")).toHaveCount(0);

  await page.reload();
  await page
    .getByRole("button", { name: "Texte et image", exact: true })
    .click();
  await expect(textColor).toHaveValue("#ffffff");
  await expect(imageColor).toHaveValue("#fff8ed");
  await expect(previewText).toHaveCSS("background-color", "rgb(255, 255, 255)");
  const published = page.waitForResponse(
    (response) =>
      response.url().endsWith("/website-publish") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Publier", exact: true }).click();
  expect((await published).ok()).toBe(true);
  const storefront = await context.newPage();
  await storefront.goto("http://localhost:3000/r/atelier-foody?lang=fr");
  const section = storefront.locator(".website-text-image");
  const copy = section.locator(".website-text-image-copy");
  const media = section.locator(".website-text-image-media");
  for (const width of [1440, 375]) {
    await storefront.setViewportSize({ width, height: 900 });
    await expect(copy).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(media).toHaveCSS("background-color", "rgb(255, 248, 237)");
    await expect(media.locator("img")).toHaveCSS("object-fit", "contain");
    const geometry = await section.evaluate((element) => {
      const text = element
        .querySelector(".website-text-image-copy")!
        .getBoundingClientRect();
      const image = element
        .querySelector(".website-text-image-media")!
        .getBoundingClientRect();
      return {
        text: { x: text.x, y: text.y, height: text.height },
        image: { x: image.x, y: image.y, height: image.height },
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(geometry.overflow).toBe(false);
    if (width === 1440) {
      expect(geometry.text.x).toBeLessThan(geometry.image.x);
      expect(geometry.text.y).toBe(geometry.image.y);
      expect(geometry.text.height).toBe(geometry.image.height);
    } else {
      expect(geometry.image.y).toBeLessThan(geometry.text.y);
    }
    await section.screenshot({
      path: testInfo.outputPath(`backgrounds-${width}.png`),
    });
  }

  await page
    .getByRole("button", { name: "Texte et image", exact: true })
    .click();
  await panel
    .getByRole("button", {
      name: "Fond du texte — Rétablir automatique",
      exact: true,
    })
    .click();
  await expect(textColor).toHaveValue("");
  await expect(imageColor).toHaveValue("#fff8ed");
  await expect(previewText).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect
    .poll(async () => (await draft()).sections[0].settings.text_bg_color)
    .toBe("");
  await panel
    .getByRole("button", { name: "Fond de l’image — Transparent", exact: true })
    .click();
  await expect(previewImage).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect
    .poll(async () => (await draft()).sections[0].settings.image_bg_color)
    .toBe("transparent");
  await storefront.reload();
  await expect(copy).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(media).toHaveCSS("background-color", "rgb(255, 248, 237)");
});
