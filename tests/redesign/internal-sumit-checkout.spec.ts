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

async function fillCustomer(panel: Locator) {
  await panel.getByRole('combobox', { name: 'Nom du client', exact: true }).fill('Client démo');
  await panel.getByRole('combobox', { name: 'Numéro de téléphone', exact: true }).fill('0500000000');
}
async function paymentStep(panel: Locator) {
  await panel.getByRole('button', { name: 'Continuer', exact: true }).click();
  if (await panel.locator('[aria-current="step"]').filter({ hasText: 'Événement' }).count()) await panel.getByRole('button', { name: 'Continuer', exact: true }).click();
  await expect(panel.locator('[aria-current="step"]')).toContainText('Paiement et confirmation');
  await panel.getByRole('group', { name: 'Ajouter au plan de production', exact: true }).getByRole('radio', { name: 'Non', exact: true }).check();
}
async function chooseLink(panel: Locator) {
  await panel.getByRole('checkbox', { name: 'Le client complétera ses informations via le lien Foody', exact: true }).check();
  await paymentStep(panel);
}
async function receptionStep(panel: Locator) {
  await panel.getByRole('navigation').getByRole('button', { name: /Réception et client/ }).click();
}

test('production is asked only at confirmation and an explicit No is required before creation', async ({ page }, info) => {
  const state = await install(page, false);
  const panel = await checkout(page);
  await expect(panel.locator('[data-production-summary]')).toHaveCount(0);
  await expect(panel.getByRole('group', { name: 'Ajouter au plan de production', exact: true })).toHaveCount(0);
  await fillCustomer(panel);
  await panel.getByRole('button', { name: 'Continuer', exact: true }).click();
  const group = panel.getByRole('group', { name: 'Ajouter au plan de production', exact: true });
  const yes = group.getByRole('radio', { name: 'Oui', exact: true });
  const no = group.getByRole('radio', { name: 'Non', exact: true });
  await expect(yes).not.toBeChecked();
  await expect(no).not.toBeChecked();
  await panel.getByRole('radio', { name: 'Payer plus tard', exact: true }).check();
  await panel.getByRole('button', { name: 'Créer la commande', exact: true }).click();
  await expect(yes).toBeFocused();
  await expect(yes).toHaveAttribute('aria-invalid', 'true');
  await expect(no).toHaveAttribute('aria-invalid', 'true');
  await expect(group).toContainText('Choisissez Oui ou Non');
  await page.screenshot({ path: info.outputPath('production-choice-required-fr.png') });
  expect(state.created).toHaveLength(0);
  await no.check();
  await panel.getByRole('button', { name: 'Créer la commande', exact: true }).click();
  expect(state.created[0]).toMatchObject({ production_plan: false });
  expect(state.created[0]).not.toHaveProperty('force_production');
});

test('an explicit Yes survives earlier steps and a change of payment intent', async ({ page }) => {
  const state = await install(page, true);
  const panel = await checkout(page);
  await fillCustomer(panel);
  await paymentStep(panel);
  const yes = panel.getByRole('group', { name: 'Ajouter au plan de production', exact: true }).getByRole('radio', { name: 'Oui', exact: true });
  await yes.check();
  await panel.getByRole('radio', { name: 'Lien de paiement', exact: true }).check();
  await panel.getByRole('button', { name: 'Précédent', exact: true }).click();
  await panel.getByRole('button', { name: 'Continuer', exact: true }).click();
  await expect(yes).toBeChecked();
  await panel.getByRole('radio', { name: 'Payer plus tard', exact: true }).check();
  await expect(yes).toBeChecked();
  await panel.getByRole('button', { name: 'Créer la commande', exact: true }).click();
  expect(state.created[0]).toMatchObject({ production_plan: true });
});

