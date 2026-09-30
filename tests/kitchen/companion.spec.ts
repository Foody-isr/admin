import { test, expect, type Page } from '@playwright/test';

const preparations = [
  { prep_item_id: 1, prep_item_name: 'Pink Tartare', unit: 'unit', current_qty: 0, required_qty: 24, shortfall_qty: 24, batches_needed: 2, yield_per_batch: 12, category: 'Poisson', priority: 'high' },
  { prep_item_id: 2, prep_item_name: 'Signature', unit: 'unit', current_qty: 8, required_qty: 32, shortfall_qty: 24, batches_needed: 2, yield_per_batch: 12, category: 'Sauces', priority: 'medium' },
  { prep_item_id: 3, prep_item_name: 'Minituna', unit: 'unit', current_qty: 36, required_qty: 30, shortfall_qty: 0, batches_needed: 0, yield_per_batch: 12, category: 'Poisson', priority: 'low' },
];
const items = [
  { id: 1, stock_item_id: 1, item_name: 'Cheddar', unit: 'kg', opening_stock: 2.4, received_qty: 0, theoretical_usage: 1.3, waste_qty: 0, closing_stock: 0, closing_stock_counted: false, variance: 0, variance_cost: 0, variance_percent: 0, cost_per_unit: 45 },
  { id: 2, stock_item_id: 2, item_name: 'Pain hamburger', unit: 'unit', opening_stock: 20, received_qty: 0, theoretical_usage: 24, waste_qty: 0, closing_stock: 0, closing_stock_counted: false, variance: 0, variance_cost: 0, variance_percent: 0, cost_per_unit: 3 },
];

async function fixture(page: Page, { failed = false, viewer = false, locale = 'fr' } = {}) {
  const writes: string[] = [];
  await page.addInitScript(({ locale }) => {
    localStorage.setItem('foody_restaurant_token', 'kitchen-local-test');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Chef démo', role: 'owner' }));
    localStorage.setItem('foody_restaurant_ids', '[1]');
    localStorage.setItem('foody-admin-locale', locale);
  }, { locale });
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET') writes.push(path);
    let body: object = {};
    if (path === '/api/v1/restaurants/1') body = { restaurant: { id: 1, name: 'Atelier Foody', currency: 'ILS', timezone: 'Asia/Jerusalem', opening_hours_config: {} } };
    else if (path === '/api/v1/users/me') body = { permissions: viewer ? ['kitchen.view'] : ['kitchen.view', 'kitchen.manage'], role_name: viewer ? 'Kitchen observer' : 'Owner' };
    else if (path === '/api/v1/prep/daily-plan') {
      if (failed) return route.fulfill({ status: 503, json: { message: 'unavailable' } });
      body = { items: preparations };
    }
    else if (path === '/api/v1/prep/items') body = { items: preparations.map(p => ({ id: p.prep_item_id, name: p.prep_item_name, quantity: p.current_qty, unit: p.unit, yield_per_batch: p.yield_per_batch, category: p.category, is_active: true })) };
    else if (path.endsWith('/kitchen-summary')) body = { summary: { stocks: items.map(i => ({ stock_item_id: i.stock_item_id, name: i.item_name, unit: i.unit, opening_qty: i.opening_stock, received_qty: 0, production_usage: 0, order_usage: i.theoretical_usage, pending_usage: 0, adjustment_qty: 0, waste_qty: 0, expected_remaining: i.opening_stock - i.theoretical_usage, counted_remaining: null, unexplained_qty: null })), preparations: [], unmapped_sales: 0 } };
    else if (path === '/api/v1/stock/items') body = { items: [{ id: 1, name: 'Cheddar', quantity: 1.1, unit: 'kg', is_active: true, reorder_threshold: 2 }, { id: 2, name: 'Pain hamburger', quantity: -4, unit: 'unit', is_active: true, reorder_threshold: 10 }] };
    else if (path === '/api/v1/stock/forecast') body = { forecast: { sample_days: 6, top_items: [{ menu_item_id: 1, menu_item_name: 'Pink Tartare', predicted_qty: 24 }, { menu_item_id: 2, menu_item_name: 'Signature', predicted_qty: 32 }, { menu_item_id: 3, menu_item_name: 'Minituna', predicted_qty: 30 }] } };
    else if ((path === '/api/v1/stock/daily-reports/today' || path.endsWith('/compute'))) body = { report: { id: 10, status: 'open', report_date: '2026-10-01', items, sales: [{ id: 1, menu_item_id: 1, menu_item_name: 'Pink Tartare', quantity: 12, source: 'pos' }, { id: 2, menu_item_id: 2, menu_item_name: 'Signature', quantity: 24, source: 'pos' }], total_sales_revenue: 2400 } };
    else if (path === '/api/v1/stock/daily-reports') body = { reports: [] };
    else if (path.includes('purchase-orders')) body = { orders: [] };
    else if (path.includes('transactions')) body = { transactions: [] };
    else if (path.includes('item-categories')) body = { categories: [] };
    await route.fulfill({ json: body });
  });
  await page.goto('/1/kitchen/daily-operations');
  await expect(page.getByRole('heading', { name: locale === 'he' ? 'שותף המטבח' : 'Compagnon de cuisine', exact: true })).toBeVisible();
  // Initial automatic report calculation is complete; interactions below must stay read-only.
  writes.length = 0;
  return writes;
}

