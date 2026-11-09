import { expect, test } from "@playwright/test";
import type { DraftResponse } from "../../src/lib/website-v3/types";

test("reapplies full width after another editor publishes a page", async ({ page, request, context }) => {
  await page.addInitScript(() => {
    localStorage.setItem("foody_restaurant_token", "isolated-ui-fixture");
    localStorage.setItem("foody_restaurant_user", JSON.stringify({ id: 1, role: "manager", full_name: "Demo", email: "demo@foody.test" }));
    localStorage.setItem("foody_restaurant_ids", "[1]");
    localStorage.setItem("foody-admin-locale", "fr");
  });
  await context.route("**/*", route =>
    ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort(),
  );

  const port = process.env.FOODY_WEBSITE_EDITOR_API_PORT || 18081;
  const api = `http://127.0.0.1:${port}/api/v1/restaurants/1`;
  const readDraft = async (): Promise<DraftResponse> =>
    (await request.get(`${api}/website-draft`)).json();
  const seed = (await readDraft()).state;
  const order = seed.pages.find(item => item.type === "order")!;
  for (const item of seed.pages) item.is_homepage = item === order;
  order.appearance_overrides = { ...order.appearance_overrides, website_order: { content_width: "standard" } };
  seed.pages.push({
    tmp_id: "page-events", type: "content", slug: "evenements", title: "Événements",
    sort_order: seed.pages.length, nav_visible: true, is_default: false, is_homepage: false,
    seo: {}, settings: {}, appearance_overrides: {},
  });
  expect((await request.put(`${api}/website-draft`, { data: seed })).ok()).toBe(true);

  await page.goto("/1/website-v3");
  await page.getByRole("button", { name: "Liste des articles", exact: true }).click({ timeout: 60_000 });
  const width = page.getByRole("combobox", { name: "Largeur du menu" });
  await expect(width).toHaveValue("standard");
  const preview = page.frameLocator("iframe").locator(".website-order-menu");
  const publish = page.getByRole("button", { name: "Publier", exact: true });
  await expect(preview).toHaveAttribute("data-width", "standard", { timeout: 60_000 });
  await expect(publish).not.toHaveAttribute("title", /.+/);

  const otherTab = await readDraft();
  otherTab.state.pages.find(item => item.tmp_id === "page-events")!.slug = "evenements-prives";
  expect((await request.put(`${api}/website-draft`, { data: otherTab.state })).ok()).toBe(true);
  expect((await request.post(`${api}/website-publish`)).ok()).toBe(true);
  const publishedEvent = (await readDraft()).state.pages.find(item => item.slug === "evenements-prives");
  expect(publishedEvent?.id).toBeTruthy();

  await width.selectOption("wide");
  await expect(page.getByRole("alert").filter({ hasText: "Le site a changé dans un autre onglet" })).toBeVisible();
  await expect(width).toHaveValue("wide");
  expect((await readDraft()).draft_dirty).toBe(false);
  await page.getByRole("button", { name: "Récupérer mes modifications" }).click();
  await expect(page.getByText("Vos modifications ont été reprises sur la dernière version.", { exact: false })).toBeVisible();
  await expect(preview).toHaveAttribute("data-width", "wide");

  await expect(publish).not.toHaveAttribute("title", /.+/);
  await publish.click();
  await expect(page.getByText("Le site est publié.", { exact: true })).toBeVisible();
  const result = await readDraft();
  expect(result.draft_dirty).toBe(false);
  expect(result.state.pages.find(item => item.slug === "evenements-prives")?.id).toBe(publishedEvent?.id);
  expect(result.state.pages.some(item => item.slug === "evenements")).toBe(false);
  expect(result.state.pages.find(item => item.type === "order")?.appearance_overrides.website_order)
    .toMatchObject({ content_width: "wide" });
  await page.goto("http://localhost:3000/r/atelier-foody/order");
  await expect(page.locator(".website-order-menu")).toHaveAttribute("data-width", "wide");
});
