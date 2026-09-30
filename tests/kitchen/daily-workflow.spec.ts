import { test, expect, type Page } from '@playwright/test';

// All API calls are intercepted. This suite never writes restaurant data.
async function mockKitchen(page: Page, options: { emptyPlan?: boolean; failStock?: boolean } = {}) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
  let status = 'open';
  let received = false;
  let produced = false;
  const writes: { path: string; body: unknown }[] = [];
  const stock = { id: 11, name: 'Cabillaud', quantity: 12, unit: 'kg', cost_per_unit: 10, reorder_threshold: 15, is_active: true, supplier: 'Poissonnerie' };
  const prep = { id: 21, name: 'Fish pané', quantity: 2, unit: 'unit', yield_per_batch: 10, reorder_threshold: 5, is_active: true, shelf_life_hours: 24, category: 'Poissons' };
  const plan = { prep_item_id: prep.id, prep_item_name: prep.name, unit: prep.unit, current_qty: 2, required_qty: 12, shortfall_qty: 10, batches_needed: 1, yield_per_batch: 10, shelf_life_hours: 24, category: 'Poissons', priority: 'high' };
  await page.addInitScript(() => {
    localStorage.setItem('foody_restaurant_token', 'mock-kitchen-session');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Test chef', role: 'manager' }));
    localStorage.setItem('foody_restaurant_ids', '[1]');
    localStorage.setItem('foody_remember', '1');
    localStorage.setItem('foody-admin-locale', 'fr');
  });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
      return;
    }
    if (request.method() !== 'GET') writes.push({ path, body: request.postDataJSON() });
    if (path.endsWith('/close')) status = 'closed';
    if (path.endsWith('/receive')) received = true;
    if (path.endsWith('/produce')) produced = true;
    const report = { id: 31, restaurant_id: 1, report_date: `${date}T00:00:00Z`, status, sales_source: 'aviv', total_sales_revenue: 5718, items: [
      { id: 1, stock_item_id: 11, item_name: 'Cabillaud', unit: 'kg', opening_stock: 2, received_qty: 10, closing_stock: 1.25, closing_stock_counted: false, theoretical_usage: 10.75, actual_usage: 10.75, cost_per_unit: 10, variance: 0, variance_percent: 0, variance_cost: 0, waste_qty: 0 },
    ], sales: [{ id: 1, menu_item_id: 42, menu_item_name: 'Signature', quantity: 86, source: 'aviv' }] };
    let data: unknown = {};
    if (path === '/api/v1/restaurants/1') data = { restaurant: { id: 1, name: 'Test cuisine', currency: 'ILS' } };
    else if (path.endsWith('/users/me')) data = { permissions: ['kitchen.manage', 'kitchen.view'], role_name: 'Owner' };
    else if (path.includes('/daily-reports')) data = { report, reports: [], purchase_orders: [] };
    else if (path.endsWith('/stock/items')) {
      if (options.failStock) { await route.fulfill({ status: 500, json: { error: 'Stock unavailable' }, headers: { 'Access-Control-Allow-Origin': '*' } }); return; }
      data = { items: [stock] };
    } else if (path.endsWith('/stock/transactions')) data = { transactions: [] };
    else if (path.endsWith('/daily-plan')) data = { items: options.emptyPlan || produced ? null : [plan] };
    else if (path.endsWith('/prep/items')) data = { items: [{ ...prep, quantity: produced ? 12 : 2 }] };
    else if (path.endsWith('/preview')) data = { ingredients: [{ stock_item_id: 11, stock_item_name: 'Cabillaud', quantity_used: 1, unit: 'kg' }], insufficient: null };
    else if (path.endsWith('/purchase-orders')) data = { orders: received ? [] : [{ id: 41, supplier: { name: 'Poissonnerie' }, status: 'sent', items: [{ id: 51, name: 'Cabillaud', quantity: 10, unit: 'kg' }] }] };
    else if (path.includes('/categories')) data = { categories: [] };
    await route.fulfill({ json: data, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await page.goto('/1/kitchen/daily-operations');
  await expect(page.getByText('Livraisons à vérifier', { exact: true })).toBeVisible();
  return writes;
}

test('chef can review delivery, confirm a batch, and close without inventory', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const writes = await mockKitchen(page);
  await expect(page.getByText('86', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Que faut-il saisir ?', { exact: true })).toBeHidden();
  await page.screenshot({ path: 'test-results/kitchen-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Vérifier la livraison', exact: true }).click();
  const confirmReceipt = page.getByRole('button', { name: 'Confirmer la réception', exact: true });
  await expect(confirmReceipt).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Ligne vérifiée: Cabillaud' }).check();
  await confirmReceipt.click();
  await expect(page.getByText('Aucune commande fournisseur envoyée en attente de réception.')).toBeVisible();
  await page.getByRole('button', { name: 'Enregistrer un lot terminé', exact: true }).first().click();
  await page.getByRole('button', { name: 'Aperçu', exact: true }).click();
  const productionModal = page.locator('div.fixed.inset-0').filter({ hasText: 'Confirmez uniquement lorsque le lot est prêt.' });
  await productionModal.getByRole('button', { name: 'Enregistrer un lot terminé', exact: true }).click();
  await expect(page.getByText('Aucune recommandation de production.', { exact: false }).first()).toBeVisible();
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Clôturer la journée', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Réouvrir la journée', exact: true })).toBeVisible();
  expect(writes.some((write) => write.path.endsWith('/closing-stock'))).toBe(false);
  expect(writes.filter((write) => write.path.endsWith('/receive'))).toHaveLength(1);
  expect(writes.filter((write) => write.path.endsWith('/produce'))).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('empty recommendations do not claim service coverage; tablet stays within viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await mockKitchen(page, { emptyPlan: true });
  await expect(page.getByText('0/0', { exact: true })).toHaveCount(0);
  await page.getByText('Vérifier le prochain service', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Besoin pour le prochain service (unit)' }).fill('12');
  await expect(page.getByText('À produire: 10.00 unit')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/kitchen-tablet.png', fullPage: true });
});

test('stock load failure is visible and does not render a green zero alert', async ({ page }) => {
  await mockKitchen(page, { failStock: true });
  await expect(page.getByRole('alert').filter({ hasText: 'Stock unavailable' })).toBeVisible();
  await expect(page.getByText('Aucune alerte de stock actuellement.', { exact: true })).toHaveCount(0);
});
