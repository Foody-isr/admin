import { test, expect, type Page } from "@playwright/test";

const preparations = [
  {
    prep_item_id: 1,
    prep_item_name: "Pink Tartare",
    unit: "unit",
    current_qty: 0,
    required_qty: 24,
    shortfall_qty: 24,
    batches_needed: 2,
    yield_per_batch: 12,
    category: "Poisson",
    priority: "high",
  },
  {
    prep_item_id: 2,
    prep_item_name: "Signature",
    unit: "unit",
    current_qty: 8,
    required_qty: 32,
    shortfall_qty: 24,
    batches_needed: 2,
    yield_per_batch: 12,
    category: "Sauces",
    priority: "medium",
  },
  {
    prep_item_id: 3,
    prep_item_name: "Minituna",
    unit: "unit",
    current_qty: 36,
    required_qty: 30,
    shortfall_qty: 0,
    batches_needed: 0,
    yield_per_batch: 12,
    category: "Poisson",
    priority: "low",
  },
];
const items = [
  {
    id: 1,
    stock_item_id: 1,
    item_name: "Cheddar",
    unit: "kg",
    opening_stock: 2.4,
    received_qty: 0,
    theoretical_usage: 1.3,
    waste_qty: 0,
    closing_stock: 0,
    closing_stock_counted: false,
    variance: 0,
    variance_cost: 0,
    variance_percent: 0,
    cost_per_unit: 45,
  },
  {
    id: 2,
    stock_item_id: 2,
    item_name: "Pain hamburger",
    unit: "unit",
    opening_stock: 20,
    received_qty: 0,
    theoretical_usage: 24,
    waste_qty: 0,
    closing_stock: 0,
    closing_stock_counted: false,
    variance: 0,
    variance_cost: 0,
    variance_percent: 0,
    cost_per_unit: 3,
  },
];

