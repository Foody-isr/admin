import { test, expect, type Page } from "@playwright/test";
import { createFixture } from "./fixtures.mjs";

async function install(page: Page, locale = "fr") {
  const fixture = createFixture({ carte: true, library: true });
  const menu = fixture.menus[0];
  menu.is_weekly_rotating = true;
  const key = fixture.batchConfig.upcoming_cycles[0].fulfillment_days[0].date;
  const docs = new Map<string, any>();
  let publishedName = menu.name;
  const writes: string[] = [];
  let rejectSave = false;
  const payload = {
    name: menu.name,
    description: "",
    web_enabled: true,
    pos_enabled: true,
    follows_restaurant_hours: true,
    hours: [],
    groups: [
      {
        key: "group-1",
        id: 1,
        name: "Plats",
        image_url: "",
        web_enabled: true,
        pos_enabled: true,
        is_hidden: false,
        follows_menu_hours: true,
        hours: [],
        banner_focal_x: 50,
        banner_focal_y: 50,
        item_ids: [fixture.items[0].id],
      },
    ],
    stocks: [],
  };
  const initial = () => ({
    menu_id: menu.id,
    series_key: key,
    revision: 0,
    base_revision: 0,
    base_fingerprint: "test-fingerprint",
    published_revision: 0,
    has_draft: false,
    is_weekly_rotating: true,
    payload: structuredClone(payload),
  });
  await page.addInitScript(
    ({ locale }) => {
      localStorage.setItem("foody_restaurant_token", "isolated-ui-fixture");
      localStorage.setItem(
        "foody_restaurant_user",
        JSON.stringify({
          id: 1,
          full_name: "Demo",
          role: "owner",
          email: "demo@foody.test",
        }),
      );
      localStorage.setItem("foody_restaurant_ids", "[1]");
      localStorage.setItem("foody-admin-locale", locale);
      localStorage.setItem("foody_admin_theme", "light");
    },
    { locale },
  );
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const series = url.searchParams.get("serie_date") || key;
    const data = docs.get(series) ?? initial();
    if (path === `/api/v1/menu/menus/${menu.id}/draft`) {
      if (req.method() === "PUT") {
        writes.push("draft");
        if (rejectSave)
          return route.fulfill({
            status: 409,
            json: { error: "revision_conflict" },
          });
        const input = req.postDataJSON();
        docs.set(series, {
          ...data,
          ...input,
          has_draft: true,
          revision: data.revision + 1,
          updated_at: new Date().toISOString(),
        });
      }
      return route.fulfill({ json: docs.get(series) ?? data });
    }
    if (path === `/api/v1/menu/menus/${menu.id}/publish`) {
      writes.push("publish");
      publishedName = data.payload.name;
      const next = {
        ...data,
        has_draft: false,
        revision: data.revision + 1,
        published_revision: 1,
        base_revision: 1,
      };
      docs.set(series, next);
      return route.fulfill({ json: next });
    }
    if (path === `/api/v1/menu/menus/${menu.id}/draft/preview`) {
      writes.push("preview");
      const input = req.postDataJSON();
      return route.fulfill({
        json: {
          private_preview: true,
          menu: {
            ...menu,
            name: input.name,
            groups: input.groups.map((g: any) => ({
              ...g,
              items: g.item_ids.map((id: number) =>
                fixture.items.find((i) => i.id === id),
              ),
            })),
          },
        },
      });
    }
    if (path === "/api/v1/menu/sales-stock") {
      return route.fulfill({
        json: {
          series_key: series,
          rows: fixture.items.map((item) => ({
            item,
            managed: true,
            config: null,
            previous: {
              mode: "count",
              unit: "",
              revision: 1,
              override: "force_sold_out",
              counters: [{ option_id: 0, initial_quantity: 20, committed: 18 }],
            },
            sizes: [],
            availability: {
              availability_state: "available",
              buildable_count: null,
            },
          })),
        },
      });
    }
    const result = fixture.response(
      req.url(),
      req.method(),
      req.postDataJSON() ?? {},
      1,
    );
    return route.fulfill({
      status: result.status ?? 200,
      json: result.json ?? {},
    });
  });
  await page.route("**/*", (route) =>
    ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort(),
  );
  return {
    writes,
    menu,
    docs,
    get publishedName() {
      return publishedName;
    },
    set rejectSave(value: boolean) {
      rejectSave = value;
    },
  };
}
async function rename(page: Page, name: string) {
  await page
    .getByRole("button", { name: "Paramètres de la carte", exact: true })
    .click();
  await page.getByRole("dialog").getByRole("textbox").first().fill(name);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Fermer", exact: true })
    .click();
}