test('briefing, phase navigation, simulation and physical checks', async ({ page }) => {
  const writes = await fixture(page);
  await expect(page.getByText('Prenez une longueur d’avance.')).toBeVisible();
  await page.screenshot({ path: 'test-results/kitchen/companion-opening.png', fullPage: true });
  await page.getByRole('tab', { name: /Pendant le service/ }).click();
  const target = page.getByRole('spinbutton', { name: 'Besoin du service — Minituna' });
  await target.fill('61');
  await expect(target.locator('..')).toContainText('25 unit');
  expect(writes).toEqual([]);
  await page.screenshot({ path: 'test-results/kitchen/companion-service.png', fullPage: true });
  await page.getByRole('tab', { name: /Bilan du jour/ }).click();
  await expect(page.getByText('Reste attendu', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Contrôler le reste' }).first().click();
  await expect(page.getByLabel('Stock physique restant (unit)')).toHaveValue('');
  await page.screenshot({ path: 'test-results/kitchen/companion-closing.png', fullPage: true });
  await page.locator('input[type=date]').fill('2026-09-12');
  await expect(page.getByText(/Aucun bilan enregistré à cette date/)).toBeVisible();
  expect(writes).toEqual([]);
});

test('failed planning is unknown rather than all ready; viewer cannot write', async ({ page }) => {
  await fixture(page, { failed: true, viewer: true });
  await expect(page.getByText('Complétons la vue d’ensemble.')).toBeVisible();
  await page.getByRole('tab', { name: /Bilan du jour/ }).click();
  await expect(page.getByRole('button', { name: 'Contrôler le reste' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Clôturer la journée', exact: true })).toHaveCount(0);
});

test('Hebrew layout and keyboard phase navigation on tablet', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 1366 });
  await fixture(page, { locale: 'he' });
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const tabs = page.getByRole('tab');
  await tabs.nth(0).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 1024);
  await page.screenshot({ path: 'test-results/kitchen/companion-hebrew-tablet.png', fullPage: true });
});

test('physical zero counts are saved explicitly and other counts remain optional', async ({ page }) => {
  const writes = await fixture(page);
  await page.getByRole('tab', { name: /Bilan du jour/ }).click();
  await page.getByRole('button', { name: 'Contrôler le reste' }).first().click();
  await page.getByLabel('Stock physique restant (unit)').fill('0');
  const savedCount = page.waitForRequest(request => request.url().endsWith('/closing-stock'));
  await page.getByRole('button', { name: 'Enregistrer ce contrôle' }).click();
  expect((await savedCount).postDataJSON()).toEqual({ items: [{ stock_item_id: 2, quantity: 0 }] });
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Clôturer la journée', exact: true }).click();
  await expect.poll(() => writes).toContain('/api/v1/stock/daily-reports/10/close');
});

test('admin remains responsive on a phone while POS has its own iPad gate', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const writes = await fixture(page);
  await page.getByRole('tab', { name: /Pendant le service/ }).click();
  await expect(page.getByRole('spinbutton', { name: 'Besoin du service — Minituna' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(writes).toEqual([]);
});
