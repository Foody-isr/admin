import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

async function setup(page: Page, { locale = 'fr', denied = false, fail = false } = {}) {
  const fixture = createFixture({ denied });
  let historyReads = 0;
  let failed = fail;
  const requests: URL[] = [];
  await page.addInitScript(({ locale }) => {
    localStorage.setItem('foody_restaurant_token', 'synthetic-transaction-history');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Synthetic staff', role: 'owner' }));
    localStorage.setItem('foody_restaurant_ids', '[1,2]');
    localStorage.setItem('foody-admin-locale', locale);
  }, { locale });
  await page.route('**/*', route => ['localhost', '127.0.0.1', 'square-fonts-production-f.squarecdn.com'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  await page.routeWebSocket('**', socket => socket.close());
  await page.route('**/api/v1/**', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/v1/transactions') {
      historyReads++;
      requests.push(url);
      expect(request.method()).toBe('GET');
      expect(request.headers()['x-restaurant-id']).toBe('1');
      expect(url.searchParams.get('restaurant_id')).toBe('1');
      if (failed) return route.fulfill({ status: 500, json: { error: 'Synthetic unavailable history' } });
      return route.fulfill({ json: { transactions: [
        { id: 'provider:1', kind: 'sale', status: 'completed', method: 'credit_card', source: 'online', payment_rail: 'stancer', amount_minor: 1099, currency: 'EUR', occurred_at: '2026-11-04T10:00:00Z', reference: 'SYNTHETIC-ONLINE', allocations: [{ order_id: 1048 }], items: ['Article démo'] },
        { id: 'cash:synthetic', kind: 'sale', status: 'completed', method: 'cash', source: 'pos', payment_rail: 'cash', amount_minor: 7000, currency: 'ILS', occurred_at: '2026-11-04T09:00:00Z', allocation_details_unavailable: true, allocations: [], items: [] },
      ], total: 2, limit: 30, offset: 0, totals_by_currency: { EUR: 1099, ILS: 7000 }, recorded_returns_by_currency: {} } });
    }
    const response = fixture.response(request.url(), request.method(), request.postDataJSON() ?? {}, Number(request.headers()['x-restaurant-id']) || 1);
    return route.fulfill({ status: response.status ?? 200, json: response.json ?? {} });
  });
  await page.goto('/1/transactions');
  return { requests, reads: () => historyReads, recover: () => { failed = false; }, fixture };
}

test('payment history is reachable, multiprovider, scoped and read-only', async ({ page }) => {
  const state = await setup(page);
  await expect(page.getByRole('heading', { name: 'Transactions', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Stancer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Détails cash:synthetic', exact: true }).click();
  await expect(page.getByRole('dialog').getByText(/commande ou son addition d’origine est indisponible/)).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('link')).toHaveCount(0);
  await expect(page.getByRole('dialog').getByRole('button', { name: /Rembourser|Payer|Déposer/ })).toHaveCount(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Fermer', exact: true }).click();
  await page.getByLabel('Canal de vente', { exact: true }).selectOption('online');
  await expect.poll(() => state.requests.at(-1)?.searchParams.get('source')).toBe('online');
  await page.getByRole('textbox', { name: 'Référence, commande ou article' }).fill('SYNTHETIC & 1');
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
  await expect.poll(() => state.requests.at(-1)?.searchParams.get('q')).toBe('SYNTHETIC & 1');
  expect(state.fixture.writes).toEqual([]);
});

test('an unavailable history is explicit and can be retried', async ({ page }) => {
  const state = await setup(page, { fail: true });
  await expect(page.getByRole('alert').filter({ hasText: 'Impossible de charger' })).toBeVisible();
  state.recover();
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Stancer', exact: true })).toBeVisible();
});

test('a user without payments permission never requests history', async ({ page }) => {
  const state = await setup(page, { denied: true });
  await expect(page.getByRole('heading', { name: /accès|autorisé/i })).toBeVisible();
  expect(state.reads()).toBe(0);
});

test('Hebrew history and detail stay usable on a phone', async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const state = await setup(page, { locale: 'he' });
  await expect(page.getByRole('heading', { name: 'עסקאות', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'פרטים cash:synthetic', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('transactions-phone-he.png') });
  expect(state.fixture.writes).toEqual([]);
});
