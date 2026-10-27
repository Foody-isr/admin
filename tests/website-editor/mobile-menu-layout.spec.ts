import { test, expect } from "@playwright/test";
import { normalizeSiteColors } from "../../src/lib/website-v3/site-colors";
import { normalizeWebsiteHeader } from "../../src/lib/website-v3/header";
import type { DraftStatePayload } from "../../src/lib/website-v3/types";

// Synthetic API data only: exercise Safari and Chromium against the same public renderer.
test("category shapes, selected colors and long headings fit desktop and mobile", async ({ page, context, request }, testInfo) => {
  test.skip(process.env.FOODY_MENU_TABS !== "1", "Requires the isolated two-menu fixture");
  test.setTimeout(300_000);
  await context.route("**/*", route => ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const seed: DraftStatePayload = (await (await request.get("http://127.0.0.1:18081/api/v1/restaurants/1/website-draft")).json()).state;
  seed.sections = [];
  seed.config.nav_layout = { header: normalizeWebsiteHeader({ layout: "left", scroll: "sticky", fulfillment: { enabled: false } }) };
  const colors = normalizeSiteColors({});
  colors.styles[0].menu = { bar_background: "#38271a", category_text: "#fae4af", active_background: "#2d1b08", active_text: "#fae4af" };
  seed.config.custom_palette = { mode: "light", bg: "#f9dfae", surface: "#f9dfae", ink: "#2d1b08", accent: "#2d1b08", color_styles: colors };
  seed.config.category_banner_style = "text-block";
  const order = seed.pages.find(item => item.type === "order")!;
  order.settings.menu_ids = [1, 2];
  for (const titleStyle of ["inherit", "title-1"]) {
    for (const shape of ["pill", "rounded", "underline", "plain"]) {
      order.appearance_overrides = { foody_renderer_version: 1, website_order: {
        color_style: "style-1", card_style: "filled", layout: "grid", columns: 1,
        category_shape: shape, category_title_style: titleStyle,
        show_banner: false, show_fulfillment: false, prompt_on_entry: false,
      } };
      expect((await request.put("http://127.0.0.1:18081/api/v1/restaurants/1/website-draft", { data: seed })).ok()).toBe(true);
      expect((await request.post("http://127.0.0.1:18081/api/v1/restaurants/1/website-publish")).ok()).toBe(true);
      for (const [width, language] of [[1280, "fr"], [390, "fr"], [320, "he"]] as const) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto(`http://localhost:3000/r/atelier-foody/order?lang=${language}`);
        const navigation = page.locator(".website-order-navigation");
        await expect(navigation).toHaveAttribute("data-shape", shape);
        const active = navigation.locator('nav a[aria-current="location"]');
        await expect(active).toHaveCSS("color", "rgb(250, 228, 175)");
        await expect(active).toHaveCSS("background-color", ["pill", "rounded"].includes(shape) ? "rgb(45, 27, 8)" : "rgba(0, 0, 0, 0)");
        await expect(active).toHaveCSS("border-radius", shape === "pill" ? "999px" : shape === "rounded" ? "8px" : "0px");
        expect(await active.evaluate(el => getComputedStyle(el, "::after").content)).toBe(shape === "underline" ? '""' : "none");
        await expect(page.getByRole("tab", { name: "BASSARI" })).toHaveCSS("border-radius", "0px");
        const headings = page.locator(".website-order-category h2, .website-order-category h3");
        await expect(headings).toHaveCount(2);
        expect(await headings.evaluateAll(els => els.every(el => el.scrollWidth <= el.clientWidth + 1))).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        // Navigation scrolls internally and still reaches the intended group.
        await navigation.locator("nav a").last().click();
        await expect(page).toHaveURL(/#menu-menu-1-12$/);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (shape === "pill" && titleStyle === "inherit" && width === 390) {
          await page.screenshot({ path: `test-results/website-editor/mobile-menu-${testInfo.project.name}.png` });
        }
      }
    }
  }
});
