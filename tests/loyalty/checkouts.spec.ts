import { test, expect, type Page } from '@playwright/test';
import { createFixture } from '../redesign/fixtures.mjs';

async function setup(page: Page, options: { locale?: string; readOnly?: boolean; mode?: string; empty?: boolean } = {}) {
  const fixtureOptions = { empty: false, permissions: ['payments.view', 'payments.manage'] };
  const fixture = createFixture(fixtureOptions);
  const rows = new Map<number, Record<string, any>>([
    [1048, { order_id: 1048, checkout_state: 'attempted', reward_state: 'reserved', payment_state: 'pending', fulfillment_state: 'pending_review', next_step: 'verify_and_close', revision: 'a'.repeat(64), expected_amount_minor: 7000, currency: 'EUR', can_request_close: !options.readOnly }],
    [1050, { order_id: 1050, checkout_state: 'attempted', reward_state: 'reserved', payment_state: 'pending', fulfillment_state: 'pending_review', next_step: 'review', reason_code: 'configuration_changed', revision: 'b'.repeat(64), can_request_close: !options.readOnly }],
    [2050, { order_id: 2050, checkout_state: 'open', reward_state: 'reserved', payment_state: 'pending', fulfillment_state: 'pending_review', next_step: 'close_local', revision: 'c'.repeat(64), expected_amount_minor: 1200, currency: 'ILS', can_request_close: !options.readOnly }],
  ]);
  const posts: Record<string, any>[] = [];
  await page.addInitScript(({ locale }) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-loyalty-fixture');
    if (!localStorage.getItem('foody_restaurant_user')) localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Synthetic operator', role: 'owner' }));
    localStorage.setItem('foody_restaurant_ids', '[1,2]');
    localStorage.setItem('foody-admin-locale', locale);
    localStorage.setItem('foody_admin_theme', locale === 'he' ? 'dark' : 'light');
  }, { locale: options.locale ?? 'fr' });
  await page.route('**/*', route => ['localhost', '127.0.0.1', 'square-fonts-production-f.squarecdn.com'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  await page.routeWebSocket('**', socket => socket.close());
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const rid = Number(request.headers()['x-restaurant-id']);
    if (path.startsWith('/api/v1/loyalty/checkout-resolutions')) {
      expect(request.headers()['authorization']).toContain('isolated-loyalty-fixture');
      expect([1, 2]).toContain(rid);
      if (options.mode === 'unavailable') return route.fulfill({ status: 404, json: { error: 'unavailable' } });
      const oid = Number(path.split('/')[5]);
      if (!oid) return route.fulfill({ json: { items: options.empty ? [] : Array.from(rows.values()).filter(row => row.order_id > Number(url.searchParams.get('after') ?? 0) && (rid === 1 ? row.order_id < 2000 : row.order_id >= 2000) && row.checkout_state !== 'closed'), next_after: 0 } });
      const row = rows.get(oid)!;
      expect(rid === 1 ? oid < 2000 : oid >= 2000).toBe(true);
      if (request.method() === 'GET') return route.fulfill({ json: row });
      const input = request.postDataJSON(); posts.push(input);
      if (options.mode === 'stale' && posts.length === 1) { row.revision = 'd'.repeat(64); return route.fulfill({ status: 409, json: { error: 'loyalty_checkout_conflict' } }); }
      row.latest_request = { request_id: input.request_id, status: 'pending', updated_at: '2026-10-31T10:00:00Z' };
      row.next_step = 'verify_closure'; row.checkout_state = 'closing'; row.revision = 'e'.repeat(64);
      if (posts.length === 1 && options.mode === 'lost') return route.abort('failed');
      if (posts.length === 1 && options.mode === 'pending') return route.fulfill({ status: 202, json: { request_id: input.request_id, order_id: oid, status: 'pending' } });
      if (options.mode === 'failure') return route.fulfill({ status: 500, json: { error: 'synthetic secret provider detail' } });
      await new Promise(resolve => setTimeout(resolve, 120));
      row.checkout_state = 'closed'; row.reward_state = 'released'; row.payment_state = 'unpaid'; row.fulfillment_state = 'rejected'; row.next_step = 'none'; row.reason_code = 'closed'; row.latest_request.status = 'completed';
      return route.fulfill({ json: { request_id: input.request_id, order_id: oid, state: 'closed' } });
    }
    if (/^\/api\/v1\/restaurants\/\d+$/.test(path)) return route.fulfill({ json: { restaurant: { id: Number(path.split('/').pop()), name: 'Synthetic restaurant', currency: 'EUR', slug: 'synthetic', timezone: 'Asia/Jerusalem' } } });
    const response = fixture.response(request.url(), request.method(), request.postDataJSON() ?? {}, rid || 1);
    return route.fulfill({ status: response.status ?? 200, json: response.json ?? {} });
  });
  await page.goto('/1/loyalty/checkouts');
  return { posts, rows, fixture };
}

