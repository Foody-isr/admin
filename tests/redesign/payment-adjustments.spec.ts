import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

async function setup(page: Page, { locale = 'fr', voidable = false, restricted = false, unknown = false, ambiguous = false, previousDecline = false, unsettledPending = false } = {}) {
  const fixture = createFixture({ denied: restricted });
  Object.assign(fixture.orders[0], { payment_status: 'paid', payment_method: 'credit_card', total_amount: 100, total: 100 });
  let posts = 0;
  const summary = { supported: true, currency: 'ILS', paid_minor: 10000, refunded_minor: 0, remaining_minor: 10000,
    can_refund: !voidable && !ambiguous, can_void: voidable, settlement_state: ambiguous ? undefined : voidable ? 'unsettled' : 'settled',
    blocked_reason: ambiguous ? 'payment_adjustment_verification_required' : '', operations: [] as Record<string, unknown>[] };
  if (previousDecline) summary.operations.push({ id: '00000000-0000-4000-8000-000000000456', payment_id: 1, kind: 'refund', amount_minor: 10000,
    currency: 'ILS', reason: 'Synthetic rejected request', state: 'declined', actor_user_id: 1, created_at: new Date().toISOString() });
  if (unsettledPending) {
    summary.can_void = false;
    summary.can_refund = false;
    summary.settlement_state = 'unsettled';
    summary.blocked_reason = 'payment_adjustment_pending';
    summary.operations.push({ id: '00000000-0000-4000-8000-000000000789', payment_id: 1, kind: 'void', amount_minor: 10000,
      currency: 'ILS', reason: 'Synthetic uncertain cancellation', state: 'unknown', actor_user_id: 1, created_at: new Date().toISOString() });
  }
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
  await expect(page.getByText('Montant annulable', { exact: true })).toBeVisible();
  await expect(page.getByText('Paiement capturé, règlement pas encore confirmé.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rembourser le paiement', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Annuler tout le paiement', exact: true }).click();
  const dialog = page.getByRole('dialog').last();
  await expect(dialog.getByLabel('Montant partiel', { exact: true })).toHaveCount(0);
  await dialog.getByLabel('Motif obligatoire').fill('Erreur (démo)');
  await dialog.getByRole('button', { name: 'Confirmer l’opération financière' }).click();
  await expect(page.getByText('Confirmé par Verifone', { exact: true })).toBeVisible();
  expect(state.summary.operations[0].kind).toBe('void');
});

test('prior rejected refunds do not look paid back or hide the eligible VOID', async ({ page }, info) => {
  const state = await setup(page, { voidable: true, previousDecline: true });
  await expect(page.getByText('Demande rejetée par Verifone — aucune restitution confirmée', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rembourser le paiement', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Annuler tout le paiement', exact: true })).toBeVisible();
  await expect(page.getByText('Montant remboursable', { exact: true })).toHaveCount(0);
  expect(state.summary.refunded_minor).toBe(0);
  expect(state.posts()).toBe(0);
  await page.getByRole('region', { name: 'Rembourser ou annuler le paiement', exact: true }).screenshot({ path: info.outputPath('unsettled-void-only.png') });
});

test('an unsettled reserved operation never suggests another cancellation', async ({ page }) => {
  const state = await setup(page, { voidable: true, unsettledPending: true });
  await expect(page.getByText('Une opération attend une confirmation.', { exact: false })).toBeVisible();
  await expect(page.getByText('Paiement capturé, règlement pas encore confirmé.', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Rembourser le paiement', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Annuler tout le paiement', exact: true })).toHaveCount(0);
  expect(state.posts()).toBe(0);
});

test('ambiguous settlement exposes neither money action', async ({ page }) => {
  const state = await setup(page, { ambiguous: true });
  await expect(page.getByText('Solde du paiement', { exact: true })).toBeVisible();
  await expect(page.getByText('Le paiement ne peut pas être vérifié avec certitude.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rembourser le paiement', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Annuler tout le paiement', exact: true })).toHaveCount(0);
  expect(state.posts()).toBe(0);
});

test('a settlement change does not convert a stale VOID to a refund', async ({ page }) => {
  const state = await setup(page, { voidable: true });
  await page.getByRole('button', { name: 'Annuler tout le paiement', exact: true }).click();
  const dialog = page.getByRole('dialog').last();
  await dialog.getByLabel('Motif obligatoire').fill('Synthetic state change');
  let rejectedPosts = 0;
  await page.route('**/payment/adjustments', async route => {
    if (route.request().method() === 'GET') return route.fallback();
    rejectedPosts++;
    expect(route.request().postDataJSON().kind).toBe('void');
    state.summary.can_void = false;
    state.summary.can_refund = true;
    state.summary.settlement_state = 'settled';
    return route.fulfill({ status: 409, json: { code: 'payment_adjustment_unavailable', error: 'payment_adjustment_unavailable' } });
  });
  await dialog.getByRole('button', { name: 'Confirmer l’opération financière' }).click();
  await expect(dialog.getByText('Le montant ou l’état du paiement a changé. Actualisez avant de continuer.', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Confirmer l’opération financière' })).toBeDisabled();
  expect(rejectedPosts).toBe(1);
  expect(state.posts()).toBe(0);
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