async function fixture(
  page: Page,
  { failed = false, viewer = false, locale = "fr", many = false } = {},
) {
  const writes: string[] = [];
  await page.addInitScript(
    ({ locale }) => {
      localStorage.setItem("foody_restaurant_token", "kitchen-local-test");
      localStorage.setItem(
        "foody_restaurant_user",
        JSON.stringify({ id: 1, full_name: "Chef démo", role: "owner" }),
      );
      localStorage.setItem("foody_restaurant_ids", "[1]");
      localStorage.setItem("foody-admin-locale", locale);
    },
    { locale },
  );
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET") writes.push(path);
    let body: object = {};
    if (path === "/api/v1/restaurants/1")
      body = {
        restaurant: {
          id: 1,
          name: "Atelier Foody",
          currency: "ILS",
          timezone: "Asia/Jerusalem",
          opening_hours_config: {},
        },
      };
    else if (path === "/api/v1/users/me")
      body = {
        permissions: viewer
          ? ["kitchen.view"]
          : ["kitchen.view", "kitchen.manage"],
        role_name: viewer ? "Kitchen observer" : "Owner",
      };
    else if (path === "/api/v1/prep/daily-plan") {
      if (failed)
        return route.fulfill({ status: 503, json: { message: "unavailable" } });
      body = { items: preparations };
    } else if (path === "/api/v1/prep/items")
      body = {
        items: preparations.map((p) => ({
          id: p.prep_item_id,
          name: p.prep_item_name,
          quantity: p.current_qty,
          unit: p.unit,
          yield_per_batch: p.yield_per_batch,
          category: p.category,
          is_active: true,
        })),
      };
    else if (path.endsWith("/kitchen-summary"))
      body = {
        summary: {
          stocks: items.map((i) => ({
            stock_item_id: i.stock_item_id,
            name: i.item_name,
            unit: i.unit,
            opening_qty: i.opening_stock,
            received_qty: 0,
            production_usage: 0,
            order_usage: i.theoretical_usage,
            pending_usage: 0,
            adjustment_qty: 0,
            waste_qty: 0,
            expected_remaining: i.opening_stock - i.theoretical_usage,
            counted_remaining: null,
            unexplained_qty: null,
          })),
          preparations: [],
          unmapped_sales: 0,
        },
      };
    else if (path === "/api/v1/stock/items")
      body = {
        items: [
          {
            id: 1,
            name: "Cheddar",
            quantity: 1.1,
            unit: "kg",
            is_active: true,
            reorder_threshold: 2,
          },
          {
            id: 2,
            name: "Pain hamburger",
            quantity: -4,
            unit: "unit",
            is_active: true,
            reorder_threshold: 10,
          },
        ],
      };
    else if (path === "/api/v1/stock/forecast")
      body = {
        forecast: {
          sample_days: 6,
          top_items: [
            {
              menu_item_id: 1,
              menu_item_name: "Pink Tartare",
              predicted_qty: 24,
            },
            { menu_item_id: 2, menu_item_name: "Signature", predicted_qty: 32 },
            { menu_item_id: 3, menu_item_name: "Minituna", predicted_qty: 30 },
          ],
        },
      };
    else if (
      path === "/api/v1/stock/daily-reports/today" ||
      path.endsWith("/compute")
    )
      body = {
        report: {
          id: 10,
          status: "open",
          report_date: "2026-10-01",
          items,
          sales: [
            {
              id: 1,
              menu_item_id: 1,
              menu_item_name: "Pink Tartare",
              quantity: 12,
              source: "pos",
            },
            {
              id: 2,
              menu_item_id: 2,
              menu_item_name: "Signature",
              quantity: 24,
              source: "pos",
            },
          ],
          total_sales_revenue: 2400,
        },
      };
    else if (path === "/api/v1/stock/daily-reports") body = { reports: [] };
    else if (path.includes("purchase-orders")) body = { orders: [] };
    else if (path.includes("transactions")) body = { transactions: [] };
    else if (path.includes("item-categories")) body = { categories: [] };
    if (path.endsWith("/sales-links")) body = { items: [], sales: [], report_closed: false };
    if (many && path.endsWith("/kitchen-summary"))
      body = {
        summary: {
          stocks: Array.from({ length: 24 }, (_, i) => ({
            stock_item_id: i + 1,
            name:
              i === 0
                ? "Pain hamburger"
                : [
                    "Cabillaud",
                    "Ciboulette",
                    "Coriandre",
                    "Cheddar",
                    "Saumon",
                    "Crème",
                    "Citron",
                  ][i % 7] + ` ${i + 1}`,
            unit: i === 0 ? "unit" : "kg",
            opening_qty: i === 0 ? 100 : 10,
            received_qty: 0,
            production_usage: 0,
            order_usage: i === 0 ? 172 : 8,
            pending_usage: 0,
            waste_qty: 0,
            adjustment_qty: 0,
            expected_remaining: i === 0 ? -72 : 2,
            counted_remaining: null,
            unexplained_qty: null,
          })),
          preparations: preparations.map((p) => ({
            prep_item_id: p.prep_item_id,
            name: p.prep_item_name,
            unit: p.unit,
            target_qty: p.required_qty,
            produced_qty: p.current_qty,
            remaining_qty: p.current_qty,
            waste_qty: 0,
          })),
          unmapped_sales: 457,
        },
      };
    if (many && (path.endsWith("/today") || path.endsWith("/compute") || path === "/api/v1/stock/daily-reports/10"))
      body = {
        report: {
          id: 10,
          status: "open",
          report_date: "2026-10-01",
          items,
          sales: Array.from({ length: 73 }, (_, i) => ({
            id: i + 1,
            menu_item_id: i % 3 === 0 ? null : i + 1,
            menu_item_name: i === 0 ? "Signature" : `Article ${i + 1}`,
            quantity: i === 0 ? 86 : i < 40 ? 8 : 7,
            source: i === 0 ? "manual" : "aviv",
          })),
        },
      };
    await route.fulfill({ json: body });
  });
  await page.goto("/1/kitchen/daily-operations");
  await expect(
    page.getByRole("heading", {
      name: locale === "he" ? "שותף המטבח" : "Compagnon de cuisine",
      exact: true,
    }),
  ).toBeVisible();
  // Initial automatic report calculation is complete; interactions below must stay read-only.
  writes.length = 0;
  return writes;
}

