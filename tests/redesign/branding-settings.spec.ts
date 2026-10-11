import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

async function install(page: Page, options: { locale?: string; permissions?: string[]; logo?: string } = {}) {
  const fixtureOptions = { empty: false, permissions: options.permissions }, fixture = createFixture(fixtureOptions);
  const control = { name: 'Atelier Foody · מטבח הדגמה', description: 'Une cuisine de quartier, des produits de saison et des tables à partager.', logo_url: options.logo ?? '/synthetic-restaurant-logo.svg', reads: 0, failReads: false, failSave: 0, brokenImage: false, gate: null as Promise<void> | null };
  const writes: { body: any; restaurant?: string; path: string }[] = [];
  await page.addInitScript(({ locale }) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture'); localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'owner', email: 'demo@foody.test' }));
    localStorage.setItem('foody_restaurant_ids', '[1,2]'); localStorage.setItem('foody-admin-locale', locale); localStorage.setItem('foody_admin_theme', locale === 'he' ? 'dark' : 'light');
  }, { locale: options.locale ?? 'fr' });
  await page.route('**/api/v1/**', async route => {
    const req = route.request(), method = req.method(), path = new URL(req.url()).pathname, restaurant = req.headers()['x-restaurant-id'], body = req.postDataJSON() ?? {};
    const result = fixture.response(req.url(), method, body, Number(restaurant) || 1);
    if (/\/restaurants\/\d+$/.test(path)) {
      if (method === 'GET') { control.reads++; if (control.failReads) return route.fulfill({ status: 503, json: { error: 'Synthetic read failure' } }); }
      else {
        writes.push({ body, restaurant, path }); if (control.gate) await control.gate;
        if (control.failSave) { control.failSave--; return route.fulfill({ status: 503, json: { error: 'Synthetic write failure' } }); }
        Object.assign(control, body);
      }
      return route.fulfill({ json: { restaurant: { ...(result.json as { restaurant?: Record<string, unknown> } | undefined)?.restaurant, name: control.name, description: control.description, logo_url: control.logo_url } } });
    }
    return route.fulfill({ json: result.json ?? {}, status: result.status ?? 200 });
  });
  await page.route('**/synthetic-restaurant-logo*.svg', route => control.brokenImage ? route.fulfill({ status: 404, body: '' }) : route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="280" height="80" viewBox="0 0 280 80"><rect width="280" height="80" rx="8" fill="#153b5b"/><text x="140" y="47" text-anchor="middle" font-family="sans-serif" font-size="23" fill="white">ATELIER · DEMO</text></svg>' }));
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  return { fixture, control, writes };
}
const name = (page: Page) => page.getByRole('textbox', { name: 'Nom', exact: true });
const description = (page: Page) => page.getByRole('textbox', { name: 'Description', exact: true });
const logoUrl = (page: Page) => page.getByRole('textbox', { name: 'URL du logo', exact: true });
const save = (page: Page) => page.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).last();
const status = (page: Page) => page.locator('main [role=status]').filter({ hasNotText: /^Chargement/ });
const guarded = (page: Page) => page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; });

for (const locale of ['fr', 'he']) test(`restaurant branding responsive ${locale} and uncropped logo`, async ({ page }, info) => {
  const state = await install(page, { locale }); await page.setViewportSize({ width: locale === 'fr' ? 375 : 1440, height: 1000 }); await page.goto('/1/settings/branding');
  const image = page.locator('main img'); await expect(image).toBeVisible(); await expect(image).toHaveCSS('object-fit', 'contain'); await expect(image).toHaveJSProperty('naturalWidth', 280);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath(`restaurant-branding-${locale}.png`), fullPage: true });
  if (locale === 'fr') { await page.locator('form button[type=submit]').last().scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('restaurant-branding-lower-fr.png') }); }
  expect(state.fixture.unhandled).toEqual([]);
});

test('branding read failure after entry offers retry without default editable identity', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/branding'); await expect(name(page)).toHaveValue(state.control.name);
  await page.getByRole('link', { name: 'Sécurité', exact: true }).click(); await expect(page).toHaveURL(/security$/); await expect(name(page)).toHaveCount(0); state.control.failReads = true;
  await page.getByRole('link', { name: 'Image de marque', exact: true }).click(); await expect(page.locator('main [role=alert]')).toContainText('Impossible de charger l’identité'); await expect(name(page)).toHaveCount(0); await expect(save(page)).toBeDisabled();
  state.control.failReads = false; await page.getByRole('button', { name: 'Réessayer', exact: true }).click(); await expect(name(page)).toHaveValue(state.control.name); expect(state.writes).toHaveLength(0);
});

test('branding saves only changed restaurant properties and preserves long descriptions', async ({ page }) => {
  const state = await install(page); const long = 'Un repas convivial · מטבח '.repeat(100); await page.goto('/2/settings/branding'); await description(page).fill(long); await save(page).click(); await expect(status(page)).toContainText('Enregistré');
  expect(state.writes).toEqual([{ path: '/api/v1/restaurants/2', restaurant: '2', body: { description: long } }]); await expect(description(page)).toHaveValue(long); expect(await guarded(page)).toBe(false);
  await expect(page.locator('input[type=color]')).toHaveCount(0); await expect(page.getByRole('combobox')).toHaveCount(0); await expect(page.getByRole('link', { name: 'Ouvrir l’éditeur du site', exact: true })).toHaveAttribute('href', '/2/website-v3');
});

