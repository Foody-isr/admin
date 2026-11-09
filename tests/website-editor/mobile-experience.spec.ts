import { expect, test, devices } from "@playwright/test";

test("draft mobile settings preview and publish to the restaurant storefront", async ({ page, browser, context }) => {
  await page.addInitScript(() => {
    localStorage.setItem("foody_restaurant_token", "isolated-ui-fixture");
    localStorage.setItem("foody_restaurant_user", JSON.stringify({ id: 1, full_name: "Demo", role: "manager", email: "demo@foody.test" }));
    localStorage.setItem("foody_restaurant_ids", "[1]");
    localStorage.setItem("foody-admin-locale", "fr");
  });
  const localOnly = (url: string) => ["localhost", "127.0.0.1"].includes(new URL(url).hostname);
  await context.route("**/*", route => localOnly(route.request().url()) ? route.continue() : route.abort());

  const iphone = devices["iPhone 13"];
  const mobile = await browser.newContext({
    viewport: iphone.viewport, userAgent: iphone.userAgent, isMobile: true, hasTouch: true, locale: "fr-FR",
  });
  await mobile.route("**/*", route => localOnly(route.request().url()) ? route.continue() : route.abort());
  const storefront = await mobile.newPage();
  try {
    await page.goto("/1/website-v3");
    await page.getByRole("button", { name: "Expérience mobile", exact: true }).click({ timeout: 60_000 });
    const preview = page.frameLocator("iframe");
    const choosePage = async (name: string) => {
      await page.getByRole("group", { name: "Pages d’aperçu" }).getByRole("button").click();
      await page.locator(".sqe-pages").getByRole("button", { name, exact: true }).click();
    };
    await choosePage("Confirmation de commande");
    await page.locator(".sqe-outline").getByRole("button", { name: "Installation", exact: true }).click();
    const card = preview.locator(".mobile-install-card");
    await expect(card.getByRole("heading", { name: /^Ajoutez .+ à votre écran d’accueil$/ })).toBeVisible();
    const subtitle = "Retrouvez le menu d’un geste la prochaine fois.";
    await expect(card.getByText(subtitle, { exact: true })).toBeVisible();
    const steps = card.locator(".mobile-install-steps li");
    const openGuide = card.getByRole("button", { name: "Ajouter à l’écran d’accueil", exact: true });
    await expect(openGuide).toHaveAttribute("aria-expanded", "false");
    await expect(steps).toHaveCount(0);
    await openGuide.click();
    await expect(steps).toHaveCount(3);
    await expect(steps.nth(0)).toContainText("Touchez Partager dans Safari");
    await expect(steps.nth(1)).toContainText("Choisissez « Sur l’écran d’accueil »");
    await expect(steps.nth(2)).toContainText("Confirmez avec « Ajouter »");
    await card.getByRole("button", { name: "Masquer l’aide à l’installation", exact: true }).click();
    await expect(steps).toHaveCount(0);
    await expect(openGuide).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("combobox", { name: "Avantage à mettre en avant" }).selectOption("loyalty");
    await expect(card.getByText(subtitle, { exact: true })).toBeVisible();
    await expect(card.getByText("Cumulez des points dès votre première commande éligible.")).toBeVisible();
    await page.getByRole("switch", { name: "Proposer avant la première commande" }).setChecked(true);
    await expect(preview.locator('.mobile-install-card[data-placement="home"]')).toBeVisible();
    await expect(steps).toHaveCount(0);
    const title = "Gardez le menu à portée de main";
    await page.getByRole("textbox", { name: "Titre", exact: true }).fill("Gardez le menu\nà portée de main");
    await expect(preview.getByRole("heading", { name: title })).toBeVisible({ timeout: 60_000 });

    const publicUrl = "http://localhost:3000/r/atelier-foody?lang=fr";
    await storefront.goto(publicUrl);
    await expect(storefront.getByRole("heading", { name: title })).toHaveCount(0);

    await page.getByRole("button", { name: "Terminé", exact: true }).click();
    await page.locator(".sqe-outline").getByRole("button", { name: "Navigation", exact: true }).click();
    await page.getByRole("switch", { name: "Afficher la barre du bas" }).setChecked(true);
    const navigation = preview.getByRole("navigation", { name: "Navigation mobile" });
    await expect(navigation).toBeVisible();
    await page.getByRole("combobox", { name: "Mode d’aperçu" }).selectOption("browser");
    await expect(navigation).toHaveCount(0);
    await expect(preview.getByRole("heading", { name: title })).toBeVisible();
    await page.getByRole("combobox", { name: "Mode d’aperçu" }).selectOption("standalone");
    await expect(navigation).toBeVisible();
    await expect(preview.getByRole("heading", { name: title })).toHaveCount(0);
    await page.getByText("Couleurs de la barre", { exact: true }).click();
    const color = (key: string) => page.locator(`input[type="text"][data-field-id="mobile.navigation.colors.${key}"]`);
    await color("icon").fill("#283044");
    await color("active_icon").fill("#1b625a");
    await color("accent").fill("#c8eac9");
    const activeIcon = (nav: typeof navigation) => nav.locator("[aria-current=page] .mobile-tabbar-icon");
    await expect(activeIcon(navigation)).toHaveCSS("color", "rgb(27, 98, 90)");
    await expect(navigation.locator("[data-mobile-tab=more] .mobile-tabbar-icon")).toHaveCSS("color", "rgb(40, 48, 68)");
    await expect(activeIcon(navigation).locator(".mobile-tabbar-accent")).toHaveCSS("fill", "rgb(200, 234, 201)");
    await page.getByRole("combobox", { name: "Style de la barre" }).selectOption("docked");
    await expect(preview.locator("[data-mobile-style=docked] .mobile-tabbar")).toBeVisible();

    await page.getByRole("button", { name: "Terminé", exact: true }).click();
    await choosePage("Page Plus");
    await expect(page.locator(".sqe-outline").getByRole("button", { name: "Bannière principale", exact: true })).toBeVisible();
    await page.locator(".sqe-outline").getByRole("button", { name: "En-tête", exact: true }).click();
    await page.getByRole("textbox", { name: "Titre", exact: true }).first().fill("Infos et compte");
    await expect(preview.getByRole("heading", { name: "Infos et compte" })).toBeVisible();

    await page.getByRole("button", { name: "Format de l’aperçu" }).click();
    await page.getByRole("menuitemradio", { name: "Ordinateur" }).click();
    await expect(page.locator(".sqe-toolbar [role=status]")).toHaveText("Enregistré", { timeout: 60_000 });
    await page.getByRole("button", { name: "Publier", exact: true }).click();
    await expect.poll(async () => {
      const response = await page.request.get("http://127.0.0.1:18081/api/v1/restaurants/1/website-draft");
      const data = await response.json();
      return !data.draft_dirty && data.state.config.nav_layout?.mobile_experience?.more?.title?.fr;
    }).toBe("Infos et compte");

    await storefront.reload();
    await expect(storefront.getByRole("heading", { name: title })).toBeVisible();
    await expect(storefront.getByRole("navigation", { name: "Navigation mobile" })).toHaveCount(0);
    await storefront.getByRole("button", { name: "Ajouter à l’écran d’accueil", exact: true }).click();
    await expect(storefront.getByText("Touchez Partager dans Safari", { exact: true })).toBeVisible();
    await storefront.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
    await expect(storefront.getByRole("navigation", { name: "Navigation mobile" })).toHaveCount(0);

    const installedApp = await mobile.newPage();
    await installedApp.addInitScript(() => {
      Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (keyframes, options) {
        if (this.classList.contains("mobile-tabbar-selection")) {
          document.documentElement.dataset.mobileTabSlide = "true";
        }
        return animate.call(this, keyframes, options);
      };
    });
    await installedApp.goto(publicUrl);
    const appNavigation = installedApp.getByRole("navigation", { name: "Navigation mobile" });
    const more = appNavigation.getByRole("link", { name: "Infos et compte" });
    await expect(more).toBeVisible();
    await expect(installedApp.getByRole("heading", { name: title })).toHaveCount(0);
    await more.click();
    await expect(installedApp.getByRole("heading", { name: "Infos et compte" })).toBeVisible();
    await expect(more).toHaveAttribute("aria-current", "page");
    await expect(installedApp.locator("html")).toHaveAttribute("data-mobile-tab-slide", "true");
    await expect(activeIcon(appNavigation)).toHaveCSS("color", "rgb(27, 98, 90)");
    await expect(activeIcon(appNavigation).locator(".mobile-tabbar-accent")).toHaveCSS("fill", "rgb(200, 234, 201)");
    await installedApp.emulateMedia({ reducedMotion: "reduce" });
    await installedApp.evaluate(() => delete document.documentElement.dataset.mobileTabSlide);
    await appNavigation.locator("[data-mobile-tab=home]").click();
    await expect(appNavigation.locator("[data-mobile-tab=home]")).toHaveAttribute("aria-current", "page");
    await expect(installedApp.locator("html[data-mobile-tab-slide]")).toHaveCount(0);
  } finally {
    await mobile.close();
  }
});
