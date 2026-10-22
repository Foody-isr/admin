import { test, expect } from "@playwright/test";
import { normalizeSiteColors } from "../../src/lib/website-v3/site-colors";
import type { DraftStatePayload } from "../../src/lib/website-v3/types";

test("receipt inherits the menu theme and its edits survive preview, reload and publication", async ({
  page,
  request,
  context,
}) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    localStorage.setItem("foody_restaurant_token", "isolated-ui-fixture");
    localStorage.setItem(
      "foody_restaurant_user",
      JSON.stringify({
        id: 1,
        full_name: "Demo",
        role: "manager",
        email: "demo@foody.test",
      }),
    );
    localStorage.setItem("foody_restaurant_ids", "[1]");
    localStorage.setItem("foody-admin-locale", "fr");
  });
  await context.route("**/*", (route) =>
    ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort(),
  );
  // The sibling web checkout lacks the Admin branch's unrelated video renderer.
  // No video is exercised here; keep the receipt contract from the actual runtime.
  await context.route("**/api/website-v3-capabilities", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      json: { ...(await response.json()), video_playback: 1, video_height: 1 },
    });
  });
  const draft = async (): Promise<DraftStatePayload> =>
    (
      await (
        await request.get(
          "http://127.0.0.1:18081/api/v1/restaurants/1/website-draft",
        )
      ).json()
    ).state;
  const seed = await draft();
  seed.sections = [];
  for (const item of seed.pages) item.is_homepage = item.type === "order";
  seed.config.typography = {
    site: { headingFont: "Arial", bodyFont: "Arial", buttonShape: "pill" },
  };
  const colors = normalizeSiteColors({
    bg: "#ffffff",
    ink: "#202020",
    accent: "#234abc",
  });
  Object.assign(colors.styles[0], {
    background: "#142a40",
    title: "#ffffff",
    paragraph: "#d4e0ec",
    solid_button: "#83bfff",
    solid_button_text: "#142a40",
  });
  Object.assign(colors.styles[1], {
    background: "#eff6fc",
    title: "#142a40",
    paragraph: "#314456",
    solid_button: "#234abc",
    solid_button_text: "#ffffff",
  });
  seed.config.custom_palette = {
    mode: "light",
    bg: "#ffffff",
    surface: "#f2f2f2",
    ink: "#202020",
    accent: "#234abc",
    color_styles: colors,
  };
  seed.config.checkout_config = {
    delivery: {
      require_auth: false,
      fields: [
        {
          id: "building_code",
          kind: "custom",
          type: "text",
          enabled: true,
          required: false,
          label: { fr: "Code bâtiment", he: "קוד בניין" },
        },
      ],
    },
  };
  seed.pages.find((item) => item.type === "order")!.appearance_overrides = {
    foody_renderer_version: 1,
    website_order: {
      color_style: "style-1",
      prompt_on_entry: false,
      show_banner: false,
    },
  };
  await request.put(
    "http://127.0.0.1:18081/api/v1/restaurants/1/website-draft",
    { data: seed },
  );
  await request.post(
    "http://127.0.0.1:18081/api/v1/restaurants/1/website-publish",
  );
  await page.goto("/1/website-v3");
  await page
    .getByRole("button", { name: "Parcours de commande", exact: true })
    .click({ timeout: 60_000 });
  await page
    .getByRole("combobox", { name: "Écran", exact: true })
    .selectOption("receipt");
  const preview = page.frameLocator("iframe");
  const surface = preview.locator(".receipt-surface");
  await expect(surface).toBeVisible({ timeout: 60_000 });
  await expect(surface).toHaveCSS("background-color", "rgb(20, 42, 64)");
  await expect(preview.locator("h1")).toHaveCSS("font-family", /Arial/);
  await page
    .getByRole("combobox", { name: "Langue des textes", exact: true })
    .selectOption("fr");
  await page
    .getByRole("textbox", { name: /^Titre du reçu/ })
    .fill("Votre reçu personnalisé");
  await page
    .getByRole("textbox", { name: /^Message de remerciement/ })
    .fill("Merci et à très bientôt !");
  await page
    .getByRole("combobox", { name: "Espacement des articles", exact: true })
    .selectOption("compact");
  await page.getByRole("switch", { name: "Partager", exact: true }).uncheck();
  await expect(preview.locator("h1")).toHaveText(
    "Votre reçu personnalisé #1234",
  );
  await expect(preview.getByText("Merci et à très bientôt !")).toBeVisible();
  await expect(surface).toHaveAttribute("data-layout", "compact");
  await expect(
    preview.getByRole("button", { name: "Partager", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Langue des textes", exact: true })
    .selectOption("he");
  await page.getByRole("textbox", { name: /^Titre du reçu/ }).fill("הקבלה שלך");
  await page
    .getByRole("textbox", { name: /^Message de remerciement/ })
    .fill("תודה ולהתראות בקרוב!");
  await expect(preview.locator("h1")).toHaveText("הקבלה שלך #1234");
  await expect(surface).toHaveAttribute("dir", "rtl");
  await page
    .getByRole("combobox", { name: "Langue des textes", exact: true })
    .selectOption("fr");
  await expect(preview.locator("h1")).toHaveText(
    "Votre reçu personnalisé #1234",
  );
  const expected = {
    title: { fr: "Votre reçu personnalisé" },
    message: { fr: "Merci et à très bientôt !" },
    layout: "compact",
    show_share: false,
  };
  await expect
    .poll(async () => (await draft()).config.checkout_config)
    .toMatchObject({ receipt: expected });
  // Unsaved/published separation on the real server-rendered token route.
  const live = await context.newPage();
  await live.goto("http://localhost:3000/receipt/receipt-demo?lang=fr");
  await expect(live.locator("h1")).toHaveText("Reçu de commande #1234");
  await expect(live.locator(".receipt-surface")).toHaveCSS(
    "background-color",
    "rgb(20, 42, 64)",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Parcours de commande", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Écran", exact: true })
    .selectOption("receipt");
  await expect(
    page.getByRole("textbox", { name: /^Titre du reçu/ }),
  ).toHaveValue("Votre reçu personnalisé");
  await expect(surface).toHaveAttribute("data-layout", "compact");
  // Receipt can select an independent existing style, then restore menu inheritance.
  await page
    .getByRole("button", { name: "Style de couleurs 2", exact: true })
    .click();
  await expect(surface).toHaveCSS("background-color", "rgb(239, 246, 252)");
  await page
    .getByRole("button", { name: "Comme le menu", exact: true })
    .click();
  await expect(surface).toHaveCSS("background-color", "rgb(20, 42, 64)");
  const published = page.waitForResponse(
    (response) =>
      response.url().endsWith("/website-publish") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Publier", exact: true }).click();
  expect((await published).ok()).toBe(true);
  for (const [width, locale] of [
    [1280, "fr"],
    [393, "fr"],
    [320, "fr"],
    [393, "he"],
    [320, "he"],
  ] as const) {
    await live.setViewportSize({ width, height: 900 });
    await live.goto(
      `http://localhost:3000/receipt/receipt-demo?lang=${locale}`,
    );
    await expect(live.locator("h1")).toHaveText(
      locale === "he" ? "הקבלה שלך #1234" : "Votre reçu personnalisé #1234",
    );
    await expect(live.locator(".receipt-surface")).toHaveAttribute(
      "dir",
      locale === "he" ? "rtl" : "ltr",
    );
    await expect(live.locator(".receipt-total > bdi")).toHaveText("₪108.00");
    await expect(live.getByText("Article annulé", { exact: true })).toHaveCount(
      0,
    );
    await expect(live.locator(".receipt-statuses")).not.toContainText(
      /out_for_delivery|unpaid/,
    );
    await expect(live.getByText("Grand", { exact: true })).toBeVisible();
    await expect(
      live.getByText("Formule découverte", { exact: true }),
    ).toBeVisible();
    expect(
      await live.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await live.screenshot({
      path: `test-results/website-editor/receipt-${width}-${locale}.png`,
      fullPage: true,
    });
  }
  await expect(live.locator(".receipt-summary")).toHaveCSS(
    "border-top-left-radius",
    "16px",
  );
  // Print keeps the receipt legible on paper and removes all action buttons/links.
  await live.emulateMedia({ media: "print" });
  await expect(live.locator(".receipt-surface")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(live.locator(".receipt-actions")).toBeHidden();
  await expect(live.locator(".receipt-total > bdi")).toBeVisible();
  await live.screenshot({
    path: "test-results/website-editor/receipt-print.png",
    fullPage: true,
  });
});

test("receipt sharing confirms copying, reports errors and respects native cancellation", async ({
  page,
  request,
}) => {
  const response = await request.get(
    "http://127.0.0.1:18081/api/v1/restaurants/1/website-draft",
  );
  const state: DraftStatePayload = (await response.json()).state;
  state.config.checkout_config = {
    ...(state.config.checkout_config as object),
    receipt: { show_share: true },
  };
  await request.put(
    "http://127.0.0.1:18081/api/v1/restaurants/1/website-draft",
    { data: state },
  );
  await request.post(
    "http://127.0.0.1:18081/api/v1/restaurants/1/website-publish",
  );
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          sessionStorage.setItem("receipt-test-copied", text);
        },
      },
    });
  });
  await page.goto("http://localhost:3000/receipt/receipt-demo?lang=fr");
  const actions = page.locator(".receipt-actions");
  await actions.getByRole("button", { name: "Partager", exact: true }).click();
  await expect(actions.getByRole("status")).toHaveText(
    "Le lien du reçu a été copié.",
  );
  expect(
    await page.evaluate(() => sessionStorage.getItem("receipt-test-copied")),
  ).toContain("/receipt/receipt-demo?lang=fr");
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("Synthetic clipboard failure");
        },
      },
    }),
  );
  await actions.getByRole("button", { name: "Partager", exact: true }).click();
  await expect(actions.getByRole("alert")).toHaveText(
    "Impossible de partager le lien. Veuillez réessayer.",
  );
  await page.evaluate(() =>
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => {
        throw new DOMException("Cancelled", "AbortError");
      },
    }),
  );
  await actions.getByRole("button", { name: "Partager", exact: true }).click();
  await expect(actions.getByRole("alert")).toHaveCount(0);
  await expect(
    actions.getByRole("button", { name: "Partager", exact: true }),
  ).toBeEnabled();
});