test("briefing, phase navigation, simulation and physical checks", async ({
  page,
}) => {
  const writes = await fixture(page);
  await expect(
    page.getByRole("heading", { name: "Plan de production", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/kitchen/companion-opening.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("tab", { name: /Pendant le service/ }).click();
  const target = page.getByRole("spinbutton", {
    name: "Besoin du service — Minituna",
  });
  await target.fill("61");
  await expect(target.locator("..")).toContainText("25 unit");
  expect(writes).toEqual([]);
  await page.screenshot({
    path: "test-results/kitchen/companion-service.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("tab", { name: /Bilan du jour/ }).click();
  await expect(
    page.getByText("Reste attendu", { exact: false }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Contrôler le reste" })
    .first()
    .click();
  await expect(page.getByLabel("Stock physique restant (unit)")).toHaveValue(
    "",
  );
  await page.screenshot({
    path: "test-results/kitchen/companion-closing.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await page.locator("input[type=date]").fill("2026-09-12");
  await expect(
    page.getByText(/Aucun bilan enregistré à cette date/),
  ).toBeVisible();
  expect(writes).toEqual([]);
});

test("failed planning is unknown rather than all ready; viewer cannot write", async ({
  page,
}) => {
  await fixture(page, { failed: true, viewer: true });
  await expect(
    page.getByRole("alert").filter({ hasText: "Certaines informations" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /Bilan du jour/ }).click();
  await expect(
    page.getByRole("button", { name: /Contrôler le reste/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Clôturer la journée", exact: true }),
  ).toHaveCount(0);
});

test("Hebrew layout and keyboard phase navigation on tablet", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 1366 });
  await fixture(page, { locale: "he" });
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const tabs = page.getByRole("tab");
  await tabs.nth(0).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 1024);
  await page.screenshot({
    path: "test-results/kitchen/companion-hebrew-tablet.png",
    fullPage: true,
    animations: "disabled",
  });
});

test("physical zero counts are saved explicitly and other counts remain optional", async ({
  page,
}) => {
  const writes = await fixture(page);
  await page.getByRole("tab", { name: /Bilan du jour/ }).click();
  await page
    .getByRole("button", { name: "Contrôler le reste" })
    .first()
    .click();
  await page.getByLabel("Stock physique restant (unit)").fill("0");
  const savedCount = page.waitForRequest((request) =>
    request.url().endsWith("/closing-stock"),
  );
  await page.getByRole("button", { name: "Enregistrer ce contrôle" }).click();
  expect((await savedCount).postDataJSON()).toEqual({
    items: [{ stock_item_id: 2, quantity: 0 }],
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Clôturer la journée", exact: true })
    .click();
  await expect
    .poll(() => writes)
    .toContain("/api/v1/stock/daily-reports/10/close");
});

test("admin remains responsive on a phone while POS has its own iPad gate", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const writes = await fixture(page);
  await page.getByRole("tab", { name: /Pendant le service/ }).click();
  await expect(
    page.getByRole("spinbutton", { name: "Besoin du service — Minituna" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(writes).toEqual([]);
});

test("a busy day keeps 73 sales and 24 ingredients searchable outside the closing page", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await fixture(page, { many: true });
  await page.screenshot({
    path: "test-results/kitchen/redesign-opening.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("tab", { name: "Bilan du jour", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Contrôler le reste ·/ }),
  ).toHaveCount(1);
  await expect(page.getByText("457 articles sans recette liée")).toBeVisible();
  await page.screenshot({
    path: "test-results/kitchen/redesign-closing.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: /Journal des ventes/ }).click();
  const journal = page.getByRole("dialog");
  await expect(journal.getByText("1–10 / 73")).toBeVisible();
  await expect(journal.getByText("Article 11", { exact: true })).toHaveCount(0);
  await expect(
    journal.getByRole("button", { name: "Suivant", exact: true }),
  ).toBeEnabled();
  await journal.getByRole("button", { name: "Suivant", exact: true }).click();
  await expect(journal.getByText("11–20 / 73")).toBeVisible();
  await journal
    .getByRole("searchbox", { name: "Chercher un article vendu…" })
    .fill("Article 73");
  await expect(journal.getByText("1–1 / 1")).toBeVisible();
  await journal
    .getByRole("searchbox", { name: "Chercher un article vendu…" })
    .clear();
  await journal
    .getByRole("combobox", { name: "Source", exact: true })
    .selectOption("manual");
  await expect(journal.getByText("1–1 / 1")).toBeVisible();
  await expect(journal.getByText("Signature", { exact: true })).toBeVisible();
  await journal
    .getByRole("combobox", { name: "Source", exact: true })
    .selectOption("all");
  await page.screenshot({
    path: "test-results/kitchen/redesign-sales.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(journal).toHaveCount(0);
  await page
    .getByRole("button", { name: "Contrôler le reste · Pain hamburger" })
    .click();
  await page.screenshot({
    path: "test-results/kitchen/redesign-count.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});

test("sales import retains handover drafts and requires explicit acceptance of a mismatched date", async ({
  page,
}) => {
  await fixture(page);
  await page.getByRole("tab", { name: "Bilan du jour", exact: true }).click();
  const note = page.getByPlaceholder(
    "Une livraison à attendre, une préparation à surveiller…",
  );
  await note.fill("Prévoir une réception demain matin.");
  await page
    .getByRole("button", { name: "Importer les ventes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Synchroniser Foody POS", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(note).toHaveValue("Prévoir une réception demain matin.");
  let imported = false;
  await page.route("**/sales/import/aviv**", async (route) => {
    if (route.request().url().endsWith("/preview"))
      await route.fulfill({
        json: {
          preview: {
            report_from: "2026-09-30T12:00:00Z",
            report_to: "2026-09-30T22:00:00Z",
            report_date: "2026-10-01",
            date_mismatch: true,
            total_quantity: 73,
            total_revenue: 2000,
            rows: Array.from({ length: 14 }, (_, i) => ({
              source_name_key: `item-${i}`,
              name: `Plat ${i + 1}`,
              quantity: 5,
              line_total: 100,
              suggested_menu_item_id: null,
            })),
          },
        },
      });
    else {
      imported = true;
      await route.fulfill({ json: { report: { id: 10 } } });
    }
  });
  await page
    .getByRole("button", { name: "Importer les ventes", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .locator("input[type=file]")
    .setInputFiles({
      name: "test-sales.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 test fixture"),
    });
  const confirmImport = page.getByRole("button", {
    name: "Importer les ventes Aviv",
    exact: true,
  });
  await expect(confirmImport).toBeDisabled();
  await expect(page.getByRole("dialog").getByText("1–6 / 14")).toBeVisible();
  expect(imported).toBe(false);
  await page.getByRole("dialog").getByRole("checkbox").check();
  await expect(confirmImport).toBeEnabled();
  await page.screenshot({
    path: "test-results/kitchen/redesign-import.png",
    fullPage: true,
    animations: "disabled",
  });
  await confirmImport.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(note).toHaveValue("Prévoir une réception demain matin.");
  expect(imported).toBe(true);
});


test("Hebrew imports can be linked to the full library, with retry and unchanged quantities", async ({ page }) => {
  await fixture(page, { many: true });
  let linked = false;
  let fail = true;
  const requests: unknown[] = [];
  await page.route("**/daily-reports/10/sales-links", route => route.fulfill({ json: {
    report_closed: true,
    items: [
      { id: 8, name: "Café crème", category: "Boissons", image_url: "", translations: { name: { he: "אספרסו" } }, has_recipe: false },
      { id: 9, name: "Cola Zero", category: "Boissons", image_url: "", translations: { name: { he: "קולה זירו" } }, has_recipe: true },
    ],
    sales: [{ sale_id: 1, source_name: "קולה זירו", menu_item_id: linked ? 9 : null, menu_item_name: linked ? "Cola Zero" : "", can_link: true, has_recipe: linked }],
  }}));
  await page.route("**/daily-reports/10/sales/1/link", async route => {
    requests.push(route.request().postDataJSON());
    if (fail) await route.fulfill({ status: 500, json: { error: "Temporary failure" } });
    else { linked = true; await route.fulfill({ json: { ok: true } }); }
  });
  await page.getByRole("tab", { name: /Bilan du jour/ }).click();
  await page.getByRole("button", { name: /Journal des ventes/ }).click();
  await page.getByRole("button", { name: "Relier un article", exact: true }).click();
  const editor = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Relier à la bibliothèque d’articles" }) });
  await expect(editor).toContainText("Cette journée est clôturée");
  expect(requests).toEqual([]);
  await editor.getByLabel("Rechercher en français, hébreu ou anglais").fill("קולה");
  await expect(editor.getByRole("radio")).toHaveCount(1);
  await editor.getByRole("radio", { name: /Cola Zero/ }).click();
  await editor.getByRole("button", { name: "Enregistrer le lien" }).click();
  await expect(editor.getByRole("alert")).toContainText("Votre sélection est conservée");
  await expect(editor.getByRole("radio", { name: /Cola Zero/ })).toBeChecked();
  fail = false;
  await page.screenshot({ path: "test-results/kitchen/sales-link-library.png", fullPage: true });
  await editor.getByRole("button", { name: "Enregistrer le lien" }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByRole("dialog")).toContainText("Cola Zero");
  expect(requests).toEqual([{ menu_item_id: 9 }, { menu_item_id: 9 }]);
});
