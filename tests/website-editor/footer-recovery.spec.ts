import { test, expect } from "@playwright/test";
import type { DraftStatePayload } from "../../src/lib/website-v3/types";

test("an absent footer can be created, edited and published independently of branding", async ({ page, request, context }) => {
  await page.addInitScript(() => {
    localStorage.setItem("foody_restaurant_token", "isolated-ui-fixture");
    localStorage.setItem("foody_restaurant_user", JSON.stringify({ id: 1, full_name: "Demo", role: "manager", email: "demo@foody.test" }));
    localStorage.setItem("foody_restaurant_ids", "[1]");
    localStorage.setItem("foody-admin-locale", "fr");
  });
  await context.route("**/*", route => ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const draft = async (): Promise<DraftStatePayload> =>
    (await (await request.get("http://127.0.0.1:18081/api/v1/restaurants/1/website-draft")).json()).state;
  const original = await draft();
  // Reset only the synthetic fixture, making the check repeatable.
  await request.put("http://127.0.0.1:18081/api/v1/restaurants/1/website-draft", {
    data: { ...original, sections: original.sections.filter(section => section.section_type !== "footer") },
  });
  await request.post("http://127.0.0.1:18081/api/v1/restaurants/1/website-publish");
  await page.goto("/1/website-v3");
  await page.getByRole("button", { name: "Pied de page", exact: true }).click();
  const create = page.getByRole("button", { name: "Ajouter un pied de page", exact: true });
  await expect(create).toBeVisible();
  expect((await draft()).sections.some(section => section.section_type === "footer")).toBe(false);
  await create.click();
  const preview = page.frameLocator('iframe[title="Aperçu de Home"]');
  const footer = preview.locator('[data-editor-region="footer"]');
  const branding = preview.locator('[data-editor-region="footer-branding"]');
  await expect(footer).toBeVisible();
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(create).toBeVisible();
  await expect(footer).toHaveCount(0);
  await page.getByRole("button", { name: "Rétablir", exact: true }).click();
  await expect(footer).toBeVisible();
  await page.getByRole("button", { name: "Liens externes", exact: true }).click();
  await page.locator('[data-field-id="site.footer.content.custom_text"]').fill("© Atelier — footer recovery");
  await expect(footer).toContainText("© Atelier — footer recovery");
  await expect.poll(async () => (await draft()).sections.filter(section => section.section_type === "footer").length).toBe(1);
  const created = (await draft()).sections.find(section => section.section_type === "footer")!;
  expect(created.page).toBe("_site");
  expect(created.page_id).toBeUndefined();

  await page.getByRole("button", { name: "Terminé", exact: true }).click();
  await page.getByRole("button", { name: "Signature du pied de page", exact: true }).click();
  const brandingToggle = page.locator('[data-field-id="site.footer_branding.enabled"]');
  await brandingToggle.uncheck();
  await expect(branding).toHaveCount(0);
  await expect(footer).toBeVisible();
  await brandingToggle.check();
  await page.locator('input[type="text"][data-field-id="site.footer_branding.background"]').fill("#234537");
  await expect(branding).toHaveCSS("background-color", "rgb(35, 69, 55)");
  await expect.poll(async () => ((await draft()).config.custom_palette as Record<string, unknown>)?.footer_branding).toMatchObject({ enabled: true, background: "#234537" });

  await page.reload();
  await page.getByRole("button", { name: "Pied de page", exact: true }).click();
  await expect(create).toHaveCount(0);
  await expect(footer).toContainText("© Atelier — footer recovery");
  const visibility = page.locator('[data-field-id="site.footer.is_visible"]');
  await visibility.uncheck();
  await expect(footer).toHaveCount(0);
  await expect(branding).toBeVisible();
  await visibility.check();
  await expect(footer).toBeVisible();

  const publicPage = await context.newPage();
  await publicPage.goto("http://localhost:3000/r/atelier-foody?lang=fr");
  await expect(publicPage.locator('[data-editor-region="footer"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Publier", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Publier", exact: true }).click();
  await expect.poll(async () => (await (await request.get("http://127.0.0.1:18081/api/v1/restaurants/1/website-draft")).json()).draft_dirty).toBe(false);
  for (const path of ["", "/about", "/order"]) {
    await publicPage.goto(`http://localhost:3000/r/atelier-foody${path}?lang=fr`);
    await expect(publicPage.locator('[data-editor-region="footer"]')).toContainText("© Atelier — footer recovery");
    await expect(publicPage.locator('[data-editor-region="footer-branding"]')).toHaveCSS("background-color", "rgb(35, 69, 55)");
  }
  expect((await draft()).sections.filter(section => section.section_type === "footer")).toHaveLength(1);
  await publicPage.close();
});
