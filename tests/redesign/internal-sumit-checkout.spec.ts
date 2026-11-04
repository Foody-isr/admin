import { test, expect, type Page, type Locator } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

async function install(page: Page, enabled: boolean, paymentPermission = true, locale = 'fr', catering = false, batch = false) {
  await page.routeWebSocket('**/*',socket=>socket.close());
  const fixture = createFixture();
  if(catering) Object.assign(fixture.menus[0],{is_catering:true});
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
    if (path === '/api/v1/users/me') return route.fulfill({ json: { user: { id: 1, role: 'manager' }, role_name: 'Manager', permissions: paymentPermission ? ['orders.view', 'orders.manage', 'payments.manage', 'orders.discount', 'kitchen.manage'] : ['orders.view', 'orders.manage'] } });
    if (path.endsWith('/internal-checkout-capabilities')) return route.fulfill({ json: { enabled,hold_enabled:enabled } });
    if (path.endsWith('/staff-batch-fulfillment-config')) return route.fulfill({ json: batch ? { enabled: true, upcoming_cycles: [{ fulfillment_days: [{ date: '2026-11-06', day_name: 'Friday', pickup_window: { start: '08:00', end: '15:00' }, delivery_window: { start: '08:00', end: '15:00' } }] }] } : { enabled: false, upcoming_cycles: [] } });
    if (path === '/api/v1/menu/items') return route.fulfill({ json: { items: fixture.items } });
    if (path === '/api/v1/orders' && req.method() === 'POST') {
      created.push(req.postDataJSON());
      return route.fulfill({ json: { order: { id: 999, receipt_token: 'synthetic-order-token' }, checkout_url: 'http://localhost:3000/r/1/payment/checkout/999?t=synthetic-order-token' } });
    }
    if (path.endsWith('/orders/999/internal-checkout')) {
      expect(req.headers()['x-receipt-token']).toBe('synthetic-order-token');
      expect(req.postDataJSON()).toEqual({expected_event_revision:0});
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

test('a confirmed event exposes its remaining payment link without a post-payment item edit', async ({ page }) => {
  await install(page, true);
  let collections = 0;
  await page.route('**/api/v1/orders/999**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/payment/collect-balance')) {
      collections++;
      return route.fulfill({ json: { balance_due: 700, payment_url: 'https://app.sumit.co.il/pay/synthetic-balance' } });
    }
    if (path.endsWith('/orders/999')) return route.fulfill({ json: { order: {
      ...createFixture().orders[0], id: 999, payment_status: 'partially_paid', total_amount: 1000, balance_due: 700,
      external_metadata: { paid_amount: 300 },
      event_config: { name: 'Réception démo', guests: 25, payment_mode: 'deposit', deposit_type: 'percent', deposit_value: 30, finalized_at: '2026-11-01T10:00:00Z' },
    } } });
    return route.fallback();
  });
  await page.goto('/1/orders/999');
  const summary = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Informations événement', exact: true }) });
  await summary.getByRole('button', { name: 'Générer un lien de paiement', exact: true }).click();
  await expect(summary.getByRole('textbox', { name: 'Lien de paiement', exact: true })).toHaveValue('https://app.sumit.co.il/pay/synthetic-balance');
  expect(collections).toBe(1);
});

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
  expect(state.created[0]).toMatchObject({ order_type: 'delivery', delivery_address: '', internal_checkout: 'link', force_production: false });
  expect(state.created[0]).not.toHaveProperty('delivery_fee');
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


