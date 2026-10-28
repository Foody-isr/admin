import { test, expect, type Page } from "@playwright/test";
import { createFixture } from "./fixtures.mjs";

async function install(
  page: Page,
  { series = false, locale = "fr", readOnly = false } = {},
) {
  const f = createFixture({ library: true });
  const item = f.items[0] as typeof f.items[0] & { stock_mode: string; stock_quantity: number; stock_revision: number; availability_override: string; availability_state: string };
  Object.assign(item, {
    stock_mode: "count",
    stock_quantity: 0,
    stock_revision: 3,
    availability_override: "auto",
    availability_state: "sold_out",
  });
  const key = f.batchConfig.upcoming_cycles[0].fulfillment_days[0].date;
  const writes: { path: string; body: any; date: string | null }[] = [];
  let reject = false,
    loadFailed = false,
    reads = 0;
  await page.addInitScript(
    ({ locale, readOnly }) => {
      localStorage.setItem("foody_restaurant_token", "isolated-ui-fixture");
      localStorage.setItem(
        "foody_restaurant_user",
        JSON.stringify({
          id: 1,
          full_name: "Demo",
          role: readOnly ? "staff" : "owner",
          email: "demo@foody.test",
        }),
      );
      localStorage.setItem("foody_restaurant_ids", "[1]");
      localStorage.setItem("foody-admin-locale", locale);
      localStorage.setItem("foody_admin_theme", "light");
    },
    { locale, readOnly },
  );
  await page.routeWebSocket("**/*", (socket) => socket.close());
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    if (path.endsWith("/batch-fulfillment-config"))
      return route.fulfill({ json: { ...f.batchConfig, enabled: series } });
    if (path === "/api/v1/menu/sales-stock") {
      reads++;
      if (loadFailed)
        return route.fulfill({ status: 503, json: { error: "unavailable" } });
      return route.fulfill({
        json: {
          series_key: key,
          rows: [
            {
              item,
              managed: series,
              previous: null,
              sizes: [],
              config: series
                ? {
                    mode: item.stock_mode,
                    unit: "",
                    override: item.availability_override,
                    revision: item.stock_revision,
                    counters: [
                      {
                        option_id: 0,
                        initial_quantity: (item.stock_quantity ?? 0) + 6,
                        committed: 6,
                      },
                    ],
                  }
                : null,
              availability: {
                availability_state: item.availability_state,
                buildable_count: item.stock_quantity,
              },
            },
          ],
        },
      });
    }
    if (path.includes("/sales-stock/") && req.method() === "POST") {
      const body = req.postDataJSON();
      writes.push({ path, body, date: url.searchParams.get("serie_date") });
      if (reject)
        return route.fulfill({
          status: 409,
          json: { error: "revision_conflict" },
        });
      if (path.endsWith("/restock"))
        Object.assign(item, {
          stock_quantity: body.quantity,
          stock_mode: body.mode,
          availability_override: "auto",
          availability_state: "available",
          stock_revision: item.stock_revision + 1,
        });
      else
        Object.assign(item, {
          availability_override: body.override,
          availability_state:
            body.override === "force_sold_out" ? "sold_out" : "available",
        });
      return route.fulfill({ json: { revision: item.stock_revision } });
    }
    const result = f.response(
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
  const base = process.env.MAMIE_UI_QA_URL ?? "http://localhost:3103";
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.pathname.startsWith("/api/v1/") ||
      ["localhost", "127.0.0.1", new URL(base).hostname].includes(
        url.hostname,
      ) ||
      (route.request().resourceType() === "font" &&
        url.hostname === "square-fonts-production-f.squarecdn.com")
      ? route.fallback()
      : route.abort();
  });
  await page.goto("/1/menu/items");
  const row = page.locator("tbody tr").filter({ hasText: item.name }).first();
  await expect(row).toBeVisible();
  const badge = row.locator(".list-availability-pill");
  return {
    item,
    key,
    badge,
    writes,
    get reads() {
      return reads;
    },
    reject(value: boolean) {
      reject = value;
    },
    failLoad(value: boolean) {
      loadFailed = value;
    },
  };
}

test("Articles badge opens the shared editor without writing or navigating and Cancel/Escape restore focus", async ({
  page,
}) => {
  const f = await install(page);
  await f.badge.click();
  const panel = page.getByRole("dialog");
  await expect(
    panel.getByRole("radio", { name: "Quantité définie manuellement", exact: true }),
  ).toBeChecked();
  expect(f.writes).toHaveLength(0);
  await expect(page).toHaveURL("/1/menu/items");
  await panel
    .getByRole("radio", { name: "Disponible sans limite", exact: true })
    .click();
  await panel.getByRole("button", { name: "Annuler", exact: true }).click();
  expect(f.writes).toHaveLength(0);
  await expect(f.badge).toBeFocused();
  await f.badge.click();
  await expect(
    panel.getByRole("radio", { name: "Quantité définie manuellement", exact: true }),
  ).toBeChecked();
  await page.keyboard.press("Escape");
  expect(f.writes).toHaveLength(0);
  await expect(f.badge).toBeFocused();
});

