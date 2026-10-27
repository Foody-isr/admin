import { test, expect, type Page } from "@playwright/test";
import { createFixture } from "./fixtures.mjs";

async function install(page: Page, locale = "fr", full = false) {
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
  if (full) {
    payload.groups[0].item_ids = fixture.items.map((item) => item.id);
    payload.groups.push({
      ...structuredClone(payload.groups[0]),
      key: "group-2",
      id: 2,
      name: "Boissons",
      item_ids: [],
    });
  }
  const overrides = new Map<number, string>();
  let rejectAvailability = false;
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
    if (/^\/api\/v1\/menu\/items\/\d+\/sales-stock\/availability$/.test(path)) {
      writes.push("availability");
      if (rejectAvailability)
        return route.fulfill({
          status: 409,
          json: { error: "revision_conflict" },
        });
      overrides.set(Number(path.split("/")[5]), req.postDataJSON().override);
      return route.fulfill({ json: {} });
    }
    if (path === "/api/v1/menu/sales-stock") {
      return route.fulfill({
        json: {
          series_key: series,
          rows: fixture.items.map((item) => ({
            item,
            managed: true,
            config: overrides.has(item.id)
              ? { override: overrides.get(item.id), revision: 1 }
              : null,
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
              buildable_count: full ? 20 : null,
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
    ["localhost", "127.0.0.1"].includes(
      new URL(route.request().url()).hostname,
    ) ||
    (route.request().resourceType() === "font" &&
      new URL(route.request().url()).hostname ===
        "square-fonts-production-f.squarecdn.com")
      ? route.fallback()
      : route.abort(),
  );
  return {
    writes,
    items: fixture.items,
    key,
    payload,
    menu,
    docs,
    get publishedName() {
      return publishedName;
    },
    set rejectAvailability(value: boolean) {
      rejectAvailability = value;
    },
    set rejectSave(value: boolean) {
      rejectSave = value;
    },
  };
}
function header(page: Page) {
  return page.locator("[data-carte-editor-header]");
}
async function carteAction(page: Page, label: string) {
  await page
    .getByRole("button", { name: "Actions de la carte", exact: true })
    .click();
  await page.getByRole("menuitem", { name: label, exact: true }).click();
}
async function rename(page: Page, name: string) {
  await carteAction(page, "Paramètres de la carte");
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
  await header(page)
    .getByRole("button", { name: "Enregistrer le brouillon", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Brouillon enregistré");
  expect(f.writes).toEqual(["draft"]);
  expect(f.publishedName).toBe(initial);
  await carteAction(page, "Aperçu");
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
  await header(page)
    .getByRole("button", { name: "Publier", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Publier", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Publiée");
  expect(f.publishedName).toBe("Carte privée");
  expect(f.writes).toEqual(["draft", "preview", "publish"]);
  await page.screenshot({
    animations: "disabled",
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
  await page
    .getByRole("link", { name: "Retour aux cartes", exact: true })
    .click();
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
  await carteAction(page, "Préparer les stocks de cette série");
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
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.locator('[data-carte-item] .list-availability-pill').first().click();
  const availabilityPanel = page.getByRole('dialog');
  await expect(availabilityPanel).toBeVisible();
  await expect.poll(async () => {
    const box = await availabilityPanel.boundingBox();
    return !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 391 && box.y + box.height <= 845;
  }).toBe(true);
  await page.screenshot({ path: 'test-results/carte-availability-mobile-he.png', fullPage: true, animations: 'disabled' });
  await page.keyboard.press('Escape');
  await page.screenshot({
    animations: "disabled",
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
    page.getByRole("heading", { name: "Historique des stocks", exact: true }),
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
      .getByRole("link", { name: "Historique complet du stock", exact: true }),
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

test("Square geometry, collapse and bulk membership edits preserve the publication boundary", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 812 });
  const f = await install(page, "fr", true);
  await page.goto(`/1/menu/menus/${f.menu.id}`);
  const first = page.locator('[data-carte-group="group-1"]');
  await expect(first.getByRole("table")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const card = await first.boundingBox();
  expect(card?.x).toBe(296);
  expect(card?.y).toBe(183);
  const row = await first.locator("tbody tr").first().boundingBox();
  expect(row?.height).toBe(65);
  await page.screenshot({
    animations: "disabled",
    path: "test-results/carte-square-desktop-fr.png",
  });
  await first.getByRole("button", { name: "Plats", exact: true }).click();
  await expect(first.getByRole("table")).toHaveCount(0);
  expect(f.writes).toEqual([]);
  await first.getByRole("button", { name: "Plats", exact: true }).click();
  await first
    .getByRole("checkbox", {
      name: "Sélectionner Salade méditerranéenne",
      exact: true,
    })
    .check();
  await expect(
    first.getByRole("checkbox", {
      name: "Sélectionner tous les articles de Plats",
    }),
  ).toHaveAttribute("aria-checked", "mixed");
  await first
    .getByRole("combobox", { name: "Déplacer vers un groupe" })
    .selectOption("group-2");
  await expect(first.locator('[data-carte-item="1"]')).toHaveCount(0);
  await page
    .locator('[data-carte-group="group-2"]')
    .getByRole("button", { name: "Boissons", exact: true })
    .click();
  await expect(
    page.locator('[data-carte-group="group-2"] [data-carte-item="1"]'),
  ).toBeVisible();
  expect(f.writes).toEqual([]);
  await header(page)
    .getByRole("button", { name: "Enregistrer le brouillon", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Brouillon enregistré");
  expect(Array.from(f.docs.values())[0].payload.groups[1].item_ids).toEqual([
    1,
  ]);
  expect(f.writes).toEqual(["draft"]);
});

test("contextual availability requires Apply, keeps failures open and restores focus", async ({
  page,
}) => {
  const f = await install(page, "fr", true);
  await page.goto(`/1/menu/menus/${f.menu.id}`);
  const trigger = page.getByRole("button", {
    name: "Actions pour Salade méditerranéenne",
    exact: true,
  });
  await trigger.click();
  await page
    .getByRole("menuitem", { name: "Modifier la disponibilité", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("radio", { name: "Disponible sans limite", exact: true })
    .check();
  expect(f.writes).toEqual([]);
  f.rejectAvailability = true;
  await dialog.getByRole("button", { name: "Appliquer", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog).toBeVisible();
  f.rejectAvailability = false;
  await dialog.getByRole("button", { name: "Appliquer", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page
      .locator('[data-carte-item="1"]')
      .getByText("Toujours disponible", { exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-carte-item="1"] .list-availability-pill')).toBeFocused();
  await expect(
    header(page).getByRole("button", { name: "Publier", exact: true }),
  ).toBeDisabled();
  expect(f.writes).toEqual(["availability", "availability"]);
});

test("Add selects a target group and item navigation guards the resulting draft", async ({
  page,
}) => {
  const f = await install(page, "fr", true);
  await page.goto(`/1/menu/menus/${f.menu.id}`);
  const add = page.getByRole("button", { name: "Ajouter", exact: true });
  await add.focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("menuitem", { name: "Ajouter des articles", exact: true })
    .click();
  const picker = page.getByRole("dialog");
  await picker
    .getByRole("combobox", { name: "Groupe de cartes", exact: true })
    .selectOption("group-2");
  await picker.getByRole("checkbox").first().check();
  await picker.getByRole("button", { name: "Terminé", exact: true }).click();
  await page
    .getByRole("link", { name: "Salade méditerranéenne", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Continuer la modification", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/menu/menus/${f.menu.id}$`));
  expect(f.writes).toEqual([]);
});

test("item picker filters library categories, keeps hidden selections and renders photos", async ({ page }) => {
  const f = await install(page, "fr", true);
  f.items[0].image_url = "/images/login/cafe-israel.webp";
  await page.goto(`/1/menu/menus/${f.menu.id}`);
  await page.getByRole("button", { name: "Ajouter des articles", exact: true }).first().click();
  const picker = page.locator("[data-carte-item-picker]");
  const item = (id: number) => picker.locator(`[data-picker-item="${id}"]`);
  await expect(item(1).locator("img")).toBeVisible();
  await expect.poll(() => item(1).locator("img").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(picker.locator("svg.lucide-search")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: test.info().outputPath("picker-articles.png") });
  await expect(picker.getByRole("status")).toHaveText("3 élément(s) sélectionné(s)");
  await picker.getByRole("button", { name: "Filtres", exact: true }).click();
  await page.screenshot({ path: test.info().outputPath("picker-filters.png") });
  await page.getByRole("button", { name: "Catégorie Tous", exact: true }).click();
  const filter = page.locator("[data-carte-picker-filter]");
  await filter.getByRole("checkbox", { name: "Boissons", exact: true }).check();
  await page.screenshot({ path: test.info().outputPath("picker-category.png") });
  await filter.getByRole("button", { name: "Appliquer", exact: true }).click();
  await expect(item(1)).toHaveCount(0);
  await expect(item(2)).toHaveCount(0);
  await expect(item(3)).toBeVisible();
  await expect(item(3).getByRole("checkbox")).toBeChecked();
  await expect(picker.getByRole("status")).toHaveText("3 élément(s) sélectionné(s)");
  await item(3).getByRole("checkbox").uncheck();
  await picker.getByRole("textbox", { name: "Rechercher", exact: true }).fill("absent");
  await expect(picker.getByText("Aucun résultat trouvé", { exact: true })).toBeVisible();
  await picker.getByRole("textbox", { name: "Rechercher", exact: true }).fill("");
  await picker.getByRole("button", { name: "Filtres", exact: true }).click();
  await page.getByRole("button", { name: "Effacer tous les filtres", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(item(1).getByRole("checkbox")).toBeChecked();
  await expect(item(2).getByRole("checkbox")).toBeChecked();
  await expect(item(3).getByRole("checkbox")).not.toBeChecked();
  await picker.getByRole("button", { name: "Terminé", exact: true }).click();
  expect(f.writes).toEqual([]);
  await header(page).getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Brouillon enregistré");
  expect(Array.from(f.docs.values())[0].payload.groups[0].item_ids).toEqual([1, 2]);
  expect(Array.from(f.docs.values())[0].payload.groups[1].item_ids).toEqual([]);
});

test("picker filters apply explicitly and stay usable on Hebrew mobile", async ({ page }) => {
  const f = await install(page, "he", true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/1/menu/menus/${f.menu.id}`);
  await page.getByRole("button", { name: "הוספת פריטים", exact: true }).first().click();
  const picker = page.locator("[data-carte-item-picker]");
  await picker.getByRole("button", { name: "מסננים", exact: true }).click();
  await page.getByRole("button", { name: "מלאי הכל", exact: true }).click();
  const filter = page.locator("[data-carte-picker-filter]");
  await expect(filter.getByRole("button", { name: "החל", exact: true })).toBeDisabled();
  await filter.getByRole("radio", { name: "אזל המלאי", exact: true }).check();
  await filter.getByRole("button", { name: "סגור", exact: true }).click();
  await expect(picker.locator("[data-picker-item]")).toHaveCount(3);
  await picker.getByRole("button", { name: "מסננים", exact: true }).click();
  await page.getByRole("button", { name: "מלאי הכל", exact: true }).click();
  await filter.getByRole("radio", { name: "אזל המלאי", exact: true }).check();
  await filter.getByRole("button", { name: "החל", exact: true }).click();
  await expect(picker.locator("[data-picker-item]")).toHaveCount(0);
  const bounds = await picker.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(f.writes).toEqual([]);
});

test("category loading can retry and Escape discards only unapplied filters", async ({ page }) => {
  const f = await install(page, "fr", true);
  f.items[0].image_url = "/missing-picker-photo.jpg";
  let failCategories = true;
  await page.route("**/api/v1/menu/item-categories?*", route => failCategories
    ? route.fulfill({ status: 503, json: { error: "unavailable" } }) : route.fallback());
  await page.goto(`/1/menu/menus/${f.menu.id}`);
  await page.getByRole("button", { name: "Ajouter des articles", exact: true }).first().click();
  const picker = page.locator("[data-carte-item-picker]");
  await expect(picker.locator('[data-picker-item="1"] img')).toHaveCount(0);
  await picker.getByRole("button", { name: "Filtres", exact: true }).click();
  await page.getByRole("button", { name: "Catégorie Tous", exact: true }).click();
  const filter = page.locator("[data-carte-picker-filter]");
  await expect(filter.getByRole("alert")).toHaveText(/Impossible de charger les catégories/);
  failCategories = false;
  await filter.getByRole("button", { name: "Réessayer", exact: true }).click();
  await filter.getByRole("textbox", { name: "Rechercher des catégories", exact: true }).fill("cuis");
  await expect(filter.getByRole("checkbox", { name: "Boissons", exact: true })).toHaveCount(0);
  await filter.getByRole("checkbox", { name: "Cuisine", exact: true }).check();
  await page.keyboard.press("Escape");
  await expect(filter).toHaveCount(0);
  await expect(picker.locator("[data-picker-item]")).toHaveCount(3);
  await expect(picker.getByRole("button", { name: "Filtres", exact: true })).toBeFocused();
  expect(f.writes).toEqual([]);
});

test("publication remains reachable on a long carte and French mobile stays within viewport", async ({
  page,
}) => {
  const f = await install(page, "fr", true);
  for (let i = 3; i <= 16; i++)
    f.payload.groups.push({
      ...structuredClone(f.payload.groups[0]),
      key: `group-${i}`,
      id: i,
      name: `Groupe ${i}`,
    });
  await page.goto(`/1/menu/menus/${f.menu.id}`);
  await rename(page, "Une longue carte");
  await expect(
    page
      .locator("[data-carte-editor-footer]")
      .getByRole("button", { name: "Enregistrer le brouillon", exact: true }),
  ).toBeInViewport();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await expect(
    page
      .locator("[data-carte-editor-footer]")
      .getByRole("button", { name: "Enregistrer le brouillon", exact: true }),
  ).toBeInViewport();
  await page.screenshot({
    animations: "disabled",
    path: "test-results/carte-square-mobile-fr.png",
  });
});

test("stock, preview and publication shortcuts remain visible without opening menus", async ({
  page,
}) => {
  const f = await install(page, "fr", true);
  await page.goto(`/1/menu/menus/${f.menu.id}`);
  const top = header(page);
  await expect(
    top.getByRole("button", { name: "Aperçu", exact: true }),
  ).toBeVisible();
  await expect(
    top.getByRole("button", { name: "Enregistrer le brouillon", exact: true }),
  ).toBeVisible();
  await expect(
    top.getByRole("button", { name: "Enregistrer le brouillon", exact: true }),
  ).toBeDisabled();
  await expect(
    top.getByRole("button", { name: "Publier", exact: true }),
  ).toBeVisible();
  await expect(
    top.getByRole("button", { name: "Publier", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Historique des stocks", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Préparer les stocks de cette série",
      exact: true,
    })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", {
        name: "Préparer les stocks de cette série",
        exact: true,
      }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Fermer", exact: true })
    .click();
  await top.getByRole("button", { name: "Aperçu", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Fermer", exact: true })
    .click();
  let historyItem: string | null = null;
  await page.route("**/api/v1/menu/sales-stock/history*", (route) => {
    historyItem = new URL(route.request().url()).searchParams.get("item_id");
    return route.fulfill({ json: { events: [], next_cursor: 0 } });
  });
  await page
    .getByRole("button", {
      name: "Historique du stock — Salade méditerranéenne",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Historique du stock", exact: true }),
  ).toBeVisible();
  await expect.poll(() => historyItem).toBe("1");
  expect(f.writes).toEqual(["preview"]);
});

const historyEvent = (id: number, itemId = 1) => ({
  id, menu_item_id: itemId,
  item_name: itemId === 1 ? "Salade méditerranéenne" : "Focaccia maison",
  option_name: "", series_key: "2026-10-16", kind: "quantity_changed",
  before_quantity: 20, after_quantity: 18, delta: -2,
  actor_id: 1, actor_name: "Responsable", order_id: 42,
  reason: "", created_at: "2026-10-21T08:00:00Z",
});

test("stock page is history-only and preserves combined filters across pagination", async ({ page }) => {
  const f = await install(page);
  const requests: URL[] = [];
  const writes: string[] = [];
  const stockReads: string[] = [];
  page.on("request", (request) => {
    if (!request.url().includes("/api/v1/")) return;
    if (!["GET", "HEAD"].includes(request.method())) writes.push(request.url());
    if (new URL(request.url()).pathname === "/api/v1/menu/sales-stock") stockReads.push(request.url());
  });
  await page.route("**/api/v1/menu/sales-stock/history*", (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const itemId = Number(url.searchParams.get("item_id")) || 1;
    return route.fulfill({ json: {
      events: [historyEvent(url.searchParams.has("before_id") ? 8 : 10, itemId)],
      next_cursor: url.searchParams.has("before_id") ? 0 : 10,
    }});
  });
  await page.goto("/1/menu/stock?item_id=1");
  const journal = page.locator("[data-sales-stock-history]");
  await expect(journal.getByRole("heading", { name: "Historique des stocks", exact: true })).toBeVisible();
  await expect(journal.getByRole("table")).toBeInViewport();
  await expect(journal.getByRole("combobox", { name: "Article", exact: true })).toHaveValue("1");
  await expect(journal.getByRole("spinbutton")).toHaveCount(0);
  await expect(journal.getByRole("link", { name: "Gérer le stock", exact: true })).toHaveCount(0);
  await expect(journal.getByRole("button", { name: "Appliquer les corrections de stock", exact: true })).toHaveCount(0);
  await journal.getByRole("combobox", { name: "Mouvement", exact: true }).selectOption("quantity_changed");
  await expect.poll(() => requests.at(-1)?.searchParams.get("kind")).toBe("quantity_changed");
  await journal.getByLabel("Série", { exact: true }).fill("2026-10-16");
  await expect.poll(() => requests.at(-1)?.searchParams.get("serie_date")).toBe("2026-10-16");
  await journal.getByRole("combobox", { name: "Article", exact: true }).selectOption(String(f.payload.groups[0].item_ids[0] + 1));
  await expect.poll(() => requests.at(-1)?.searchParams.get("item_id")).toBe("2");
  await expect(journal.getByRole("combobox", { name: "Mouvement", exact: true })).toHaveValue("quantity_changed");
  await expect(journal.getByRole("cell", { name: "Focaccia maison", exact: true })).toBeVisible();
  await journal.getByRole("button", { name: "Afficher la suite", exact: true }).click();
  await expect(journal.getByRole("row")).toHaveCount(3);
  expect(Object.fromEntries(requests.at(-1)!.searchParams)).toEqual({
    item_id: "2", serie_date: "2026-10-16", before_id: "10", kind: "quantity_changed",
  });
  await journal.getByRole("button", { name: "Toutes les séries", exact: true }).click();
  await expect.poll(() => requests.at(-1)?.searchParams.has("serie_date")).toBe(false);
  await expect(journal.getByRole("row")).toHaveCount(2);
  expect(stockReads).toEqual([]);
  expect(writes).toEqual([]);
  await page.screenshot({ path: "test-results/stock-history-desktop-fr.png", fullPage: true, animations: "disabled" });
});

test("changing history filters discards an older in-flight pagination response", async ({ page }) => {
  await install(page);
  let release: (() => void) | undefined;
  let completed = false;
  await page.route("**/api/v1/menu/sales-stock/history*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.has("before_id")) {
      await new Promise<void>((resolve) => { release = resolve; });
      await route.fulfill({ json: { events: [{ ...historyEvent(8), item_name: "Ancien résultat" }], next_cursor: 0 } });
      completed = true;
      return;
    }
    return route.fulfill({ json: { events: [historyEvent(10, Number(params.get("item_id")) || 1)], next_cursor: 10 } });
  });
  await page.goto("/1/menu/stock");
  await page.getByRole("button", { name: "Afficher la suite", exact: true }).click();
  await expect.poll(() => !!release).toBe(true);
  await page.getByRole("combobox", { name: "Article", exact: true }).selectOption("2");
  await expect(page.getByRole("cell", { name: "Focaccia maison", exact: true })).toBeVisible();
  release!();
  await expect.poll(() => completed).toBe(true);
  await expect(page.getByRole("cell", { name: "Ancien résultat", exact: true })).toHaveCount(0);
});

for (const locale of ["fr", "he"]) {
  test(`history-only page remains usable on ${locale} mobile`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await install(page, locale);
    await page.route("**/api/v1/menu/sales-stock/history*", (route) => route.fulfill({ json: { events: [historyEvent(10)], next_cursor: 0 } }));
    await page.goto("/1/menu/stock");
    const journal = page.locator("[data-sales-stock-history]");
    await expect(journal.getByRole("table")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "he" ? "rtl" : "ltr");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/stock-history-mobile-${locale}.png`, fullPage: true, animations: "disabled" });
  });
}

test("history remains available if its item filter fails and history errors can be retried", async ({ page }) => {
  await install(page);
  let itemsFailed = true;
  let historyFailed = false;
  await page.route("**/api/v1/menu/items?*", (route) => itemsFailed
    ? route.fulfill({ status: 503, json: { error: "unavailable" } })
    : route.fallback());
  await page.route("**/api/v1/menu/sales-stock/history*", (route) => historyFailed
    ? route.fulfill({ status: 503, json: { error: "unavailable" } })
    : route.fulfill({ json: { events: [historyEvent(10)], next_cursor: 0 } }));
  await page.goto("/1/menu/stock");
  await expect(page.locator("[data-sales-stock-history]").getByRole("alert")).toContainText("Impossible de charger le filtre des articles");
  await expect(page.getByRole("cell", { name: "Responsable", exact: true })).toBeVisible();
  itemsFailed = false;
  await page.locator("[data-sales-stock-history]").getByRole("alert").getByRole("button", { name: "Réessayer", exact: true }).click();
  await expect(page.locator("[data-sales-stock-history]").getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("option", { name: "Salade méditerranéenne", exact: true })).toHaveCount(1);
  historyFailed = true;
  await page.getByRole("combobox", { name: "Mouvement", exact: true }).selectOption("reservation");
  await expect(page.locator("[data-sales-stock-history]").getByRole("alert")).toContainText("Impossible de charger ou de modifier le stock");
  await expect(page.getByText("Aucun mouvement enregistré pour ces filtres.", { exact: true })).toHaveCount(0);
  historyFailed = false;
  await page.locator("[data-sales-stock-history]").getByRole("alert").getByRole("button", { name: "Réessayer", exact: true }).click();
  await expect(page.locator("[data-sales-stock-history]").getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "Responsable", exact: true })).toBeVisible();
});

test("carte availability opens the centered editor and only applies an explicit choice", async ({ page }) => {
 const f = await install(page, 'fr', true);
 await page.goto(`/1/menu/menus/${f.menu.id}`);
 const row = page.locator('[data-carte-item]').first();
 await expect(page.getByRole('columnheader', { name: 'Disponibilité', exact: true })).toBeVisible();
 await expect(row.locator('.list-availability-pill')).toHaveText('Disponible');
 await row.locator('.list-availability-pill').click();
 await expect(page.getByRole('dialog')).toBeVisible();
 expect(f.writes).toEqual([]);
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(row.locator('.list-availability-pill')).toBeFocused();
 expect(f.writes).toEqual([]);
 await row.locator('.list-availability-pill').click();
 await page.getByRole('dialog').getByRole('radio', { name: 'Indisponible', exact: true }).check();
 expect(f.writes).toEqual([]);
 await page.getByRole('dialog').getByRole('button', { name: 'Annuler', exact: true }).click();
 await expect(row.locator('.list-availability-pill')).toHaveText('Disponible');
 expect(f.writes).toEqual([]);
 await row.locator('.list-availability-pill').click();
 await page.getByRole('dialog').getByRole('radio', { name: 'Indisponible', exact: true }).check();
 await page.getByRole('dialog').getByRole('button', { name: 'Appliquer', exact: true }).click();
 await expect.poll(() => f.writes).toEqual(['availability']);
 await expect(row.locator('.list-availability-pill')).toHaveText('Rupture de stock');
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.screenshot({ path: 'test-results/carte-availability-column-fr.png', fullPage: true, animations: 'disabled' });
});

for (const measure of [false, true]) test(`exhausted predefined ${measure ? "measured" : "counted"} stock asks for remaining quantity directly and preserves draft controls`, async ({ page }) => {
 const f = await install(page, 'fr', true);
 let quantity = 0, revision = 2;
 const inputs: any[] = [];
 await page.route('**/api/v1/menu/sales-stock?*', route => route.fulfill({ json: { series_key: f.key, rows: f.items.map(item => ({ item, managed: true, previous: null, sizes: measure ? [{ id: 20, name: '250 g' }] : [], config: { menu_item_id: item.id, mode: measure ? 'measure' : 'count', unit: measure ? 'kg' : '', override: 'auto', revision, counters: [{ option_id: 0, initial_quantity: 10 + quantity, committed: 10 }] }, availability: { availability_state: quantity ? 'available' : 'sold_out', buildable_count: measure ? Math.floor(quantity / 250) : quantity } })) } }));
 await page.route('**/api/v1/menu/items/*/sales-stock/restock?*', route => { const input = route.request().postDataJSON(); inputs.push(input); quantity = input.quantity; revision++; return route.fulfill({ json: { revision } }); });
 await page.goto(`/1/menu/menus/${f.menu.id}`);
 const row = page.locator('[data-carte-item]').first();
 await expect(row.locator('.list-availability-pill')).toHaveText('Rupture de stock');
 await row.locator('.list-availability-pill').click();
 const dialog = page.getByRole('dialog');
 await expect(dialog.getByRole('heading', { name: 'Disponibilité' })).toBeVisible();
 expect(inputs).toHaveLength(0);
 if (measure) await expect(dialog.getByText('Quantité disponible (g)', { exact: true })).toBeVisible();
 await dialog.getByRole('spinbutton').fill(measure ? '500' : '5');
 await dialog.getByRole('button', { name: 'Appliquer', exact: true }).click();
 await expect(dialog).toHaveCount(0);
 await expect(row.locator('.list-availability-pill')).toHaveText('Disponible');
 await expect(row).toContainText(measure ? '2 disponible' : '5 disponible');
 expect(inputs).toHaveLength(1); expect(inputs[0]).toMatchObject({ quantity: measure ? 500 : 5, expected_revision: 2, mode: measure ? 'measure' : 'count', unit: measure ? 'g' : '', override: 'auto' });
 expect(f.writes).toEqual([]);
 await expect(header(page).getByRole('button', { name: 'Aperçu', exact: true })).toBeVisible();
 await page.screenshot({ path: 'test-results/carte-direct-restock-fr.png', fullPage: true });
});

for (const locale of ['fr', 'he']) test(`restaurant quotas are read-only and responsive (${locale})`, async ({ page }) => {
 await install(page, locale);
 if (locale === 'he') await page.setViewportSize({ width: 390, height: 844 });
 const ids = ['google_autocomplete','google_details','google_geocoding','google_routes','google_optimization_single','google_optimization_fleet','google_tiles','geoapify_credits'];
 const limits = [2000,500,500,500,500,100,10000,3000];
 await page.route('**/api/v1/restaurants/1/api-usage', route => route.fulfill({ json: { restaurant_id: 1, revision: 0, month: '2026-10', resets_at: '2026-11-01T00:00:00Z', tracked_since: '2026-10-21T10:00:00Z', counters: ids.map((id,i) => ({ id, provider: i === 7 ? 'geoapify' : 'google', unit: i === 7 ? 'estimated_credits' : i === 6 ? 'tiles' : i === 4 || i === 5 ? 'shipments' : 'requests', default_limit: limits[i], used: i === 5 ? 100 : i === 4 ? 400 : i === 7 ? 0.25 : 1, requests: 1, limit: limits[i], remaining: limits[i], status: i === 5 ? 'exhausted' : i === 4 ? 'warning' : 'available' })) } }));
 await page.goto('/1/settings/usage');
 await expect(page.getByRole('heading', { level: 1 })).toHaveText(locale === 'fr' ? 'Consommation et quotas' : 'צריכה ומכסות');
 await expect(page.getByRole('progressbar')).toHaveCount(8);
 await expect(page.getByRole('spinbutton')).toHaveCount(0);
 await expect(page.getByText(locale === 'fr' ? 'Plafond atteint ; ce service est suspendu' : 'המכסה נוצלה; השירות מושהה', { exact: true })).toBeVisible();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await page.screenshot({ path: `test-results/api-quotas-${locale}.png`, fullPage: true });
});


test('predefined stock can be created from the badge and a conflict preserves entered quantities', async ({page}) => {
 const f = await install(page,'fr',true);
 let quantity: number | null = null, revision = 0, reject = true;
 const inputs: any[] = [];
 await page.route('**/api/v1/menu/sales-stock?*', route => route.fulfill({json:{series_key:f.key,rows:f.items.map(item=>({item:{...item,stock_mode:'',stock_quantity:null},managed:true,previous:null,sizes:[],config:revision ? {mode:'count',unit:'',override:'auto',revision,counters:[{option_id:0,initial_quantity:(quantity??0)+10,committed:10}]} : null,availability:{availability_state:'available',buildable_count:quantity}}))}}));
 await page.route('**/api/v1/menu/items/*/sales-stock/restock?*', route => {
  const input=route.request().postDataJSON();inputs.push(input);
  if(reject){quantity=9;revision=3;return route.fulfill({status:409,json:{error:'revision_conflict'}});}
  quantity=input.quantity;revision++;return route.fulfill({json:{revision}});
 });
 await page.goto(`/1/menu/menus/${f.menu.id}`);
 const row=page.locator('[data-carte-item]').first();await row.locator('.list-availability-pill').click();
 const dialog=page.getByRole('dialog');await dialog.getByRole('radio',{name:'Stock prédéfini',exact:true}).check();
 const input=dialog.getByRole('spinbutton');await input.fill('0');await expect(dialog.getByRole('button',{name:'Appliquer',exact:true})).toBeDisabled();
 await input.fill('6');expect(inputs).toHaveLength(0);
 await page.screenshot({path:'test-results/carte-availability-stock-fr.png',fullPage:true,animations:'disabled'});
 await dialog.getByRole('button',{name:'Appliquer',exact:true}).click();await expect(dialog.getByRole('alert')).toBeVisible();await expect(input).toHaveValue('6');
 reject=false;await dialog.getByRole('button',{name:'Recharger les stocks',exact:true}).click();await expect(dialog.getByRole('alert')).toHaveCount(0);await expect(input).toHaveValue('6');
 await dialog.getByRole('button',{name:'Appliquer',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(row).toContainText('6 disponibles');
 expect(inputs).toHaveLength(2);expect(inputs[0]).toMatchObject({mode:'count',quantity:6,expected_revision:0,override:'auto'});expect(inputs[1]).toMatchObject({mode:'count',quantity:6,expected_revision:3});expect(f.writes).toEqual([]);
});

test('predefined stock preserves an unlimited size while adjusting another size', async ({page}) => {
 const f=await install(page,'fr',true);const inputs:any[]=[];
 await page.route('**/api/v1/menu/sales-stock?*',route=>route.fulfill({json:{series_key:f.key,rows:f.items.map(item=>({item,managed:true,previous:null,sizes:[{id:20,name:'Petite'},{id:21,name:'Grande'}],config:{mode:'per_variant',unit:'',override:'auto',revision:2,counters:[{option_id:20,initial_quantity:5,committed:2},{option_id:21,initial_quantity:null,committed:0}]},availability:{availability_state:'available',buildable_count:null}}))}}));
 await page.route('**/api/v1/menu/items/*/sales-stock/restock?*',route=>{inputs.push(route.request().postDataJSON());return route.fulfill({json:{revision:3}});});
 await page.goto(`/1/menu/menus/${f.menu.id}`);await page.locator('[data-carte-item] .list-availability-pill').first().click();const dialog=page.getByRole('dialog');
 await expect(dialog.getByRole('spinbutton',{name:'Grande',exact:true})).toHaveValue('');await dialog.getByRole('spinbutton',{name:'Petite',exact:true}).fill('6');
 await dialog.getByRole('button',{name:'Appliquer',exact:true}).click();await expect(dialog).toHaveCount(0);expect(inputs[0]).toMatchObject({mode:'per_variant',quantity:null,options:{'20':6,'21':null},expected_revision:2,override:'auto'});
});


test("non-series carte restock uses the library revision rather than a series revision", async ({page}) => {
 const f=await install(page);let received:any;
 await page.route("**/api/v1/public/restaurants/1/batch-fulfillment-config",route=>route.fulfill({json:{enabled:false,upcoming_cycles:[]}}));
 await page.route("**/api/v1/menu/menus?*",route=>route.fulfill({json:{menus:[{...f.menu,is_weekly_rotating:false}]}}));
 await page.route("**/api/v1/menu/sales-stock?*",route=>route.fulfill({json:{series_key:f.key,rows:f.items.map(item=>({item:{...item,stock_revision:9,stock_mode:'count',stock_quantity:0},managed:false,previous:null,config:null,sizes:[],availability:{availability_state:'sold_out',buildable_count:0}}))}}));
 await page.route("**/api/v1/menu/items/*/sales-stock/restock?*",route=>{received=route.request().postDataJSON();return route.fulfill({json:{revision:10}});});
 await page.goto(`/1/menu/menus/${f.menu.id}`);
 await page.locator('[data-carte-item] .list-availability-pill').first().click();const panel=page.getByRole('dialog');
 await panel.getByRole('spinbutton').fill('7');await panel.getByRole('button',{name:'Appliquer',exact:true}).click();
 await expect(panel).toBeHidden();expect(received).toMatchObject({quantity:7,expected_revision:9});
});

for (const tracking of ['measure', 'per_variant'] as const) test(`series product restores ${tracking} stock with measured input and explicit Apply`, async ({ page }) => {
  const f = await install(page, 'fr', true);
  const inputs: any[] = [];
  const sizes = [{ id: 20, name: '250 g' }, { id: 21, name: '500 g' }];
  let config: any = null;
  await page.route('**/api/v1/menu/sales-stock?*', route => route.fulfill({ json: {
    series_key: f.key,
    rows: f.items.map(item => ({ item: { ...item, stock_mode: '', stock_quantity: null }, managed: true, previous: null, sizes, config, availability: { availability_state: 'available', buildable_count: config ? 8 : null } })),
  } }));
  await page.route('**/api/v1/menu/items/*/sales-stock/restock?*', route => {
    const input = route.request().postDataJSON(); inputs.push(input);
    expect(new URL(route.request().url()).searchParams.get('serie_date')).toBe(f.key);
    expect(route.request().headers()['x-restaurant-id']).toBe('1');
    config = { ...input, revision: 1, counters: tracking === 'measure'
      ? [{ option_id: 0, initial_quantity: input.quantity, committed: 0 }]
      : sizes.map(size => ({ option_id: size.id, initial_quantity: input.options[size.id], committed: 0 })) };
    return route.fulfill({ json: { revision: 1 } });
  });
  await page.goto('/1/menu/items/1?tab=availability');
  const section = page.locator('#item-availability');
  const edit = section.getByRole('button', { name: 'Modifier le stock et la disponibilité', exact: true });
  await edit.click();
  const dialog = page.getByRole('dialog', { name: 'Disponibilité', exact: true });
  await dialog.getByRole('radio', { name: 'Stock prédéfini', exact: true }).check();
  await dialog.getByRole('combobox', { name: 'Mode de suivi', exact: true }).selectOption(tracking);
  await dialog.getByRole('combobox', { name: 'Unité de saisie', exact: true }).selectOption('g');
  if (tracking === 'measure') {
    await dialog.getByRole('spinbutton').fill('2000');
    await dialog.getByRole('combobox', { name: 'Unité de saisie', exact: true }).selectOption('kg');
    await expect(dialog.getByRole('spinbutton')).toHaveValue('2');
  } else {
    await dialog.getByRole('spinbutton', { name: '250 g (g)', exact: true }).fill('1000');
    await dialog.getByRole('spinbutton', { name: '500 g (g)', exact: true }).fill('1000');
    await expect(dialog.getByText('4 × 250 g', { exact: true })).toBeVisible();
    await expect(dialog.getByText('2 × 500 g', { exact: true })).toBeVisible();
    await dialog.getByRole('spinbutton', { name: '250 g (g)', exact: true }).fill('1100');
    await expect(dialog.getByRole('button', { name: 'Appliquer', exact: true })).toBeDisabled();
    await dialog.getByRole('spinbutton', { name: '250 g (g)', exact: true }).fill('1000');
  }
  expect(inputs).toEqual([]);
  await dialog.getByRole('button', { name: 'Annuler', exact: true }).click();
  expect(inputs).toEqual([]);
  await edit.click();
  await dialog.getByRole('radio', { name: 'Stock prédéfini', exact: true }).check();
  await dialog.getByRole('combobox', { name: 'Mode de suivi', exact: true }).selectOption(tracking);
  await dialog.getByRole('combobox', { name: 'Unité de saisie', exact: true }).selectOption(tracking === 'measure' ? 'kg' : 'g');
  if (tracking === 'measure') await dialog.getByRole('spinbutton').fill('2');
  else for (const input of await dialog.getByRole('spinbutton').all()) await input.fill('1000');
  await page.screenshot({ path: `test-results/product-stock-${tracking}-fr.png`, fullPage: true });
  await dialog.getByRole('button', { name: 'Appliquer', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(inputs).toHaveLength(1);
  expect(inputs[0]).toMatchObject(tracking === 'measure'
    ? { mode: 'measure', unit: 'g', quantity: 2000, expected_revision: 0 }
    : { mode: 'per_variant', unit: '', quantity: null, options: { '20': 4, '21': 2 }, expected_revision: 0 });
  expect(f.writes).toEqual([]);
});

for (const rejected of [false, true]) test(`a committed series can change tracking mode and preserves the draft after a conversion error (${rejected})`, async ({ page }) => {
  const f = await install(page, 'fr', true);
  const inputs: any[] = [];
  let mode = 'count', revision = 3;
  await page.route('**/api/v1/menu/sales-stock?*', route => route.fulfill({ json: { series_key: f.key, rows: f.items.map(item => ({ item, managed: true, previous: null, sizes: [{ id: 20, name: '250 g' }, { id: 21, name: '500 g' }], config: { mode, unit: mode === 'measure' ? 'g' : '', override: 'auto', revision, counters: [{ option_id: 0, initial_quantity: mode === 'measure' ? 3000 : 488, committed: mode === 'measure' ? 1000 : 3 }] }, availability: { availability_state: 'available', buildable_count: 8 } })) } }));
  await page.route('**/api/v1/menu/items/*/sales-stock/restock?*', route => {
    const input = route.request().postDataJSON(); inputs.push(input);
    if (rejected) return route.fulfill({ status: 422, json: { error: 'stock_conversion_unavailable' } });
    mode = input.mode; revision++;
    return route.fulfill({ json: { revision } });
  });
  await page.goto('/1/menu/items/1?tab=availability');
  const section = page.locator('#item-availability');
  await section.getByRole('button', { name: 'Modifier le stock et la disponibilité', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Disponibilité', exact: true });
  await expect(dialog.getByRole('combobox', { name: 'Mode de suivi', exact: true })).toBeEnabled();
  await dialog.getByRole('combobox', { name: 'Mode de suivi', exact: true }).selectOption('measure');
  await expect(dialog.getByText(/Les réservations existantes seront recalculées/)).toBeVisible();
  await expect(dialog.getByRole('spinbutton')).toHaveValue('');
  await dialog.getByRole('spinbutton').fill('2000');
  expect(inputs).toEqual([]);
  await dialog.getByRole('button', { name: 'Appliquer', exact: true }).click();
  expect(inputs[0]).toMatchObject({ mode: 'measure', unit: 'g', quantity: 2000, expected_revision: 3 });
  if (rejected) {
    await expect(dialog.getByRole('alert')).toContainText('Impossible de convertir les réservations existantes');
    await expect(dialog.getByRole('spinbutton')).toHaveValue('2000');
    expect(mode).toBe('count');
  } else {
    await expect(dialog).toHaveCount(0);
    await expect(section).toContainText('2000 g');
    await expect(section).toContainText('1000 g');
  }
  expect(f.writes).toEqual([]);
});

test('series product measured size inputs fit Hebrew mobile', async ({ page }) => {
  const f = await install(page, 'he', true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/v1/menu/sales-stock?*', route => route.fulfill({ json: { series_key: f.key, rows: f.items.map(item => ({ item, managed: true, previous: null, sizes: [{ id: 20, name: '250 g' }, { id: 21, name: '500 g' }], config: { mode: 'per_variant', unit: '', override: 'auto', revision: 1, counters: [{ option_id: 20, initial_quantity: 4, committed: 0 }, { option_id: 21, initial_quantity: 2, committed: 0 }] }, availability: { availability_state: 'available', buildable_count: 6 } })) } }));
  await page.goto('/1/menu/items/1?tab=availability');
  await page.locator('#item-availability').getByRole('button', { name: 'עריכת מלאי וזמינות', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'זמינות', exact: true });
  await dialog.getByRole('combobox', { name: 'יחידת הזנה', exact: true }).selectOption('g');
  await expect(dialog.getByRole('spinbutton', { name: '250 g (g)', exact: true })).toHaveValue('1000');
  await expect(dialog.getByRole('spinbutton', { name: '500 g (g)', exact: true })).toHaveValue('1000');
  const box = await dialog.boundingBox();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(dialog.getByRole('button', { name: 'החל', exact: true })).toBeVisible();
  expect(f.writes).toEqual([]);
  await page.screenshot({ path: 'test-results/product-stock-per-variant-mobile-he.png', fullPage: true });
});

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900, locale: 'fr' },
  { name: 'short desktop', width: 1280, height: 600, locale: 'fr' },
  { name: 'Hebrew mobile', width: 390, height: 844, locale: 'he' },
  { name: 'mobile landscape', width: 844, height: 390, locale: 'fr' },
]) test(`stock editor uses the viewport and keeps actions visible on ${viewport.name}`, async ({ page }) => {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  const f = await install(page, viewport.locale, true);
  const sizes = Array.from({ length: 16 }, (_, index) => ({ id: 20 + index, name: `${(index + 1) * 100} g` }));
  await page.route('**/api/v1/menu/sales-stock?*', route => route.fulfill({ json: {
    series_key: f.key,
    rows: f.items.map(item => ({ item, managed: true, previous: null, sizes,
      config: { mode: 'per_variant', unit: '', override: 'auto', revision: 1,
        counters: sizes.map(size => ({ option_id: size.id, initial_quantity: 10, committed: 1 })) },
      availability: { availability_state: 'available', buildable_count: 144 } })),
  } }));
  await page.goto('/1/menu/items/1?tab=availability');
  const edit = page.locator('#item-availability').getByRole('button', {
    name: viewport.locale === 'he' ? 'עריכת מלאי וזמינות' : 'Modifier le stock et la disponibilité', exact: true,
  });
  // Reproduce a trigger at the bottom of the product page's visible area.
  await edit.evaluate(element => element.scrollIntoView({ block: 'end' }));
  await edit.click();
  const dialog = page.getByRole('dialog', { name: viewport.locale === 'he' ? 'זמינות' : 'Disponibilité', exact: true });
  const scroll = dialog.locator('[data-availability-scroll]');
  const actions = dialog.locator('[data-availability-actions]');
  await expect(dialog).toBeVisible();
  await expect(actions).toBeInViewport({ ratio: 1 });
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(11);
  expect(box.y).toBeGreaterThanOrEqual(11);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 11);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 11);
  if (viewport.width >= 1000) {
    expect(box.width).toBeGreaterThanOrEqual(630);
    expect((await scroll.boundingBox())!.height).toBeGreaterThan(viewport.height - 330);
  }
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  const before = await actions.boundingBox();
  const scrollBox = (await scroll.boundingBox())!;
  await page.mouse.move(scrollBox.x + scrollBox.width / 2, scrollBox.y + scrollBox.height / 2);
  await page.mouse.wheel(0, 2200);
  await expect.poll(() => scroll.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  const lastInput = dialog.getByRole('spinbutton', { name: '1600 g', exact: true });
  await lastInput.scrollIntoViewIfNeeded();
  await expect(lastInput).toBeInViewport({ ratio: 1 });
  await expect(actions).toBeInViewport({ ratio: 1 });
  expect((await actions.boundingBox())!.y).toBeCloseTo(before!.y, 0);
  await page.screenshot({ path: `test-results/stock-editor-${viewport.name.replaceAll(' ', '-')}.png`, animations: 'disabled' });
  await dialog.getByRole('button', { name: viewport.locale === 'he' ? 'ביטול' : 'Annuler', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(edit).toBeFocused();
  expect(f.writes).toEqual([]);
});
