import { expect, test, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

const handoverDate = '2026-11-28';
const stockSeries = '2026-11-27';
const productionUrl = `/1/orders/production?date=${handoverDate}`;
const availabilityAction = /Modifier la disponibilité$/;

async function install(page: Page, {
  readOnly = false,
  batch = true,
  reportedSeries = stockSeries,
  reportedItemSeries = reportedSeries,
}: {
  readOnly?: boolean;
  batch?: boolean;
  reportedSeries?: string;
  reportedItemSeries?: string;
} = {}) {
  const fixture = createFixture({ library: true });
  const item = fixture.items[0];
  const writes: { series: string | null; body: unknown }[] = [];
  const stockReads: { series: string | null; itemId: string | null }[] = [];
  let availabilityState = 'available';
  let override = 'auto';
  const part = {
    date: handoverDate,
    categories: [{ id: 1, name: 'Salades', measure: 'unit', item_ids: [item.id] }],
    items: [{ menu_item_id: item.id, name: item.name, category_id: 1, measure: 'unit', unit: 'u', total: 3 }],
    orders: [{ order_id: 1, customer_name: 'Client démo', order_type: 'pickup', cells: { [item.id]: 3 }, prepared: false }],
  };
  await page.addInitScript(({ readOnly }) => {
    localStorage.setItem('foody_restaurant_portal_session', 'fp1p.e30.fixture.00');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({
      id: 1, full_name: 'Équipe démo', role: readOnly ? 'staff' : 'owner', email: 'demo@foody.test',
    }));
    localStorage.setItem('foody_restaurant_ids', '[1]');
    localStorage.setItem('foody-admin-locale', 'fr');
  }, { readOnly });
  await page.routeWebSocket('**/*', socket => socket.close());
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (readOnly && url.pathname === '/api/v1/users/me') {
      return route.fulfill({ json: { permissions: ['orders.view', 'kitchen.view', 'menu.view'], role_name: 'Observer' } });
    }
    if (url.pathname === '/api/v1/orders/production-sheet/days') {
      return route.fulfill({ json: { days: [{ date: handoverDate, order_count: 1 }] } });
    }
    if (url.pathname === '/api/v1/orders/production-sheet') {
      return route.fulfill({ json: {
        ...part,
        stock_series_key: batch ? stockSeries : '',
        sections: [{ menu_id: 1, name: 'Carte démo', is_catering: false, sheet: part }],
      } });
    }
    if (url.pathname.endsWith('/batch-fulfillment-config')) {
      return route.fulfill({ json: { ...fixture.batchConfig, enabled: batch } });
    }
    if (url.pathname === '/api/v1/menu/sales-stock') {
      const itemId = url.searchParams.get('item_id');
      stockReads.push({ series: url.searchParams.get('serie_date'), itemId });
      return route.fulfill({ json: { series_key: itemId ? reportedItemSeries : reportedSeries, rows: [{
        item: { ...item, availability_override: batch ? 'force_sold_out' : override },
        managed: batch,
        config: batch && override !== 'auto' ? { override, counters: [] } : null,
        previous: null,
        sizes: [],
        availability: { availability_state: availabilityState, buildable_count: null },
      }] } });
    }
    if (url.pathname === `/api/v1/menu/items/${item.id}/sales-stock/availability`) {
      const body = request.postDataJSON();
      writes.push({ series: url.searchParams.get('serie_date'), body });
      override = body.override;
      availabilityState = override === 'force_sold_out' ? 'sold_out' : 'available';
      return route.fulfill({ status: 204 });
    }
    const result = fixture.response(request.url(), request.method(), request.postDataJSON() ?? {}, 1);
    return route.fulfill({ status: result.status ?? 200, json: result.json ?? {} });
  });
  const appHost = new URL(test.info().project.use.baseURL ?? 'http://localhost:3103').hostname;
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    const inFixture = url.pathname.startsWith('/api/v1/') || [appHost, 'localhost', '127.0.0.1'].includes(url.hostname);
    return inFixture ? route.fallback() : route.abort();
  });
  await page.goto(productionUrl);
  return { item, stockReads, writes };
}

function tabs(page: Page) {
  return page.getByRole('group', { name: 'Plan de production', exact: true });
}

