import { test, expect, type Locator } from "@playwright/test";
import type { DraftStatePayload } from "../../src/lib/website-v3/types";
import { normalizeWebsiteHeader } from "../../src/lib/website-v3/header";
import { normalizeSiteColors } from "../../src/lib/website-v3/site-colors";

// All API writes stay in the isolated fixture's memory.
test("category styles and sticky choices survive preview, reload and publication on desktop and mobile", async ({ page, context, request }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    localStorage.setItem("foody_restaurant_token", "isolated-ui-fixture");
    localStorage.setItem("foody_restaurant_user", JSON.stringify({ id: 1, full_name: "Demo", role: "manager", email: "demo@foody.test" }));
    localStorage.setItem("foody_restaurant_ids", "[1]");
    localStorage.setItem("foody-admin-locale", "fr");
  });
  await context.route("**/*", route =>
    ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname)
      ? route.continue() : route.abort());
  const draft = async (): Promise<DraftStatePayload> =>
    (await (await request.get("http://127.0.0.1:18081/api/v1/restaurants/1/website-draft")).json()).state;
  const seed = await draft();
  seed.sections = [];
  seed.config.nav_layout = { header: normalizeWebsiteHeader({ layout: "left", scroll: "sticky", fulfillment: { enabled: false } }) };
  seed.config.custom_palette = { mode: "light", bg: "#191511", surface: "#302920", ink: "#ffffff", accent: "#dba974",
    color_styles: normalizeSiteColors({ bg: "#191511", ink: "#ffffff", accent: "#dba974" }) };
  for (const item of seed.pages) item.is_homepage = item.type === "order";
  const order = seed.pages.find(item => item.type === "order")!;
  order.appearance_overrides = { foody_renderer_version: 1, website_order: {
    card_style: "filled", layout: "grid", columns: 1, color_style: "style-1",
    show_banner: true, banner_height: "large", show_fulfillment: false,
    prompt_on_entry: false, item_title_style: "paragraph-2", show_availability_filter: false,
  } };
  await request.put("http://127.0.0.1:18081/api/v1/restaurants/1/website-draft", { data: seed });
  for (let index = 0; index < 8; index++) {
    expect((await request.post("http://127.0.0.1:18081/api/v1/menu/items", { data: {
      restaurant_id: 1, category_id: 1, name: `Article de démonstration ${index + 1}`,
      price: 12, base_price: 12, is_active: true, is_available: true,
    } })).ok()).toBe(true);
  }
  await request.post("http://127.0.0.1:18081/api/v1/restaurants/1/website-publish");
  expect((await request.get("http://localhost:3000/api/website-v3-capabilities")).ok()).toBe(true);
  expect((await request.get("http://localhost:3000/r/atelier-foody/order?lang=fr")).ok()).toBe(true);
  await page.goto("/1/website-v3");
  await expect(page.getByRole("button", { name: "Liste des articles", exact: true })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Liste des articles", exact: true }).click();
  const sticky = page.getByRole("switch", { name: "Fixer le menu des catégories en haut (sticky)", exact: true });
  await expect(sticky).toBeVisible();
  await expect(sticky).toBeChecked();
  const preview = page.frameLocator("iframe");
  const navigation = preview.locator(".website-order-navigation");
  await expect(navigation).toHaveAttribute("data-sticky", "true", { timeout: 60_000 });
  await expect(navigation).toHaveAttribute("data-shape", "pill");
  await expect(navigation).toBeVisible({ timeout: 60_000 });
  const dimensions = async () => navigation.locator("nav a").first().evaluate(element => {
    const box = element.getBoundingClientRect();
    const css = getComputedStyle(element);
    return { width: box.width, height: box.height, padding: css.padding, gap: getComputedStyle(element.parentElement!).gap };
  });
  const initial = await dimensions();
  expect(initial.height).toBeGreaterThanOrEqual(44);
  expect(initial.width).toBeGreaterThan(44);
  expect(initial.padding).toBe("10px 16px");
  expect(initial.gap).toBe("20px");
  await expect(navigation.locator(".order-menu-more")).toBeHidden();
  await assertDesktopRow(navigation);
  await page.locator(".sqe-order-settings .sqe-shared-colors").first()
    .getByRole("button", { name: "Style de couleurs 2", exact: true }).click();
  await expect.poll(dimensions).toEqual(initial);
  const categoryStyle = page.getByRole("combobox", { name: "Style du menu des catégories", exact: true });
  await expect(categoryStyle).toBeVisible();
  await categoryStyle.selectOption("underline");
  await expect(navigation).toHaveAttribute("data-shape", "underline");
  await expect(navigation.locator("nav a").first()).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect.poll(() => navigation.locator("nav a").first().evaluate(element =>
    getComputedStyle(element, "::after").height)).toBe("3px");
  await page.locator("summary").filter({ hasText: "Disposition et couleurs" }).click();
  await page.screenshot({ path: "test-results/website-editor/category-menu-setting.png" });
  const categorySettings = page.locator("details").filter({ has: page.locator("summary", { hasText: "Menu des catégories" }) });
  await categorySettings.locator("summary").click();
  await categorySettings.getByLabel("Taille du texte (%)").fill("300");
  await expect(navigation.locator("nav a").first()).toHaveCSS("font-size", "48px");
  await assertPinned(navigation);
  await sticky.uncheck();
  await expect(navigation).toHaveCSS("position", "static");
  await expect.poll(async () => (await draft()).pages.find(item => item.type === "order")?.appearance_overrides.website_order)
    .toMatchObject({ sticky_categories: false, color_style: "style-2", category_shape: "underline" });
  await page.reload();
  await page.getByRole("button", { name: "Liste des articles", exact: true }).click();
  await expect(sticky).not.toBeChecked();
  await expect(categoryStyle).toHaveValue("underline");
  const publish = async () => {
    const button = page.getByRole("button", { name: "Publier", exact: true });
    await expect(button).not.toHaveAttribute("title", /.+/, { timeout: 60_000 });
    const response = page.waitForResponse(value => value.url().endsWith("/website-publish") && value.request().method() === "POST", { timeout: 30_000 });
    await button.click();
    expect((await response).ok()).toBe(true);
  };
  await publish();
  const storefront = await context.newPage();
  await storefront.setViewportSize({ width: 1280, height: 480 });
  await storefront.goto("http://localhost:3000/r/atelier-foody/order?lang=fr");
  const publicNavigation = storefront.locator(".website-order-navigation");
  await expect(publicNavigation).toHaveCSS("position", "static");
  await publicNavigation.evaluate(element => window.scrollTo(0, scrollY + element.getBoundingClientRect().top + 200));
  await expect.poll(() => publicNavigation.evaluate(element => element.getBoundingClientRect().bottom)).toBeLessThan(0);
  await page.getByRole("button", { name: "Liste des articles", exact: true }).click();
  await sticky.check();
  await expect(navigation).toHaveCSS("position", "sticky");
  await publish();
  for (const [width, language] of [[1280, "fr"], [375, "fr"], [320, "he"]] as const) {
    await storefront.setViewportSize({ width, height: 480 });
    await storefront.goto(`http://localhost:3000/r/atelier-foody/order?lang=${language}`);
    await expect(publicNavigation).toHaveAttribute("data-sticky", "true");
    await expect(publicNavigation).toHaveAttribute("data-shape", "underline");
    if (width >= 768) {
      await assertDesktopRow(publicNavigation);
      await expect(publicNavigation.locator(".order-menu-more")).toBeHidden();
    } else {
      await expect(publicNavigation.locator(".order-menu-more")).toBeVisible();
      const geometry = await publicNavigation.evaluate(element => ({
        height: element.getBoundingClientRect().height,
        toolbar: element.querySelector(".order-menu-toolbar")!.getBoundingClientRect().height,
        categories: element.querySelector("nav")!.getBoundingClientRect().width,
        search: element.querySelector("input")!.getBoundingClientRect().height,
      }));
      expect(geometry.height).toBeGreaterThanOrEqual(104);
      expect(geometry).toMatchObject({ toolbar: 56, categories: width, search: 40 });
    }
    await assertPinned(publicNavigation);
    await publicNavigation.locator("nav a").first().click();
    await expect.poll(() => publicNavigation.evaluate(element => {
      const target = document.querySelector(element.querySelector("nav a")!.getAttribute("href")!)!;
      return target.getBoundingClientRect().top - element.getBoundingClientRect().bottom;
    })).toBeGreaterThanOrEqual(23);
    expect(await storefront.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await storefront.screenshot({ path: `test-results/website-editor/category-menu-${width}-${language}.png` });
  }
});

async function assertDesktopRow(navigation: Locator) {
  const geometry = await navigation.evaluate(element => {
    const search = element.querySelector("input")!.getBoundingClientRect();
    const categories = element.querySelector("nav")!.getBoundingClientRect();
    return { center: Math.abs(search.top + search.height / 2 - categories.top - categories.height / 2),
      gap: search.left - categories.right, width: search.width };
  });
  expect(geometry.center).toBeLessThan(1);
  expect(geometry.gap).toBeGreaterThanOrEqual(15);
  expect(geometry.width).toBeLessThanOrEqual(280);
}

async function assertPinned(navigation: Locator) {
  await navigation.evaluate(element => window.scrollTo(0, scrollY + element.getBoundingClientRect().top + 100));
  await expect(navigation).toHaveCSS("position", "sticky");
  await expect.poll(() => navigation.evaluate(element =>
    Math.abs(element.getBoundingClientRect().top - parseFloat(getComputedStyle(element).top)))).toBeLessThan(2);
}
