import { expect, test } from "@playwright/test";
import { normalizeSiteColors } from "../../src/lib/website-v3/site-colors";
import type { DraftStatePayload } from "../../src/lib/website-v3/types";

test("item presentation preserves the editor theme, framing and publication", async ({page, request, context}) => {
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
  const colors = normalizeSiteColors({});
  colors.styles[1].item_detail = {background:"#fff9ef", title:"#482c2c", description:"#765c5c", price:"#bb3e3e",
    options_background:"#e8dfd1", options_text:"#482c2c", footer_background:"#f2e5d5", button_background:"#9b3c47", button_text:"#ffffff"};
  seed.config.custom_palette = {mode:"light", bg:"#fff9ef", surface:"#fff9ef", ink:"#482c2c", accent:"#9b3c47", color_styles:colors};
  seed.config.typography = {site:{headingFont:"Arial", bodyFont:"Arial"}};
  const frames = {"1":{desktop:{x:25,y:60,zoom:1.2,fit:"contain"}}};
  seed.pages.find(item => item.type === "order")!.appearance_overrides = {foody_renderer_version:1, navigation_mode:"hidden", footer_mode:"hidden", website_order:{
    color_style:"style-1", item_color_style:"style-2", item_layout:"standard", item_width:"wide", item_radius:"square",
    item_aspect_ratio:"4/3", item_image_fit:"contain", item_image_frames:frames, show_fulfillment:false, prompt_on_entry:false, show_banner:false,
  }};
  await request.put("http://127.0.0.1:18081/api/v1/restaurants/1/website-draft", {data:seed});
  await request.post("http://127.0.0.1:18081/api/v1/restaurants/1/website-publish");
  await page.goto("/1/website-v3");
  await page.getByRole("button", {name:"Liste des articles", exact:true}).click({timeout:60_000});
  const panel = page.locator("details").filter({has:page.locator("summary", {hasText:/^Fiche article$/})});
  await panel.locator("summary").click();
  const preview = page.frameLocator("iframe");
  const modal = preview.locator(".website-item-dialog");
  await expect(modal).toBeVisible({timeout:60_000});
  await expect(modal).toHaveCSS("background-color", "rgb(255, 249, 239)");
  await expect(modal.locator("[data-item-part=image]")).toHaveCSS("aspect-ratio", "4 / 3");
  await expect(modal.locator("[data-item-part=footer]")).toHaveCSS("background-color", "rgb(242, 229, 213)");
  await expect(modal.locator("[data-item-part=add]")).toHaveCSS("background-color", "rgb(155, 60, 71)");
  await expect(modal.locator("[data-item-part=add]")).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(modal.locator("[data-item-part=footer] [data-item-part=quantity]")).toBeVisible();
  await expect(modal.locator(".website-item-toolbar")).toHaveCount(0);
  const add = modal.locator("[data-item-part=add]");
  await expect(add).toHaveAttribute("aria-disabled", "true");
  await add.dispatchEvent("click"); // An editor preview must ignore activation.
  await expect(modal).toBeVisible();
  await panel.getByRole("button", {name:"Présentation compacte", exact:true}).click();
  const expected = {item_color_style:"style-2", item_layout:"cover", item_width:"compact", item_radius:"rounded", item_aspect_ratio:"16/9", item_image_fit:"cover", item_image_frames:frames};
  await expect.poll(async () => (await draft()).pages.find(item => item.type === "order")?.appearance_overrides.website_order).toMatchObject(expected);
  await expect(modal).toHaveCSS("max-width", "512px");
  await expect(modal).toHaveCSS("border-radius", "24px");
  await expect(modal.locator("[data-item-part=image]")).toHaveCSS("aspect-ratio", "16 / 9");
  expect((await draft()).config.custom_palette).toEqual(seed.config.custom_palette);
  await page.reload();
  await page.getByRole("button", {name:"Liste des articles", exact:true}).click();
  await panel.locator("summary").click();
  await expect(panel.getByRole("combobox", {name:"Proportions de l’image", exact:true})).toHaveValue("16/9");
  await expect(modal).toHaveCSS("background-color", "rgb(255, 249, 239)");
  await page.screenshot({path:"test-results/website-editor/compact-item-editor.png"});
  const published = page.waitForResponse(response => response.url().endsWith("/website-publish") && response.request().method() === "POST");
  await page.getByRole("button", {name:"Publier", exact:true}).click();
  expect((await published).ok()).toBe(true);
  const storefront = await context.newPage();
  for (const scenario of [{width:1280, locale:"fr"}, {width:320, locale:"he"}]) {
    await storefront.setViewportSize({width:scenario.width, height:900});
    await storefront.goto(`http://localhost:3000/r/atelier-foody/order?lang=${scenario.locale}`);
    await storefront.locator(".website-order-menu .website-order-item").first().click();
    const live = storefront.locator(".website-item-dialog");
    await live.getByRole("spinbutton").click(); // Settle the opening animation before visual evidence.
    await expect(live).toHaveCSS("background-color", "rgb(255, 249, 239)");
    await expect(live.locator("[data-item-part=add]")).toHaveCSS("background-color", "rgb(155, 60, 71)");
    await expect(live.locator("[data-item-part=description]")).toHaveCSS("color", "rgb(118, 92, 92)");
    await expect(live.locator("[data-item-part=footer] [data-item-part=quantity]")).toHaveCSS("background-color", "rgb(232, 223, 209)");
    await expect(live.locator("[data-item-part=image]")).toHaveCSS("aspect-ratio", "16 / 9");
    await expect(live.locator("[data-item-part=add]")).not.toHaveAttribute("aria-disabled", "true");
    expect(await live.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await storefront.screenshot({path:`test-results/website-editor/compact-item-public-${scenario.locale}.png`});
  }
});
