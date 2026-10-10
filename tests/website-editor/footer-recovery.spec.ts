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
  await expect(page.locator(".sqe-sidebar [role=tablist], [data-inspector-tabs]")).toHaveCount(0);
  expect((await draft()).sections.some(section => section.section_type === "footer")).toBe(false);
  await create.click();
  await expect(page.getByRole("button", { name: "Disposition et couleurs", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Logo", exact: true })).toBeVisible();
  const preview = page.frameLocator('iframe[title="Aperçu de Home"]');
  const footer = preview.locator('[data-editor-region="footer"]');
  const branding = preview.locator('[data-editor-region="footer-branding"]');
  await expect(footer).toBeVisible();
  await page.screenshot({ path: "test-results/website-editor/footer-unified.png" });
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
  await expect(page.locator(".sqe-sidebar [role=tablist], [data-inspector-tabs]")).toHaveCount(0);
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

test("section content and settings remain reachable through contextual actions", async ({ page, request, context }) => {
  await page.addInitScript(() => {
    localStorage.setItem("foody_restaurant_token", "isolated-ui-fixture");
    localStorage.setItem("foody_restaurant_user", JSON.stringify({ id: 1, full_name: "Demo", role: "manager", email: "demo@foody.test" }));
    localStorage.setItem("foody_restaurant_ids", "[1]");
    localStorage.setItem("foody-admin-locale", "fr");
  });
  await context.route("**/*", route => ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  await page.goto("/1/website-v3");
  await page.getByRole("button", { name: "Texte et image", exact: true }).click();
  const panel = page.locator("[data-section-panel]");
  await expect(panel).toHaveAttribute("data-section-panel", "appearance");
  await panel.getByRole("button", { name: "Cliquez ici pour modifier", exact: true }).click();
  await expect(panel).toHaveAttribute("data-section-panel", "content");
  await panel.getByRole("textbox", { name: "Titre", exact: true }).first().fill("A unified Foody editor");
  const preview = page.frameLocator('iframe[title="Aperçu de Home"]');
  await expect(preview.getByText("A unified Foody editor", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Plus d’actions", exact: true }).click();
  await panel.getByRole("button", { name: "Paramètres", exact: true }).click();
  await expect(panel).toHaveAttribute("data-section-panel", "settings");
  await expect(panel.locator('[data-field-id="section.is_visible"]')).toBeVisible();
  await expect(panel.locator('[role="tablist"]')).toHaveCount(0);
  await expect.poll(async () => {
    const draft = await (await request.get("http://127.0.0.1:18081/api/v1/restaurants/1/website-draft")).json();
    return draft.state.sections.find((section: { id: number }) => section.id === 3).content.title;
  }).toBe("A unified Foody editor");
  await panel.getByRole("button", { name: "Terminé", exact: true }).click();
  await expect(panel).toHaveAttribute("data-section-panel", "appearance");
  await panel.getByRole("button", { name: "Terminé", exact: true }).click();
  await page.getByRole("button", { name: "Design du site", exact: true }).click();
  await page.getByRole("button", { name: "Paramètres du site", exact: true }).click();
  await expect(page.getByRole("link", { name: "Gérer les Stories Instagram" })).toHaveAttribute("href", "/1/settings/stories");
  await expect(page.locator('.sqe-sidebar [role="tablist"], [data-inspector-tabs]')).toHaveCount(0);
});
