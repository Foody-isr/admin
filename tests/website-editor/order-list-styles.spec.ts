import { test, expect } from "@playwright/test";
import { normalizeSiteColors } from "../../src/lib/website-v3/site-colors";
import { normalizeWebsiteHeader } from "../../src/lib/website-v3/header";
import type { DraftStatePayload } from "../../src/lib/website-v3/types";

// Run with FOODY_MENU_APPEARANCE=1. All persistence stays in the synthetic API.
test("compact menu styles survive editing, reload and publication on mobile in LTR and RTL", async ({ page, request, context }) => {
  test.skip(process.env.FOODY_MENU_APPEARANCE !== "1", "Run with FOODY_MENU_APPEARANCE=1 to load the isolated photo menu fixture.");
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    localStorage.setItem("foody_restaurant_token", "isolated-ui-fixture");
    localStorage.setItem("foody_restaurant_user", JSON.stringify({ id: 1, full_name: "Demo", role: "manager", email: "demo@foody.test" }));
    localStorage.setItem("foody_restaurant_ids", "[1]");
    localStorage.setItem("foody-admin-locale", "fr");
  });
  await context.route("**/*", route => ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  // This web checkout predates the Admin branch's video capabilities. Isolate
  // those unrelated flags for this menu-only fixture; no video is exercised.
  await context.route("**/api/website-v3-capabilities", async route => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...await response.json(), video_playback: 1, video_height: 1 } });
  });
  const draft = async (): Promise<DraftStatePayload> =>
    (await (await request.get("http://127.0.0.1:18081/api/v1/restaurants/1/website-draft")).json()).state;
  const seed = await draft();
  seed.sections = [];
  seed.config.nav_layout = { header: normalizeWebsiteHeader({ layout: "left", button: { enabled: false }, fulfillment: { enabled: false } }) };
  seed.config.typography = { site: { headingFont: "Arial", bodyFont: "Arial" } };
  for (const item of seed.pages) item.is_homepage = item.type === "order";
  const colors = normalizeSiteColors({ bg: "#000000", ink: "#ffffff", accent: "#009fca" });
  Object.assign(colors.styles[0], { background: "#000000", title: "#ffffff", paragraph: "#ffffff", menu: {
    background: "#000000", heading: "#ffffff", bar_background: "#222222", category_text: "#cccccc",
    active_text: "#009fca", card_background: "#000000", card_title: "#ffffff", card_price: "#009fca",
    card_description: "#aaaaaa", card_border: "#333333",
  }});
  seed.config.custom_palette = { mode: "dark", bg: "#000000", surface: "#222222", ink: "#ffffff", accent: "#009fca", color_styles: colors };
  const order = seed.pages.find(item => item.type === "order")!;
  order.appearance_overrides = { foody_renderer_version: 1, navigation_mode: "hidden", footer_mode: "hidden", website_order: {
    layout: "list", card_style: "filled", color_style: "style-1", columns: 2,
    show_banner: false, show_fulfillment: false, prompt_on_entry: false, show_availability_filter: false,
  }};
  await request.put("http://127.0.0.1:18081/api/v1/restaurants/1/website-draft", { data: seed });
  await request.post("http://127.0.0.1:18081/api/v1/restaurants/1/website-publish");
  await page.goto("/1/website-v3");
  await page.getByRole("button", { name: "Liste des articles", exact: true }).click({ timeout: 60_000 });
  await page.getByRole("button", { name: "Liste compacte", exact: true }).click();
  const preview = page.frameLocator("iframe");
  const row = preview.locator(".website-order-item").first();
  await expect(row).toHaveAttribute("data-layout", "rows", { timeout: 60_000 });
  await expect(row).toHaveCSS("border-bottom-width", "1px");
  await expect(row.locator("img")).toHaveCSS("aspect-ratio", "3 / 2");
  await expect(preview.locator(".website-order-navigation")).toHaveAttribute("data-shape", "underline");
  const cards = page.locator("details").filter({ has: page.locator("summary", { hasText: /^Cartes des articles$/ }) });
  await cards.locator("summary").click();
  await cards.getByLabel("Marge verticale des lignes (px)").fill("24");
  await cards.getByLabel("Espace entre les articles (px)").fill("8");
  await cards.getByLabel("Position du prix").selectOption("bottom");
  const images = page.locator("details").filter({ has: page.locator("summary", { hasText: /^Images des articles$/ }) });
  await images.locator("summary").click();
  await images.getByLabel("Taille de la photo").selectOption("large");
  await images.getByLabel("Position de la photo").selectOption("left");
  await expect(row).toHaveAttribute("data-image-position", "left");
  await images.getByLabel("Position de la photo").selectOption("right");
  const descriptions = page.locator("details").filter({ has: page.locator("summary", { hasText: /^Descriptions des articles$/ }) });
  await descriptions.locator("summary").click();
  await descriptions.getByLabel("Lignes de description").selectOption("all");
  const expected = { layout: "rows", color_style: "style-1", columns: 2, card_border: "separator", row_padding: 24,
    item_spacing: 8, image_position: "right", image_size: "large", description_lines: "all", price_placement: "bottom" };
  await expect.poll(async () => (await draft()).pages.find(item => item.type === "order")?.appearance_overrides.website_order).toMatchObject(expected);
  await expect(row).toHaveCSS("padding-top", "24px");
  await expect(row.locator(".website-order-item-description")).toHaveCSS("display", "block");
  await page.screenshot({ path: "test-results/website-editor/compact-menu-editor.png" });
  await page.reload();
  await expect(row).toHaveAttribute("data-image-size", "large");
  await expect(row).toHaveCSS("padding-top", "24px");
  const publication = page.waitForResponse(response => response.url().endsWith("/website-publish") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Publier", exact: true }).click();
  expect((await publication).ok()).toBe(true);
  const storefront = await context.newPage();
  for (const [width, locale] of [[1280, "fr"], [393, "fr"], [320, "fr"], [393, "he"], [320, "he"]] as const) {
    await storefront.setViewportSize({ width, height: 900 });
    await storefront.goto(`http://localhost:3000/r/atelier-foody/order?lang=${locale}`);
    const liveRow = storefront.locator(".website-order-item").first();
    await expect(liveRow).toHaveAttribute("data-layout", "rows");
    await expect(liveRow).toHaveCSS("padding-top", "24px");
    const copy = await liveRow.locator(".website-order-item-copy").boundingBox();
    const photo = await liveRow.locator(".website-order-item-media").boundingBox();
    expect(photo!.x).toBeGreaterThan(copy!.x + copy!.width - 1);
    expect(Math.abs(photo!.height - photo!.width / 1.5)).toBeLessThan(1);
    const overflow = await storefront.evaluate(() => Array.from(document.querySelectorAll("body *"))
      .filter(el => { const rect = el.getBoundingClientRect(); return rect.width && (rect.right > innerWidth + 1 || rect.left < -1); })
      .map(el => ({ tag: el.tagName, class: el.className, width: el.getBoundingClientRect().width })).slice(0, 8));
    expect(await storefront.evaluate(() => document.documentElement.scrollWidth <= innerWidth), JSON.stringify(overflow)).toBe(true);
    await expect(liveRow.locator(".website-order-item-price")).toHaveCSS("color", "rgb(0, 159, 202)");
    const search = storefront.getByRole("textbox", { name: locale === "he" ? "חיפוש" : "Rechercher", exact: true });
    await expect(search).toBeVisible();
    await storefront.screenshot({ path: `test-results/website-editor/compact-menu-${width}-${locale}.png` });
    const firstName = await liveRow.getAttribute("aria-label");
    await search.fill(firstName!);
    await expect(liveRow).toHaveAttribute("aria-label", firstName!);
    await search.fill("unmatched-fixture-query");
    await expect(storefront.locator(".website-order-item")).toHaveCount(0);
    await search.fill("");
    await expect(liveRow).toBeVisible();
    const lastCategory = storefront.locator(".website-order-navigation nav a").last();
    const target = storefront.locator((await lastCategory.getAttribute("href"))!);
    await lastCategory.click();
    await expect.poll(async () => {
      const heading = await target.boundingBox();
      const navigation = await storefront.locator(".website-order-navigation").boundingBox();
      return heading!.y >= navigation!.y + navigation!.height - 1;
    }).toBe(true);
  }
});