test('branding serializes saves, freezes inputs and preserves the failed draft', async ({ page }) => {
  const state = await install(page); state.control.failSave = 1; await page.goto('/1/settings/branding'); await name(page).fill('Nouvelle identité · דוגמה');
  let release!: () => void; state.control.gate = new Promise<void>(resolve => { release = resolve; });
  await save(page).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); }); await expect(name(page)).toHaveJSProperty('readOnly', true); await expect(logoUrl(page)).toHaveJSProperty('readOnly', true);
  release(); state.control.gate = null; await expect(page.locator('main [role=alert]')).toBeVisible(); await expect(name(page)).toHaveValue('Nouvelle identité · דוגמה'); expect(await guarded(page)).toBe(true);
  await save(page).click(); await expect(status(page)).toContainText('Enregistré'); expect(state.writes).toHaveLength(2); expect(state.writes[1].body).toEqual({ name: 'Nouvelle identité · דוגמה' });
});

test('branding validates an empty name and unsafe replacement URL without mutation', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/branding'); await name(page).fill('  '); await save(page).click(); await expect(name(page)).toHaveAttribute('aria-invalid', 'true'); await expect(name(page)).toBeFocused();
  await name(page).fill(state.control.name); await logoUrl(page).fill('javascript:alert(1)'); await save(page).click(); await expect(logoUrl(page)).toHaveAttribute('aria-invalid', 'true'); await expect(logoUrl(page)).toBeFocused();
  await expect(page.locator('main img')).toHaveCount(0); expect(state.writes).toHaveLength(0);
});

test('branding image failure preserves the URL and offers a preview-only retry', async ({ page }) => {
  const state = await install(page); state.control.brokenImage = true; await page.goto('/1/settings/branding'); await expect(page.getByText(/Aperçu indisponible/)).toBeVisible(); await expect(logoUrl(page)).toHaveValue(state.control.logo_url);
  state.control.brokenImage = false; await page.getByRole('button', { name: 'Réessayer', exact: true }).click(); await expect(page.locator('main img')).toHaveJSProperty('naturalWidth', 280); expect(state.writes).toHaveLength(0);
});

test('branding logo removal is a confirmed local change until saving', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/branding'); const remove = page.getByRole('button', { name: 'Retirer le logo', exact: true }); await remove.click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler', exact: true }).click(); await expect(remove).toBeFocused(); await expect(logoUrl(page)).toHaveValue(state.control.logo_url);
  await remove.click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer', exact: true }).click(); await expect(logoUrl(page)).toHaveValue(''); await expect(page.getByText('Aucun logo de restaurant.', { exact: true })).toBeVisible(); expect(state.writes).toHaveLength(0);
  await description(page).fill(''); await save(page).click(); await expect(status(page)).toContainText('Enregistré'); expect(state.writes[0].body).toEqual({ description: '', logo_url: '' });
});

test('branding keeps unsupported historical image values when editing unrelated text', async ({ page }) => {
  const state = await install(page, { logo: 'data:image/png;base64,synthetic-legacy-value' }); await page.goto('/1/settings/branding'); await expect(logoUrl(page)).toHaveValue(state.control.logo_url); await description(page).fill('Mise à jour');
  await save(page).click(); await expect(status(page)).toContainText('Enregistré'); expect(state.writes[0].body).toEqual({ description: 'Mise à jour' }); await expect(logoUrl(page)).toHaveValue(state.control.logo_url);
});

test('branding saves a valid new logo path without changing website drafts', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/branding'); await logoUrl(page).fill('/synthetic-restaurant-logo-new.svg'); await expect(page.locator('main img')).toHaveJSProperty('naturalWidth', 280);
  await save(page).click(); await expect(status(page)).toContainText('Enregistré'); expect(state.writes[0].body).toEqual({ logo_url: '/synthetic-restaurant-logo-new.svg' }); expect(state.fixture.unhandled).toEqual([]);
});

test('branding draft survives language changes and guarded navigation before reset', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/branding'); await description(page).fill('Brouillon conservé'); const reads = state.control.reads;
  await page.getByRole('link', { name: 'Ouvrir l’éditeur du site', exact: true }).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler', exact: true }).click(); await expect(page).toHaveURL(/branding$/);
  await page.getByRole('button', { name: state.control.name, exact: true }).click(); await page.getByRole('dialog').getByRole('combobox').selectOption('en'); await page.keyboard.press('Escape'); await expect(description(page)).toHaveValue('Brouillon conservé'); expect(state.control.reads).toBe(reads);
  await page.getByRole('button', { name: 'Reset', exact: true }).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Discard changes', exact: true }).click(); await expect(description(page)).toHaveValue(state.control.description); expect(state.writes).toHaveLength(0); expect(await guarded(page)).toBe(false);
});

test('branding read-only identity remains copyable and exposes no mutation action', async ({ page }) => {
  const state = await install(page, { permissions: ['settings.view'] }); await page.goto('/1/settings/branding'); await expect(name(page)).toHaveJSProperty('readOnly', true); await expect(logoUrl(page)).toHaveJSProperty('readOnly', true); await expect(description(page)).toBeEnabled();
  await expect(save(page)).toHaveCount(0); await expect(page.getByRole('button', { name: 'Retirer le logo', exact: true })).toHaveCount(0); expect(state.writes).toHaveLength(0);
});