async function inspect(page: Page) {
  await page.getByRole('button', { name: 'Examiner #1048', exact: true }).click();
  const drawer = page.getByRole('dialog').last();
  await expect(drawer.getByText('€70.00', { exact: true })).toBeVisible();
  return drawer;
}

async function closeRequest(page: Page) {
  const drawer = await inspect(page);
  await drawer.getByLabel('Motif de clôture', { exact: true }).fill('Abandon confirmé (démonstration)');
  await drawer.getByRole('button', { name: 'Clôturer cette commande', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirmer la clôture', exact: true }).click();
}

test('queue and detail use financial states, explicit review and one confirmed command', async ({ page }, info) => {
  const state = await setup(page);
  await expect(page.getByRole('heading', { name: 'Paiements fidélité en attente', exact: true })).toBeVisible();
  await expect(page.getByText('À examiner', { exact: true })).toBeVisible();
  const drawer = await inspect(page);
  await expect(drawer.getByRole('button', { name: 'Clôturer cette commande' })).toBeDisabled();
  await page.screenshot({ path: info.outputPath('loyalty-detail-desktop.png'), animations: 'disabled' });
  await drawer.getByLabel('Motif de clôture').fill('Abandon confirmé (démonstration)');
  await drawer.getByRole('button', { name: 'Clôturer cette commande' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByText('Foody vérifie d’abord la clôture du paiement.', { exact: false })).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirmer la clôture' }).click();
  await expect(drawer.getByText('La commande est clôturée. Ses réservations ont été libérées.').first()).toBeVisible();
  expect(state.posts).toHaveLength(1);
  expect(state.posts[0].expected_revision).toBe('a'.repeat(64));
  expect(state.fixture.writes).toEqual([]);
});

test('lost response reload keeps the original UUID, revision and reason', async ({ page }) => {
  const state = await setup(page, { mode: 'lost' });
  await closeRequest(page);
  await expect(page.getByText('Le résultat n’est pas confirmé.', { exact: false })).toBeVisible();
  expect(state.posts).toHaveLength(1);
  await page.reload();
  const drawer = await inspect(page);
  await expect(drawer.getByLabel('Motif de clôture')).toBeDisabled();
  await expect(drawer.getByLabel('Motif de clôture')).toHaveValue('Abandon confirmé (démonstration)');
  await drawer.getByRole('button', { name: 'Reprendre la même demande' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Reprendre la même demande' }).click();
  await expect(drawer.getByText('La commande est clôturée.', { exact: false }).first()).toBeVisible();
  expect(state.posts).toHaveLength(2);
  expect(state.posts[1]).toEqual(state.posts[0]);
});

test('202 stays pending without automatic replay and another actor cannot adopt its stored body', async ({ page }) => {
  const state = await setup(page, { mode: 'pending' });
  await closeRequest(page);
  await expect(page.getByText('La vérification est encore en cours.', { exact: false })).toBeVisible();
  await page.waitForTimeout(300);
  expect(state.posts).toHaveLength(1);
  await page.evaluate(() => localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 2, full_name: 'Another synthetic operator', role: 'owner' })));
  await page.reload();
  const drawer = await inspect(page);
  await expect(drawer.getByText('Une demande est déjà en cours.', { exact: false })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Reprendre la même demande' })).toHaveCount(0);
  await expect(drawer.getByLabel('Motif de clôture')).toHaveCount(0);
  expect(state.posts).toHaveLength(1);
});

test('server close capability makes a custom role read-only', async ({ page }) => {
  const state = await setup(page, { readOnly: true });
  const drawer = await inspect(page);
  await expect(drawer.getByText('Vous pouvez consulter cette commande.', { exact: false })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Clôturer cette commande' })).toHaveCount(0);
  expect(state.posts).toHaveLength(0);
});

test('initial stale rejection requires a fresh review and never auto-submits a replacement', async ({ page }) => {
  const state = await setup(page, { mode: 'stale' });
  await closeRequest(page);
  const drawer = page.getByRole('dialog').last();
  await expect(drawer.getByText('La commande a changé.', { exact: false })).toBeVisible();
  expect(state.posts).toHaveLength(1);
  await drawer.getByRole('button', { name: 'Clôturer cette commande' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirmer la clôture' }).click();
  await expect(drawer.getByText('La commande est clôturée.', { exact: false }).first()).toBeVisible();
  expect(state.posts[1].request_id).not.toBe(state.posts[0].request_id);
  expect(state.posts[1].expected_revision).toBe('d'.repeat(64));
});

test('storage failure blocks a first close and provider text never reaches the interface', async ({ page }) => {
  const state = await setup(page);
  await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key.startsWith('foody.loyalty-close')) throw new Error('synthetic quota'); return original.call(this, key, value); }; });
  await closeRequest(page);
  await expect(page.getByText('Ce navigateur n’a pas pu conserver la demande', { exact: false })).toBeVisible();
  expect(state.posts).toHaveLength(0);
});

test('empty and unavailable states never invent a reward or offer a close', async ({ page }) => {
  await setup(page, { empty: true });
  await expect(page.getByText('Aucun paiement fidélité à examiner', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clôturer cette commande' })).toHaveCount(0);
});

test('unavailable server is explained without exposing a technical error', async ({ page }) => {
  await setup(page, { mode: 'unavailable' });
  await expect(page.getByText('Ce suivi n’est pas encore disponible pour ce restaurant.', { exact: true })).toBeVisible();
});

test('mobile Hebrew dark view respects RTL, viewport and current-restaurant headers', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, { locale: 'he' });
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByRole('button', { name: 'בדיקה #1048', exact: true }).click();
  const drawer = page.getByRole('dialog').last();
  await expect(drawer.getByLabel('סיבת הסגירה', { exact: true })).toBeVisible();
  expect(await drawer.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('loyalty-mobile-hebrew-dark.png'), animations: 'disabled' });
  await drawer.getByRole('button', { name: 'סגור', exact: true }).click();
  await page.goto('/2/loyalty/checkouts');
  await expect(page.getByText('#2050', { exact: true })).toBeVisible();
  await expect(page.getByText('#1048', { exact: true })).toHaveCount(0);
});

test('English is translated and raw provider errors are never displayed', async ({ page }) => {
  const state = await setup(page, { locale: 'en', mode: 'failure' });
  await expect(page.getByRole('heading', { name: 'Pending loyalty payments', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review #1048', exact: true }).click();
  const drawer = page.getByRole('dialog').last();
  await drawer.getByLabel('Reason for closing').fill('Synthetic cancellation reason');
  await drawer.getByRole('button', { name: 'Close this order' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm closure' }).click();
  await expect(page.getByText('The result is not confirmed.', { exact: false })).toBeVisible();
  await expect(page.getByText('synthetic secret provider detail', { exact: false })).toHaveCount(0);
  expect(state.posts).toHaveLength(1);
});


test('another-tab actor change immediately removes the prior drawer and financial rows', async ({ page }) => {
  const state = await setup(page);
  const drawer = await inspect(page);
  await drawer.getByLabel('Motif de clôture').fill('Original operator private reason');
  await page.evaluate(() => {
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 2, full_name: 'Other operator', role: 'owner' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'foody_restaurant_user' }));
  });
  await expect(page.getByText('Vous n’avez plus accès à ce suivi des paiements.', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('#1048', { exact: true })).toHaveCount(0);
  expect(state.posts).toHaveLength(0);
});
