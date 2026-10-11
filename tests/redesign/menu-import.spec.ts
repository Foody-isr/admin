import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';
import type { RichExtraction } from '../../src/lib/api';

const itemName = 'Salade méditerranéenne — légumes de saison, tahini et herbes fraîches';
const extraction: RichExtraction = {
  restaurant_logo_url: 'https://assets.example.test/logo.png',
  restaurant_cover_url: 'https://assets.example.test/cover.png',
  categories: [{ name: 'Plats à partager', items: [{
    name: itemName, description: 'Tomates confites et citron, servis avec une focaccia maison.', price: 48,
    option_sets: [{ name: 'Taille de portion', default_option_name: 'Individuelle', options: [{ name: 'Individuelle', price: 48 }, { name: 'À partager', price: 82 }] }],
    modifier_sets: [{ name: 'Accompagnements', is_required: false, min_selections: 0, max_selections: 2, modifiers: [{ name: 'Tahini supplémentaire', price_delta: 4 }, { name: 'Sans garniture', price_delta: -2.5 }] }],
  }, { name: 'Fromage affiné', description: '', price: 0, pricing_mode: 'by_weight', price_per_kg: 112, estimated_weight_grams: 200 }] }],
};

async function install(page: Page, options: { locale?: string; permissions?: string[] } = {}) {
  const fixtureOptions = { menuLibrary: true, permissions: options.permissions };
  const fixture = createFixture(fixtureOptions);
  const writes: { path: string; body: any; restaurant: number; query: string }[] = [];
  const faults = { restaurant: 0, extract: 0, preview: 0, confirm: 0, extractDelay: 0, previewDelay: 0, confirmDelay: 0 };
  const state = { payload: structuredClone(extraction) as unknown, carteId: 1, confirmGate: null as Promise<void> | null };
  await page.addInitScript(({ locale }) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'owner', email: 'demo@foody.test' }));
    localStorage.setItem('foody_restaurant_ids', '[1,2]');
    localStorage.setItem('foody-admin-locale', locale);
    localStorage.setItem('foody_admin_theme', locale === 'he' ? 'dark' : 'light');
  }, { locale: options.locale ?? 'fr' });
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const method = request.method(), restaurant = Number(request.headers()['x-restaurant-id']) || 1;
    const body = request.headers()['content-type']?.includes('multipart/') ? { file: true } : request.postDataJSON() ?? {};
    const send = (json: unknown, status = 200) => route.fulfill({ json, status });
    const fail = () => send({ error: 'Échec synthétique import' }, 503);
    const consume = (key: keyof typeof faults) => { if (faults[key] > 0) { faults[key]--; return true; } return false; };
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    if (path.startsWith('/api/v1/menu/import') || path.endsWith('/translations/preview')) {
      writes.push({ path, body, restaurant, query: url.search });
      if (path.endsWith('/confirm')) {
        if (state.confirmGate) await state.confirmGate;
        if (faults.confirmDelay) await delay(faults.confirmDelay);
        if (consume('confirm')) return fail();
        return send({ categories: [], carte_id: state.carteId });
      }
      if (path.endsWith('/translations/preview')) {
        if (faults.previewDelay) await delay(faults.previewDelay);
        if (consume('preview')) return fail();
        return send({ translations: Object.fromEntries(body.groups.flatMap((group: any) => group.texts.map((text: string) => [text, { fr: text, en: `EN ${text}`, he: `עברית ${text}` }]))) });
      }
      if (faults.extractDelay) await delay(faults.extractDelay);
      if (consume('extract')) return fail();
      return send(path.endsWith('/url') ? state.payload : { extraction: state.payload });
    }
    if (/^\/api\/v1\/restaurants\/\d+$/.test(path) && method === 'GET') {
      if (consume('restaurant')) return fail();
      const result = fixture.response(request.url(), method, body, restaurant) as any;
      return send({ restaurant: { ...result.json.restaurant, default_locale: 'fr' } });
    }
    const result = fixture.response(request.url(), method, body, restaurant);
    return send(result.json ?? {}, result.status ?? 200);
  });
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  return { writes, faults, state, fixture };
}

const continueButton = (page: Page) => page.getByRole('button', { name: 'Vérifier les traductions', exact: true });
const importButton = (page: Page) => page.getByRole('button', { name: 'Importer 2 articles', exact: true });
const english = (page: Page) => page.getByRole('textbox', { name: `English · ${itemName}`, exact: true });
const mainLanguage = (page: Page) => page.getByRole('combobox', { name: 'Langue principale du menu', exact: true });
const autoTranslate = (page: Page) => page.getByRole('checkbox', { name: 'Traduire automatiquement en hébreu, français et anglais', exact: true });
async function extractURL(page: Page, restaurant = 1) {
  await page.goto(`/${restaurant}/menu/import`);
  await page.getByRole('button', { name: 'Site web', exact: true }).click();
  await page.getByRole('textbox', { name: 'Adresse de la page menu', exact: true }).fill('https://example.test/menu');
  await page.getByRole('button', { name: 'Importer le menu', exact: true }).click();
}
async function review(page: Page) {
  await extractURL(page);
  await continueButton(page).click();
}