test("receipt links keep a non-default order page theme within the receipt restaurant", async ({
  page,
  request,
}) => {
  const response = await request.get(
    "http://127.0.0.1:18081/api/v1/restaurants/1/website-draft",
  );
  const state: DraftStatePayload = (await response.json()).state;
  const order = state.pages.find((item) => item.type === "order")!;
  state.pages = state.pages.filter((item) => item.slug !== "weekend");
  state.pages.push({
    ...order,
    id: 90,
    tmp_id: undefined,
    title: "Weekend",
    slug: "weekend",
    is_default: false,
    is_homepage: false,
    appearance_overrides: {
      ...order.appearance_overrides,
      website_order: { color_style: "style-2" },
      order_journey: { receipt: "default" },
    },
  });
  await request.put(
    "http://127.0.0.1:18081/api/v1/restaurants/1/website-draft",
    { data: state },
  );
  await request.post(
    "http://127.0.0.1:18081/api/v1/restaurants/1/website-publish",
  );
  await page.goto(
    "http://localhost:3000/receipt/receipt-demo?pageSlug=weekend&restaurantId=999&lang=fr",
  );
  await expect(page.locator(".receipt-surface")).toHaveCSS(
    "background-color",
    "rgb(239, 246, 252)",
  );
  await expect(page.locator(".receipt-restaurant")).toHaveText("Atelier Foody");
  await expect(
    page.getByRole("link", { name: "Retour au menu", exact: true }),
  ).toHaveAttribute("href", "/r/atelier-foody/weekend");
  for (const pageSlug of ["about", "missing"]) {
    await page.goto(
      `http://localhost:3000/receipt/receipt-demo?pageSlug=${pageSlug}&lang=fr`,
    );
    await expect(page.locator(".receipt-surface")).toHaveCSS(
      "background-color",
      "rgb(20, 42, 64)",
    );
  }
});
