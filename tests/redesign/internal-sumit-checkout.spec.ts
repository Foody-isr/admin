import { test, expect, type Page, type Locator } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

async function install(page: Page, enabled: boolean, paymentPermission = true, locale = 'fr') {
  const fixture = createFixture();
  const created: Record<string, unknown>[] = [];
  let paid = false;
  let paymentRequests = 0;
  await page.addInitScript(locale => {
    localStorage.setItem('foody_restaurant_token', 'synthetic-ui-session');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'manager' }));
    localStorage.setItem('foody_restaurant_ids', '[1]');
    localStorage.setItem('foody-admin-locale', locale);
  }, locale);
  await page.route('**/*', route => ['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  await page.route('https://app.sumit.co.il/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Formulaire Sumit simulé</p>' }));
  await page.route('**/api/v1/**', async route => {
    const req = route.request(); const path = new URL(req.url()).pathname;
    if (path === '/api/v1/users/me') return route.fulfill({ json: { user: { id: 1, role: 'manager' }, role_name: 'Manager', permissions: paymentPermission ? ['orders.view', 'orders.manage', 'payments.manage', 'orders.discount'] : ['orders.view', 'orders.manage'] } });
    if (path.endsWith('/internal-checkout-capabilities')) return route.fulfill({ json: { enabled } });
    if (path.endsWith('/staff-batch-fulfillment-config')) return route.fulfill({ json: { enabled: false, upcoming_cycles: [] } });
    if (path === '/api/v1/menu/items') return route.fulfill({ json: { items: fixture.items } });
    if (path === '/api/v1/orders' && req.method() === 'POST') {
      created.push(req.postDataJSON());
      return route.fulfill({ json: { order: { id: 999, receipt_token: 'synthetic-order-token' }, checkout_url: 'http://localhost:3000/r/1/payment/checkout/999?t=synthetic-order-token' } });
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
  await page.getByRole('complementary', { name: 'Articles de la commande', exact: true }).getByRole('button', { name: 'Continuer', exact: true }).click();
  return page.getByRole('region', { name: 'Finaliser la commande', exact: true });
}

test('Sumit options stay hidden for other providers and card collection requires payment authority', async ({ page }) => {
  await install(page, false);
  const drawer = await checkout(page);
  await expect(drawer.getByRole('radio', { name: /Lien de paiement/ })).toHaveCount(0);
  await expect(drawer.getByRole('radio', { name: 'Encaisser par carte', exact: true })).toHaveCount(0);
});

test('staff can share a Foody basket without filling in customer details', async ({ page }, info) => {
  const state = await install(page, true, false);
  const drawer = await checkout(page);
  await expect(drawer.getByRole('radio', { name: 'Encaisser par carte', exact: true })).toHaveCount(0);
  await drawer.getByRole('radio', { name: /Lien de paiement/ }).click();
  await drawer.getByRole('button', { name: 'Créer le lien de paiement', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Lien de paiement prêt' })).toBeVisible();
  expect(state.created).toHaveLength(1);
  expect(state.created[0]).toMatchObject({ internal_checkout: 'link', payment_required: false, force_production: false, customer_name: '', customer_phone: '' });
  await expect(page.getByText('http://localhost:3000/r/1/payment/checkout/999?t=synthetic-order-token', { exact: true })).toBeVisible();
  expect(state.paymentRequests()).toBe(0);
  await page.screenshot({ path: info.outputPath('sumit-customer-link.png') });
});

test('admin enters the card in the Sumit frame and waits for API payment confirmation', async ({ page }, info) => {
  const state = await install(page, true);
  const drawer = await checkout(page);
  await drawer.getByRole('radio', { name: 'Encaisser par carte', exact: true }).check();
  await fillCustomer(drawer);
  await expect(drawer.getByRole('switch', { name: 'Déjà encaissé ?' })).toHaveCount(0);
  await drawer.getByRole('button', { name: 'Ouvrir le paiement sécurisé', exact: true }).click();
  await expect(page.locator('iframe[title="Encaisser une carte avec Sumit"]')).toHaveAttribute('src', 'https://app.sumit.co.il/pay/synthetic');
  await expect(page.getByRole('heading', { name: 'Paiement confirmé', exact: true })).toHaveCount(0);
  expect(state.created[0]).toMatchObject({ internal_checkout: 'card', payment_required: false });
  expect(state.created[0]).not.toHaveProperty('payment_status');
  await page.screenshot({ path: info.outputPath('sumit-admin-frame.png') });
  expect(state.paymentRequests()).toBe(1);
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

async function fillCustomer(panel: Locator) {
  await panel.getByRole('combobox', { name: 'Nom du client', exact: true }).fill('Client démo');
  await panel.getByRole('combobox', { name: 'Numéro de téléphone', exact: true }).fill('0500000000');
}

test('recording a received payment needs an explicit acknowledgement and changing amount revokes it', async ({ page }, info) => {
  const state = await install(page, true);
  const panel = await checkout(page);
  await expect(panel.locator('input[name="order-payment-intent"]:checked')).toHaveCount(0);
  const radio = panel.locator('input[name="order-payment-intent"]').first();
  await expect(radio).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(panel.getByRole('button', { name: 'Créer la commande', exact: true })).toBeDisabled();
  await panel.getByRole('radio', { name: 'Enregistrer un paiement reçu', exact: true }).check();
  await expect(panel.getByRole('radio', { name: 'Enregistrer un paiement reçu', exact: true })).toHaveCSS('background-color', 'rgb(23, 23, 23)');
  await fillCustomer(panel);
  const action = panel.getByRole('button', { name: 'Enregistrer le paiement', exact: true });
  await expect(action).toBeDisabled();
  const acknowledgement = panel.getByRole('checkbox', { name: /Je confirme avoir reçu/ });
  await acknowledgement.check();
  await expect(action).toBeEnabled();
  await panel.getByRole('radio', { name: 'Carte encaissée ailleurs', exact: true }).check();
  await expect(acknowledgement).not.toBeChecked();
  await acknowledgement.check();
  await panel.getByText('Appliquer une réduction', { exact: true }).click();
  await panel.getByPlaceholder('0.00', { exact: true }).fill('5');
  await panel.getByPlaceholder('Motif', { exact: true }).fill('Geste commercial');
  await expect(acknowledgement).not.toBeChecked();
  await expect(action).toBeDisabled();
  await acknowledgement.check();
  await page.screenshot({ path: info.outputPath('order-ux-record-payment-fr.png') });
  await action.click();
  expect(state.created[0]).toMatchObject({ payment_method: 'card', payment_status: 'paid', manual_discount: { type: 'fixed', value: 5, reason: 'Geste commercial' } });
});

test('paying later stays unpaid and returning to articles preserves customer and date', async ({ page }) => {
  const state = await install(page, false);
  const panel = await checkout(page);
  await panel.getByRole('radio', { name: 'Payer plus tard', exact: true }).check();
  await fillCustomer(panel);
  await panel.getByRole('button', { name: 'Date prévue', exact: true }).click();
  await panel.locator('input[type="date"]').fill('2026-11-06');
  await panel.getByRole('button', { name: 'Retour aux articles', exact: true }).click();
  const ticket = page.getByRole('complementary', { name: 'Articles de la commande', exact: true });
  await expect(ticket.getByRole('button', { name: 'Continuer', exact: true })).toBeFocused();
  await ticket.getByRole('button', { name: 'Continuer', exact: true }).click();
  await expect(panel.getByRole('combobox', { name: 'Nom du client', exact: true })).toHaveValue('Client démo');
  await expect(panel.locator('input[type="date"]')).toHaveValue('2026-11-06');
  await panel.getByRole('button', { name: 'Créer la commande', exact: true }).click();
  expect(state.created[0]).toMatchObject({ payment_status: 'unpaid', payment_method: 'cash', is_scheduled: true, scheduled_for: '2026-11-06' });
});

test('removing the last item offers undo before checkout', async ({ page }) => {
  await install(page, false);
  await page.goto('/1/orders/new');
  await page.getByRole('button', { name: /^Salade méditerranéenne/ }).first().click();
  const ticket = page.getByRole('complementary', { name: 'Articles de la commande', exact: true });
  await ticket.getByRole('button', { name: 'Diminuer', exact: true }).click();
  await expect(ticket.getByRole('button', { name: 'Continuer', exact: true })).toBeDisabled();
  await ticket.getByRole('button', { name: 'Annuler la suppression', exact: true }).click();
  await expect(ticket.getByRole('button', { name: 'Continuer', exact: true })).toBeEnabled();
  await expect(ticket.getByRole('listitem')).toHaveCount(1);
});

for (const variant of [
  { locale: 'fr', width: 1440, height: 1000, title: 'Finaliser la commande', next: 'Continuer', link: 'Lien de paiement', create: 'Créer le lien de paiement' },
  { locale: 'en', width: 390, height: 844, title: 'Complete order', next: 'Continue', link: 'Payment link', create: 'Create payment link' },
  { locale: 'he', width: 1440, height: 1000, title: 'סיום ההזמנה', next: 'המשך', link: 'קישור לתשלום', create: 'יצירת קישור לתשלום' },
]) test(`finalization fits the viewport and keeps the action visible: ${variant.locale}`, async ({ page }, info) => {
  await page.setViewportSize(variant);
  await install(page, true, true, variant.locale);
  await page.goto('/1/orders/new');
  await page.getByRole('button', { name: /^Salade méditerranéenne/ }).first().click();
  await page.screenshot({ path: info.outputPath(`order-ux-catalogue-${variant.locale}.png`) });
  if (variant.width < 1024) await page.locator('main > div').getByRole('button', { name: /· 1$/ }).click();
  await page.getByRole('button', { name: variant.next, exact: true }).click();
  const panel = page.getByRole('region', { name: variant.title, exact: true });
  await expect(panel.getByRole('heading', { name: variant.title, exact: true })).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await panel.getByRole('radio', { name: variant.link, exact: true }).check();
  const action = panel.getByRole('button', { name: variant.create, exact: true });
  await expect(action).toBeEnabled();
  const box = await action.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(variant.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`order-ux-finalize-${variant.locale}.png`) });
});

test('a delivery link leaves the address and delivery quote to the recipient', async ({ page }) => {
  const state = await install(page, true);
  const panel = await checkout(page);
  await panel.getByRole('radio', { name: 'Livraison', exact: true }).check();
  await panel.getByRole('radio', { name: 'Lien de paiement', exact: true }).check();
  await expect(panel.getByRole('combobox', { name: 'Nom du client', exact: true })).toHaveCount(0);
  await expect(panel.getByText('Les frais', { exact: false })).toBeVisible();
  await panel.getByRole('button', { name: 'Créer le lien de paiement', exact: true }).click();
  expect(state.created[0]).toMatchObject({ order_type: 'delivery', delivery_address: '', delivery_fee: 0, internal_checkout: 'link', force_production: false });
});

test('undo restores the draft price warning and its checkout block', async ({ page }) => {
  await install(page, false);
  await page.goto('/1/orders/new');
  await page.getByRole('button', { name: /^Salade méditerranéenne/ }).first().click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('foody.orders.draft.1'))).not.toBeNull();
  await page.evaluate(() => {
    const draft = JSON.parse(localStorage.getItem('foody.orders.draft.1')!);
    draft.lines[0].unitPriceAtDraft = 1;
    localStorage.setItem('foody.orders.draft.1', JSON.stringify(draft));
  });
  await page.reload();
  const ticket = page.getByRole('complementary', { name: 'Articles de la commande', exact: true });
  const next = ticket.getByRole('button', { name: 'Continuer', exact: true });
  await expect(next).toBeDisabled();
  await expect(ticket.getByText('Vérifiez les lignes signalées', { exact: true })).toBeVisible();
  await ticket.getByRole('button', { name: 'Retirer', exact: true }).last().click();
  await ticket.getByRole('button', { name: 'Annuler la suppression', exact: true }).click();
  await expect(ticket.getByText('Vérifiez les lignes signalées', { exact: true })).toBeVisible();
  await expect(next).toBeDisabled();
});

test('a failed creation keeps the ticket and customer draft available', async ({ page }) => {
  await install(page, false);
  await page.route(/\/api\/v1\/orders\/?(?:\?.*)?$/, route => route.request().method() === 'POST' ? route.fulfill({ status: 503, json: { error: 'Création indisponible' } }) : route.fallback());
  const panel = await checkout(page);
  await panel.getByRole('radio', { name: 'Payer plus tard', exact: true }).check();
  await fillCustomer(panel);
  await panel.getByRole('button', { name: 'Créer la commande', exact: true }).click();
  await expect(panel.getByRole('alert')).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('foody.orders.draft.1') ?? '{}').customer?.name)).toBe('Client démo');
  await page.reload();
  await page.getByRole('button', { name: 'Continuer', exact: true }).click();
  await panel.getByRole('radio', { name: 'Payer plus tard', exact: true }).check();
  await expect(panel.getByRole('combobox', { name: 'Nom du client', exact: true })).toHaveValue('Client démo');
});
