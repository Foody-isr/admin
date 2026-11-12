import { test, expect, type Locator } from "@playwright/test";
import { normalizeWebsiteHeader } from "../../src/lib/website-v3/header";
import { record } from "../../src/lib/website-v3/restaurant-themes";
import { normalizeSiteColors } from "../../src/lib/website-v3/site-colors";
import type { DraftStatePayload } from "../../src/lib/website-v3/types";

test("the standard site can pin or scroll its fulfillment bar independently of the header", async ({ page, context, request }) => {
  test.skip(process.env.FOODY_HEADER_CHOICES !== "1", "Requires the isolated pickup and delivery fixture.");
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    localStorage.setItem("foody_restaurant_token", "isolated-ui-fixture");
    localStorage.setItem("foody_restaurant_user", JSON.stringify({ id: 1, full_name: "Demo", role: "manager", email: "demo@example.invalid" }));
    localStorage.setItem("foody_restaurant_ids", "[1]");
    localStorage.setItem("foody-admin-locale", "fr");
  });
  await context.route("**/*", route => ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const api = `http://127.0.0.1:${process.env.FOODY_WEBSITE_EDITOR_API_PORT ?? 18081}/api/v1/restaurants/1`;
  const draft = async (): Promise<DraftStatePayload> => (await (await request.get(api + "/website-draft")).json()).state;
  const seed = await draft();
  const order = seed.pages.find(item => item.type === "order")!;
  for (const item of seed.pages) item.is_homepage = item === order;
  order.appearance_overrides = { foody_renderer_version: 1, website_order: {
    layout: "list", show_banner: false, show_fulfillment: true, prompt_on_entry: false,
    choose_before_menu: false, sticky_categories: true, language_in_menu: true,
  }};
  seed.sections = [];
  seed.config.nav_layout = {
    // Simulate a site that was saved before the scroll setting existed.
    header: { ...normalizeWebsiteHeader({ layout: "center", scroll: "reveal" }), fulfillment: { enabled: true, background: "" } },
    mobile_experience: { version: 1, navigation: { enabled: true, items: [
      { id: "home", target: "home", placement: "bar" }, { id: "order", target: "order", placement: "bar" },
    ] } },
  };
  expect((await request.put(api + "/website-draft", { data: seed })).ok()).toBe(true);
  expect((await request.post(api + "/website-publish")).ok()).toBe(true);

  const openControls = async () => {
    await page.getByRole("button", { name: "En-tête", exact: true }).click({ timeout: 60_000 });
    await page.getByRole("button", { name: "Retrait, livraison et planification", exact: true }).click();
  };
  const settings = page.getByRole("group", { name: "Défilement de la barre de commande" });
  const preview = page.frameLocator("iframe");
  const service = ".website-service-location";
  const sticky = "[data-fulfillment-sticky]";
  const chooseView = async (name: string) => {
    await page.getByRole("button", { name: "Format de l’aperçu" }).click();
    await page.getByRole("menuitemradio", { name, exact: true }).click();
  };
  const publish = async () => {
    const button = page.getByRole("button", { name: "Publier", exact: true });
    await chooseView("Vue téléphone");
    await expect(button).not.toHaveAttribute("title", /aperçu mobile/);
    await chooseView("Vue ordinateur");
    await expect(button).not.toHaveAttribute("title", /.+/);
    const response = page.waitForResponse(r => r.url().endsWith("/website-publish") && r.request().method() === "POST");
    await button.click();
    expect((await response).ok()).toBe(true);
  };
  await page.goto("/1/website-v3");
  await openControls();
  await chooseView("Vue téléphone");
  await expect(settings.getByRole("radio", { name: "Suivre l’en-tête" })).toBeChecked();
  await expect(preview.locator(service)).toBeVisible();
  await expect(preview.locator(".order-menu-back")).toHaveCount(0);
  await settings.getByRole("radio", { name: "Fixer pendant le défilement" }).check();
  await expect(preview.locator(sticky).locator(service)).toBeVisible();
  await expect(preview.locator(sticky)).toHaveCSS("position", "sticky");
  await expect.poll(async () => (await draft()).config.nav_layout).toMatchObject({ header: { scroll: "reveal", fulfillment: { scroll: "sticky" } } });
  await page.reload();
  await openControls();
  await expect(settings.getByRole("radio", { name: "Fixer pendant le défilement" })).toBeChecked();
  await publish();

  const storefront = await context.newPage();
  const orderUrl = "http://localhost:3000/r/atelier-foody/order?lang=fr";
  const scrollDown = async (locator: Locator) => {
    await locator.evaluate(() => window.scrollTo({ top: 480, behavior: "instant" }));
    await expect.poll(() => locator.evaluate(() => window.scrollY)).toBeGreaterThan(160);
  };
  const navigation = storefront.locator(".website-order-navigation");
  for (const width of [390, 1280]) {
    await storefront.setViewportSize({ width, height: 480 });
    await storefront.goto(orderUrl);
    const bar = storefront.locator(sticky);
    await expect(bar.locator(service)).toBeVisible();
    await scrollDown(bar);
    await expect.poll(() => bar.evaluate(el => Math.round(el.getBoundingClientRect().top))).toBe(0);
    const bottom = await bar.evaluate(el => el.getBoundingClientRect().bottom);
    await expect.poll(() => navigation.evaluate(el => el.getBoundingClientRect().top)).toBeCloseTo(bottom, 0);
    await expect(storefront.locator(".order-menu-back")).toHaveCount(0);
    const lastCategory = navigation.locator("nav a").last();
    const target = (await lastCategory.getAttribute("href"))!;
    await lastCategory.click();
    await expect.poll(() => storefront.locator(target).evaluate(el =>
      el.getBoundingClientRect().top - document.querySelector(".website-order-navigation")!.getBoundingClientRect().bottom,
    )).toBeGreaterThanOrEqual(0);
  }

  // The dedicated app keeps its previous menu and fulfillment layout.
  const app = await context.newPage();
  await app.setViewportSize({ width: 390, height: 700 });
  await app.addInitScript(() => Object.defineProperty(navigator, "standalone", { value: true }));
  await app.goto(orderUrl);
  await expect(app.getByRole("navigation", { name: "Navigation mobile" })).toBeVisible();
  await expect(app.locator(sticky)).toHaveCount(0);
  await expect(app.locator(".order-menu-back")).toBeVisible();
  await app.close();

  await openControls();
  await settings.getByRole("radio", { name: "Défiler avec la page" }).check();
  await page.getByRole("radio", { name: "En-tête fixe", exact: true }).check();
  await expect(preview.locator(sticky)).toHaveCount(0);
  await expect.poll(async () => (await draft()).config.nav_layout).toMatchObject({ header: { scroll: "reveal", fulfillment: { scroll: "none" } } });
  await expect.poll(async () => (await draft()).pages.find(item => item.type === "order")?.appearance_overrides.order_header).toMatchObject({ scroll: "sticky" });
  await publish();
  await storefront.setViewportSize({ width: 390, height: 480 });
  await storefront.reload();
  const header = storefront.locator(".website-header");
  await expect(storefront.locator(service)).toBeVisible();
  await scrollDown(header);
  await expect.poll(() => header.evaluate(el => Math.round(el.getBoundingClientRect().top))).toBe(0);
  await expect.poll(() => storefront.locator(service).evaluate(el => el.getBoundingClientRect().bottom)).toBeLessThan(0);
  await expect.poll(() => navigation.evaluate(el => el.getBoundingClientRect().top)).toBeCloseTo((await header.boundingBox())!.height, 0);
});