test('event order reuses the Foody link with a deposit and an independent due date',async({page},info)=>{
 const state=await install(page,true,true,'fr',true);const panel=await checkout(page);
 await expect(panel.getByRole('checkbox',{name:'Événement / Catering',exact:true})).toBeChecked();
 await panel.getByRole('radio',{name:/Lien de paiement/}).check();
 await panel.getByLabel('Date',{exact:true}).fill('2026-11-05');
 await panel.getByRole('combobox',{name:'Paiement maintenant',exact:true}).selectOption('deposit');
 await panel.getByLabel('Valeur de l’acompte',{exact:true}).fill('30');
 await page.screenshot({path:info.outputPath('event-order-admin.png'),fullPage:true});
 await panel.getByRole('button',{name:'Créer le lien de paiement',exact:true}).click();
 expect(state.created).toHaveLength(1);expect(state.created[0]).toMatchObject({internal_checkout:'link',is_scheduled:true,scheduled_for:'2026-11-05',event_config:{require_guests:true,require_date:true,require_time:true,payment_mode:'deposit',deposit_type:'percent',deposit_value:30}});
 expect((state.created[0].items as {source_menu_id?:number}[])[0].source_menu_id).toBeGreaterThan(0);
});


test('an event keeps November 4 independently of the November 6 batch and preserves its delivery fee', async ({ page }, info) => {
  const state = await install(page, true, true, 'fr', true, true);
  const panel = await checkout(page);
  await expect(panel.getByRole('checkbox', { name: 'Événement / Catering', exact: true })).toBeChecked();
  await panel.getByLabel('Date', { exact: true }).fill('2026-11-04');
  await panel.getByLabel('De', { exact: true }).fill('10:00');
  await panel.getByLabel('À', { exact: true }).fill('12:00');
  await panel.getByRole('radio', { name: 'Livraison', exact: true }).check();
  const fee = panel.getByRole('textbox', { name: /Frais de livraison/ });
  await fee.fill('35,50');
  await expect(panel.getByLabel('Date', { exact: true })).toHaveValue('2026-11-04');
  await panel.getByRole('button', { name: 'Retour aux articles', exact: true }).click();
  await page.getByRole('button', { name: 'Continuer', exact: true }).click();
  await expect(fee).toHaveValue('35,50');
  await expect(panel.getByLabel('Date', { exact: true })).toHaveValue('2026-11-04');
  await expect(panel.getByLabel('De', { exact: true })).toHaveValue('10:00');
  await panel.getByRole('radio', { name: 'Lien de paiement', exact: true }).check();
  await panel.getByRole('combobox', { name: 'Paiement maintenant', exact: true }).selectOption('deposit');
  await panel.getByLabel('Valeur de l’acompte', { exact: true }).fill('30');
  await expect(panel.locator('footer')).toContainText('35.50');
  await expect(panel.locator('footer')).toContainText('fixés par vous');
  await fee.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('event-free-date-fixed-delivery-fee.png') });
  await panel.getByRole('button', { name: 'Créer le lien de paiement', exact: true }).click();
  expect(state.created[0]).toMatchObject({ order_type: 'delivery', internal_checkout: 'link', delivery_fee: 35.5, delivery_fee_fixed: true, scheduled_for: '2026-11-04', scheduled_pickup_window_start: '10:00', scheduled_pickup_window_end: '12:00', event_config: { payment_mode: 'deposit' } });
});

for (const value of ['0', '45']) test(`a staff delivery quote of ${value} remains fixed when choosing a payment link`, async ({ page }) => {
  const state = await install(page, true);
  const panel = await checkout(page);
  await panel.getByRole('radio', { name: 'Livraison', exact: true }).check();
  await panel.getByRole('button', { name: 'Définir des frais de livraison fixes', exact: true }).click();
  await panel.getByRole('textbox', { name: /Frais de livraison/ }).fill(value);
  await panel.getByRole('radio', { name: 'Lien de paiement', exact: true }).check();
  await panel.getByRole('button', { name: 'Créer le lien de paiement', exact: true }).click();
  expect(state.created[0]).toMatchObject({ delivery_fee: Number(value), delivery_fee_fixed: true, internal_checkout: 'link' });
});