test("private save, preview and explicit publication are separate", async ({
  page,
}) => {
  const f = await install(page);
  await page.goto(`/1/menu/menus/${f.menu.id}`);
  await expect(
    page.getByRole("heading", { name: f.menu.name, exact: true }),
  ).toBeVisible();
  const initial = f.publishedName;
  await rename(page, "Carte privée");
  expect(f.writes).toEqual([]);
  await page
    .getByRole("button", { name: "Enregistrer le brouillon", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Brouillon enregistré");
  expect(f.writes).toEqual(["draft"]);
  expect(f.publishedName).toBe(initial);
  await page.getByRole("button", { name: "Aperçu", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "Carte privée", exact: true }),
  ).toBeVisible();
  expect(f.publishedName).toBe(initial);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Fermer", exact: true })
    .click();
  await page.getByRole("button", { name: "Publier", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Publier", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Publiée");
  expect(f.publishedName).toBe("Carte privée");
  expect(f.writes).toEqual(["draft", "preview", "publish"]);
  await page.screenshot({
    path: "test-results/carte-published-fr.png",
    fullPage: true,
  });
});
test("failed save keeps the editor and draft mounted during departure", async ({
  page,
}) => {
  const f = await install(page);
  await page.goto(`/1/menu/menus/${f.menu.id}`);
  await rename(page, "À conserver");
  f.rejectSave = true;
  await page.getByRole("link", { name: "← Cartes", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Enregistrer et quitter", exact: true })
    .click();
  await expect(page.getByRole("alertdialog").getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/menu/menus/${f.menu.id}$`));
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Continuer la modification", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "À conserver", exact: true }),
  ).toBeVisible();
});
test("copying stock uses initial quantities and series switching remains guarded", async ({
  page,
}) => {
  const f = await install(page);
  await page.goto(`/1/menu/menus/${f.menu.id}`);
  await page
    .getByRole("button", {
      name: "Préparer les stocks de cette série",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: "Reprendre les quantités initiales précédentes",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("dialog").getByRole("spinbutton").first(),
  ).toHaveValue("20");
  expect(f.writes).toEqual([]);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Fermer", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Choisir une série" })
    .selectOption("1");
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Abandonner", exact: true })
    .click();
  // A second local change must still be protected after the first switch.
  await rename(page, "Deuxième série");
  await page
    .getByRole("combobox", { name: "Choisir une série" })
    .selectOption("0");
  await expect(page.getByRole("alertdialog")).toBeVisible();
});
test("Hebrew mobile layout stays within viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const f = await install(page, "he");
  await page.goto(`/1/menu/menus/${f.menu.id}`);
  await expect(
    page.getByRole("heading", { name: f.menu.name, exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/carte-mobile-he.png",
    fullPage: true,
  });
});

test("stock history links to the existing order-detail route", async ({
  page,
}) => {
  await install(page);
  await page.route("**/api/v1/menu/sales-stock/history*", async (route) =>
    route.fulfill({
      json: {
        events: [
          {
            id: 1,
            menu_item_id: 1,
            item_name: "Salade méditerranéenne",
            option_name: "",
            series_key: "2026-10-23",
            kind: "quantity_changed",
            before_quantity: 20,
            after_quantity: 18,
            delta: -2,
            actor_id: 1,
            actor_name: "Responsable",
            order_id: 42,
            reason: "",
            created_at: "2026-10-20T08:00:00Z",
          },
        ],
        next_cursor: 0,
      },
    }),
  );
  await page.goto("/1/menu/stock");
  await expect(
    page.getByRole("heading", { name: "Stocks des articles", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Commande #42", exact: true }),
  ).toHaveAttribute("href", "/1/orders/42");
  await expect(page.getByText("Responsable", { exact: true })).toBeVisible();
});
test("a series-managed product exposes its own stock summary and history", async ({
  page,
}) => {
  await install(page);
  await page.goto("/1/menu/items/1?tab=availability");
  await expect(
    page
      .locator("#item-availability")
      .getByRole("link", { name: "Gérer le stock", exact: true }),
  ).toHaveAttribute("href", "/1/menu/stock?item_id=1");
  await page
    .locator("#item-availability")
    .getByRole("button", { name: "Historique du stock", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .filter({
        has: page.getByRole("heading", {
          name: "Historique du stock",
          exact: true,
        }),
      })
      .last(),
  ).toBeVisible();
});