for (const locale of ['fr', 'he']) test(`menu import rich review and translation responsive ${locale}`, async ({ page }, info) => {
  const state = await install(page, { locale });
  if (locale === 'he') (state.state.payload as RichExtraction).categories[0].items[0].modifier_sets![0].max_selections = 0;
  await page.setViewportSize({ width: locale === 'fr' ? 375 : 1440, height: 1000 });
  await page.goto('/1/menu/import');
  await expect(page.locator('input[type=file]')).toBeAttached();
  await page.screenshot({ path: info.outputPath(`menu-import-source-${locale}.png`) });
  await page.getByRole('button', { name: locale === 'fr' ? 'Site web' : 'אתר אינטרנט', exact: true }).click();
  await page.locator('input[type=url]').fill('https://example.test/menu');
  await page.getByRole('button', { name: locale === 'fr' ? 'Importer le menu' : 'משוך תפריט', exact: true }).click();
  const next = page.getByRole('button', { name: locale === 'fr' ? 'Vérifier les traductions' : 'בדיקת תרגומים', exact: true });
  await expect(next).toBeEnabled();
  await page.locator('summary').click();
  if (locale === 'he') await expect(page.getByText('אופציונלי · בחירות: 0–∞', { exact: true })).toBeVisible();
  await page.getByText(itemName, { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath(`menu-import-review-${locale}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await next.click();
  await english(page).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath(`menu-import-translations-${locale}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  expect(state.fixture.unhandled).toEqual([]);
});

test('menu import validates file type and size before uploading, and resets the input for retry', async ({ page }) => {
  const state = await install(page);
  await page.goto('/1/menu/import');
  const file = page.locator('input[type=file]');
  await file.setInputFiles({ name: 'menu.csv', mimeType: 'text/csv', buffer: Buffer.from('demo') });
  await expect(page.locator('main [role=alert]')).toContainText('Choisissez un fichier');
  await file.setInputFiles({ name: 'menu.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
  await expect(page.locator('main [role=alert]')).toContainText('10 Mio');
  expect(state.writes).toHaveLength(0);
  state.faults.extract = 1;
  const payload = { name: 'menu.pdf', mimeType: 'application/pdf', buffer: Buffer.from('synthetic isolated menu') };
  await file.setInputFiles(payload);
  await expect(page.locator('main [role=alert]')).toContainText('Échec synthétique');
  await file.setInputFiles(payload);
  await expect(continueButton(page)).toBeEnabled();
  expect(state.writes.filter(write => write.path === '/api/v1/menu/import')).toHaveLength(2);
});

test('menu import validates a public link and locks source controls during extraction', async ({ page }) => {
  const state = await install(page);
  state.faults.extractDelay = 900;
  await page.goto('/1/menu/import');
  await page.getByRole('button', { name: 'Lien Wolt', exact: true }).click();
  const url = page.getByRole('textbox', { name: 'Adresse de la page menu', exact: true });
  await url.fill('javascript:alert(1)');
  await url.press('Enter');
  await expect(page.locator('main [role=alert]')).toContainText('http:// ou https://');
  expect(state.writes).toHaveLength(0);
  await url.fill('https://example.test/wolt-menu');
  await url.press('Enter');
  await expect(url).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Photo ou PDF', exact: true })).toBeDisabled();
  await expect(continueButton(page)).toBeEnabled();
  expect(state.writes.filter(write => write.path.endsWith('/url'))).toHaveLength(1);
});

test('menu import extraction failures keep the entered URL for retry', async ({ page }) => {
  const state = await install(page); state.faults.extract = 1;
  await extractURL(page);
  await expect(page.locator('main [role=alert]')).toContainText('Échec synthétique');
  await expect(page.locator('input[type=url]')).toHaveValue('https://example.test/menu');
  await page.getByRole('button', { name: 'Importer le menu', exact: true }).click();
  await expect(continueButton(page)).toBeEnabled();
  expect(state.writes.filter(write => write.path.endsWith('/url'))).toHaveLength(2);
});

test('menu import translation preview failure is explicit and requires a successful retry', async ({ page }) => {
  const state = await install(page); state.faults.preview = 1;
  await extractURL(page);
  await expect(page.locator('main [role=alert]')).toContainText('L’aperçu des traductions a échoué');
  await expect(continueButton(page)).toBeDisabled();
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await continueButton(page).click();
  await expect(english(page)).toHaveValue(`EN ${itemName}`);
  expect(state.writes.filter(write => write.path.endsWith('/confirm'))).toHaveLength(0);
});

test('menu import may skip translation and preserves weight, absolute options, deltas, branding and restaurant scope', async ({ page }) => {
  const state = await install(page); state.faults.preview = 1;
  await extractURL(page, 2);
  await expect(page.locator('main [role=alert]')).toBeVisible();
  await autoTranslate(page).uncheck();
  await page.getByRole('checkbox', { name: 'Créer aussi une carte avec ces catégories comme sections', exact: true }).uncheck();
  await expect(page.getByText('Les articles sont ajoutés à la bibliothèque.', { exact: false })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Importer aussi le logo et la photo de couverture du restaurant', exact: true }).check();
  await mainLanguage(page).selectOption('he');
  await importButton(page).click();
  await expect(page).toHaveURL(/\/2\/menu\/items$/, { timeout: 20_000 });
  const write = state.writes.find(write => write.path.endsWith('/confirm'))!;
  expect(write).toMatchObject({ restaurant: 2, query: '?restaurant_id=2', body: { ...extraction, create_carte: false, import_branding: true, primary_locale: 'he', auto_translate: false } });
  expect(write.body).not.toHaveProperty('translations');
});

test('menu import source change keeps previous edits after failure and retries only the affected section', async ({ page }) => {
  const state = await install(page);
  await review(page);
  await english(page).fill('Manually corrected salad');
  const desc = page.getByRole('textbox', { name: 'English · Tomates confites et citron, servis avec une focaccia maison.', exact: true });
  await desc.fill('Description kept');
  const source = page.getByRole('combobox', { name: "Langue d'origine · Articles", exact: true });
  await source.focus();
  await source.selectOption('en');
  await expect(page.getByRole('alertdialog')).toContainText('remplace vos retouches');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(source).toBeFocused();
  await expect(english(page)).toHaveValue('Manually corrected salad');
  state.faults.preview = 1;
  await source.focus();
  await source.selectOption('en');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(page.locator('main [role=alert]')).toContainText('Échec synthétique');
  await expect(source).toHaveValue('fr');
  await expect(english(page)).toHaveValue('Manually corrected salad');
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect(source).toHaveValue('en');
  await expect(desc).toHaveValue('Description kept');
  expect(state.writes.filter(write => write.path.endsWith('/preview')).at(-1)?.body).toEqual({ groups: [{ source_locale: 'en', texts: [itemName, 'Fromage affiné'] }] });
});

test('menu import freezes translations during source preview and preserves empty reviewed values on confirmation', async ({ page }) => {
  const state = await install(page);
  await review(page);
  state.faults.previewDelay = 800;
  await page.getByRole('combobox', { name: "Langue d'origine · Catégories", exact: true }).selectOption('he');
  await expect(english(page)).toBeDisabled();
  await expect(importButton(page)).toBeDisabled();
  await expect(english(page)).toBeEnabled();
  await english(page).fill('');
  await importButton(page).click();
  await expect(page).toHaveURL(/\/1\/menu\/menus\/1$/, { timeout: 20_000 });
  expect(state.writes.find(write => write.path.endsWith('/confirm'))?.body).toMatchObject({ translations: { [itemName]: { en: '' } }, create_carte: true, import_branding: false, primary_locale: 'fr' });
});

test('menu import failed confirmation retains its draft and explains uncertainty before an explicit retry', async ({ page }) => {
  const state = await install(page); state.faults.confirm = 1;
  await review(page); await english(page).fill('Draft preserved');
  await importButton(page).click();
  await expect(page.locator('main [role=alert]')).toContainText('une deuxième carte');
  await expect(english(page)).toHaveValue('Draft preserved');
  await importButton(page).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  expect(state.writes.filter(write => write.path.endsWith('/confirm'))).toHaveLength(1);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect(page).toHaveURL(/\/1\/menu\/menus\/1$/, { timeout: 20_000 });
  const confirmations = state.writes.filter(write => write.path.endsWith('/confirm'));
  expect(confirmations).toHaveLength(2);
  expect(confirmations[1].body).toEqual(confirmations[0].body);
});

test('menu import serializes confirmation and disables all draft controls while saving', async ({ page }) => {
  const state = await install(page); state.faults.confirmDelay = 1000;
  await review(page);
  await importButton(page).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(english(page)).toBeDisabled();
  await expect(mainLanguage(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Retour', exact: true })).toBeDisabled();
  await expect(page).toHaveURL(/\/1\/menu\/menus\/1$/, { timeout: 20_000 });
  expect(state.writes.filter(write => write.path.endsWith('/confirm'))).toHaveLength(1);
});

test('menu import acknowledges the result before navigation and does not repeat the write', async ({ page }) => {
  const state = await install(page);
  await review(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(/\/1\/menu\/menus\/1(?:\?|$)/, async route => { await gate; await route.continue(); });
  await importButton(page).click();
  await expect(page.getByText('Import du catalogue confirmé', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Ouvrir le menu importé', exact: true }).click();
  expect(state.writes.filter(write => write.path.endsWith('/confirm'))).toHaveLength(1);
  expect(await page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })).toBe(false);
  release();
  await expect(page).toHaveURL(/\/1\/menu\/menus\/1$/, { timeout: 20_000 });
});

test('menu import restart protects the draft and resets the explicit primary-language choice', async ({ page }) => {
  await install(page);
  await extractURL(page); await expect(continueButton(page)).toBeEnabled();
  const guarded = () => page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; });
  expect(await guarded()).toBe(true);
  await mainLanguage(page).selectOption('he');
  const restart = page.getByRole('button', { name: 'Recommencer l’import', exact: true });
  await restart.click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(restart).toBeFocused();
  await expect(mainLanguage(page)).toHaveValue('he');
  await restart.click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Abandonner les modifications', exact: true }).click();
  expect(await guarded()).toBe(false);
  await page.getByRole('button', { name: 'Importer le menu', exact: true }).click();
  await expect(continueButton(page)).toBeEnabled();
  await expect(mainLanguage(page)).toHaveValue('fr');
});

test('menu import preserves the draft when the interface language changes', async ({ page }) => {
  const state = await install(page);
  await review(page); await english(page).fill('Draft retained');
  await page.getByRole('button', { name: 'Atelier Foody', exact: true }).click();
  await page.getByRole('dialog').getByRole('combobox').selectOption('en');
  await page.keyboard.press('Escape');
  await expect(english(page)).toHaveValue('Draft retained');
  await expect(page.getByRole('combobox', { name: 'Main menu language', exact: true })).toHaveValue('fr');
  expect(state.writes.filter(write => write.path.endsWith('/preview'))).toHaveLength(1);
});

test('menu import late confirmation does not redirect a user who left the workspace', async ({ page }) => {
  const state = await install(page);
  let release!: () => void;
  state.state.confirmGate = new Promise<void>(resolve => { release = resolve; });
  await review(page);
  const response = page.waitForResponse(response => response.url().includes('/import/confirm'));
  await importButton(page).click();
  await page.locator('a[href="/1/menu/items"]').first().click();
  await expect(page).toHaveURL(/\/1\/menu\/items$/, { timeout: 20_000 });
  release();
  await (await response).finished();
  await expect(page).toHaveURL(/\/1\/menu\/items$/, { timeout: 20_000 });
  expect(state.writes.filter(write => write.path.endsWith('/confirm'))).toHaveLength(1);
});

test('menu import rejects malformed or empty extraction without rendering a false review', async ({ page }) => {
  const state = await install(page); state.state.payload = { categories: [] };
  await extractURL(page);
  await expect(page.locator('main [role=alert]')).toContainText('No importable');
  await expect(continueButton(page)).toHaveCount(0);
  expect(state.writes.filter(write => write.path.endsWith('/preview'))).toHaveLength(0);
});

test('menu import requires menu.edit and makes no import requests for a read-only role', async ({ page }) => {
  const state = await install(page, { permissions: ['menu.view'] });
  await page.goto('/1/menu/import');
  await expect(page.getByRole('button', { name: 'Photo ou PDF', exact: true })).toHaveCount(0);
  await expect(page.locator('main')).toContainText(/autorisé|permission|accès/i);
  expect(state.writes).toHaveLength(0);
});

test('menu import retries a restaurant-language load before allowing extraction', async ({ page }) => {
  const state = await install(page);
  await page.goto('/1/menu/items');
  await expect(page.getByRole('button', { name: 'Actions', exact: true })).toBeVisible();
  state.faults.restaurant = 10;
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Importer le menu avec IA', exact: true }).click();
  await expect(page.locator('main [role=alert]')).toContainText('Échec synthétique');
  await expect(page.getByRole('button', { name: 'Photo ou PDF', exact: true })).toHaveCount(0);
  state.faults.restaurant = 0;
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Photo ou PDF', exact: true })).toBeEnabled();
  expect(state.writes).toHaveLength(0);
});