for (const width of [1024, 1440, 1920]) test(`the ticket and catalogue remain fixed through checkout at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 });
  const state = await install(page, true, true, 'fr', true);
  await page.goto('/1/orders/new');
  const item = page.getByRole('button', { name: /Salade méditerranéenne/ }).first();
  await item.click();
  const ticket = page.getByRole('complementary', { name: 'Articles de la commande', exact: true });
  const originalTicket = await ticket.boundingBox();
  const originalItem = await item.boundingBox();
  expect(originalItem!.width).toBeGreaterThanOrEqual(128);
  await page.screenshot({ path: info.outputPath(`ticket-${width}.png`) });
  await ticket.getByRole('button', { name: 'Continuer', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Finaliser la commande', exact: true });
  const expectStableLayout = async () => {
    const currentTicket = await ticket.boundingBox();
    const currentItem = await item.boundingBox();
    expect(currentTicket!.x).toBeCloseTo(originalTicket!.x, 0);
    expect(currentTicket!.width).toBeCloseTo(originalTicket!.width, 0);
    expect(currentItem!.width).toBeCloseTo(originalItem!.width, 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  };
  await expectStableLayout();
  await page.screenshot({ path: info.outputPath(`reception-${width}.png`) });
  await panel.getByRole('checkbox', { name: 'Le client complétera ses informations via le lien Foody', exact: true }).check();
  await panel.locator('#checkout-scheduledFor').fill('2026-11-06');
  await panel.getByRole('button', { name: 'Continuer', exact: true }).click();
  await expect(panel.locator('[aria-current="step"]')).toContainText('Événement');
  await expectStableLayout();
  await page.screenshot({ path: info.outputPath(`event-${width}.png`) });
  await panel.getByRole('button', { name: 'Continuer', exact: true }).click();
  await expect(panel.locator('[aria-current="step"]')).toContainText('Paiement et confirmation');
  await expectStableLayout();
  await page.screenshot({ path: info.outputPath(`checkout-${width}.png`) });
  await panel.getByRole('button', { name: 'Retour aux articles', exact: true }).click();
  await expectStableLayout();
  expect(state.created).toHaveLength(0);
});

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

test('saved order resumes the existing Sumit card payment after reloading', async ({ page }) => {
  const state = await install(page, true);
  await page.goto('/1/orders/999');
  await page.getByRole('button', { name: 'Ouvrir le paiement sécurisé Sumit', exact: true }).click();
  await page.getByRole('button', { name: 'Ouvrir le paiement sécurisé Sumit', exact: true }).click();
  await expect(page.locator('iframe[title="Encaisser une carte avec Sumit"]')).toHaveAttribute('src', 'https://app.sumit.co.il/pay/synthetic');
  expect(state.created).toHaveLength(0);
  expect(state.paymentRequests()).toBe(1);
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

test('staff can share a Foody basket without recipient details or payment permission', async ({ page }, info) => {
  const state = await install(page, true, false);
  const panel = await checkout(page);
  await chooseLink(panel);
  await expect(panel.getByRole('radio', { name: 'Encaisser par carte', exact: true })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Créer le lien de paiement', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Lien de paiement prêt' })).toBeVisible();
  expect(state.created).toHaveLength(1);
  expect(state.created[0]).toMatchObject({ internal_checkout: 'link', payment_required: false, production_plan: false, customer_name: '', customer_phone: '' });
  expect(state.paymentRequests()).toBe(0);
  await page.screenshot({ path: info.outputPath('sumit-customer-link.png') });
});

test('admin card collection retains the hosted frame and waits for server confirmation', async ({ page }) => {
  const state = await install(page, true);
  const panel = await checkout(page);
  await fillCustomer(panel);
  await paymentStep(panel);
  await panel.getByRole('radio', { name: 'Encaisser par carte', exact: true }).check();
  await panel.getByRole('button', { name: 'Ouvrir le paiement sécurisé', exact: true }).click();
  await expect(page.locator('iframe[title="Encaisser une carte avec Sumit"]')).toHaveAttribute('src', 'https://app.sumit.co.il/pay/synthetic');
  expect(state.created[0]).toMatchObject({ internal_checkout: 'card', payment_required: false });
  expect(state.created[0]).not.toHaveProperty('payment_status');
  expect(state.paymentRequests()).toBe(1);
  state.confirmPayment();
  await expect(page.getByRole('heading', { name: 'Paiement confirmé', exact: true })).toBeVisible({ timeout: 10000 });
});

test('the current step exposes every missing field and focuses the first', async ({ page }, info) => {
  const state = await install(page, false);
  const panel = await checkout(page);
  await panel.getByRole('radio', { name: 'Livraison', exact: true }).check();
  const next = panel.getByRole('button', { name: 'Continuer', exact: true });
  await expect(next).toBeEnabled();
  await next.click();
  await expect(panel.locator('#checkout-customerName')).toBeFocused();
  for (const id of ['customerName', 'customerPhone', 'address']) await expect(panel.locator(`#checkout-${id}`)).toHaveAttribute('aria-invalid', 'true');
  await expect(panel.getByRole('alert')).toContainText('3 points à corriger');
  await panel.getByRole('alert').getByRole('button', { name: 'Renseignez l’adresse de livraison.' }).click();
  await expect(panel.locator('#checkout-address')).toBeFocused();
  expect(state.created).toHaveLength(0);
  await page.screenshot({ path: info.outputPath('checkout-multiple-errors-fr.png') });
});

