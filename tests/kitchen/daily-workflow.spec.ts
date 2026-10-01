import { test, expect, type Page } from "@playwright/test";

// All API calls are intercepted. This suite never writes restaurant data.
async function mockKitchen(
  page: Page,
  options: {
    emptyPlan?: boolean;
    failStock?: boolean;
    failSummary?: boolean;
    many?: boolean;
    negative?: boolean;
  } = {},
) {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
  }).format(new Date());
  let status = "open";
  let received = false;
  let produced = false;
  let counted: number | null = null;
  let target: number | null = null;
  const writes: { path: string; body: unknown }[] = [];
  const stock = {
    id: 11,
    name: "Cabillaud",
    quantity: 12,
    unit: "kg",
    cost_per_unit: 10,
    reorder_threshold: 15,
    is_active: true,
    supplier: "Poissonnerie",
  };
  const prep = {
    id: 21,
    name: "Fish pané",
    quantity: 2,
    unit: "unit",
    yield_per_batch: 10,
    reorder_threshold: 5,
    is_active: true,
    shelf_life_hours: 24,
    category: "Poissons",
  };
  const plan = {
    prep_item_id: prep.id,
    prep_item_name: prep.name,
    unit: prep.unit,
    current_qty: 2,
    required_qty: 12,
    shortfall_qty: 10,
    batches_needed: 1,
    yield_per_batch: 10,
    shelf_life_hours: 24,
    category: "Poissons",
    priority: "high",
  };
  await page.addInitScript(() => {
    localStorage.setItem("foody_restaurant_token", "mock-kitchen-session");
    localStorage.setItem(
      "foody_restaurant_user",
      JSON.stringify({ id: 1, full_name: "Test chef", role: "manager" }),
    );
    localStorage.setItem("foody_restaurant_ids", "[1]");
    localStorage.setItem("foody_remember", "1");
    localStorage.setItem("foody-admin-locale", "fr");
  });
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "*",
        },
      });
      return;
    }
    if (request.method() !== "GET")
      writes.push({ path, body: request.postDataJSON() });
    if (path.endsWith("/close")) status = "closed";
    if (path.endsWith("/receive") || path.endsWith("/import/delivery/confirm"))
      received = true;
    if (path.endsWith("/produce")) produced = true;
    if (path.endsWith("/closing-stock"))
      counted = request.postDataJSON().items[0].quantity;
    if (path.endsWith("/production-target"))
      target = request.postDataJSON().quantity;
    const report = {
      id: 31,
      restaurant_id: 1,
      report_date: `${date}T00:00:00Z`,
      status,
      sales_source: "aviv",
      total_sales_revenue: 5718,
      items: [
        {
          id: 1,
          stock_item_id: 11,
          item_name: "Cabillaud",
          unit: "kg",
          opening_stock: 2,
          received_qty: 10,
          closing_stock: 1.25,
          closing_stock_counted: false,
          theoretical_usage: 10.75,
          actual_usage: 10.75,
          cost_per_unit: 10,
          variance: 0,
          variance_percent: 0,
          variance_cost: 0,
          waste_qty: 0,
        },
      ],
      sales: [
        {
          id: 1,
          menu_item_id: 42,
          menu_item_name: "Signature",
          quantity: 86,
          source: "aviv",
        },
      ],
    };
    let data: unknown = {};
    if (path === "/api/v1/restaurants/1")
      data = { restaurant: { id: 1, name: "Test cuisine", currency: "ILS" } };
    else if (path.endsWith("/users/me"))
      data = {
        permissions: ["kitchen.manage", "kitchen.view"],
        role_name: "Owner",
      };
    else if (path.endsWith("/kitchen-summary")) {
      if (options.failSummary) {
        await route.fulfill({
          status: 500,
          json: { error: "Summary unavailable" },
          headers: { "Access-Control-Allow-Origin": "*" },
        });
        return;
      }
      const expectedRemaining = (received ? 20 : 10) - (produced ? 7.5 : 6.25);
      const row = {
        stock_item_id: 11,
        name: "Cabillaud",
        unit: "kg",
        opening_qty: 2,
        received_qty: received ? 18 : 8,
        production_usage: produced ? 7.5 : 6.25,
        order_usage: 0,
        pending_usage: 0,
        waste_qty: 0,
        adjustment_qty: 0,
        expected_remaining: expectedRemaining,
        recorded_remaining: expectedRemaining,
        counted_remaining: counted,
        unexplained_qty: counted == null ? null : expectedRemaining - counted,
        recipes: [
          {
            name: "Fish pané",
            produced_qty: produced ? 60 : 50,
            prep_unit: "unit",
            quantity_per_unit: 0.125,
          },
        ],
      };
      data = {
        summary: {
          unmapped_sales: 0,
          stocks: options.many
            ? [
                row,
                ...Array.from({ length: 6 }, (_, i) => ({
                  ...row,
                  stock_item_id: 100 + i,
                  name: `Autre ingrédient ${i}`,
                  recipes: [],
                })),
              ]
            : [row],
          preparations: [
            {
              prep_item_id: 21,
              name: "Fish pané",
              unit: "unit",
              target_qty: target,
              produced_qty: produced ? 60 : 50,
              waste_qty: 0,
              remaining_qty: 2,
            },
          ],
        },
      };
    } else if (path.includes("/daily-reports"))
      data = { report, reports: [], purchase_orders: [] };
    else if (path.endsWith("/stock/items")) {
      if (options.failStock) {
        await route.fulfill({
          status: 500,
          json: { error: "Stock unavailable" },
          headers: { "Access-Control-Allow-Origin": "*" },
        });
        return;
      }
      data = { items: [stock] };
    } else if (path.endsWith("/stock/transactions"))
      data = { transactions: [] };
    else if (path.endsWith("/daily-plan"))
      data = {
        items:
          options.emptyPlan || produced
            ? null
            : [{ ...plan, current_qty: options.negative ? -76 : 2 }],
      };
    else if (path.endsWith("/prep/items"))
      data = { items: [{ ...prep, quantity: produced ? 12 : 2 }] };
    else if (path.endsWith("/preview"))
      data = {
        ingredients: [
          {
            stock_item_id: 11,
            stock_item_name: "Cabillaud",
            quantity_used: 1,
            unit: "kg",
          },
        ],
        insufficient: null,
      };
    else if (path.endsWith("/purchase-orders"))
      data = {
        orders: received
          ? []
          : [
              {
                id: 41,
                supplier: { name: "Poissonnerie" },
                status: "sent",
                items: [
                  { id: 51, name: "Cabillaud", quantity: 10, unit: "kg" },
                ],
              },
            ],
      };
    else if (path.includes("/categories")) data = { categories: [] };
    await route.fulfill({
      json: data,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });
  await page.goto("/1/kitchen/daily-operations");
  await page
    .getByRole("tab", { name: "Préparer le service", exact: true })
    .click();
  await expect(
    page.getByText("Livraisons à vérifier", { exact: true }),
  ).toBeVisible();
  return writes;
}

