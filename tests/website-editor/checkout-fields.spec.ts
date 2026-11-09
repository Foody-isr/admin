import { expect, test } from "@playwright/test";
import type { CheckoutConfig } from "../../src/lib/api";
import type { DraftStatePayload } from "../../src/lib/website-v3/types";

const api = "http://127.0.0.1:18081/api/v1/restaurants/1";

test.use({ serviceWorkers: "block" });

test("delivery field visibility and requirements update live and only reach guests after publication", async ({ page, context, request }, info) => {
  test.setTimeout(240_000);
  await context.addInitScript(() => {
    if (location.port === "3003") {
      localStorage.setItem("foody_restaurant_token", "isolated-ui-fixture");
      localStorage.setItem("foody_restaurant_user", JSON.stringify({ id: 1, full_name: "Demo", role: "manager", email: "demo@foody.test" }));
      localStorage.setItem("foody_restaurant_ids", "[1]");
      localStorage.setItem("foody-admin-locale", "fr");
    } else if (location.port === "3000") {
      localStorage.setItem("foody-locale", "fr");
      localStorage.setItem("foody-cart", JSON.stringify({
        version: 1, state: { restaurantId: "1", currency: "EUR", lines: [
          { id: "fixture-line", item: { id: "1", name: "Test", price: 25, groupId: "1", available: true }, quantity: 2 },
        ] },
      }));
    }
  });
  const orders: Record<string, unknown>[] = [];
  const cors = { "access-control-allow-origin": "*" };
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) return route.abort();
    if (url.pathname.endsWith("/address-autocomplete/config")) return route.fulfill({ headers: cors, json: { available: false, enabled: false } });
    if (url.pathname.endsWith("/delivery/cities")) return route.fulfill({ headers: cors, json: { cities: ["Paris"] } });
    if (url.pathname.endsWith("/customers/check-trusted")) return route.fulfill({ headers: cors, json: { trusted: false } });
    if (url.pathname === "/api/customer-auth/providers") return route.fulfill({ json: {} });
    if (url.pathname === "/api/customer-api/restaurants/1") {
      const response = await route.fetch();
      const body = await response.json();
      // The general editor fixture has an empty hours object, which closes
      // immediate ordering. Use the always-open contract for this checkout.
      return route.fulfill({ response, json: { ...body, restaurant: { ...body.restaurant, opening_hours_config: null } } });
    }
    if (/\/orders\/?$/.test(url.pathname) && route.request().method() === "POST") {
      orders.push(route.request().postDataJSON());
      return route.fulfill({ status: 422, json: { error: "Synthetic order capture" } });
    }
    return route.continue();
  });

  const draft = async (): Promise<DraftStatePayload> => (await (await request.get(api + "/website-draft")).json()).state;
  const seed = await draft();
  seed.sections = [];
  for (const item of seed.pages) item.is_homepage = item.type === "order";
  const builtins = [
    "customer_phone", "delivery_address", "delivery_city", "delivery_floor", "delivery_apt", "delivery_entry_code", "delivery_notes",
  ].map((id, i) => ({ id, kind: "builtin" as const, enabled: true, required: i < 3 }));
  seed.config.checkout_config = {
    offer_sign_in: false,
    delivery: { require_auth: false, fields: [...builtins, { id: "delivery_hint", kind: "custom", enabled: true, required: false, type: "textarea", label: { fr: "Repère" } }] },
  };
  expect((await request.put(api + "/website-draft", { data: seed })).ok()).toBe(true);
  expect((await request.post(api + "/website-publish")).ok()).toBe(true);

  await page.goto("/1/website-v3");
  await page.getByRole("button", { name: "Parcours de commande", exact: true }).click({ timeout: 60_000 });
  await page.getByRole("combobox", { name: "Écran", exact: true }).selectOption("checkout");
  await page.getByRole("combobox", { name: "Mode de l’aperçu" }).selectOption("delivery");
  const preview = page.frameLocator("iframe");
  const floor = preview.getByRole("textbox", { name: "Étage", exact: true });
  const apartment = preview.getByRole("textbox", { name: "Appartement", exact: true });
  const code = preview.getByRole("textbox", { name: "Code immeuble", exact: true });
  const city = preview.getByRole("combobox", { name: "Ville", exact: true });
  const check = preview.getByRole("button", { name: "Vérifier les champs" });
  await expect(city).toHaveValue("", { timeout: 60_000 });
  for (const field of [floor, apartment, code]) await expect(field).toBeVisible();

  const floorRow = page.locator('[data-checkout-field="delivery_floor"]');
  await floorRow.getByRole("button", { name: /Étage/ }).click();
  const requirement = floorRow.getByRole("combobox", { name: "Champ obligatoire" });
  await requirement.selectOption("required");
  await expect(floor).toHaveJSProperty("required", true);
  const hintRow = page.locator('[data-checkout-field="delivery_hint"]');
  await hintRow.getByRole("button", { name: /Repère/ }).click();
  await hintRow.getByRole("combobox", { name: "Champ obligatoire" }).selectOption("required");
  await expect(preview.getByRole("textbox", { name: "Repère", exact: true })).toHaveJSProperty("required", true);
  await hintRow.getByRole("switch", { name: "Afficher le champ : Repère" }).uncheck();
  await expect(preview.getByRole("textbox", { name: "Repère", exact: true })).toHaveCount(0);

  await preview.getByRole("textbox", { name: "Téléphone", exact: true }).fill("0502345678");
  await preview.getByRole("textbox", { name: "Adresse de livraison", exact: true }).fill("12 rue Exemple");
  await city.selectOption("Paris");
  await check.click();
  await expect(floor).toBeFocused();
  expect(orders).toHaveLength(0);
  await floorRow.getByRole("button", { name: /Étage/ }).click();
  await requirement.selectOption("optional");
  await expect(floor).toHaveJSProperty("required", false);
  await check.click();
  await expect(preview.getByText("Le formulaire est valide. Aucune commande n’a été passée.")).toBeVisible();
  await requirement.selectOption("required");
  await expect.poll(async () => ((await draft()).config.checkout_config as CheckoutConfig | null)?.delivery?.fields.find(field => field.id === "delivery_floor")?.required).toBe(true);
  await floorRow.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("checkout-fields-editor.png"), style: "nextjs-portal { display: none; }" });

  const live = await context.newPage();
  const liveURL = "http://localhost:3000/order/checkout?restaurantId=1&orderType=delivery&lang=fr";
  await live.goto(liveURL);
  const liveFloor = live.getByRole("textbox", { name: "Étage", exact: true });
  await expect(liveFloor).toHaveJSProperty("required", false);
  const publication = page.waitForResponse(response => response.url().endsWith("/website-publish") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Publier", exact: true }).click();
  expect((await publication).ok()).toBe(true);
  await live.reload();
  await expect(liveFloor).toHaveJSProperty("required", true);
  await expect(live.getByRole("textbox", { name: "Repère", exact: true })).toHaveCount(0);
  await expect(live.getByRole("textbox", { name: "Appartement", exact: true })).toHaveJSProperty("required", false);

  await live.setViewportSize({ width: 390, height: 900 });
  await live.getByRole("textbox", { name: "Téléphone", exact: true }).fill("0502345678");
  await live.getByRole("textbox", { name: "Adresse de livraison", exact: true }).fill("12 rue Exemple");
  await live.getByRole("combobox", { name: "Ville", exact: true }).selectOption("Paris");
  const submit = live.locator('.commerce-confirm-action button[type="submit"]');
  await submit.click();
  await expect(liveFloor).toBeFocused();
  expect(orders).toHaveLength(0);
  await liveFloor.fill("2");
  await live.getByRole("textbox", { name: "Code immeuble", exact: true }).fill("041B");
  const orderAttempt = live.waitForRequest(req => /\/orders\/?$/.test(new URL(req.url()).pathname) && req.method() === "POST", { timeout: 45_000 });
  await submit.click();
  await orderAttempt;
  await expect.poll(() => orders.length).toBe(1);
  expect(orders[0]).toMatchObject({ delivery_floor: "2", delivery_entry_code: "041B" });
  expect(orders[0].delivery_apt).toBeUndefined();
  await live.locator(".commerce-contact").screenshot({ path: info.outputPath("checkout-fields-mobile.png") });
});