test('received payments require acknowledgement again after a method or amount change', async ({ page }) => {
  const state = await install(page, true);
  const panel = await checkout(page);
  await fillCustomer(panel);
  await paymentStep(panel);
  await panel.getByRole('button', { name: 'Créer la commande', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Choisissez comment régler');
  await expect(panel.locator('input[name="order-payment-intent"]').first()).toBeFocused();
  await panel.getByRole('radio', { name: 'Enregistrer un paiement reçu', exact: true }).check();
  const action = panel.getByRole('button', { name: 'Enregistrer le paiement', exact: true });
  await action.click();
  const acknowledgement = panel.getByRole('checkbox', { name: /Je confirme avoir reçu/ });
  await expect(acknowledgement).toBeFocused();
  await acknowledgement.check();
  await panel.getByRole('radio', { name: 'Carte encaissée ailleurs', exact: true }).check();
  await expect(acknowledgement).not.toBeChecked();
  await acknowledgement.check();
  await panel.getByText('Appliquer une réduction', { exact: true }).click();
  await panel.locator('#checkout-manualValue').fill('5');
  await panel.locator('#checkout-manualReason').fill('Geste commercial');
  await expect(acknowledgement).not.toBeChecked();
  await acknowledgement.check();
  await action.click();
  expect(state.created[0]).toMatchObject({ payment_method: 'card', payment_status: 'paid', manual_discount: { type: 'fixed', value: 5, reason: 'Geste commercial' } });
});

test('back, step titles and returning to articles preserve contact date discount and payment intent', async ({ page }) => {
  const state = await install(page, false);
  const panel = await checkout(page);
  await fillCustomer(panel);
  await panel.getByRole('button', { name: 'Date prévue', exact: true }).click();
  await panel.locator('#checkout-scheduledFor').fill('2026-11-06');
  await paymentStep(panel);
  await panel.getByRole('radio', { name: 'Payer plus tard', exact: true }).check();
  await panel.getByText('Appliquer une réduction', { exact: true }).click();
  await panel.locator('#checkout-manualValue').fill('5');
  await panel.locator('#checkout-manualReason').fill('Geste commercial');
  await panel.getByRole('button', { name: 'Précédent', exact: true }).click();
  await expect(panel.locator('#checkout-customerName')).toHaveValue('Client démo');
  await expect(panel.locator('#checkout-scheduledFor')).toHaveValue('2026-11-06');
  await panel.getByRole('navigation').getByRole('button', { name: /Paiement et confirmation/ }).click();
  await expect(panel.getByRole('radio', { name: 'Payer plus tard', exact: true })).toBeChecked();
  await expect(panel.locator('#checkout-manualValue')).toHaveValue('5');
  await panel.getByRole('button', { name: 'Retour aux articles', exact: true }).click();
  const ticket = page.getByRole('complementary', { name: 'Articles de la commande', exact: true });
  await expect(ticket.getByRole('button', { name: 'Continuer', exact: true })).toBeFocused();
  await ticket.getByRole('button', { name: 'Continuer', exact: true }).click();
  await expect(panel.locator('#checkout-manualValue')).toHaveValue('5');
  await panel.getByRole('button', { name: 'Créer la commande', exact: true }).click();
  expect(state.created[0]).toMatchObject({ payment_status: 'unpaid', is_scheduled: true, scheduled_for: '2026-11-06', manual_discount: { value: 5 } });
});

test('equal handover hours identify both fields while an event at handover end is accepted', async ({ page }, info) => {
  const state = await install(page, true, true, 'fr', true);
  const panel = await checkout(page);
  await fillCustomer(panel);
  await panel.locator('#checkout-scheduledFor').fill('2026-11-06');
  await panel.locator('#checkout-windowStart').fill('12:00');
  await panel.locator('#checkout-windowEnd').fill('12:00');
  await panel.getByRole('button', { name: 'Continuer', exact: true }).click();
  await expect(panel.locator('#checkout-windowStart')).toBeFocused();
  await expect(panel.locator('#checkout-windowEnd')).toHaveAttribute('aria-invalid', 'true');
  await panel.locator('#checkout-windowStart').fill('10:00');
  await expect(panel.locator('#checkout-windowEnd')).not.toHaveAttribute('aria-invalid', 'true');
  await panel.getByRole('button', { name: 'Continuer', exact: true }).click();
  await panel.getByRole('button', { name: 'Utiliser la date de retrait ou de livraison', exact: true }).click();
  await panel.locator('[id="checkout-event.guests"]').fill('25');
  await panel.locator('[id="checkout-event.event_time"]').fill('12:00');
  await panel.getByRole('button', { name: 'Continuer', exact: true }).click();
  await panel.getByRole('radio', { name: 'Payer plus tard', exact: true }).check();
  await expect(panel.locator('[data-production-summary]')).toHaveCount(0);
  await panel.getByRole('group', { name: 'Ajouter au plan de production', exact: true }).getByRole('radio', { name: 'Non', exact: true }).check();
  await expect(panel.getByRole('checkbox', { name: /Ajouter au plan de production/ })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('checkout-event-payment-fr.png') });
  await panel.getByRole('button', { name: 'Créer la commande', exact: true }).click();
  expect(state.created[0]).toMatchObject({ scheduled_for: '2026-11-06', scheduled_pickup_window_start: '10:00', scheduled_pickup_window_end: '12:00', event_config: { event_date: '2026-11-06', event_time: '12:00', guests: 25 } });
});

test('changing from a link to manual payment routes missing details to their original step', async ({ page }) => {
  const state = await install(page, true, true, 'fr', true);
  const panel = await checkout(page);
  await panel.locator('#checkout-scheduledFor').fill('2026-11-06');
  await chooseLink(panel);
  await panel.getByRole('radio', { name: 'Payer plus tard', exact: true }).check();
  await panel.getByRole('button', { name: 'Créer la commande', exact: true }).click();
  await expect(panel.locator('[aria-current="step"]')).toContainText('Réception et client');
  await expect(panel.locator('#checkout-customerName')).toBeFocused();
  await expect(panel.getByRole('alert')).toContainText('5 points à corriger');
  await fillCustomer(panel);
  await panel.getByRole('button', { name: 'Continuer', exact: true }).click();
  await expect(panel.locator('[aria-current="step"]')).toContainText('Événement');
  await expect(panel.locator('[id="checkout-event.guests"]')).toHaveAttribute('aria-invalid', 'true');
  expect(state.created).toHaveLength(0);
});

test('a failed creation retains the draft and server field errors navigate to their input', async ({ page }) => {
  await install(page, true, true, 'fr', true);
  await page.route(/\/api\/v1\/orders\/?(?:\?.*)?$/, route => route.request().method() === 'POST' ? route.fulfill({ status: 400, json: { error: 'invalid deposit' } }) : route.fallback());
  const panel = await checkout(page);
  await panel.locator('#checkout-scheduledFor').fill('2026-11-06');
  await chooseLink(panel);
  await panel.getByRole('combobox', { name: 'Paiement maintenant', exact: true }).selectOption('deposit');
  await panel.getByRole('button', { name: 'Créer le lien de paiement', exact: true }).click();
  await expect(panel.locator('[id="checkout-event.deposit_value"]')).toBeFocused();
  await expect(panel.getByRole('alert')).toContainText('L’acompte');
  await panel.locator('[id="checkout-event.deposit_value"]').fill('20');
  await expect(panel.locator('[id="checkout-event.deposit_value"]')).not.toHaveAttribute('aria-invalid', 'true');
});

for (const mode of ['hold', 'deposit_hold'] as const) test(`event link preserves ${mode} and the explicit production request`, async ({ page }) => {
  const state = await install(page, true, true, 'fr', true, true);
  const panel = await checkout(page);
  await panel.locator('#checkout-scheduledFor').fill('2026-11-04');
  await panel.getByRole('radio', { name: 'Livraison', exact: true }).check();
  await panel.getByRole('textbox', { name: /Frais de livraison/ }).fill('35,50');
  await chooseLink(panel);
  await panel.getByRole('combobox', { name: 'Paiement maintenant', exact: true }).selectOption(mode);
  await panel.getByRole('group', { name: 'Ajouter au plan de production', exact: true }).getByRole('radio', { name: 'Oui', exact: true }).check();
  await panel.getByRole('button', { name: 'Créer le lien de paiement', exact: true }).click();
  expect(state.created[0]).toMatchObject({ production_plan: true, internal_checkout: 'link', delivery_fee: 35.5, delivery_fee_fixed: true, scheduled_for: '2026-11-04', event_config: { payment_mode: mode, hold_type: 'percent', hold_value: 100 } });
});

test('deposit errors stay in payment and open the exact field', async ({ page }) => {
  const state = await install(page, true, true, 'fr', true);
  const panel = await checkout(page);
  await panel.locator('#checkout-scheduledFor').fill('2026-11-06');
  await chooseLink(panel);
  await panel.getByRole('combobox', { name: 'Paiement maintenant', exact: true }).selectOption('deposit');
  await panel.locator('[id="checkout-event.deposit_value"]').fill('100');
  await panel.getByRole('button', { name: 'Créer le lien de paiement', exact: true }).click();
  await expect(panel.locator('[id="checkout-event.deposit_value"]')).toBeFocused();
  await expect(panel.getByRole('alert')).toContainText('L’acompte');
  await expect(panel.getByRole('alert')).not.toContainText('informations événement obligatoires');
  expect(state.created).toHaveLength(0);
});

test('ordinary delivery waits for the current address quote and accepts a free zone', async ({ page }) => {
  const state = await install(page, false);
  await page.route('**/public/delivery/check?*', route => route.fulfill({ json: { deliverable: true, resolved: true, delivery_fee: new URL(route.request().url()).searchParams.get('address') === 'Zone gratuite' ? 0 : 25 } }));
  const panel = await checkout(page);
  await panel.getByRole('radio', { name: 'Livraison', exact: true }).check();
  await fillCustomer(panel);
  const address = panel.getByRole('textbox', { name: 'Adresse de livraison', exact: true });
  await address.fill('12 rue démo');
  await expect(panel.getByRole('status').filter({ hasText: 'Frais de livraison calculés' })).toContainText('25.00');
  await address.fill('Zone gratuite');
  await panel.getByRole('button', { name: 'Continuer', exact: true }).click();
  await expect(panel.locator('[aria-current="step"]')).toContainText('Réception et client');
  await expect(panel.getByRole('status').filter({ hasText: 'Frais de livraison calculés' })).toContainText('0.00');
  await paymentStep(panel);
  await panel.getByRole('radio', { name: 'Payer plus tard', exact: true }).check();
  await panel.getByRole('button', { name: 'Créer la commande', exact: true }).click();
  expect(state.created[0]).toMatchObject({ delivery_fee: 0, delivery_address: 'Zone gratuite', payment_status: 'unpaid' });
});

test('changing pickup to delivery from a visited step requires an address before advancing', async ({ page }) => {
  await install(page, false);
  const panel = await checkout(page);
  await fillCustomer(panel);
  await paymentStep(panel);
  await receptionStep(panel);
  await panel.getByRole('radio', { name: 'Livraison', exact: true }).check();
  await panel.getByRole('navigation').getByRole('button', { name: /Paiement et confirmation/ }).click();
  await expect(panel.locator('#checkout-address')).toBeFocused();
  await expect(panel.locator('#checkout-address')).toHaveAttribute('aria-invalid', 'true');
});

for (const variant of [
  { locale: 'fr', width: 1440, height: 1000, title: 'Finaliser la commande', next: 'Continuer', details: 'Le client complétera ses informations via le lien Foody', create: 'Créer le lien de paiement' },
  { locale: 'en', width: 390, height: 844, title: 'Complete order', next: 'Continue', details: 'The customer will complete their details through the Foody link', create: 'Create payment link' },
  { locale: 'he', width: 1440, height: 1000, title: 'סיום ההזמנה', next: 'המשך', details: 'הלקוח ישלים את הפרטים דרך קישור Foody', create: 'יצירת קישור לתשלום' },
  { locale: 'fr', width: 390, height: 844, catering: true, title: 'Finaliser la commande', next: 'Continuer', details: 'Le client complétera ses informations via le lien Foody', create: 'Créer le lien de paiement' },
  { locale: 'he', width: 390, height: 844, catering: true, title: 'סיום ההזמנה', next: 'המשך', details: 'הלקוח ישלים את הפרטים דרך קישור Foody', create: 'יצירת קישור לתשלום' },
]) test(`step navigation, production and final action fit ${variant.locale} at ${variant.width}px`, async ({ page }, info) => {
  await page.setViewportSize(variant);
  await install(page, true, true, variant.locale, variant.catering ?? false);
  await page.goto('/1/orders/new');
  await page.getByRole('button', { name: /^Salade méditerranéenne/ }).first().click();
  if (variant.width < 1024) await page.locator('main > div').getByRole('button', { name: /· 1$/ }).click();
  await page.getByRole('button', { name: variant.next, exact: true }).click();
  const panel = page.getByRole('region', { name: variant.title, exact: true });
  await expect(panel.getByRole('heading', { name: variant.title, exact: true })).toBeFocused();
  await panel.getByRole('checkbox', { name: variant.details, exact: true }).check();
  if (variant.catering) await panel.locator('#checkout-scheduledFor').fill('2026-11-06');
  await panel.getByRole('button', { name: variant.next, exact: true }).click();
  if (variant.catering) await panel.getByRole('button', { name: variant.next, exact: true }).click();
  const action = panel.getByRole('button', { name: variant.create, exact: true });
  await expect(action).toBeEnabled();
  const box = await action.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(variant.height);
  await expect(panel.locator('[data-production-summary]')).toHaveCount(0);
  const production = panel.locator('input[name="production-plan"]');
  await expect(production).toHaveCount(2);
  await expect(panel.locator('input[name="production-plan"]:checked')).toHaveCount(0);
  await production.nth(1).check();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`checkout-steps-${variant.locale}.png`) });
});

