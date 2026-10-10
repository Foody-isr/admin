import { test, expect } from "@playwright/test";
import { normalizeWebsiteHeader } from "../../src/lib/website-v3/header";
import { normalizeSiteColors } from "../../src/lib/website-v3/site-colors";
import type { DraftStatePayload } from "../../src/lib/website-v3/types";

test("service colors edit independently, survive publication, and the availability filter fits in LTR and RTL", async ({ page, request, context }) => {
  await page.addInitScript(() => {
    localStorage.setItem("foody_restaurant_token", "isolated-ui-fixture");
    localStorage.setItem("foody_restaurant_user", JSON.stringify({id: 1, full_name: "Demo", role: "manager", email: "demo@foody.test"}));
    localStorage.setItem("foody_restaurant_ids", "[1]");
    localStorage.setItem("foody-admin-locale", "fr");
  });
  await context.route("**/*", route => ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const draft = async (): Promise<DraftStatePayload> =>
    (await (await request.get("http://127.0.0.1:18081/api/v1/restaurants/1/website-draft")).json()).state;
  const seed = await draft();
  const colors = normalizeSiteColors({bg: "#15200e", ink: "#ffffff", accent: "#ffffff"});
  Object.assign(colors.styles[0], {background: "#15200e", title: "#ffffff", paragraph: "#ffffff"});
  Object.assign(colors.styles[1], {background: "#f4ede0", title: "#223311", paragraph: "#223311"});
  seed.config.nav_layout = {header: normalizeWebsiteHeader({layout: "left", color_style: "style-1", scroll: "none", fulfillment: {enabled: true}})};
  seed.config.custom_palette = {mode: "light", bg: "#15200e", surface: "#20301a", ink: "#ffffff", accent: "#ffffff", color_styles: colors};
  seed.sections = [];
  const order = seed.pages.find(value => value.type === "order")!;
  order.appearance_overrides = {foody_renderer_version: 1, website_order: {
    color_style: "style-1", show_availability_filter: true, show_fulfillment: true, prompt_on_entry: false, show_banner: false,
  }};
  await request.put("http://127.0.0.1:18081/api/v1/restaurants/1/website-draft", {data: seed});
  await request.post("http://127.0.0.1:18081/api/v1/restaurants/1/website-publish");
  await page.goto("/1/website-v3");
  await expect(page.getByRole("button", {name: "En-tête", exact: true})).toBeVisible({timeout: 60_000});
  await page.getByRole("button", {name: "En-tête", exact: true}).click();
  await page.getByRole("button", {name: "Retrait, livraison et planification", exact: true}).click();
  const picker = page.locator('[data-field-id="header.restaurant.info_color_style"]');
  await picker.getByRole("button", {name: "Style de couleurs 2", exact: true}).click();
  const preview = page.frameLocator('iframe[title="Aperçu de Home"]');
  await expect(preview.locator(".website-header")).toHaveCSS("background-color", "rgb(21, 32, 14)");
  await expect(preview.locator(".website-service-location")).toHaveCSS("background-color", "rgb(244, 237, 224)");
  await expect(preview.locator(".website-service-location")).toHaveCSS("color", "rgb(34, 51, 17)");
  await expect.poll(async () => (await draft()).config.nav_layout).toMatchObject({header: {color_style: "style-1", restaurant: {info_color_style: "style-2"}}});
  await page.reload();
  await page.getByRole("button", {name: "En-tête", exact: true}).click();
  await page.getByRole("button", {name: "Retrait, livraison et planification", exact: true}).click();
  await expect(picker.getByRole("button", {name: "Style de couleurs 2", exact: true})).toHaveAttribute("aria-pressed", "true");
  const publish = page.getByRole("button", {name: "Publier", exact: true});
  await expect(publish).not.toHaveAttribute("title", /.+/);
  const published = page.waitForResponse(response => response.url().endsWith("/website-publish") && response.request().method() === "POST");
  await publish.click();
  expect((await published).ok()).toBe(true);
  const storefront = await context.newPage();
  for (const path of ["", "/order"]) {
    await storefront.goto(`http://localhost:3000/r/atelier-foody${path}?lang=fr`);
    await expect(storefront.locator(".website-header")).toHaveCSS("background-color", "rgb(21, 32, 14)");
    await expect(storefront.locator(".website-service-location")).toHaveCSS("background-color", "rgb(244, 237, 224)");
  }
  for (const [width, locale] of [[1280, "fr"], [320, "fr"], [320, "he"]] as const) {
    await storefront.setViewportSize({width, height: 900});
    await storefront.goto(`http://localhost:3000/r/atelier-foody/order?lang=${locale}`);
    const filter = storefront.locator(".website-availability-filter select");
    await expect(filter).toBeVisible();
    await expect(filter).toHaveCSS("appearance", "none");
    await expect(filter).toHaveCSS("height", "44px");
    await filter.focus();
    await expect(filter).toHaveCSS("outline-style", "solid");
    await filter.selectOption("available");
    await expect(filter).toHaveValue("available");
    await filter.selectOption("all");
    expect(await storefront.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const selectBox = await filter.boundingBox();
    const arrowBox = await storefront.locator(".website-availability-filter > svg").boundingBox();
    expect(selectBox).not.toBeNull();
    expect(arrowBox).not.toBeNull();
    expect(arrowBox!.x - selectBox!.x).toBeGreaterThanOrEqual(10);
    expect(selectBox!.x + selectBox!.width - arrowBox!.x - arrowBox!.width).toBeGreaterThanOrEqual(10);
    await storefront.screenshot({path: `test-results/website-editor/service-filter-${width}-${locale}.png`});
  }
});
