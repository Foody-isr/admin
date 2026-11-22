import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

const [currentDay, nextDay, unpublishedDay] = ['2026-11-27', '2026-12-04', '2026-12-11'];

async function install(page: Page, { locale = 'fr', noMenus = false, restaurantId = 1, rotating = false } = {}) {
  const fixture = createFixture();
  const base = fixture.items[0];
  const oldItem = { ...base, id: 105, name: 'Article ancienne série' };
  const nextItem = { ...base, id: 106, name: 'Article prochaine série' };
  const sharedItem = { ...base, id: 107, name: 'Article suivi par série' };
  const libraryItems = [
    ...fixture.items,
    { ...base, id: 101, name: 'Article hors carte', price: 19, option_sets: [], modifiers: [] },
    { ...base, id: 102, name: 'Article désactivé', is_active: false },
    { ...base, id: 103, name: 'Article épuisé', availability_state: 'sold_out' },
    { ...base, id: 104, name: 'Article personnalisable', option_sets: [{ id: 10, name: 'Format', options: [
      { id: 41, name: 'Petit format', price: 25, is_active: true },
      { id: 42, name: 'Grand format', price: 40, is_active: true },
    ] }], modifiers: [{ id: 51, name: 'Supplément démo', is_active: true, price_delta: 3 }] },
    ...(rotating ? [oldItem, nextItem, sharedItem] : []),
  ];
  const menu = { ...fixture.menus[0], is_weekly_rotating: rotating, publication_enabled: rotating, groups: [
    { id: 1, name: 'Groupe principal', items: rotating ? [base, oldItem, nextItem, sharedItem] : [base] },
    { id: 2, name: 'Autre groupe', items: [base] },
  ] };
  const catalogRequests: { restaurant: string | undefined; query: string | null }[] = [];
  const seriesRequests: { restaurant: string | undefined; date: string | null }[] = [];
  const control = { nextGate: null as Promise<void> | null, nextResponseDate: nextDay };
  const orders: Record<string, unknown>[] = [];
  await page.addInitScript(({ locale, restaurantId }) => {
    localStorage.setItem('foody_restaurant_portal_session', 'fp1p.e30.fixture.00');
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
    if (path === '/api/v1/menu') {
      const date = url.searchParams.get('serie_date');
      if (!rotating || !date) return route.fulfill({ json: { menus: noMenus ? [] : [menu] } });
      seriesRequests.push({ restaurant: request.headers()['x-restaurant-id'], date });
      if (date === nextDay && control.nextGate) await control.nextGate;
      const items = date === currentDay ? [base, { ...sharedItem, availability_state: 'sold_out' }]
        : date === nextDay ? [nextItem, { ...sharedItem, availability_state: 'available' }] : [];
      return route.fulfill({ json: {
        serie_date: date === nextDay ? control.nextResponseDate : date,
        menus: [{ ...menu, groups: items.length ? [{ ...menu.groups[0], items }] : [] }],
      } });
    }
    if (path.endsWith('/staff-batch-fulfillment-config')) return route.fulfill({ json: {
      enabled: rotating,
      upcoming_cycles: rotating ? [currentDay, nextDay, unpublishedDay].map((date, index) => ({
        ordering_closed: index === 0,
        fulfillment_days: [{ date, day_name: 'Friday', pickup_window: { start: '10:00', end: '14:00' } }],
      })) : [],
    } });
    if (path === '/api/v1/orders' && request.method() === 'POST') {
      orders.push(request.postDataJSON());
      return route.fulfill({ json: { order: { id: 999 } } });
    }
    const result = fixture.response(request.url(), request.method(), request.postDataJSON() ?? {}, restaurantId);
    return route.fulfill({ status: result.status ?? 200, json: result.json ?? {} });
  });
  return { fixture, catalogRequests, orders, seriesRequests, control };
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
  await ticket(page).getByRole('button', { name: 'Continuer', exact: true }).click();
  const dialog = page.getByRole('region', { name: 'Finaliser la commande', exact: true });
  await dialog.getByRole('combobox', { name: 'Nom du client', exact: true }).fill('Client démo');
  await dialog.getByRole('combobox', { name: 'Numéro de téléphone', exact: true }).fill('0500000000');
  await dialog.getByRole('button', { name: 'Continuer', exact: true }).click();
  await dialog.getByRole('radio', { name: 'Payer plus tard', exact: true }).check();
  await dialog.getByRole('group', { name: 'Ajouter au plan de production', exact: true }).getByRole('radio', { name: 'Non', exact: true }).check();
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

test('the current staff series shows its published items while the library includes off-series items', async ({ page }) => {
  const state = await install(page, { restaurantId: 2, rotating: true });
  await page.goto('/2/orders/new');
  await expect(page.getByRole('combobox', { name: 'Choisir une série' })).toHaveValue('0');
  await expect(page.getByRole('button', { name: /^Salade méditerranéenne/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Article suivi par série/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /^Article ancienne série/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Article prochaine série/ })).toHaveCount(0);
  expect(state.seriesRequests).toEqual([{ restaurant: '2', date: currentDay }]);

  await library(page).click();
  await expect(page.getByRole('button', { name: /^Article hors carte/ })).toBeVisible();
  await page.getByRole('button', { name: /^Article ancienne série/ }).click();
  await expect(ticket(page)).toContainText('Article ancienne série');
});

test('switching series ignores an earlier response and leaves an unpublished series empty', async ({ page }) => {
  const state = await install(page, { rotating: true });
  let releaseNext = () => {};
  state.control.nextGate = new Promise<void>((resolve) => { releaseNext = resolve; });
  await page.goto('/1/orders/new');
  await expect(page.getByRole('button', { name: /^Salade méditerranéenne/ })).toBeVisible();
  const selector = page.getByRole('combobox', { name: 'Choisir une série' });
  try {
    await selector.selectOption('1');
    await expect.poll(() => state.seriesRequests.at(-1)?.date).toBe(nextDay);
    await expect(page.getByRole('button', { name: /^Salade méditerranéenne/ })).toHaveCount(0);
    await selector.selectOption('2');
    await expect(page.getByText('Aucun article trouvé', { exact: true })).toBeVisible();
    const nextResponse = page.waitForResponse((response) => new URL(response.url()).searchParams.get('serie_date') === nextDay);
    releaseNext();
    await nextResponse;
    await expect(selector).toHaveValue('2');
    await expect(page.getByRole('button', { name: /^Article prochaine série/ })).toHaveCount(0);
    await expect(page.getByText('Aucun article trouvé', { exact: true })).toBeVisible();

    await selector.selectOption('1');
    await expect(page.getByRole('button', { name: /^Article prochaine série/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Article suivi par série/ })).toBeEnabled();
    await page.getByRole('button', { name: /^Article suivi par série/ }).click();
    await expect(ticket(page)).toContainText('Article suivi par série');
  } finally {
    releaseNext();
  }
});

test('a response for the wrong series is rejected and can be retried', async ({ page }) => {
  const state = await install(page, { rotating: true });
  state.control.nextResponseDate = currentDay;
  await page.goto('/1/orders/new');
  await page.getByRole('combobox', { name: 'Choisir une série' }).selectOption('1');
  await expect(page.getByText('Impossible de charger ces données. Réessayez.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Article prochaine série/ })).toHaveCount(0);
  state.control.nextResponseDate = nextDay;
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Article prochaine série/ })).toBeVisible();
});
