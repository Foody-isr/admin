import { expect, test } from "@playwright/test";
import { normalizeWebsiteHeader } from "../../src/lib/website-v3/header";
import type { DraftResponse } from "../../src/lib/website-v3/types";

const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/RggAAAAASUVORK5CYII=",
  "base64",
);
const logoFile = { name: "logo.png", mimeType: "image/png", buffer: image };
const logoUrl = (name: string) => `http://localhost:3003/__logo-fixture/${name}.png`;

test("the main logo updates the existing header in preview, draft and publication", async ({ page, context, request }) => {
  await page.addInitScript(() => {
    localStorage.setItem("foody_restaurant_portal_session", "fp1p.e30.fixture.00");
    localStorage.setItem("foody_restaurant_user", JSON.stringify({ id: 1, full_name: "Demo", role: "manager", email: "demo@foody.test" }));
    localStorage.setItem("foody_restaurant_ids", "[1]");
    localStorage.setItem("foody-admin-locale", "fr");
  });
  await context.route("**/*", (route) =>
    ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname)
      ? route.continue() : route.abort(),
  );
  await context.route("**/__logo-fixture/*.png", (route) =>
    route.fulfill({ contentType: "image/png", body: image }),
  );

  const port = process.env.FOODY_WEBSITE_EDITOR_API_PORT || 18081;
  const api = `http://127.0.0.1:${port}/api/v1/restaurants/1`;
  const draft = async (): Promise<DraftResponse> =>
    (await request.get(`${api}/website-draft`)).json();
  const publishedLogo = async (): Promise<string> =>
    (await (await request.get(api)).json()).restaurant.logo_url;
  const seed = (await draft()).state;
  const home = seed.pages.find((page) => page.type === "landing" && page.slug === "home");
  if (home) seed.pages.forEach((page) => { page.is_homepage = page === home; });
  const header = normalizeWebsiteHeader({
    layout: "left",
    logo: { type: "image", image: logoUrl("old-header"), size: 96, link: { kind: "order" } },
  });
  seed.config.nav_layout = { header };
  seed.config.restaurant_logo_url = logoUrl("old-main");
  seed.config.hide_hero_logo = true;
  seed.config.favicon_url = logoUrl("favicon");
  seed.config.share_image_mode = "cover";
  seed.config.share_image_bg = "white";
  seed.config.share_image_url = logoUrl("share");
  expect((await request.put(`${api}/website-draft`, { data: seed })).ok()).toBe(true);
  expect((await request.post(`${api}/website-publish`)).ok()).toBe(true);

  let nextUpload = logoUrl("replacement");
  let failUpload = false;
  let pauseUpload = true;
  let finishUpload: (() => void) | undefined;
  let uploads = 0;
  await context.route("**/api/v1/restaurants/1/logo", async (route) => {
    uploads += 1;
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers()["x-restaurant-id"]).toBe("1");
    expect(route.request().postDataBuffer()?.toString("latin1")).toContain('name="image"; filename="logo.png"');
    if (pauseUpload) await new Promise<void>((resolve) => { finishUpload = resolve; });
    await route.fulfill({
      status: failUpload ? 500 : 200,
      headers: {
        "Access-Control-Allow-Origin": "http://localhost:3003",
        "Access-Control-Allow-Credentials": "true",
      },
      json: failUpload ? { error: "Upload unavailable" } : { image_url: nextUpload },
    });
  });

  const settings = async () => {
    await page.getByRole("button", { name: "Design du site", exact: true }).click();
    await page.getByRole("button", { name: "Paramètres du site", exact: true }).click();
  };
  const preview = page.frameLocator(".sqe-canvas iframe");
  const headerLogo = '[data-header-element="logo"] img';
  const mainLogo = page.getByRole("group", { name: "Logo principal", exact: true });
  const input = mainLogo.locator('input[type="file"]');
  const publish = page.getByRole("button", { name: "Publier", exact: true });
  const publishDraft = async () => {
    await expect(publish).toBeEnabled();
    await expect(publish).not.toHaveAttribute("title", /.+/);
    const result = page.waitForResponse((response) =>
      response.url().endsWith("/website-publish") && response.request().method() === "POST",
    );
    await publish.click();
    expect((await result).ok()).toBe(true);
    await expect.poll(async () => (await draft()).draft_dirty).toBe(false);
  };
  const storefront = await context.newPage();
  const publicSite = "http://localhost:3000/r/atelier-foody?lang=fr";
  const shareImage = async (url: string) => {
    const response = await request.get(url, { headers: { "User-Agent": "WhatsApp/2.26.1" } });
    expect(response.ok()).toBe(true);
    return (await response.text())
      .match(/<meta property="og:image" content="([^"]+)"/)?.[1]
      .replaceAll("&amp;", "&");
  };
  const publicImage = await shareImage(publicSite);
  expect(new URL(publicImage!).searchParams.get("url")).toBe("localhost:3003/__logo-fixture/share.png");
  for (const path of [
    "/r/atelier-foody/order?item=1",
    "/r/atelier-foody/table/demo",
    "/receipt/receipt-demo?restaurantId=2",
    "/order/confirmation/1234?restaurantId=1",
    "/order/tracking/1234?restaurantId=1",
  ]) {
    expect(await shareImage(`http://localhost:3000${path}`), path).toBe(publicImage);
  }
  await storefront.goto(publicSite);
  await page.goto("/1/website-v3");
  await settings();
  await expect(mainLogo.locator("img")).toHaveAttribute("src", logoUrl("old-main"));
  await expect(preview.locator(headerLogo)).toHaveAttribute("src", logoUrl("old-header"));

  const shareMode = page.getByRole("combobox", { name: /^Rendu de l’aperçu/ });
  const shareBg = page.getByRole("combobox", { name: /^Fond de l’aperçu/ });
  await expect(shareMode).toHaveValue("cover");
  await expect(page.getByText(/vignette carrée de WhatsApp/)).toBeVisible();
  await expect(shareBg).toHaveCount(0);
  await shareMode.selectOption("logo");
  await shareBg.selectOption("brand");
  await shareMode.selectOption("cover");
  await expect.poll(async () => (await draft()).state.config).toMatchObject({
    share_image_mode: "cover",
    share_image_bg: "brand",
    share_image_url: logoUrl("share"),
  });

  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    mainLogo.getByRole("button", { name: "Remplacer", exact: true }).click(),
  ]);
  await chooser.setFiles(logoFile);
  await expect.poll(() => Boolean(finishUpload)).toBe(true);
  const publishDisabledDuringUpload = await publish.isDisabled();
  await page.locator('[data-field-id="site.tagline"]').fill("Edited while uploading");
  pauseUpload = false;
  finishUpload!();
  await expect(preview.locator(headerLogo)).toHaveAttribute("src", nextUpload);
  expect(publishDisabledDuringUpload).toBe(true);
  await expect(mainLogo.locator("img")).toHaveAttribute("src", nextUpload);
  await expect.poll(async () => (await draft()).state.config).toMatchObject({
    restaurant_logo_url: nextUpload,
    tagline: "Edited while uploading",
    favicon_url: logoUrl("favicon"),
    hide_hero_logo: true,
    nav_layout: { header: { ...header, logo: { ...header.logo, image: nextUpload } } },
  });
  await storefront.reload();
  await expect(storefront.locator(headerLogo)).toHaveAttribute("src", logoUrl("old-header"));
  expect(await publishedLogo()).toBe(logoUrl("old-main"));

  failUpload = true;
  await input.setInputFiles(logoFile);
  await expect(mainLogo.getByRole("alert")).toBeVisible();
  await expect(preview.locator(headerLogo)).toHaveAttribute("src", nextUpload);
  failUpload = false;
  await page.reload();
  await settings();
  await expect(mainLogo.locator("img")).toHaveAttribute("src", nextUpload);
  await publishDraft();
  await storefront.reload();
  await expect(storefront.locator(headerLogo)).toHaveAttribute("src", nextUpload);
  expect(await publishedLogo()).toBe(nextUpload);

  await settings();
  await mainLogo.getByRole("button", { name: "Supprimer", exact: true }).click();
  await expect(preview.locator(headerLogo)).toHaveCount(0);
  await expect.poll(async () => (await draft()).state.config).toMatchObject({
    restaurant_logo_url: "", nav_layout: { header: { logo: { type: "text", image: "" } } },
  });
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(preview.locator(headerLogo)).toHaveAttribute("src", nextUpload);
  await page.getByRole("button", { name: "Rétablir", exact: true }).click();
  await expect(preview.locator(headerLogo)).toHaveCount(0);
  await publishDraft();
  await storefront.reload();
  await expect(storefront.locator("[data-header-element=logo]")).toBeVisible();
  await expect(storefront.locator(headerLogo)).toHaveCount(0);
  expect(await publishedLogo()).toBe("");

  await page.reload();
  await settings();
  const add = mainLogo.getByRole("button", { name: "Téléverser", exact: true });
  await expect(add).toBeVisible();
  await input.setInputFiles({ ...logoFile, mimeType: "image/svg+xml", name: "logo.svg" });
  await expect(mainLogo.getByRole("alert")).toContainText("JPEG, PNG, GIF ou WebP");
  await input.setInputFiles({ ...logoFile, buffer: Buffer.alloc(2 * 1024 * 1024 + 1) });
  await expect(mainLogo.getByRole("alert")).toContainText("2 Mio maximum");
  expect(uploads).toBe(2);
  nextUpload = logoUrl("new");
  const [newChooser] = await Promise.all([page.waitForEvent("filechooser"), add.click()]);
  await newChooser.setFiles(logoFile);
  await expect(preview.locator(headerLogo)).toHaveAttribute("src", nextUpload);
  await expect.poll(async () => (await draft()).state.config.restaurant_logo_url).toBe(nextUpload);
  expect(uploads).toBe(3);
});