test('event shortcuts copy only on request and reveal the optional field', async ({ page }) => {
  await install(page, true, true, 'fr', true);
  const panel = await checkout(page);
  await fillCustomer(panel);
  await panel.locator('#checkout-scheduledFor').fill('2026-11-06');
  await panel.getByRole('radio', { name: 'Livraison', exact: true }).check();
  await panel.getByRole('textbox', { name: 'Adresse de livraison', exact: true }).fill('12 rue démo');
  await panel.getByRole('textbox', { name: /Frais de livraison/ }).fill('0');
  await panel.getByRole('button', { name: 'Continuer', exact: true }).click();
  await expect(panel.locator('[id="checkout-event.event_date"]')).toHaveValue('');
  await panel.getByRole('button', { name: 'Utiliser la date de retrait ou de livraison', exact: true }).click();
  await expect(panel.locator('[id="checkout-event.event_date"]')).toHaveValue('2026-11-06');
  await panel.getByRole('button', { name: 'Reprendre l’adresse de livraison', exact: true }).click();
  await expect(panel.locator('[id="checkout-event.venue"]')).toBeFocused();
  await expect(panel.locator('[id="checkout-event.venue"]')).toHaveValue('12 rue démo');
  await panel.getByRole('button', { name: 'Reprendre le contact client', exact: true }).click();
  await expect(panel.locator('[id="checkout-event.contact"]')).toBeFocused();
  await expect(panel.locator('[id="checkout-event.contact"]')).toHaveValue('Client démo · 0500000000');
});