test('a malformed delivery fee blocks creation and pickup excludes it', async ({ page }) => {
  const state = await install(page, true);
  const panel = await checkout(page);
  await panel.getByRole('radio', { name: 'Livraison', exact: true }).check();
  await panel.getByRole('radio', { name: 'Lien de paiement', exact: true }).check();
  await panel.getByRole('button', { name: 'Définir des frais de livraison fixes', exact: true }).click();
  const fee = panel.getByRole('textbox', { name: /Frais de livraison/ });
  const create = panel.getByRole('button', { name: 'Créer le lien de paiement', exact: true });
  for (const invalid of ['-5', '12abc', '1.234', 'Infinity']) {
    await fee.fill(invalid);
    await expect(fee).toHaveAttribute('aria-invalid', 'true');
    await expect(create).toBeDisabled();
  }
  await fee.fill('45');
  await panel.getByRole('radio', { name: 'À emporter', exact: true }).check();
  await create.click();
  expect(state.created[0]).not.toHaveProperty('delivery_fee');
});

test('ordinary batch orders keep their series selector after leaving event mode', async ({ page }) => {
  await install(page, true, true, 'fr', true, true);
  const panel = await checkout(page);
  await panel.getByLabel('Date', { exact: true }).fill('2026-11-04');
  await panel.getByRole('checkbox', { name: 'Événement / Catering', exact: true }).uncheck();
  await expect(panel.getByRole('combobox', { name: 'Jour de retrait', exact: true })).toHaveValue('2026-11-06');
  await expect(panel.getByLabel('Date', { exact: true })).toHaveCount(0);
});


test('a fee entered before payment survives selecting an existing customer for a manual delivery', async ({ page }) => {
  const state = await install(page, false);
  await page.route(/\/customers\/search\?/, route => route.fulfill({ json: { customers: [{ name: 'Client synthétique', phone: '0500000000', phones: ['0500000000'], order_count: 1, addresses: [{ address: '12 rue démo', city: 'Ville démo', floor: '', apt: '', entry_code: '', delivery_notes: '', last_used: '2026-11-01' }] }] } }));
  const panel = await checkout(page);
  await panel.getByRole('radio', { name: 'Livraison', exact: true }).check();
  await panel.getByRole('button', { name: 'Définir des frais de livraison fixes', exact: true }).click();
  const fee = panel.getByRole('textbox', { name: /Frais de livraison/ });
  await fee.fill('25');
  await panel.getByRole('radio', { name: 'Payer plus tard', exact: true }).check();
  await panel.getByRole('combobox', { name: 'Nom du client', exact: true }).fill('Client');
  await panel.getByRole('option', { name: /Client synthétique/ }).click();
  await expect(fee).toHaveValue('25');
  await panel.getByRole('button', { name: 'Créer la commande', exact: true }).click();
  expect(state.created[0]).toMatchObject({ order_type: 'delivery', delivery_address: '12 rue démo', delivery_fee: 25, payment_status: 'unpaid', customer_phone: '0500000000' });
});

for(const mode of ['hold','deposit_hold']) test(`staff configures ${mode} beside the payment link and can plan before payment`,async({page},info)=>{
 const state=await install(page,true,true,'fr',true);
 const panel=await checkout(page);
 await panel.getByLabel('Date',{exact:true}).fill('2026-11-05');
 await panel.getByRole('radio',{name:'Lien de paiement',exact:true}).check();
 const policy=panel.getByRole('combobox',{name:'Paiement maintenant',exact:true});
 await policy.selectOption(mode);
 await panel.getByLabel('Valeur de l’empreinte',{exact:true}).fill('100');
 await panel.getByText('Options de production',{exact:true}).click();
 await panel.getByRole('checkbox',{name:/production/}).click();
 await page.screenshot({path:info.outputPath(`event-${mode}-settings.png`),fullPage:true});
 await panel.getByRole('button',{name:'Créer le lien de paiement',exact:true}).click();
 expect(state.created[0]).toMatchObject({force_production:true,internal_checkout:'link',event_config:{payment_mode:mode,hold_type:'percent',hold_value:100}});
});