test("Articles availability choices only persist on Apply and refresh the row", async ({
  page,
}) => {
  const f = await install(page);
  await f.badge.click();
  const panel = page.getByRole("dialog");
  await panel
    .getByRole("radio", { name: "Disponible sans limite", exact: true })
    .click();
  expect(f.writes).toHaveLength(0);
  await panel.getByRole("button", { name: "Appliquer", exact: true }).click();
  await expect(panel).toBeHidden();
  await expect(f.badge).toContainText("Disponible");
  expect(f.writes[0].body).toEqual({ override: "force_available" });
  await f.badge.click();
  await panel.getByRole("radio", { name: "Indisponible", exact: true }).click();
  await panel.getByRole("button", { name: "Appliquer", exact: true }).click();
  await expect(panel).toBeHidden();
  await expect(f.badge).toContainText("Rupture de stock");
  expect(f.writes[1].body).toEqual({ override: "force_sold_out" });
  await f.badge.click();
  await panel
    .getByRole("radio", {
      name: "Quantité calculée depuis la recette",
      exact: true,
    })
    .click();
  await panel.getByRole("button", { name: "Appliquer", exact: true }).click();
  await expect(panel).toBeHidden();
  expect(f.writes[2].path).toContain("/restock");
  expect(f.writes[2].body).toMatchObject({ stock_source: "recipe", mode: "", expected_revision: 3 });
  Object.assign(f.item, { availability_override: "force_sold_out", availability_state: "sold_out" });
  await page.getByRole("button", { name: "Actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Actualiser", exact: true }).click();
  await expect(f.badge).toContainText("Rupture de stock");
});

for (const series of [false, true])
  test(`Articles predefined ${series ? "series" : "library"} stock uses the current revision and retains inputs after a conflict`, async ({
    page,
  }) => {
    const f = await install(page, { series });
    await f.badge.click();
    const panel = page.getByRole("dialog");
    await expect(
      panel.getByRole("radio", { name: "Quantité définie manuellement", exact: true }),
    ).toBeChecked();
    if (series) await expect(panel).toContainText(f.key);
    await expect(
      panel.getByRole("button", { name: "Appliquer", exact: true }),
    ).toBeDisabled();
    await panel.getByRole("spinbutton").fill("7");
    f.reject(true);
    await panel.getByRole("button", { name: "Appliquer", exact: true }).click();
    await expect(panel.getByRole("alert")).toBeVisible();
    await expect(panel.getByRole("spinbutton")).toHaveValue("7");
    f.item.stock_revision = 4;
    await panel
      .getByRole("button", { name: "Recharger les stocks", exact: true })
      .click();
    await expect(
      panel.getByRole("button", { name: "Appliquer", exact: true }),
    ).toBeEnabled();
    await expect(panel.getByRole("spinbutton")).toHaveValue("7");
    expect(f.writes).toHaveLength(1);
    f.reject(false);
    await panel.getByRole("button", { name: "Appliquer", exact: true }).click();
    await expect(panel).toBeHidden();
    expect(f.writes[1].body).toMatchObject({
      quantity: 7,
      mode: "count",
      expected_revision: 4,
    });
    expect(f.writes[1].date).toBe(f.key);
    await expect(page).toHaveURL("/1/menu/items");
  });

test("Articles cannot apply before fresh stock loads and can retry a failed initial read", async ({
  page,
}) => {
  const f = await install(page);
  f.failLoad(true);
  await f.badge.click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByRole("alert")).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Appliquer", exact: true }),
  ).toHaveCount(0);
  expect(f.writes).toHaveLength(0);
  f.failLoad(false);
  await panel
    .getByRole("button", { name: "Recharger les stocks", exact: true })
    .click();
  await expect(
    panel.getByRole("radio", { name: "Quantité définie manuellement", exact: true }),
  ).toBeChecked();
});

test("Articles shared availability panel fits Hebrew mobile and supports stock input", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const f = await install(page, { series: true, locale: "he" });
  await f.badge.click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByRole("spinbutton")).toBeVisible();
  await expect
    .poll(async () => {
      const b = await panel.boundingBox();
      return (
        !!b &&
        b.x >= 0 &&
        b.y >= 0 &&
        b.x + b.width <= 391 &&
        b.y + b.height <= 845
      );
    })
    .toBe(true);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.screenshot({
    path: "test-results/articles-availability-mobile-he.png",
    fullPage: true,
    animations: "disabled",
  });
});
