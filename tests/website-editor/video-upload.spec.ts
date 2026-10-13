import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { DraftStatePayload } from "../../src/lib/website-v3/types";

// Uploads are intercepted; draft/publication writes use only the in-memory API.
test("video files can be uploaded, replaced, saved, published and removed", async ({ page, context, request }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    localStorage.setItem("foody_restaurant_token", "isolated-ui-fixture");
    localStorage.setItem("foody_restaurant_user", JSON.stringify({ id: 1, full_name: "Demo", role: "manager", email: "demo@foody.test" }));
    localStorage.setItem("foody_restaurant_ids", "[1]");
    localStorage.setItem("foody-admin-locale", "fr");
  });
  await context.route("**/*", route => ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const draft = async (): Promise<DraftStatePayload> =>
    (await (await request.get("http://127.0.0.1:18081/api/v1/restaurants/1/website-draft")).json()).state;
  const seed = await draft();
  seed.sections = [{
    id: 8001, section_type: "video", page: "home", page_id: 1,
    sort_order: 0, is_visible: true, layout: "default",
    content: { title: "Notre cuisine", video_url: "" }, settings: {},
  }];
  await request.put("http://127.0.0.1:18081/api/v1/restaurants/1/website-draft", { data: seed });
  await request.post("http://127.0.0.1:18081/api/v1/restaurants/1/website-publish");

  const videoUrl = (extension: string) => `http://localhost:3003/__video-fixture/video.${extension}`;
  await context.route("**/__video-fixture/video.*", async route => {
    const extension = route.request().url().endsWith("mp4") ? "mp4" : "webm";
    await route.fulfill({ contentType: `video/${extension}`, body: readFileSync(path.join(__dirname, "fixtures", `video.${extension}`)) });
  });
  let uploads = 0;
  let failUpload = false;
  let finishUpload: (() => void) | undefined;
  let pauseUpload = true;
  await context.route("**/api/v1/restaurants/1/sections/upload-video", async route => {
    uploads++;
    const upload = route.request();
    expect(upload.method()).toBe("POST");
    expect(upload.headers()["authorization"]).toBe("Bearer isolated-ui-fixture");
    expect(upload.headers()["x-restaurant-id"]).toBe("1");
    expect(upload.headers()["content-type"]).toContain("multipart/form-data; boundary=");
    const multipart = upload.postDataBuffer()!.toString("latin1");
    expect(multipart).toMatch(/name="video"; filename="video\.(webm|mp4)"/);
    expect(multipart).toMatch(/Content-Type: video\/(webm|mp4)/);
    if (pauseUpload) await new Promise<void>(resolve => { finishUpload = resolve; });
    await route.fulfill({
      status: failUpload ? 500 : 200,
      json: failUpload ? { error: "Upload indisponible" } : { video_url: videoUrl(multipart.includes('filename="video.mp4"') ? "mp4" : "webm") },
    });
  });

  await page.goto("/1/website-v3");
  const preview = page.frameLocator('iframe[title="Aperçu de Home"]');
  await expect(preview.getByText("Notre cuisine", { exact: true })).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Vidéo", exact: true }).click();
  const panel = page.locator("[data-section-panel]");
  await panel.getByRole("button", { name: "Cliquez ici pour modifier", exact: true }).click();
  const input = panel.locator('input[type="file"]');
  const url = panel.getByRole("textbox", { name: "URL de la vidéo", exact: true });
  await expect(panel.getByRole("button", { name: "Ajouter une vidéo", exact: true })).toBeVisible();
  await expect(panel).toContainText("MP4 ou WebM, 50 Mo maximum.");
  await expect(panel).not.toContainText("muette");
  await input.setInputFiles({ name: "image.png", mimeType: "image/png", buffer: Buffer.from("invalid") });
  await expect(panel.getByRole("alert")).toHaveText("Choisissez une vidéo MP4 ou WebM.");
  await input.evaluate(element => {
    const files = new DataTransfer();
    files.items.add(new File([new Uint8Array(50 * 1024 * 1024 + 1)], "large.mp4", { type: "video/mp4" }));
    (element as HTMLInputElement).files = files.files;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(panel.getByRole("alert")).toHaveText("La vidéo ne doit pas dépasser 50 Mo.");
  expect(uploads).toBe(0);

  const chooser = page.waitForEvent("filechooser");
  await panel.getByRole("button", { name: "Ajouter une vidéo", exact: true }).click();
  await (await chooser).setFiles(path.join(__dirname, "fixtures", "video.webm"));
  await expect(panel.getByRole("button", { name: "Téléversement…", exact: true })).toBeDisabled();
  await expect(url).toBeDisabled();
  await expect.poll(() => Boolean(finishUpload)).toBe(true);
  pauseUpload = false;
  finishUpload!();
  await expect(url).toHaveValue(videoUrl("webm"));
  await expect(panel.getByRole("alert")).toHaveCount(0);
  const previewVideo = preview.locator('[data-section-type="video"] video');
  await expect(previewVideo).toHaveAttribute("src", videoUrl("webm"));
  await expect.poll(async () => (await draft()).sections[0].content.video_url).toBe(videoUrl("webm"));

  failUpload = true;
  await input.setInputFiles(path.join(__dirname, "fixtures", "video.mp4"));
  await expect(panel.getByRole("alert")).toHaveText("Upload indisponible");
  await expect(url).toHaveValue(videoUrl("webm"));
  await expect(previewVideo).toHaveAttribute("src", videoUrl("webm"));
  failUpload = false;
  await input.setInputFiles(path.join(__dirname, "fixtures", "video.mp4"));
  await expect(url).toHaveValue(videoUrl("mp4"));
  await expect.poll(async () => (await draft()).sections[0].content.video_url).toBe(videoUrl("mp4"));
  expect(uploads).toBe(3);
  await page.reload();
  await page.getByRole("button", { name: "Vidéo", exact: true }).click();
  await panel.getByRole("button", { name: "Cliquez ici pour modifier", exact: true }).click();
  await expect(url).toHaveValue(videoUrl("mp4"));
  await expect(panel.locator("video")).not.toHaveAttribute("loop");
  await expect.poll(() => panel.locator("video").evaluate(video => (video as HTMLVideoElement).muted)).toBe(false);

  const publish = page.getByRole("button", { name: "Publier", exact: true });
  await expect(publish).not.toHaveAttribute("title", /.+/, { timeout: 60_000 });
  const published = page.waitForResponse(response => response.url().endsWith("/website-publish") && response.request().method() === "POST");
  await publish.click();
  expect((await published).ok()).toBe(true);
  const storefront = await context.newPage();
  await storefront.goto("http://localhost:3000/r/atelier-foody?lang=fr");
  const publicVideo = storefront.locator('[data-section-type="video"] video');
  await expect(publicVideo).toHaveAttribute("src", videoUrl("mp4"));
  await expect.poll(() => publicVideo.evaluate(video => (video as HTMLVideoElement).readyState)).toBeGreaterThan(0);
  await publicVideo.evaluate(video => (video as HTMLVideoElement).play());
  await expect.poll(() => publicVideo.evaluate(video => (video as HTMLVideoElement).currentTime)).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Vidéo", exact: true }).click();
  await panel.getByRole("button", { name: "Cliquez ici pour modifier", exact: true }).click();
  await panel.getByRole("button", { name: "Supprimer", exact: true }).click();
  await expect(url).toHaveValue("");
  await expect(previewVideo).toHaveCount(0);
  await expect.poll(async () => (await draft()).sections[0].content.video_url).toBe("");
  await storefront.reload();
  await expect(publicVideo).toHaveAttribute("src", videoUrl("mp4"));
  await url.fill("https://youtu.be/dQw4w9WgXcQ");
  await expect(preview.locator('[data-section-type="video"] iframe')).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
});