test('a malformed fixed fee identifies its field and pickup excludes the fee', async ({ page }) => {
  const state = await install(page, true);
  const panel = await checkout(page);
  await panel.getByRole('checkbox', { name: 'Le client complétera ses informations via le lien Foody', exact: true }).check();
  await panel.getByRole('radio', { name: 'Livraison', exact: true }).check();
  await panel.getByRole('button', { name: 'Définir des frais de livraison fixes', exact: true }).click();
  const fee = panel.getByRole('textbox', { name: /Frais de livraison/ });
  for (const invalid of ['-5', '12abc', '1.234', 'Infinity']) {
    await fee.fill(invalid);
    await panel.getByRole('button', { name: 'Continuer', exact: true }).click();
    await expect(fee).toHaveAttribute('aria-invalid', 'true');
    await expect(fee).toBeFocused();
  }
  await panel.getByRole('radio', { name: 'À emporter', exact: true }).check();
  await paymentStep(panel);
  await panel.getByRole('button', { name: 'Créer le lien de paiement', exact: true }).click();
  expect(state.created[0]).not.toHaveProperty('delivery_fee');
});

test('a late address quote never replaces the current fee across checkout steps', async ({ page }) => {
  const state = await install(page, false);
  let old: import('@playwright/test').Route | undefined;
  await page.route('**/public/delivery/check?*', route => {
    if (new URL(route.request().url()).searchParams.get('address') === 'Ancienne adresse') { old = route; return; }
    return route.fulfill({ json: { deliverable: true, resolved: true, delivery_fee: 10 } });
  });
  const panel = await checkout(page);
  await fillCustomer(panel);
  await panel.getByRole('radio', { name: 'Livraison', exact: true }).check();
  const address = panel.getByRole('textbox', { name: 'Adresse de livraison', exact: true });
  await address.fill('Ancienne adresse');
  await expect.poll(() => !!old).toBe(true);
  await address.fill('Nouvelle adresse');
  await expect(panel.getByRole('status').filter({ hasText: 'Frais de livraison calculés' })).toContainText('10.00');
  await old!.fulfill({ json: { deliverable: true, resolved: true, delivery_fee: 99 } }).catch(() => {});
  await paymentStep(panel);
  await panel.getByRole('radio', { name: 'Payer plus tard', exact: true }).check();
  await panel.getByRole('button', { name: 'Créer la commande', exact: true }).click();
  expect(state.created[0]).toMatchObject({ delivery_fee: 10, delivery_address: 'Nouvelle adresse' });
});

