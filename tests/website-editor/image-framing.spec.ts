import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect, type Locator } from "@playwright/test";
import { normalizeWebsiteHeader } from "../../src/lib/website-v3/header";
import type { DraftStatePayload } from "../../src/lib/website-v3/types";

const imageA = "http://localhost:3003/framing-landscape.png";
const imageB = "http://localhost:3003/framing-modal.png";
const photo = (modal: boolean) =>
  readFileSync(
    resolve(
      __dirname,
      "../redesign/fixtures",
      `image-framing-${modal ? "modal" : "landscape"}.png`,
    ),
  );
const setSlider = async (control: Locator, label: string, value: string) =>
  control.getByRole("slider", { name: label, exact: true }).fill(value);
const rectangle = (control: Locator) =>
  control.evaluate((element) => {
    const host = element.getBoundingClientRect(),
      img = element.querySelector("img")!.getBoundingClientRect();
    return {
      width: host.width,
      height: host.height,
      imageWidth: img.width,
      imageHeight: img.height,
      left: img.left - host.left,
      top: img.top - host.top,
    };
  });

test("modal photo and responsive framing survive autosave, reload and publication", async ({
  page,
  context,
  request,
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
  await context.route("**/framing-*.png", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: photo(route.request().url().includes("modal")),
    }),
  );
  await context.route(
    "**/api/v1/public/address-autocomplete/config?**",
    (route) =>
      route.fulfill({
        status: 200,
        headers: { "access-control-allow-origin": "*" },
        contentType: "application/json",
        body: JSON.stringify({
          available: false,
          enabled: false,
          provider: "geoapify",
        }),
      }),
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
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
  for (const p of seed.pages) p.is_homepage = p.type === "order";
  seed.config.nav_layout = {
    header: normalizeWebsiteHeader({
      layout: "restaurant",
      scroll: "none",
      background: { mode: "image", image: imageA },
      logo: { type: "text" },
      restaurant: {
        info_enabled: true,
        info_layout: "modern",
        height: "small",
      },
    }),
  };
  const order = seed.pages.find((p) => p.type === "order")!;
  order.appearance_overrides = {
    foody_renderer_version: 1,
    website_order: { prompt_on_entry: false, show_banner: true },
  };
  await request.put(
    "http://127.0.0.1:18081/api/v1/restaurants/1/website-draft",
    { data: seed },
  );
  await request.post(
    "http://127.0.0.1:18081/api/v1/restaurants/1/website-publish",
  );
  await page.goto("/1/website-v3");
  await expect(
    page.frameLocator("iframe").locator(".website-order-navigation:visible"),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    page.getByRole("button", { name: "Publier", exact: true }),
  ).not.toHaveAttribute("title", /.+/, { timeout: 60_000 });
  await page
    .getByRole("button", { name: "Mode de commande", exact: true })
    .click({ timeout: 60_000 });
  await expect(
    page.frameLocator("iframe").locator(".website-fulfillment-dialog[open]"),
  ).toBeVisible({ timeout: 60_000 });
  await page
    .locator(
      '[data-field-id="page.appearance_overrides.website_order.modal_cover_url"]',
    )
    .fill(imageB);
  const crop = page.locator(".sqe-order-settings .sqe-image-framing");
  await crop.locator("summary").click();
  await crop
    .getByRole("combobox", { name: "Affichage", exact: true })
    .selectOption("contain");
  await setSlider(crop, "Zoom", "0.8");
  await crop.getByRole("button", { name: "Mobile", exact: true }).click();
  await crop
    .getByRole("combobox", { name: "Affichage", exact: true })
    .selectOption("cover");
  await setSlider(crop, "Zoom", "1.4");
  await setSlider(crop, "Position horizontale", "20");
  await setSlider(crop, "Position verticale", "80");
  const expected = {
    desktop: { x: 50, y: 50, zoom: 0.8, fit: "contain" },
    mobile: { x: 20, y: 80, zoom: 1.4, fit: "cover" },
  };
  await expect
    .poll(
      async () =>
        (await draft()).pages.find((p) => p.type === "order")!
          .appearance_overrides.website_order,
    )
    .toMatchObject({ modal_cover_url: imageB, modal_cover_framing: expected });
  const preview = page.frameLocator("iframe");
  const modal = preview.locator(".website-fulfillment-dialog[open]");
  const media = modal.locator(".website-fulfillment-cover [data-image-framed]");
  await expect(media.locator("img")).toHaveAttribute("src", imageB);
  await expect
    .poll(async () => (await rectangle(media)).imageHeight)
    .toBeCloseTo(120, 0);
  await page.reload();
  await page
    .getByRole("button", { name: "Mode de commande", exact: true })
    .click();
  await crop.locator("summary").click();
  await expect(
    crop.getByRole("slider", { name: "Zoom", exact: true }),
  ).toHaveValue("0.8");
  await crop.getByRole("button", { name: "Mobile", exact: true }).click();
  await expect(
    crop.getByRole("slider", { name: "Zoom", exact: true }),
  ).toHaveValue("1.4");
  await expect(
    page.getByRole("button", { name: "Publier", exact: true }),
  ).not.toHaveAttribute("title", /.+/, { timeout: 60_000 });
  const publish = page.waitForResponse(
    (r) =>
      r.url().endsWith("/website-publish") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Publier", exact: true }).click();
  expect((await publish).ok()).toBe(true);
  const live = await context.newPage();
  live.on("pageerror", (error) => errors.push(error.message));
  for (const width of [1440, 390]) {
    await live.setViewportSize({ width, height: 1000 });
    await live.goto("http://localhost:3000/r/atelier-foody/order?lang=fr");
    await expect(live.locator(".website-restaurant-cover")).toHaveCSS(
      "background-image",
      /framing-landscape/,
    );
    await live.locator(".website-service-location:visible").click();
    const dialog = live.locator(".website-fulfillment-dialog[open]:visible");
    const viewport = dialog.locator(
      ".website-fulfillment-cover [data-image-framed]",
    );
    await expect(viewport.locator("img")).toHaveAttribute("src", imageB);
    await expect
      .poll(async () => (await rectangle(viewport)).imageWidth)
      .toBeGreaterThan(0);
    await expect(viewport).toHaveAttribute("data-image-ready", "true");
    const r = await rectangle(viewport);
    if (width === 1440) {
      expect(r.imageHeight).toBeCloseTo(120, 0);
      expect(r.imageWidth).toBeLessThan(r.width);
      expect(r.top).toBeCloseTo(15, 0);
    } else {
      expect(r.imageWidth / r.width).toBeCloseTo(1.4, 2);
      expect(r.left).toBeCloseTo((r.width - r.imageWidth) * 0.2, 0);
      expect(r.top).toBeCloseTo((r.height - r.imageHeight) * 0.8, 0);
    }
    await live.screenshot({
      path: `test-results/website-editor/image-framing-${width}.png`,
    });
    await dialog.locator(".website-view-menu").click();
    await live.locator(".website-service-time:visible").click();
    await expect(
      live.locator(
        ".website-schedule-dialog[open] .website-fulfillment-cover [data-image-framed] img",
      ),
    ).toHaveAttribute("src", imageB);
    expect(
      await live.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("header pan and zoom remain separate on mobile; gallery framing survives a content edit", async ({
  page,
  context,
  request,
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
  await context.route("**/framing-*.png", (route) =>
    route.fulfill({ contentType: "image/png", body: photo(false) }),
  );
  await context.route(
    "**/api/v1/public/address-autocomplete/config?**",
    (route) =>
      route.fulfill({
        status: 200,
        headers: { "access-control-allow-origin": "*" },
        contentType: "application/json",
        body: JSON.stringify({
          available: false,
          enabled: false,
          provider: "geoapify",
        }),
      }),
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const draft = async (): Promise<DraftStatePayload> =>
    (
      await (
        await request.get(
          "http://127.0.0.1:18081/api/v1/restaurants/1/website-draft",
        )
      ).json()
    ).state;
  const seed = await draft();
  for (const p of seed.pages) p.is_homepage = p.type === "landing";
  seed.config.nav_layout = {
    header: normalizeWebsiteHeader({
      layout: "restaurant",
      scroll: "none",
      background: { mode: "image", image: imageA },
      logo: { type: "text" },
      restaurant: { info_enabled: false, height: "small" },
    }),
  };
  const landing = seed.pages.find((p) => p.type === "landing")!;
  seed.sections = [
    {
      id: 80,
      section_type: "gallery",
      page: landing.slug,
      page_id: landing.id,
      sort_order: 0,
      is_visible: true,
      layout: "grid",
      content: {
        images: [
          {
            url: imageB,
            alt: "Gallery crop",
            image_framing: {
              desktop: { x: 50, y: 50, zoom: 0.75, fit: "contain" },
            },
          },
        ],
      },
      settings: {
        color_style: "light",
        bg_image: imageA,
        bg_image_framing: {
          desktop: { x: 50, y: 50, zoom: 1.3, fit: "cover" },
        },
      },
    },
  ];
  await request.put(
    "http://127.0.0.1:18081/api/v1/restaurants/1/website-draft",
    { data: seed },
  );
  await request.post(
    "http://127.0.0.1:18081/api/v1/restaurants/1/website-publish",
  );
  await page.goto("/1/website-v3");
  const preview = page.frameLocator("iframe");
  await expect(preview.locator(".website-restaurant-cover")).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "En-tête", exact: true }).click();
  await page.getByRole("button", { name: "Arrière-plan", exact: true }).click();
  const crop = page.locator(
    '[data-header-panel="background"] .sqe-image-framing',
  );
  await crop.locator("summary").click();
  await crop
    .getByRole("combobox", { name: "Affichage", exact: true })
    .selectOption("contain");
  await setSlider(crop, "Zoom", "0.6");
  const drag = crop.locator('[aria-label="Aperçu du cadrage"]');
  const box = (await drag.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2, {
    steps: 4,
  });
  await page.mouse.up();
  await expect
    .poll(async () =>
      Number(
        await crop
          .getByRole("slider", { name: "Position horizontale", exact: true })
          .inputValue(),
      ),
    )
    .toBeGreaterThan(50);
  await setSlider(crop, "Position horizontale", "50");
  await crop.getByRole("button", { name: "Mobile", exact: true }).click();
  await crop
    .getByRole("combobox", { name: "Affichage", exact: true })
    .selectOption("cover");
  await setSlider(crop, "Zoom", "1.2");
  await setSlider(crop, "Position verticale", "100");
  const framed = {
    desktop: { x: 50, y: 50, zoom: 0.6, fit: "contain" },
    mobile: { x: 50, y: 100, zoom: 1.2, fit: "cover" },
  };
  await expect
    .poll(async () => (await draft()).config.nav_layout)
    .toMatchObject({
      header: { background: { image: imageA, framing: framed } },
    });
  await page.getByRole("button", { name: "Terminé", exact: true }).click();
  await page
    .getByRole("button", { name: "Galerie d’images", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cliquez ici pour modifier", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Texte alternatif 1", exact: true })
    .fill("Updated gallery");
  await expect
    .poll(async () => (await draft()).sections[0].content.images)
    .toMatchObject([
      {
        alt: "Updated gallery",
        image_framing: { desktop: { zoom: 0.75, fit: "contain" } },
      },
    ]);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Publier", exact: true }),
  ).not.toHaveAttribute("title", /.+/, { timeout: 60_000 });
  const publish = page.waitForResponse(
    (r) =>
      r.url().endsWith("/website-publish") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Publier", exact: true }).click();
  expect((await publish).ok()).toBe(true);
  const live = await context.newPage();
  live.on("pageerror", (error) => errors.push(error.message));
  for (const width of [1440, 390]) {
    await live.setViewportSize({ width, height: 1000 });
    await live.goto("http://localhost:3000/r/atelier-foody?lang=fr");
    const cover = live.locator(".website-restaurant-cover [data-image-framed]");
    await expect
      .poll(async () => (await rectangle(cover)).imageWidth)
      .toBeGreaterThan(0);
    await expect(cover).toHaveAttribute("data-image-ready", "true");
    const r = await rectangle(cover);
    if (width === 1440) {
      expect(r.imageHeight / r.height).toBeCloseTo(0.6, 2);
      expect(r.imageWidth).toBeLessThan(r.width);
    } else {
      expect(r.imageWidth / r.width).toBeCloseTo(1.2, 2);
      expect(r.top).toBeCloseTo(r.height - r.imageHeight, 0);
    }
    const gallery = live.locator(
      '[data-section-type="gallery"] img[alt="Updated gallery"]',
    );
    await expect(gallery).toBeVisible();
    expect(
      await live.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  const masonry = await draft();
  masonry.sections[0].layout = "masonry";
  await request.put(
    "http://127.0.0.1:18081/api/v1/restaurants/1/website-draft",
    { data: masonry },
  );
  await request.post(
    "http://127.0.0.1:18081/api/v1/restaurants/1/website-publish",
  );
  await live.reload();
  const masonryMedia = live
    .locator('[data-section-type="gallery"] [data-image-framed]')
    .last();
  await expect
    .poll(async () => (await rectangle(masonryMedia)).imageWidth)
    .toBeGreaterThan(0);
  const masonryRect = await rectangle(masonryMedia);
  expect(masonryRect.width / masonryRect.height).toBeCloseTo(800 / 600, 2);
  expect(
    await live.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