test('prepared event edit is atomic and keeps the draft after a stale revision',async({page})=>{
 await install(page,true);
 const fixture=createFixture();
 const row={...fixture.orders[0],id:999,restaurant_id:1,updated_at:'2026-11-02T10:00:00Z',is_scheduled:true,scheduled_for:'2026-11-05T00:00:00Z',payment_status:'pending',status:'pending_review',event_config:{name:'Réception démo',payment_mode:'deposit',deposit_type:'percent',deposit_value:30},external_metadata:{internal_checkout:{mode:'link',phase:'',expires_at:'2099-01-01T00:00:00Z'}}};
 const writes:Record<string,unknown>[]=[];
 await page.route('**/api/v1/orders/999**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/event')){writes.push(route.request().postDataJSON());return route.fulfill({status:409,json:{error:'stale'}});}
  if(path.endsWith('/orders/999'))return route.fulfill({json:{order:row}});
  return route.fallback();
 });
 await page.goto('/1/orders/999');
 await page.getByRole('button',{name:'Actions',exact:true}).click();
 await page.getByRole('menuitem',{name:'Modifier',exact:true}).click();
 const drawer=page.getByRole('dialog',{name:/Modifier/});
 await drawer.getByLabel('Nom de l’événement',{exact:true}).fill('Réception mise à jour');
 await drawer.getByRole('button',{name:/Enregistrer les modifications/}).click();
 await expect(drawer).toContainText('Enregistrement impossible');
 await expect(drawer.getByLabel('Nom de l’événement',{exact:true})).toHaveValue('Réception mise à jour');
 expect(writes).toHaveLength(1);
 expect(writes[0]).toMatchObject({expected_updated_at:row.updated_at,event_config:{name:'Réception mise à jour'}});
});


test('ordinary delivery calculates from the address and replaces a paid zone with a free zone', async ({page}, info) => {
 const state=await install(page,false);
 await page.route('**/public/delivery/check?*',route=>route.fulfill({json:{deliverable:true,resolved:true,delivery_fee:new URL(route.request().url()).searchParams.get('address')==='Zone gratuite'?0:25}}));
 const panel=await checkout(page);
 await panel.getByRole('radio',{name:'Livraison',exact:true}).check();
 await expect(panel.getByRole('textbox',{name:/Frais de livraison/})).toHaveCount(0);
 await expect(panel).toContainText('calculés automatiquement');
 await panel.getByRole('radio',{name:'Payer plus tard',exact:true}).check();
 await fillCustomer(panel);
 const address=panel.getByRole('textbox',{name:'Adresse de livraison',exact:true});
 await address.fill('12 rue démo');
 await expect(panel.getByRole('status').filter({hasText:'Frais de livraison calculés'})).toContainText('25.00');
 const create=panel.getByRole('button',{name:'Créer la commande',exact:true});
 await address.fill('Zone gratuite');
 await expect(create).toBeDisabled();
 await expect(panel.getByRole('status').filter({hasText:'Frais de livraison calculés'})).toContainText('0.00');
 await page.screenshot({path:info.outputPath('ordinary-delivery-automatic-fee.png')});
 await create.click();
 expect(state.created[0]).toMatchObject({delivery_fee:0,delivery_address:'Zone gratuite',payment_status:'unpaid'});
 expect(state.created[0]).not.toHaveProperty('event_config');
});

test('a late address quote cannot overwrite the current address fee',async({page})=>{
 const state=await install(page,false);
 let old: import('@playwright/test').Route | undefined;
 await page.route('**/public/delivery/check?*',route=>{
  if(new URL(route.request().url()).searchParams.get('address')==='Ancienne adresse'){old=route;return;}
  return route.fulfill({json:{deliverable:true,resolved:true,delivery_fee:10}});
 });
 const panel=await checkout(page);
 await panel.getByRole('radio',{name:'Livraison',exact:true}).check();
 await panel.getByRole('radio',{name:'Payer plus tard',exact:true}).check();
 await fillCustomer(panel);
 const address=panel.getByRole('textbox',{name:'Adresse de livraison',exact:true});
 await address.fill('Ancienne adresse');
 await expect.poll(()=>!!old).toBe(true);
 await address.fill('Nouvelle adresse');
 await expect(panel.getByRole('status').filter({hasText:'Frais de livraison calculés'})).toContainText('10.00');
 await old!.fulfill({json:{deliverable:true,resolved:true,delivery_fee:50}});
 await panel.getByRole('button',{name:'Créer la commande',exact:true}).click();
 expect(state.created[0]).toMatchObject({delivery_fee:10,delivery_address:'Nouvelle adresse'});
});