test('leaving event mode restores the normal series selector', async ({ page }) => {
  await install(page, true, true, 'fr', true, true);
  const panel = await checkout(page);
  await panel.locator('#checkout-scheduledFor').fill('2026-11-04');
  await panel.getByRole('checkbox', { name: 'Événement / Catering', exact: true }).uncheck();
  await expect(panel.getByRole('combobox', { name: 'Jour de retrait', exact: true })).toHaveValue('2026-11-06');
  await expect(panel.getByRole('navigation').getByRole('button')).toHaveCount(2);
});

test('a rejected coupon highlights and focuses the code inside the discount section', async ({ page }) => {
  await install(page, true);
  await page.route('**/discounts/validate', route => route.fulfill({ json: { valid: false, reason: 'not_found' } }));
  const panel = await checkout(page);
  await chooseLink(panel);
  await panel.getByText('Appliquer une réduction', { exact: true }).click();
  const code = panel.locator('#checkout-coupon');
  await code.fill('DEMO-INVALID');
  await code.locator('..').getByRole('button', { name: 'Appliquer', exact: true }).click();
  await expect(code).toBeFocused();
  await expect(code).toHaveAttribute('aria-invalid', 'true');
  await expect(panel.locator('#checkout-coupon-error')).toBeVisible();
});