test("order mode separates the published format, screen appearance and shared sign-in invitation", async ({ page, request, context }) => {
  test.skip(process.env.FOODY_HEADER_CHOICES !== "1", "Requires the isolated pickup and delivery fixture.");
  await page.addInitScript(() => {
    localStorage.setItem("foody_restaurant_token", "isolated-ui-fixture");
    localStorage.setItem("foody_restaurant_user", JSON.stringify({ id: 1, full_name: "Demo", role: "manager", email: "demo@example.invalid" }));
    localStorage.setItem("foody_restaurant_ids", "[1]");
    localStorage.setItem("foody-admin-locale", "fr");
    localStorage.setItem("foody-locale", "fr");
  });
  await context.route("**/*", route => ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const port = process.env.FOODY_WEBSITE_EDITOR_API_PORT ?? "18081";
  const endpoint = `http://127.0.0.1:${port}/api/v1/restaurants/1/website-draft`;
  const draft = async (): Promise<DraftStatePayload> => (await (await request.get(endpoint)).json()).state;
  const seed = await draft();
  for (const item of seed.pages) item.is_homepage = item.type === "order";
  seed.sections = [];
  seed.config.checkout_config = { lock_order_type: false, offer_sign_in: true };
  const colors = normalizeSiteColors({});
  Object.assign(colors.styles[1], { background: "#b0cbbb", title: "#112200" });
  Object.assign(colors.styles[2], { background: "#f4ede0", title: "#453728" });
  seed.config.custom_palette = { ...record(seed.config.custom_palette), color_styles: colors };
  seed.pages.find(item => item.type === "order")!.appearance_overrides = {
    foody_renderer_version: 1, website_order: { choose_before_menu: true },
  };
  expect((await request.put(endpoint, { data: seed })).ok()).toBe(true);

  await page.goto("/1/website-v3");
  const orderMode = page.getByRole("button", { name: "Mode de commande", exact: true });
  await orderMode.click({ timeout: 60_000 });
  const format = page.getByRole("group", { name: "Présentation du choix du mode", exact: true });
  const chooseFormat = format.getByRole("radio", { name: "Choix du mode", exact: true });
  const classicFormat = format.getByRole("radio", { name: "Fenêtre classique", exact: true });
  const screen = page.getByRole("combobox", { name: "Écran à personnaliser", exact: true });
  const appearance = page.locator("details").filter({ has: page.getByText("Apparence des écrans", { exact: true }) });
  const signIn = page.getByRole("switch", { name: /Afficher l’invitation à se connecter à l’arrivée/ });
  const preview = page.frameLocator("iframe");
  const step = preview.locator(".website-order-step");
  const background = preview.locator(".website-order-start-content");
  const guest = step.getByRole("button", { name: "Commander sans compte", exact: true });
  const address = step.getByLabel("Adresse de livraison", { exact: true });
  await expect(format.getByRole("radio")).toHaveCount(2);
  await expect(chooseFormat).toBeChecked();
  await expect(preview.locator(".website-order-entry")).toBeVisible();
  await screen.selectOption("delivery");
  await appearance.getByRole("button", { name: "Style de couleurs 3", exact: true }).click();
  await expect(background).toHaveCSS("background-color", "rgb(244, 237, 224)");
  await expect(guest).toBeVisible();
  await expect(step.getByRole("button", { name: "Me connecter", exact: true })).toBeDisabled();
  await guest.click();
  await expect(address).toBeVisible();
  await signIn.uncheck();
  await expect.poll(async () => (await draft()).config.checkout_config).toMatchObject({ offer_sign_in: false });
  await expect(address).toBeVisible();
  await expect(step.getByRole("button", { name: "Se connecter", exact: true })).toBeDisabled();
  await expect(guest).toHaveCount(0);
  await signIn.check();
  await expect(guest).toBeVisible();

  await screen.selectOption("pickup");
  await appearance.getByRole("button", { name: "Style de couleurs 2", exact: true }).click();
  await appearance.getByRole("combobox", { name: "Graisse du texte", exact: true }).selectOption("600");
  await expect(background).toHaveCSS("background-color", "rgb(176, 203, 187)");
  await expect(guest).toBeVisible();
  await guest.click();
  const pickupTitle = step.getByRole("heading", { name: "Retrait sur place", exact: true });
  await expect(pickupTitle).toHaveCSS("font-weight", "600");
  await expect(pickupTitle).toHaveCSS("color", "rgb(17, 34, 0)");

  await classicFormat.check();
  await expect(screen).toHaveCount(0);
  await expect(preview.locator(".website-entry-dialog[open]")).toBeVisible();
  await expect.poll(async () => (await draft()).pages.find(item => item.type === "order")!.appearance_overrides.website_order)
    .toMatchObject({ choose_before_menu: false, delivery_step_color_style: "style-3", pickup_step_color_style: "style-2" });
  await chooseFormat.check();
  await expect(screen).toHaveValue("entry");
  await expect(preview.locator(".website-order-entry")).toBeVisible();

  const published = page.waitForResponse(response => response.url().endsWith("/website-publish") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Publier", exact: true }).click();
  expect((await published).ok()).toBe(true);
  const storefront = await context.newPage();
  await storefront.goto("http://localhost:3000/r/atelier-foody/order?lang=fr");
  await storefront.locator(".website-order-entry").getByRole("button", { name: "Retrait", exact: true }).click();
  const pickup = storefront.locator(".website-order-step");
  await expect(pickup.getByRole("button", { name: "Me connecter", exact: true })).toBeEnabled();
  await pickup.getByRole("button", { name: "Commander sans compte", exact: true }).click();
  await expect(pickup.getByRole("heading", { name: "Retrait sur place", exact: true })).toHaveCSS("font-weight", "600");
  await expect(storefront.locator(".website-order-start-content")).toHaveCSS("background-color", "rgb(176, 203, 187)");
});

test("mobile order header settings preview and save independently of the product layout", async ({ page, request, context }) => {
  test.skip(process.env.FOODY_HEADER_CHOICES !== "1", "Requires the isolated pickup and delivery fixture.");
  await page.addInitScript(() => {
    localStorage.setItem("foody_restaurant_token", "isolated-ui-fixture");
    localStorage.setItem("foody_restaurant_user", JSON.stringify({id:1, full_name:"Demo", role:"manager", email:"demo@foody.test"}));
    localStorage.setItem("foody_restaurant_ids", "[1]");
    localStorage.setItem("foody-admin-locale", "fr");
  });
  await context.route("**/*", route => ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const port = process.env.FOODY_WEBSITE_EDITOR_API_PORT ?? "18081";
  const endpoint = `http://127.0.0.1:${port}/api/v1/restaurants/1/website-draft`;
  const draft = async (): Promise<DraftStatePayload> => (await (await request.get(endpoint)).json()).state;
  const seed = await draft();
  for (const item of seed.pages) item.is_homepage = item.type === "order";
  seed.sections = [];
  seed.config.checkout_config = { lock_order_type: false };
  seed.config.nav_layout = { header: normalizeWebsiteHeader({layout: "left", fulfillment: {enabled: true}}) };
  const colors = normalizeSiteColors({});
  Object.assign(colors.styles[1], { background: "#b0cbbb", title: "#112200", menu: {
    ...colors.styles[1].menu, card_background: "#fff7ec", card_title: "#283522",
  } });
  seed.config.custom_palette = {mode:"light", bg:"#fff8ed", surface:"#ffffff", ink:"#263321", accent:"#345548", color_styles: colors};
  const order = seed.pages.find(item => item.type === "order")!;
  order.appearance_overrides = { foody_renderer_version: 1, website_order: {
    choose_before_menu: true, layout: "list", mobile_item_layout: "inherit",
  }};
  expect((await request.put(endpoint, {data: seed})).ok()).toBe(true);
  await page.goto("/1/website-v3");
  await page.getByRole("button", {name: "Mode de commande", exact: true}).click({timeout:60_000});
  await page.getByRole("button", {name: "Format de l’aperçu", exact: true}).click();
  await page.getByRole("menuitemradio", {name: "Vue téléphone", exact: true}).click();
  const settings = page.locator("details").filter({has: page.locator("summary", {hasText: /^En-tête mobile de la carte$/})});
  await settings.locator("summary").click();
  await settings.getByRole("button", {name: "Prévisualiser l’en-tête", exact: true}).click();
  const preview = page.frameLocator("iframe");
  await expect(preview.locator(".website-entry-dialog[open]")).toHaveCount(0);
  const heading = preview.locator(".website-catalogue-mobile-heading h1");
  await expect(heading).toBeVisible();
  const layout = settings.getByRole("combobox", {name:"Disposition", exact:true});
  await layout.selectOption("standard");
  await expect(heading).toHaveCount(0);
  await layout.selectOption("compact");
  await settings.getByRole("button", {name:"Style de couleurs 2", exact:true}).click();
  await expect(preview.locator(".website-header")).toHaveCSS("background-color", "rgb(176, 203, 187)");
  await expect(preview.locator(".website-service-location")).toHaveCSS("background-color", "rgb(255, 247, 236)");
  await expect(heading).toHaveCSS("color", "rgb(17, 34, 0)");
  await settings.getByRole("combobox", {name:"Graisse du texte", exact:true}).selectOption("600");
  await expect(heading).toHaveCSS("font-weight", "600");
  await expect(preview.locator(".website-order-items").first()).not.toHaveAttribute("data-mobile-layout", "carousel");
  await expect.poll(async () => (await draft()).pages.find(item => item.type === "order")?.appearance_overrides.website_order)
    .toMatchObject({mobile_header_layout:"compact", mobile_header_color_style:"style-2", layout:"list", mobile_item_layout:"inherit"});
});

test("service modal colors survive preview, reload and publication; desktop languages use the existing selector", async ({ page, request, context }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    localStorage.setItem("foody_restaurant_token", "isolated-ui-fixture");
    localStorage.setItem("foody_restaurant_user", JSON.stringify({id:1, full_name:"Demo", role:"manager", email:"demo@foody.test"}));
    localStorage.setItem("foody_restaurant_ids", "[1]");
    localStorage.setItem("foody-admin-locale", "fr");
  });
  await context.route("**/*", route => ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const draft = async (): Promise<DraftStatePayload> =>
    (await (await request.get("http://127.0.0.1:18081/api/v1/restaurants/1/website-draft")).json()).state;
  const seed = await draft();
  seed.sections = [];
  for (const item of seed.pages) item.is_homepage = item.type === "order";
  seed.config.nav_layout = {header:normalizeWebsiteHeader({layout:"left", fulfillment:{enabled:true}})};
  const colors = normalizeSiteColors({});
  Object.assign(colors.styles[0], {background:"#191511", title:"#ffffff", paragraph:"#ffffff"});
  Object.assign(colors.styles[1], {background:"#f4ede0", title:"#112200", paragraph:"#223311", solid_button:"#24304a"});
  seed.config.custom_palette = {mode:"light", bg:"#191511", surface:"#302920", ink:"#ffffff", accent:"#dba974", color_styles:colors};
  seed.pages.find(item => item.type === "order")!.appearance_overrides = {foody_renderer_version:1, website_order:{color_style:"style-1", prompt_on_entry:false, show_banner:false}};
  await request.put("http://127.0.0.1:18081/api/v1/restaurants/1/website-draft", {data:seed});
  await request.post("http://127.0.0.1:18081/api/v1/restaurants/1/website-publish");
  await page.goto("/1/website-v3");
  await page.getByRole("button", {name:"Mode de commande", exact:true}).click({timeout:60_000});
  const picker = page.locator(".sqe-order-settings .sqe-shared-colors");
  await picker.getByRole("button", {name:"Style de couleurs 2", exact:true}).click();
  const preview = page.frameLocator("iframe");
  const modal = preview.locator(".website-fulfillment-dialog[open]");
  await expect(modal).toBeVisible({timeout:60_000});
  await expect(modal).toHaveCSS("background-color", "rgb(244, 237, 224)");
  await expect(modal.locator("h2")).toHaveCSS("color", "rgb(17, 34, 0)");
  await expect(modal.locator(".website-view-menu")).toHaveCSS("background-color", "rgb(36, 48, 74)");
  await expect(modal.locator(".website-view-menu")).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect.poll(async () => (await draft()).pages.find(item => item.type === "order")?.appearance_overrides.website_order).toMatchObject({fulfillment_color_style:"style-2", color_style:"style-1"});
  await page.reload();
  await page.getByRole("button", {name:"Mode de commande", exact:true}).click();
  await expect(picker.getByRole("button", {name:"Style de couleurs 2", exact:true})).toHaveAttribute("aria-pressed", "true");
  await expect(modal).toHaveCSS("background-color", "rgb(244, 237, 224)");
  await picker.getByRole("button", {name:"Modifier les styles de couleurs", exact:true}).click();
  const background = page.locator('[data-color-role="background"]');
  await background.getByRole("button").click();
  await background.locator("input").fill("#eee4d0");
  await background.locator("input").press("Enter");
  await expect(modal).toHaveCSS("background-color", "rgb(238, 228, 208)");
  await expect.poll(async () => (await draft()).config.custom_palette).toMatchObject({color_styles:{styles:expect.arrayContaining([expect.objectContaining({id:"style-2", background:"#eee4d0"})])}});
  const published = page.waitForResponse(response => response.url().endsWith("/website-publish") && response.request().method() === "POST");
  await page.getByRole("button", {name:"Publier", exact:true}).click();
  expect((await published).ok()).toBe(true);
  const storefront = await context.newPage();
  await storefront.goto("http://localhost:3000/r/atelier-foody/order?lang=fr");
  await storefront.locator(".website-service-location").click();
  const liveModal = storefront.locator(".website-fulfillment-dialog[open]");
  await expect(liveModal).toHaveCSS("background-color", "rgb(238, 228, 208)");
  await expect(liveModal.locator(".website-view-menu")).toHaveCSS("color", "rgb(255, 255, 255)");
  await liveModal.locator(".website-fulfillment-close").click();
  const language = storefront.locator(".website-order-navigation:visible .order-menu-desktop-language");
  for (const [name, code, direction] of [["English", "EN", "ltr"], ["עברית", "HE", "rtl"], ["Français", "FR", "ltr"]]) {
    await language.click();
    const selector = storefront.locator(".order-menu-language-dialog[open]");
    await expect(selector.getByRole("button", {name:"English", exact:true})).toBeVisible();
    await expect(selector.getByRole("button", {name:"עברית", exact:true})).toBeVisible();
    await expect(selector.getByRole("button", {name:"Français", exact:true})).toBeVisible();
    await selector.getByRole("button", {name, exact:true}).click();
    await expect(language).toHaveText(code);
    await expect(storefront.locator("html")).toHaveAttribute("dir", direction);
    await expect(language).toBeFocused();
  }
  await storefront.reload();
  await expect(language).toHaveText("FR");
  await storefront.setViewportSize({width:375, height:812});
  await expect(language).toBeHidden();
  await expect(storefront.locator(".website-order-navigation:visible .order-menu-more")).toBeVisible();
});

test("service colors edit independently, survive publication, and the availability filter fits in LTR and RTL", async ({ page, request, context }) => {
  await page.addInitScript(() => {
    localStorage.setItem("foody_restaurant_token", "isolated-ui-fixture");
    localStorage.setItem("foody_restaurant_user", JSON.stringify({id: 1, full_name: "Demo", role: "manager", email: "demo@foody.test"}));
    localStorage.setItem("foody_restaurant_ids", "[1]");
    localStorage.setItem("foody-admin-locale", "fr");
  });
  await context.route("**/*", route => ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const draft = async (): Promise<DraftStatePayload> =>
    (await (await request.get("http://127.0.0.1:18081/api/v1/restaurants/1/website-draft")).json()).state;
  const seed = await draft();
  for (const item of seed.pages) item.is_homepage = item.type === "landing";
  const colors = normalizeSiteColors({bg: "#15200e", ink: "#ffffff", accent: "#ffffff"});
  Object.assign(colors.styles[0], {background: "#15200e", title: "#ffffff", paragraph: "#ffffff"});
  Object.assign(colors.styles[1], {background: "#f4ede0", title: "#223311", paragraph: "#223311"});
  seed.config.nav_layout = {header: normalizeWebsiteHeader({layout: "left", color_style: "style-1", scroll: "none", fulfillment: {enabled: true}})};
  seed.config.custom_palette = {mode: "light", bg: "#15200e", surface: "#20301a", ink: "#ffffff", accent: "#ffffff", color_styles: colors};
  seed.sections = [];
  const order = seed.pages.find(value => value.type === "order")!;
  order.appearance_overrides = {foody_renderer_version: 1, website_order: {
    color_style: "style-1", show_availability_filter: true, show_fulfillment: true, prompt_on_entry: false, show_banner: false,
  }};
  await request.put("http://127.0.0.1:18081/api/v1/restaurants/1/website-draft", {data: seed});
  await request.post("http://127.0.0.1:18081/api/v1/restaurants/1/website-publish");
  await page.goto("/1/website-v3");
  await expect(page.getByRole("button", {name: "En-tête", exact: true})).toBeVisible({timeout: 60_000});
  await page.getByRole("button", {name: "En-tête", exact: true}).click();
  await page.getByRole("button", {name: "Retrait, livraison et planification", exact: true}).click();
  const picker = page.locator('[data-header-panel="fulfillment"] .sqe-shared-colors');
  await picker.getByRole("button", {name: "Style de couleurs 2", exact: true}).click();
  const preview = page.frameLocator('iframe[title="Aperçu de Home"]');
  await expect(preview.locator(".website-header")).toHaveCSS("background-color", "rgb(21, 32, 14)");
  await expect(preview.locator(".website-service-location")).toHaveCSS("background-color", "rgb(244, 237, 224)");
  await expect(preview.locator(".website-service-location")).toHaveCSS("color", "rgb(34, 51, 17)");
  await expect.poll(async () => (await draft()).config.nav_layout).toMatchObject({header: {color_style: "style-1", restaurant: {info_color_style: "style-2"}}});
  await page.reload();
  await page.getByRole("button", {name: "En-tête", exact: true}).click();
  await page.getByRole("button", {name: "Retrait, livraison et planification", exact: true}).click();
  await expect(picker.getByRole("button", {name: "Style de couleurs 2", exact: true})).toHaveAttribute("aria-pressed", "true");
  const publish = page.getByRole("button", {name: "Publier", exact: true});
  await expect(publish).not.toHaveAttribute("title", /.+/);
  const published = page.waitForResponse(response => response.url().endsWith("/website-publish") && response.request().method() === "POST");
  await publish.click();
  expect((await published).ok()).toBe(true);
  const storefront = await context.newPage();
  for (const path of ["", "/order"]) {
    await storefront.goto(`http://localhost:3000/r/atelier-foody${path}?lang=fr`);
    await expect(storefront.locator(".website-header")).toHaveCSS("background-color", "rgb(21, 32, 14)");
    await expect(storefront.locator(".website-service-location")).toHaveCSS("background-color", "rgb(244, 237, 224)");
  }
  for (const [width, locale] of [[1280, "fr"], [320, "fr"], [320, "he"]] as const) {
    await storefront.setViewportSize({width, height: 900});
    await storefront.goto(`http://localhost:3000/r/atelier-foody/order?lang=${locale}`);
    const filter = storefront.locator(".website-availability-filter select");
    await expect(filter).toBeVisible();
    await expect(filter).toHaveCSS("appearance", "none");
    await expect(filter).toHaveCSS("height", "44px");
    await filter.focus();
    await expect(filter).toHaveCSS("outline-style", "solid");
    await filter.selectOption("available");
    await expect(filter).toHaveValue("available");
    await filter.selectOption("all");
    expect(await storefront.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const selectBox = await filter.boundingBox();
    const arrowBox = await storefront.locator(".website-availability-filter > svg").boundingBox();
    expect(selectBox).not.toBeNull();
    expect(arrowBox).not.toBeNull();
    expect(arrowBox!.x - selectBox!.x).toBeGreaterThanOrEqual(10);
    expect(selectBox!.x + selectBox!.width - arrowBox!.x - arrowBox!.width).toBeGreaterThanOrEqual(10);
    await storefront.screenshot({path: `test-results/website-editor/service-filter-${width}-${locale}.png`});
  }
});
