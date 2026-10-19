import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

async function setup(page: Page, { locale = 'fr', voidable = false, restricted = false, unknown = false } = {}) {
  const fixture = createFixture({ denied: restricted });
  Object.assign(fixture.orders[0], { payment_status: 'paid', payment_method: 'credit_card', total_amount: 100, total: 100 });
  let posts = 0;
  const summary = { supported: true, currency: 'ILS', paid_minor: 10000, refunded_minor: 0, remaining_minor: 10000,
    can_refund: !voidable, can_void: voidable, blocked_reason: '', operations: [] as Record<string, unknown>[] };
  await page.addInitScript(({ locale }) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-refund-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Synthetic staff', role: 'owner' }));
    localStorage.setItem('foody_restaurant_ids', '[1,2]');
    localStorage.setItem('foody-admin-locale', locale);
    localStorage.setItem('foody_admin_theme', locale === 'he' ? 'dark' : 'light');
  }, { locale });
  await page.route('**/*', route => ['localhost', '127.0.0.1', 'square-fonts-production-f.squarecdn.com'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  await page.routeWebSocket('**', socket => socket.close());
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.includes('/payment/adjustments')) {
      expect(request.headers()['x-restaurant-id']).toBe('1');
      if (request.method() === 'GET') return route.fulfill({ json: summary });
      if (path.endsWith('/refresh')) return route.fulfill({ json: summary.operations[0] });
      posts++;
      const input = request.postDataJSON();
      expect(input.request_id).toMatch(/^[0-9a-f-]{36}$/);
      const op = { id: input.request_id, payment_id: 1, kind: input.kind, amount_minor: input.amount_minor, currency: 'ILS', reason: input.reason,
        state: unknown ? 'unknown' : 'succeeded', actor_user_id: 1, created_at: new Date().toISOString(), provider_transaction_id: '00000000-0000-4000-8000-000000000123' };
      summary.operations.push(op);
      if (!unknown) { summary.refunded_minor += input.amount_minor; summary.remaining_minor -= input.amount_minor; }
      summary.can_void = false;
      summary.can_refund = !unknown && summary.remaining_minor > 0;
      summary.blocked_reason = unknown ? 'payment_adjustment_pending' : '';
      await new Promise(resolve => setTimeout(resolve, 250));
      return route.fulfill({ json: op });
    }
    const response = fixture.response(request.url(), request.method(), request.postDataJSON() ?? {}, Number(request.headers()['x-restaurant-id']) || 1);
    return route.fulfill({ status: response.status ?? 200, json: response.json ?? {} });
  });
  await page.goto('/1/orders/1048');
  return { summary, posts: () => posts, fixture };
}

test('partial refund uses exact agorot, reason and one UUID; retains order', async ({ page }, info) => {
  const state = await setup(page);
  await page.getByRole('button', { name: 'Rembourser le paiement', exact: true }).click();
  const dialog = page.getByRole('dialog').last();
  await dialog.getByLabel('Montant partiel', { exact: true }).check();
  await dialog.getByLabel('Montant à rembourser', { exact: true }).fill('12,34');
  const confirm = dialog.getByRole('button', { name: 'Confirmer l’opération financière', exact: true });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel('Motif obligatoire').fill('Article manquant (démo)');
  await page.screenshot({ path: info.outputPath('partial-refund.png') });
  await confirm.click();
  await expect(page.getByText('Confirmé par Verifone', { exact: true })).toBeVisible();
  expect(state.posts()).toBe(1);
  expect(state.summary.operations[0].amount_minor).toBe(1234);
  expect(state.fixture.writes).toEqual([]);
});

test('full refund mobile confirmation and history fit the viewport', async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const state = await setup(page);
  await page.getByRole('button', { name: 'Rembourser le paiement', exact: true }).click();
  const dialog = page.getByRole('dialog').last();
  await dialog.getByLabel('Motif obligatoire').fill('Annulation (démo)');
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('full-refund-mobile.png') });
  await dialog.getByRole('button', { name: 'Confirmer l’opération financière' }).click();
  await expect(page.getByText('Confirmé par Verifone', { exact: true })).toBeVisible();
  expect(state.summary.operations[0].amount_minor).toBe(10000);
  await expect(page.getByRole('button', { name: 'Rembourser le paiement', exact: true })).toHaveCount(0);
});

test('VOID has no partial amount and uses the void action', async ({ page }) => {
  const state = await setup(page, { voidable: true });
  await page.getByRole('button', { name: 'Annuler tout le paiement', exact: true }).click();
  const dialog = page.getByRole('dialog').last();
  await expect(dialog.getByLabel('Montant partiel', { exact: true })).toHaveCount(0);
  await dialog.getByLabel('Motif obligatoire').fill('Erreur (démo)');
  await dialog.getByRole('button', { name: 'Confirmer l’opération financière' }).click();
  await expect(page.getByText('Confirmé par Verifone', { exact: true })).toBeVisible();
  expect(state.summary.operations[0].kind).toBe('void');
});

test('uncertain result in RTL has refresh only and cannot issue a second refund', async ({ page }, info) => {
  const state = await setup(page, { locale: 'he', unknown: true });
  await page.getByRole('button', { name: 'זיכוי התשלום', exact: true }).click();
  const dialog = page.getByRole('dialog').last();
  await dialog.getByLabel('סיבת הפעולה (חובה)').fill('בדיקה סינתטית');
  await dialog.getByRole('button', { name: 'אישור הפעולה הכספית' }).click();
  await expect(page.getByText('נדרשת בדיקה — אין לחזור על הפעולה.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'זיכוי התשלום', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'בדיקה מול Verifone', exact: true }).click();
  expect(state.posts()).toBe(1);
  await page.screenshot({ path: info.outputPath('unknown-rtl.png') });
});

test('read-only staff never see money operation controls', async ({ page }) => {
  const state = await setup(page, { restricted: true });
  await expect(page.getByRole('heading', { name: 'Client démo', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rembourser le paiement', exact: true })).toHaveCount(0);
  expect(state.posts()).toBe(0);
});
