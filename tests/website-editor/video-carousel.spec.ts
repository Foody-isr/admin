import { expect, test } from "@playwright/test";
import type { DraftStatePayload } from "../../src/lib/website-v3/types";

const api = "http://127.0.0.1:18081/api/v1/restaurants/1";
const storefront = "http://localhost:3000/r/atelier-foody";
const videoUrl = "http://127.0.0.1:18081/__reel-fixture/clip.mp4";

test("responsive reel previews save in the editor and preserve the direct item link", async ({ page, context, request }, testInfo) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    localStorage.setItem("foody_restaurant_token", "isolated-ui-fixture");
    localStorage.setItem("foody_restaurant_user", JSON.stringify({ id: 1, full_name: "Demo", role: "manager", email: "demo@foody.test" }));
    localStorage.setItem("foody_restaurant_ids", "[1]");
    localStorage.setItem("foody-admin-locale", "fr");
  });
  await context.route("**/*", route => ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());

  const draft = async (): Promise<DraftStatePayload> => (await (await request.get(api + "/website-draft")).json()).state;
  const seed = await draft();
  seed.sections = [{
    id: 8000, section_type: "hero_banner", page: "home", page_id: 1, sort_order: 0, is_visible: true, layout: "split",
    content: { headline: "Notre café", video_url: videoUrl }, settings: { height: "tall" },
  }, {
    id: 8001, section_type: "video", page: "home", page_id: 1, sort_order: 1, is_visible: true, layout: "contained",
    content: { title: "Notre café en images" }, settings: { padding: "compact" },
  }, {
    id: 8003, section_type: "text", page: "home", page_id: 1, sort_order: 2, is_visible: true, layout: "centered",
    content: { title: "Une table à Herzliya" }, settings: { height: "tall" },
  }];
  expect((await request.put(api + "/website-draft", { data: seed })).ok()).toBe(true);
  expect((await request.post(api + "/website-publish")).ok()).toBe(true);

  await page.goto("/1/website-v3");
  const preview = page.frameLocator('iframe[title^="Aperçu de"]');
  await expect(preview.getByRole("heading", { name: "Notre café en images" })).toBeVisible({ timeout: 120_000 });
  const panel = page.locator("[data-section-panel]");
  await page.getByRole("button", { name: "Bannière principale", exact: true }).click();
  await panel.locator('input[data-field-id="section.settings.mobile_media_first"]').check();
  await panel.locator('input[data-field-id="section.settings.hide_video_playback_button"]').check();
  await page.getByRole("button", { name: "Terminé", exact: true }).click();
  await page.getByRole("button", { name: "Vidéo", exact: true }).click();
  await panel.getByRole("button", { name: "Carrousel", exact: true }).click();
  await panel.locator('input[data-field-id="section.settings.mobile_at_end"]').check();
  await panel.locator('input[data-field-id="section.settings.reel_preview_autoplay"]').check();
  const webStories = panel.getByRole("switch", { name: "Utiliser le lecteur Web Stories" });
  await webStories.check();
  await expect.poll(async () => (await draft()).sections.find(section => section.id === 8001)?.settings.web_story_player).toBe(true);
  await webStories.uncheck();
  await panel.getByRole("button", { name: "Cliquez ici pour modifier", exact: true }).click();
  const cards = panel.getByRole("group", { name: "Vidéos du carrousel" });
  await cards.getByRole("button", { name: "Ajouter une vidéo", exact: true }).click();
  const field = (name: string, index = 0) => cards.locator(`[data-field-id="section.content.reels.${index}.${name}"]`);
  await field("title").fill("La salade");
  await field("video_url").fill(videoUrl);
  await field("cta_text").fill("Commander la salade");
  await field("cta_link").fill("/order?item=1");
  await cards.getByRole("button", { name: "Ajouter une vidéo", exact: true }).click();
  await cards.locator("details").nth(1).locator("summary").click();
  await field("title", 1).fill("Les pâtisseries");
  await field("video_url", 1).fill(videoUrl);
  await expect(preview.getByRole("button", { name: "La salade", exact: true })).toBeVisible();
  await expect.poll(async () => (await draft()).sections.find(section => section.id === 8001)).toMatchObject({
    layout: "carousel",
    settings: { mobile_at_end: true, reel_preview_autoplay: true, web_story_player: false },
    content: { reels: [
      { title: "La salade", video_url: videoUrl, cta_text: "Commander la salade", cta_link: "/order?item=1" },
      { title: "Les pâtisseries", video_url: videoUrl },
    ] },
  });

  await page.reload();
  await expect(preview.getByRole("button", { name: "La salade", exact: true })).toBeVisible({ timeout: 120_000 });
  const published = page.waitForResponse(response => response.url().endsWith("/website-publish") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Publier", exact: true }).click();
  expect((await published).ok()).toBe(true);

  const guest = await context.newPage();
  await guest.addInitScript(() => localStorage.setItem("foody-locale", "fr"));
  await guest.setViewportSize({ width: 390, height: 720 });
  await guest.emulateMedia({ reducedMotion: "reduce" });
  await guest.goto(storefront);
  const hero = guest.locator('[data-section-type="hero_banner"] video');
  const heroMedia = guest.locator('[data-section-type="hero_banner"] [data-motion-part="media"]');
  const heroText = guest.locator('[data-section-type="hero_banner"] [data-motion-part="text"]');
  const carousel = guest.locator('[data-section-type="video"]');
  const later = guest.getByRole("heading", { name: "Une table à Herzliya" });
  const activePreview = carousel.locator("video[data-reel-preview]");
  const y = (locator: typeof hero) => locator.evaluate(element => element.getBoundingClientRect().top);
  await expect.poll(async () => (await y(heroMedia)) < (await y(heroText))).toBe(true);
  await expect.poll(async () => (await y(carousel)) > (await y(later))).toBe(true);
  await expect(activePreview).toHaveCount(0);
  await hero.scrollIntoViewIfNeeded();
  await expect(hero).toHaveJSProperty("paused", true);
  await guest.emulateMedia({ reducedMotion: "no-preference" });
  await expect.poll(() => hero.evaluate(video => (video as HTMLVideoElement).currentTime)).toBeGreaterThan(0);
  const bannerControl = heroMedia.getByRole("button");
  await expect(bannerControl).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(bannerControl.locator("svg")).toHaveCount(0);
  await bannerControl.click();
  await expect(hero).toHaveJSProperty("paused", true);
  await bannerControl.click();
  await expect(hero).toHaveJSProperty("paused", false);

  const card = guest.getByRole("button", { name: "La salade", exact: true });
  const nextCard = guest.getByRole("button", { name: "Les pâtisseries", exact: true });
  // The synthetic clip can finish before the next poll, especially on WebKit.
  const hasStartedMuted = (locator: typeof hero) => locator.evaluate((element: HTMLVideoElement) => element.muted && element.currentTime > 0);
  await card.scrollIntoViewIfNeeded();
  await expect.poll(() => hasStartedMuted(card.locator("video[data-reel-preview]"))).toBe(true);
  await carousel.getByRole("button", { name: "Diapositive suivante" }).click();
  await expect.poll(() => hasStartedMuted(nextCard.locator("video[data-reel-preview]"))).toBe(true);
  await expect(activePreview).toHaveCount(1);
  await guest.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect(activePreview).toHaveCount(0);
  const dialog = guest.getByRole("dialog", { name: "La salade" });
  const action = dialog.getByRole("link", { name: "Commander la salade" });
  await card.click();
  await expect(dialog).toBeVisible();
  await expect(activePreview).toHaveCount(0);
  await expect(action).toBeInViewport({ ratio: 1 });
  await expect.poll(() => dialog.locator("video").evaluate(video => (video as HTMLVideoElement).currentTime)).toBeGreaterThan(0);
  const bounds = await dialog.boundingBox();
  expect(bounds?.width).toBe(390);
  expect(bounds?.height).toBe(720);
  await guest.screenshot({ path: testInfo.outputPath("reel-mobile.png") });
  await dialog.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(card).toBeFocused();

  await guest.setViewportSize({ width: 1280, height: 800 });
  await expect.poll(async () => (await y(carousel)) < (await y(later))).toBe(true);
  await expect.poll(async () => Math.abs((await y(heroMedia)) - (await y(heroText)))).toBeLessThan(2);
  await card.scrollIntoViewIfNeeded();
  await expect.poll(() => hasStartedMuted(card.locator("video[data-reel-preview]"))).toBe(true);
  await expect(nextCard.locator("video[data-reel-preview]")).toHaveCount(0);
  await expect(carousel.getByRole("button", { name: "Mettre le carrousel en pause" })).toHaveCount(0);
  await expect(activePreview).toHaveJSProperty("paused", true);
  await card.click();
  await expect(action).toBeInViewport({ ratio: 1 });
  expect((await dialog.boundingBox())?.width).toBeLessThan(600);
  await guest.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await card.click();
  await expect(action).toHaveAttribute("href", "/r/atelier-foody/order?item=1");
  await action.click();
  await expect(guest).toHaveURL(/\/order\?item=1$/);
  await expect(guest.getByRole("dialog", { name: "Salade méditerranéenne" })).toBeVisible();
});