test("chef can review delivery, confirm a batch, and close without inventory", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const writes = await mockKitchen(page);
  await expect(page.getByRole("tabpanel")).toHaveCount(1);
  await expect(page.getByRole("table")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Vérifier la livraison", exact: true })
    .click();
  const confirmReceipt = page.getByRole("button", {
    name: "Confirmer la réception",
    exact: true,
  });
  await expect(confirmReceipt).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "Ligne vérifiée: Cabillaud" })
    .check();
  // Editing a checked quantity requires the chef to check the line again.
  await page.getByRole("textbox", { name: "Reçu: Cabillaud" }).fill("9");
  await expect(confirmReceipt).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "Ligne vérifiée: Cabillaud" })
    .check();
  await page.screenshot({
    path: "test-results/kitchen/receipt.png",
    fullPage: true,
    animations: "disabled",
  });
  await confirmReceipt.click();
  await expect(
    page.getByText(
      "Aucune commande fournisseur envoyée en attente de réception.",
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Enregistrer un lot", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Vérifier les ingrédients", exact: true })
    .click();
  await page.screenshot({
    path: "test-results/kitchen/batch.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Enregistrer un lot terminé", exact: true })
    .click();
  await expect(
    page.getByText("Aucune production suggérée", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Bilan du jour", exact: true }).click();
  await page.getByRole("button", { name: "Voir les 1 ingrédients" }).click();
  await page
    .getByRole("button", { name: "Contrôler le reste · Cabillaud" })
    .click();
  const movements = page.getByRole("dialog");
  await expect(movements.getByText("12,5 kg", { exact: true })).toBeVisible();
  await expect(movements.getByText("-7,5 kg", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Clôturer la journée", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Réouvrir la journée", exact: true }),
  ).toBeVisible();
  expect(writes.some((write) => write.path.endsWith("/closing-stock"))).toBe(
    false,
  );
  expect(
    writes.filter((write) => write.path.endsWith("/receive")),
  ).toHaveLength(1);
  expect(
    writes.filter((write) => write.path.endsWith("/produce")),
  ).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("empty recommendations do not claim coverage and tablet simulation stays local", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  const writes = await mockKitchen(page, { emptyPlan: true });
  const initialWrites = writes.length;
  await page
    .getByRole("tab", { name: "Pendant le service", exact: true })
    .click();
  await expect(page.getByText("0/0", { exact: true })).toHaveCount(0);
  await page
    .getByRole("spinbutton", { name: "Besoin du service — Fish pané" })
    .fill("12");
  await expect(page.getByText("10 unit", { exact: true })).toBeVisible();
  expect(writes.length).toBe(initialWrites);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/kitchen/tablet-service.png",
    fullPage: true,
    animations: "disabled",
  });
});

