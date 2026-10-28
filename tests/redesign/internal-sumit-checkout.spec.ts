import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

async function install(page: Page, enabled: boolean, paymentPermission = true) {
  const fixture = createFixture();
  const created: Record<string, unknown>[] = [];
  let paid = false;
  let paymentRequests = 0;
  await page.addInitScript(() => {
    localStorage.setItem('foody_restaurant_token', 'synthetic-ui-session');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'manager' }));
    localStorage.setItem('foody_restaurant_ids', '[1]');
    localStorage.setItem('foody-admin-locale', 'fr');
  });
  await page.route('**/*', route => ['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  await page.route('https://app.sumit.co.il/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Formulaire Sumit simulé</p>' }));
  await page.route('**/api/v1/**', async route => {
    const req = route.request(); const path = new URL(req.url()).pathname;
    if (path === '/api/v1/users/me') return route.fulfill({ json: { user: { id: 1, role: 'manager' }, role_name: 'Manager', permissions: paymentPermission ? ['orders.view', 'orders.manage', 'payments.manage'] : ['orders.view', 'orders.manage'] } });
    if (path.endsWith('/internal-checkout-capabilities')) return route.fulfill({ json: { enabled } });
    if (path.endsWith('/staff-batch-fulfillment-config')) return route.fulfill({ json: { enabled: false, upcoming_cycles: [] } });
    if (path === '/api/v1/menu/items') return route.fulfill({ json: { items: fixture.items } });
    if (path === '/api/v1/orders' && req.method() === 'POST') {
      created.push(req.postDataJSON());
      return route.fulfill({ json: { order: { id: 999, receipt_token: 'synthetic-order-token' }, checkout_url: 'http://localhost:3000/r/1/checkout/999?t=synthetic-order-token' } });
    }
    if (path.endsWith('/orders/999/internal-checkout')) {
      expect(req.headers()['x-receipt-token']).toBe('synthetic-order-token');
      expect(req.postDataJSON()).toEqual({});
      paymentRequests++;
      return route.fulfill({ json: { payment_url: 'https://app.sumit.co.il/pay/synthetic' } });
    }
    if (path.endsWith('/orders/999')) return route.fulfill({ json: { order: { ...fixture.orders[0], id: 999, restaurant_id: 1, receipt_token: 'synthetic-order-token', external_metadata: { internal_checkout: { mode: 'card', expires_at: '2099-01-01T00:00:00Z' } }, status: 'pending_review', payment_status: paid ? 'paid' : 'pending' } } });
    const response = fixture.response(req.url(), req.method(), req.postDataJSON() ?? {}, 1);
    return route.fulfill({ status: response.status ?? 200, json: response.json ?? {} });
  });
  return { created, confirmPayment: () => { paid = true; }, paymentRequests: () => paymentRequests };
}

async function checkout(page: Page) {
  await page.goto('/1/orders/new');
  await page.getByRole('button', { name: /^Salade méditerranéenne/ }).first().click();
  await page.getByRole('complementary', { name: 'Articles de la commande', exact: true }).getByRole('button', { name: /^Encaisser/ }).click();
  return page.getByRole('dialog');
}

test('Sumit options stay hidden for other providers and card collection requires payment authority', async ({ page }) => {
  await install(page, false);
  const drawer = await checkout(page);
  await expect(drawer.getByRole('button', { name: 'Lien de paiement Foody', exact: true })).toHaveCount(0);
  await expect(drawer.getByRole('button', { name: 'Encaisser une carte avec Sumit', exact: true })).toHaveCount(0);
});

test('staff can share a Foody basket without filling in customer details', async ({ page }, info) => {
  const state = await install(page, true, false);
  const drawer = await checkout(page);
  await expect(drawer.getByRole('button', { name: 'Encaisser une carte avec Sumit', exact: true })).toHaveCount(0);
  await drawer.getByRole('button', { name: 'Lien de paiement Foody', exact: true }).click();
  await drawer.getByRole('button', { name: /^Créer la commande/ }).click();
  await expect(page.getByRole('heading', { name: 'Lien de paiement prêt' })).toBeVisible();
  expect(state.created).toHaveLength(1);
  expect(state.created[0]).toMatchObject({ internal_checkout: 'link', payment_required: false, force_production: false, customer_name: '', customer_phone: '' });
  await expect(page.getByText('http://localhost:3000/r/1/checkout/999?t=synthetic-order-token', { exact: true })).toBeVisible();
  expect(state.paymentRequests()).toBe(0);
  await page.screenshot({ path: info.outputPath('sumit-customer-link.png') });
});

test('admin enters the card in the Sumit frame and waits for API payment confirmation', async ({ page }, info) => {
  const state = await install(page, true);
  const drawer = await checkout(page);
  await drawer.getByRole('combobox', { name: 'Nom du client', exact: true }).fill('Client démo');
  await drawer.getByRole('combobox', { name: 'Numéro de téléphone', exact: true }).fill('0500000000');
  await drawer.getByRole('button', { name: 'Encaisser une carte avec Sumit', exact: true }).click();
  await expect(drawer.getByRole('switch', { name: 'Déjà encaissé ?' })).toHaveCount(0);
  await drawer.getByRole('button', { name: /^Créer la commande/ }).click();
  await page.getByRole('button', { name: 'Ouvrir le paiement sécurisé Sumit', exact: true }).click();
  await expect(page.locator('iframe[title="Encaisser une carte avec Sumit"]')).toHaveAttribute('src', 'https://app.sumit.co.il/pay/synthetic');
  await expect(page.getByRole('heading', { name: 'Paiement confirmé', exact: true })).toHaveCount(0);
  expect(state.created[0]).toMatchObject({ internal_checkout: 'card', payment_required: false });
  expect(state.created[0]).not.toHaveProperty('payment_status');
  await page.screenshot({ path: info.outputPath('sumit-admin-frame.png') });
  state.confirmPayment();
  await expect(page.getByRole('heading', { name: 'Paiement confirmé', exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.locator('iframe')).toHaveCount(0);
});


test('saved order resumes the existing Sumit card payment after reloading', async ({ page }) => {
  const state = await install(page, true);
  await page.goto('/1/orders/999');
  await page.getByRole('button', { name: 'Ouvrir le paiement sécurisé Sumit', exact: true }).click();
  await page.getByRole('button', { name: 'Ouvrir le paiement sécurisé Sumit', exact: true }).click();
  await expect(page.locator('iframe[title="Encaisser une carte avec Sumit"]')).toHaveAttribute('src', 'https://app.sumit.co.il/pay/synthetic');
  expect(state.created).toHaveLength(0);
  expect(state.paymentRequests()).toBe(1);
});
