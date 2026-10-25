import { test, expect, type FrameLocator, type Page } from "@playwright/test";
import type { DraftStatePayload } from "../../src/lib/website-v3/types";
import { normalizeWebsiteHeader } from "../../src/lib/website-v3/header";

// FOODY_MENU_TABS=1 runs two synthetic cartes through the real Web renderer.
test("menu tabs stay separate from group styling in preview and published desktop/mobile pages", async ({ page, context, request }) => {
  test.skip(process.env.FOODY_MENU_TABS !== "1", "Requires the isolated two-menu fixture");
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    localStorage.setItem("foody_restaurant_token", "isolated-ui-fixture");
    localStorage.setItem("foody_restaurant_user", JSON.stringify({ id: 1, full_name: "Demo", role: "manager", email: "demo@foody.test" }));
    localStorage.setItem("foody_restaurant_ids", "[1]");
    localStorage.setItem("foody-admin-locale", "fr");
  });
  await context.route("**/*", route => ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const seed: DraftStatePayload = (await (await request.get("http://127.0.0.1:18081/api/v1/restaurants/1/website-draft")).json()).state;
  seed.sections = [];
  for (const item of seed.pages) item.is_homepage = item.type === "order";
  seed.config.nav_layout = { header: normalizeWebsiteHeader({ layout: "left", scroll: "sticky", fulfillment: { enabled: false } }) };
  const order = seed.pages.find(item => item.type === "order")!;
  order.settings.menu_ids = [1, 2];
  order.appearance_overrides = { foody_renderer_version: 1, website_order: {
    card_style: "filled", layout: "grid", columns: 2, category_shape: "pill",
    show_banner: false, show_fulfillment: false, prompt_on_entry: false,
    show_availability_filter: true,
  } };
  expect((await request.put("http://127.0.0.1:18081/api/v1/restaurants/1/website-draft", { data: seed })).ok()).toBe(true);
  await request.post("http://127.0.0.1:18081/api/v1/restaurants/1/website-publish");
  await page.goto("/1/website-v3");
  await expect(page.getByRole("button", { name: "Liste des articles", exact: true })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Liste des articles", exact: true }).click();
  await expect(page.getByText("Les cartes ont leurs propres onglets.", { exact: false })).toBeVisible();
  const preview = page.frameLocator("iframe");
  await page.getByRole("button", { name: "Aperçu", exact: true }).click();
  await assertMenuLevels(preview);
  await page.getByRole("button", { name: "Fermer l’aperçu", exact: true }).click();
  const categorySettings = page.locator("details").filter({ has: page.locator("summary", { hasText: "Menu des catégories" }) });
  await categorySettings.locator("summary").click();
  const showCategories = categorySettings.getByRole("switch", { name: "Menu des catégories", exact: true });
  await showCategories.uncheck();
  await expect(preview.locator(".order-menu-categories")).toHaveCount(0);
  await expect(preview.getByRole("tab", { name: "HALAVI" })).toBeVisible();
  await page.getByRole("button", { name: "Aperçu", exact: true }).click();
  await preview.getByRole("tab", { name: "HALAVI" }).click();
  await expect(preview.getByRole("button", { name: "Pizza démo", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Fermer l’aperçu", exact: true }).click();
  await showCategories.check();
  await expect(preview.locator(".order-menu-categories")).toContainText("Pizzas");
  const publish = page.getByRole("button", { name: "Publier", exact: true });
  await expect(publish).not.toHaveAttribute("title", /.+/);
  const published = page.waitForResponse(value => value.url().endsWith("/website-publish") && value.request().method() === "POST");
  await publish.click();
  expect((await published).ok()).toBe(true);

  const storefront = await context.newPage();
  for (const [width, language] of [[1280, "fr"], [390, "fr"], [320, "he"]] as const) {
    await storefront.setViewportSize({ width, height: 800 });
    await storefront.goto(`http://localhost:3000/r/atelier-foody/order?lang=${language}`);
    await assertMenuLevels(storefront, language === "he");
    const bassari = storefront.getByRole("tab", { name: "BASSARI" });
    const halavi = storefront.getByRole("tab", { name: "HALAVI" });
    await halavi.focus();
    await halavi.press(language === "he" ? "ArrowRight" : "ArrowLeft");
    await expect(bassari).toBeFocused();
    await expect(bassari).toHaveAttribute("aria-selected", "true");
    await bassari.press("End");
    await expect(halavi).toBeFocused();
    await expect(halavi).toHaveAttribute("aria-selected", "true");
    const search = storefront.locator('.website-order-navigation input[type="search"]');
    await search.fill("Glace");
    await expect(storefront.getByRole("button", { name: "Glace démo", exact: true })).toBeDisabled();
    await storefront.locator(".website-availability-filter select").selectOption("available");
    await expect(storefront.locator(".website-order-item")).toHaveCount(0);
    await expect(halavi).toHaveAttribute("aria-selected", "true");
    await storefront.locator(".website-availability-filter select").selectOption("all");
    await search.fill("aucun-resultat");
    await expect(storefront.locator(".website-order-item")).toHaveCount(0);
    await expect(bassari).toBeVisible();
    await expect(halavi).toHaveAttribute("aria-selected", "true");
    await bassari.click();
    await expect(search).toHaveValue("");
    await expect(storefront.getByRole("button", { name: "Burger démo", exact: true })).toBeVisible();
    expect(await storefront.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await storefront.screenshot({ path: `test-results/website-editor/menu-tabs-${width}-${language}.png` });
  }
});

async function assertMenuLevels(view: FrameLocator | Page, hebrew = false) {
  const tabs = view.getByRole("tablist");
  await expect(tabs.getByRole("tab")).toHaveCount(2);
  const bassari = tabs.getByRole("tab", { name: "BASSARI" });
  const halavi = tabs.getByRole("tab", { name: "HALAVI" });
  await expect(bassari).toHaveAttribute("aria-selected", "true");
  await expect(bassari).toHaveCSS("border-radius", "0px");
  await expect(view.getByRole("button", { name: "Burger démo", exact: true })).toBeVisible();
  await expect(view.getByRole("button", { name: "Pizza démo", exact: true })).toHaveCount(0);
  const groups = view.locator(".order-menu-categories");
  await expect(groups.getByRole("link")).toHaveText(hebrew ? ["כריכים", "תוספות"] : ["Sandwichs", "Accompagnements"]);
  await expect(groups).not.toContainText("BASSARI");
  await halavi.click();
  await expect(halavi).toHaveAttribute("aria-selected", "true");
  await expect(groups.getByRole("link")).toHaveText(hebrew ? ["פיצות", "קינוחים"] : ["Pizzas", "Desserts"]);
  await expect(view.getByRole("button", { name: "Burger démo", exact: true })).toHaveCount(0);
  await expect(view.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", await halavi.getAttribute("id") ?? "");
  await expect(view.getByRole("button", { name: "Pizza démo", exact: true })).toBeVisible();
  await bassari.click();
}