test('failed fee lookup cannot silently create free delivery and can be retried',async({page})=>{
 const state=await install(page,false);let unavailable=true;
 await page.route('**/public/delivery/check?*',route=>unavailable?route.fulfill({status:503,json:{}}):route.fulfill({json:{deliverable:true,resolved:true}}));
 const panel=await checkout(page);
 await panel.getByRole('radio',{name:'Livraison',exact:true}).check();
 await panel.getByRole('radio',{name:'Payer plus tard',exact:true}).check();
 await fillCustomer(panel);
 await panel.getByRole('textbox',{name:'Adresse de livraison',exact:true}).fill('12 rue démo');
 await expect(panel).toContainText('Impossible de calculer les frais');
 await expect(panel.getByRole('button',{name:'Créer la commande',exact:true})).toBeDisabled();
 expect(state.created).toHaveLength(0);
 unavailable=false;
 await panel.getByRole('button',{name:'Réessayer',exact:true}).click();
 await expect(panel.getByRole('status').filter({hasText:'Frais de livraison calculés'})).toContainText('0.00');
 await panel.getByRole('button',{name:'Créer la commande',exact:true}).click();
 expect(state.created[0]).toMatchObject({delivery_fee:0});
});

test('a fixed fee is an explicit exception and returning to address pricing recalculates it',async({page})=>{
 const state=await install(page,false);
 await page.route('**/public/delivery/check?*',route=>route.fulfill({json:{deliverable:true,resolved:true,delivery_fee:15}}));
 const panel=await checkout(page);
 await panel.getByRole('radio',{name:'Livraison',exact:true}).check();
 await panel.getByRole('radio',{name:'Payer plus tard',exact:true}).check();
 await fillCustomer(panel);
 await panel.getByRole('textbox',{name:'Adresse de livraison',exact:true}).fill('12 rue démo');
 await expect(panel.getByRole('status').filter({hasText:'Frais de livraison calculés'})).toContainText('15.00');
 await panel.getByRole('button',{name:'Définir des frais de livraison fixes',exact:true}).click();
 await panel.getByRole('textbox',{name:/Frais de livraison/}).fill('45');
 await panel.getByRole('button',{name:'Calculer selon l’adresse',exact:true}).click();
 await expect(panel.getByRole('textbox',{name:/Frais de livraison/})).toHaveCount(0);
 await expect(panel.getByRole('status').filter({hasText:'Frais de livraison calculés'})).toContainText('15.00');
 await panel.getByRole('button',{name:'Créer la commande',exact:true}).click();
 expect(state.created[0]).toMatchObject({delivery_fee:15});
});

test('picking an existing customer calculates the ordinary delivery fee without entering a tariff',async({page})=>{
 const state=await install(page,false);
 await page.route(/\/customers\/search\?/,route=>route.fulfill({json:{customers:[{name:'Client synthétique',phone:'0500000000',phones:['0500000000'],order_count:1,addresses:[{address:'12 rue démo',city:'Ville démo',floor:'',apt:'',entry_code:'',delivery_notes:'',last_used:'2026-11-04'}]}]}}));
 await page.route('**/public/delivery/check?*',route=>route.fulfill({json:{deliverable:true,resolved:true,delivery_fee:20}}));
 const panel=await checkout(page);
 await panel.getByRole('radio',{name:'Livraison',exact:true}).check();
 await panel.getByRole('radio',{name:'Payer plus tard',exact:true}).check();
 await panel.getByRole('combobox',{name:'Nom du client',exact:true}).fill('Client');
 await panel.getByRole('option',{name:/Client synthétique/}).click();
 await expect(panel.getByRole('textbox',{name:/Frais de livraison/})).toHaveCount(0);
 await expect(panel.getByRole('status').filter({hasText:'Frais de livraison calculés'})).toContainText('20.00');
 await panel.getByRole('button',{name:'Créer la commande',exact:true}).click();
 expect(state.created[0]).toMatchObject({delivery_fee:20,delivery_address:'12 rue démo',delivery_city:'Ville démo'});
});