test('an applied percentage discount recalculates after returning to change the basket', async ({ page }) => {
  const state = await install(page, true);
  const panel = await checkout(page);
  await fillCustomer(panel);
  await paymentStep(panel);
  await panel.getByRole('radio', { name: 'Payer plus tard', exact: true }).check();
  await panel.getByText('Appliquer une réduction', { exact: true }).click();
  await panel.locator('#checkout-manualValue').locator('..').locator('select').selectOption('percent');
  await panel.locator('#checkout-manualValue').fill('25');
  await panel.locator('#checkout-manualReason').fill('Offre démo');
  await panel.locator('#checkout-manualValue').locator('../..').getByRole('button', { name: 'Appliquer', exact: true }).click();
  await expect(panel.locator('#checkout-total')).toContainText('36.00');
  await panel.getByRole('button', { name: 'Retour aux articles', exact: true }).click();
  await page.getByRole('button', { name: /^1 Salade méditerranéenne/ }).first().click();
  await page.getByRole('complementary', { name: 'Articles de la commande', exact: true }).getByRole('button', { name: 'Continuer', exact: true }).click();
  await expect(panel.locator('#checkout-total')).toContainText('72.00');
  await panel.getByRole('button', { name: 'Créer la commande', exact: true }).click();
  expect(state.created[0]).toMatchObject({ manual_discount: { type: 'percent', value: 25 }, items: [{ quantity: 2 }] });
});
