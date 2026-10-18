import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

async function install(page: Page, { locale = 'fr', noMenus = false, restaurantId = 1, rotating = false } = {}) {
  const fixture = createFixture();
  const base = fixture.items[0];
  const libraryItems = [
    ...fixture.items,
    { ...base, id: 101, name: 'Article hors carte', price: 19, option_sets: [], modifiers: [] },
    { ...base, id: 102, name: 'Article désactivé', is_active: false },
    { ...base, id: 103, name: 'Article épuisé', availability_state: 'sold_out' },
    { ...base, id: 104, name: 'Article personnalisable', option_sets: [{ id: 10, name: 'Format', options: [
      { id: 41, name: 'Petit format', price: 25, is_active: true },
      { id: 42, name: 'Grand format', price: 40, is_active: true },
    ] }], modifiers: [{ id: 51, name: 'Supplément démo', is_active: true, price_delta: 3 }] },
  ];
  const menu = { ...fixture.menus[0], is_weekly_rotating: rotating, groups: [
    { id: 1, name: 'Groupe principal', items: [base] },
    { id: 2, name: 'Autre groupe', items: [base] },
  ] };
  const catalogRequests: { restaurant: string | undefined; query: string | null }[] = [];
  const orders: Record<string, unknown>[] = [];
  await page.addInitScript(({ locale, restaurantId }) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'owner' }));
    localStorage.setItem('foody_restaurant_ids', JSON.stringify([restaurantId]));
    localStorage.setItem('foody-admin-locale', locale);
  }, { locale, restaurantId });
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/\/$/, '');
    if (path === '/api/v1/menu/items') {
      catalogRequests.push({ restaurant: request.headers()['x-restaurant-id'], query: url.searchParams.get('restaurant_id') });
      return route.fulfill({ json: { items: libraryItems } });
    }
    if (path === '/api/v1/menu') return route.fulfill({ json: { menus: noMenus ? [] : [menu] } });
    if (path.endsWith('/staff-batch-fulfillment-config')) return route.fulfill({ json: { enabled: false, upcoming_cycles: [] } });
    if (/\/menu\/groups\/\d+\/memberships$/.test(path)) return route.fulfill({ json: { memberships: [] } });
    if (path === '/api/v1/orders' && request.method() === 'POST') {
      orders.push(request.postDataJSON());
      return route.fulfill({ json: { order: { id: 999 } } });
    }
    const result = fixture.response(request.url(), request.method(), request.postDataJSON() ?? {}, restaurantId);
    return route.fulfill({ status: result.status ?? 200, json: result.json ?? {} });
  });
  return { fixture, catalogRequests, orders };
}

const library = (page: Page) => page.getByRole('button', { name: 'Librairie d’articles', exact: true });
const ticket = (page: Page) => page.getByRole('complementary', { name: 'Articles de la commande', exact: true });

test('library adds off-menu items alongside carte items and submits the existing order payload', async ({ page }) => {
  const state = await install(page);
  await page.goto('/1/orders/new');
  await expect(page.getByRole('button', { name: /^Article hors carte/ })).toHaveCount(0);
  await page.getByRole('button', { name: /^Salade méditerranéenne/ }).first().click();
  await page.getByRole('button', { name: 'Groupe principal', exact: true }).click();
  await library(page).click();
  await expect(page.getByRole('button', { name: /Salade méditerranéenne/ })).toHaveCount(1);
  await page.getByRole('button', { name: /^Article hors carte/ }).click();
  await expect(ticket(page)).toContainText('Article hors carte');
  await expect(ticket(page)).toContainText('Salade méditerranéenne');
  await page.getByRole('button', { name: 'Carte du jour', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Autre groupe', exact: true })).toBeVisible();
  await expect(ticket(page)).toContainText('Article hors carte');
  await ticket(page).getByRole('button', { name: /^Encaisser/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Nom du client', exact: true }).fill('Client démo');
  await dialog.getByRole('combobox', { name: 'Numéro de téléphone', exact: true }).fill('0500000000');
  await dialog.getByRole('button', { name: /^Créer la commande/ }).click();
  await expect.poll(() => state.orders.length).toBe(1);
  expect(state.orders[0].items).toEqual([
    { menu_item_id: 1, quantity: 1, modifiers: [] },
    { menu_item_id: 101, quantity: 1, modifiers: [] },
  ]);
});

test('library searches all active items and keeps sold-out items disabled', async ({ page }) => {
  await install(page);
  await page.goto('/1/orders/new');
  await library(page).click();
  await expect(page.getByRole('button', { name: /^Article désactivé/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Article épuisé/ })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Rechercher des articles...', exact: true }).fill('HORS CARTE');
  await expect(page.getByRole('button', { name: /^Article hors carte/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Salade méditerranéenne/ })).toHaveCount(0);
});

test('library retains absolute variant prices and modifier deltas', async ({ page }) => {
  await install(page);
  await page.goto('/1/orders/new');
  await library(page).click();
  await page.getByRole('button', { name: /^Article personnalisable/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: /Grand format/ }).check();
  await dialog.getByRole('checkbox', { name: /Supplément démo/ }).check();
  await dialog.getByRole('button', { name: /^Ajouter à la commande/ }).click();
  await expect(ticket(page)).toContainText('Grand format');
  await expect(ticket(page)).toContainText('Supplément démo');
  await expect(ticket(page)).toContainText('43.00');
});

for (const [locale, label] of [['fr', 'Librairie d’articles'], ['he', 'ספריית פריטים'], ['en', 'Article library']]) {
  test(`library works without any menu on mobile in ${locale}`, async ({ page }, info) => {
    const state = await install(page, { locale, noMenus: true, restaurantId: 2 });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/2/orders/new');
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: /^Article hors carte/ }).click();
    expect(state.catalogRequests.length).toBeGreaterThan(0);
    expect(state.catalogRequests.every(request => request.restaurant === '2' && request.query === '2')).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`library-${locale}.png`) });
  });
}

test('library is independent of the rotating menu composition', async ({ page }) => {
  await install(page, { rotating: true });
  await page.goto('/1/orders/new');
  await library(page).click();
  await expect(page.getByRole('button', { name: /^Article hors carte/ })).toBeVisible();
  await page.getByRole('button', { name: /^Article hors carte/ }).click();
  await expect(ticket(page)).toContainText('Article hors carte');
});