for (const width of [1440, 390]) {
  test(`retains Articles and edits only its selling series at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    const { item, stockReads, writes } = await install(page);
    await expect(tabs(page).getByRole('button', { name: 'Clients' })).toHaveAttribute('aria-pressed', 'true');
    await tabs(page).getByRole('button', { name: 'Articles' }).click();
    await page.goto('/1/menu/items');
    await page.goto(productionUrl);
    await expect(tabs(page).getByRole('button', { name: 'Articles' })).toHaveAttribute('aria-pressed', 'true');
    const card = page.getByRole('group', { name: item.name, exact: true });
    const badge = card.getByRole('button', { name: 'Disponible — Modifier la disponibilité' });
    await expect(badge).toHaveClass(/list-availability-pill/);
    await expect(badge).toHaveCSS('min-height', width === 390 ? '44px' : '30px');
    expect(stockReads.every(read => read.series === stockSeries && read.itemId === null)).toBe(true);
    await badge.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(stockSeries);
    await dialog.getByRole('radio', { name: 'Indisponible', exact: true }).click();
    expect(writes).toEqual([]);
    await dialog.getByRole('button', { name: 'Appliquer', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(writes).toEqual([{ series: stockSeries, body: { override: 'force_sold_out' } }]);
    expect(stockReads.filter(read => read.itemId)).toEqual([
      { series: stockSeries, itemId: String(item.id) },
      { series: stockSeries, itemId: String(item.id) },
    ]);
    await expect(card.getByRole('button', { name: 'Rupture de stock — Modifier la disponibilité' })).toBeVisible();
    await expect(card).toContainText('3');

    await tabs(page).getByRole('button', { name: 'Clients' }).click();
    if (width === 390) await page.getByRole('button', { name: /Client démo/ }).click();
    const clientBadge = page.getByRole('button', { name: 'Rupture de stock — Modifier la disponibilité' });
    await clientBadge.click();
    await expect(dialog).toContainText(stockSeries);
    await page.keyboard.press('Escape');
    await expect(clientBadge).toBeFocused();
    await expect(page).toHaveURL(productionUrl);
    expect(writes).toHaveLength(1);
  });
}

test('a viewer can read the plan without any stock controls or requests', async ({ page }) => {
  const { item, stockReads, writes } = await install(page, { readOnly: true });
  await expect(page.getByRole('columnheader').filter({ hasText: item.name })).toBeVisible();
  await expect(page.getByRole('button', { name: availabilityAction })).toHaveCount(0);
  await tabs(page).getByRole('button', { name: 'Articles' }).click();
  const card = page.getByRole('group', { name: item.name, exact: true });
  await expect(card).toBeVisible();
  await expect(card.getByRole('button', { name: availabilityAction })).toHaveCount(0);
  expect(stockReads).toEqual([]);
  expect(writes).toEqual([]);
});

test('a stock response for a different series cannot be applied', async ({ page }) => {
  const { item, writes } = await install(page, { reportedItemSeries: handoverDate });
  await tabs(page).getByRole('button', { name: 'Articles' }).click();
  await page.getByRole('group', { name: item.name, exact: true }).getByRole('button', { name: availabilityAction }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Appliquer', exact: true })).toHaveCount(0);
  expect(writes).toEqual([]);
});

test('the plan does not display status from a different series', async ({ page }) => {
  const { writes } = await install(page, { reportedSeries: handoverDate });
  await expect(page.getByText('Impossible de charger ou de modifier le stock. Réessayez.')).toBeVisible();
  await expect(page.getByRole('button', { name: availabilityAction })).toHaveCount(0);
  expect(writes).toEqual([]);
});

test('the plan can edit restaurant-wide stock when batch ordering is disabled', async ({ page }) => {
  const { stockReads, writes } = await install(page, { batch: false, reportedSeries: handoverDate });
  await page.getByRole('button', { name: availabilityAction }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: 'Indisponible', exact: true }).click();
  await expect(dialog).not.toContainText(handoverDate);
  await dialog.getByRole('button', { name: 'Appliquer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Rupture de stock — Modifier la disponibilité' })).toBeVisible();
  expect(stockReads.slice(0, 2).map(read => read.series)).toEqual(['', '']);
  expect(writes).toEqual([{ series: handoverDate, body: { override: 'force_sold_out' } }]);
});

test('Clients can open the shared stock dialog in full screen', async ({ page }) => {
  const { writes } = await install(page);
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Plein écran' }).click();
  await expect(page.getByRole('button', { name: 'Quitter le plein écran' })).toBeVisible();
  const badge = page.getByRole('button', { name: availabilityAction });
  await badge.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(stockSeries);
  await dialog.getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(badge).toBeFocused();
  expect(writes).toEqual([]);
});