test("stock details preserve production consumption and only the requested physical count is saved", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const writes = await mockKitchen(page);
  await page.getByRole("tab", { name: "Bilan du jour", exact: true }).click();
  await expect(
    page.getByText("Aucun mouvement signalé", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Voir les 1 ingrédients" }).click();
  await page
    .getByRole("button", { name: "Contrôler le reste · Cabillaud" })
    .click();
  await expect(page.getByText("3,75 kg", { exact: true })).toBeVisible();
  await page.getByText("Quantités de la recette", { exact: true }).click();
  await expect(page.getByText("Fish pané · 6,25 kg")).toBeVisible();
  await page
    .getByRole("textbox", { name: "Stock physique restant (kg)" })
    .fill("2");
  await page.getByRole("button", { name: "Enregistrer ce contrôle" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Contrôler le reste · Cabillaud" })
    .click();
  await expect(
    page.getByText("1,75 kg de moins que prévu.", { exact: false }),
  ).toBeVisible();
  expect(
    writes.find((write) => write.path.endsWith("/closing-stock"))?.body,
  ).toEqual({ items: [{ stock_item_id: 11, quantity: 2 }] });
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "test-results/kitchen/check-stock.png",
    fullPage: true,
    animations: "disabled",
  });
});

test("objectives are saved explicitly and planned quantities remain distinct from produced quantities", async ({
  page,
}) => {
  const writes = await mockKitchen(page);
  await page
    .getByRole("button", {
      name: "Ajuster les objectifs de production du jour",
      exact: true,
    })
    .click();
  await page.getByRole("textbox", { name: "Fish pané (unit)" }).fill("80");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect
    .poll(
      () =>
        writes.filter((write) => write.path.endsWith("/production-target"))
          .length,
    )
    .toBe(1);
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Enregistrer", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(page.getByText("50 / 80 unit · Produit")).toBeVisible();
  await page.getByRole("tab", { name: "Bilan du jour", exact: true }).click();
  await page.getByRole("button", { name: /Bilan des préparations/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("80", { exact: true })).toBeVisible();
  await expect(dialog.getByText("50", { exact: true })).toBeVisible();
  await expect(dialog.getByText("2", { exact: true })).toBeVisible();
  await expect(
    dialog.getByText(/30 unit de moins que votre objectif/),
  ).toBeVisible();
});

test("ingredient review is paginated and keyboard phases preserve the bounded layout", async ({
  page,
}) => {
  await mockKitchen(page, { many: true });
  await page.getByRole("tab", { name: "Bilan du jour", exact: true }).click();
  await page.getByRole("button", { name: "Voir les 7 ingrédients" }).click();
  await expect(
    page.getByRole("button", { name: /Contrôler le reste ·/ }),
  ).toHaveCount(6);
  await page
    .getByRole("tabpanel")
    .getByRole("button", { name: "Suivant", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Contrôler le reste ·/ }),
  ).toHaveCount(1);
  await page
    .getByRole("tab", { name: "Bilan du jour", exact: true })
    .press("Home");
  await expect(
    page.getByRole("tab", { name: "Préparer le service", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("button", { name: /Contrôler le reste ·/ }),
  ).toHaveCount(0);
});

test("failed summaries and negative preparation balances remain explicit", async ({
  page,
}) => {
  await mockKitchen(page, { failSummary: true, negative: true });
  await expect(
    page.getByRole("link", { name: "Vérifier les préparations", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enregistrer un lot", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Bilan du jour", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Impossible de charger le bilan" }),
  ).toBeVisible();
});

test("stock load failure is visible without inventing a green zero alert", async ({
  page,
}) => {
  await mockKitchen(page, { failStock: true });
  await expect(
    page.getByRole("alert").filter({ hasText: "Stock unavailable" }),
  ).toBeVisible();
  await expect(
    page.getByText("Aucune alerte de stock actuellement.", { exact: true }),
  ).toHaveCount(0);
});

test("manual receipt reviews selected lines before recording stock", async ({
  page,
}) => {
  const writes = await mockKitchen(page);
  await page
    .getByRole("button", { name: "Réception manuelle", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Nom du fournisseur" })
    .fill("Poissonnerie");
  await page.getByRole("textbox", { name: "Reçu: Cabillaud" }).fill("10");
  await page
    .getByRole("button", { name: "Vérifier la sélection", exact: true })
    .click();
  expect(
    writes.filter((write) => write.path.endsWith("/import/delivery/confirm")),
  ).toHaveLength(0);
  await page
    .getByRole("button", { name: "Confirmer la réception", exact: true })
    .click();
  await page.getByRole("tab", { name: "Bilan du jour", exact: true }).click();
  await page.getByRole("button", { name: "Voir les 1 ingrédients" }).click();
  await page
    .getByRole("button", { name: "Contrôler le reste · Cabillaud" })
    .click();
  await expect(page.getByText("+18 kg", { exact: true })).toBeVisible();
  expect(
    writes.filter((write) => write.path.endsWith("/import/delivery/confirm")),
  ).toHaveLength(1);
});

test("phone review stays within viewport and handover survives phase changes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockKitchen(page, { many: true });
  await page.getByRole("tab", { name: "Bilan du jour", exact: true }).click();
  const note = page.getByPlaceholder(
    "Une livraison à attendre, une préparation à surveiller…",
  );
  await note.fill("Commander du cabillaud demain.");
  await page
    .getByRole("tab", { name: "Préparer le service", exact: true })
    .click();
  await page.getByRole("tab", { name: "Bilan du jour", exact: true }).click();
  await expect(note).toHaveValue("Commander du cabillaud demain.");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/kitchen/phone-review.png",
    fullPage: true,
    animations: "disabled",
  });
});
