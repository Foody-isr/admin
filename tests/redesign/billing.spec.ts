import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

const emptyDocuments = { environment: 'sandbox', documents: [], has_more: false, issuer_configured: true, email_available: false, email_enabled: false };

async function install(page: Page, options: { locale?: string; scopedRole?: string; accountRole?: string } = {}) {
  const fixture = createFixture();
  const control = { reads: 0, failRead: false, failAfterWrite: false, failWrite: false, applyAndFail: false, gate: null as Promise<void> | null, subscription: { id: 1, restaurant_id: 1, status: 'active', plan_tier: 'starter', card_last_four: '4242', card_brand: 'Demo', current_period_end: '2026-11-04T10:30:00Z', events: [{ id: 1, subscription_id: 1, event_type: 'payment_succeeded', amount: 299.75, currency: 'ILS', created_at: '2026-10-03T09:30:00Z' }, { id: 2, subscription_id: 1, event_type: 'payment_failed', amount: 18.42, currency: 'USD', created_at: '2026-10-02T08:00:00Z' }, { id: 3, subscription_id: 1, event_type: 'plan_changed', created_at: '2026-10-01T08:00:00Z' }] } as any };
  const writes: { body: any; restaurant?: string; path: string }[] = [];
  await page.addInitScript(({ locale, accountRole }) => { localStorage.setItem('foody_restaurant_portal_session', 'fp1p.e30.fixture.00'); localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: accountRole, email: 'demo@foody.test' })); localStorage.setItem('foody_restaurant_ids', '[1,2]'); localStorage.setItem('foody-admin-locale', locale); localStorage.setItem('foody_admin_theme', locale === 'he' ? 'dark' : 'light'); }, { locale: options.locale ?? 'fr', accountRole: options.accountRole ?? 'owner' });
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method(), body = request.postDataJSON() ?? {}, restaurant = request.headers()['x-restaurant-id'];
    if (path === '/api/v1/users/me') return route.fulfill({ json: { permissions: ['settings.view', 'settings.edit'], role_name: options.scopedRole ?? 'Owner', user: { id: 1, full_name: 'Équipe démo', role: options.accountRole ?? 'owner' } } });
    if (path.endsWith('/foody-billing')) return route.fulfill({ status: 404, json: { error: 'foody_billing_not_found' } });
    if (/\/subscription$/.test(path)) { control.reads++; return control.failRead ? route.fulfill({ status: 503, json: { error: 'Synthetic subscription failure' } }) : route.fulfill({ json: { subscription: control.subscription && { ...control.subscription, restaurant_id: Number(restaurant) } } }); }
    if (path.endsWith('/subscription/change-plan')) {
      writes.push({ body, restaurant, path }); if (control.gate) await control.gate;
      if (!control.failWrite || control.applyAndFail) control.subscription.plan_tier = body.plan_tier;
      if (control.failAfterWrite) control.failRead = true;
      return route.fulfill({ status: control.failWrite ? 503 : 200, json: control.failWrite ? { error: 'Synthetic uncertain plan change' } : { ok: true } });
    }
    const result = fixture.response(request.url(), method, body, Number(restaurant) || 1); return route.fulfill({ json: result.json ?? {}, status: result.status ?? 200 });
  });
  await page.route('**/*', route => (['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) || route.request().url().startsWith('https://api.foody-pos.co.il/api/v1/')) ? route.fallback() : route.abort());
  return { control, writes, fixture };
}
const upgrade = (page: Page) => page.getByRole('button', { name: 'Passer à Premium', exact: true });
async function confirm(page: Page) { await upgrade(page).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Confirmer', exact: true }).click(); }
const verify = (page: Page) => page.getByRole('button', { name: 'Vérifier l’abonnement', exact: true });

async function openAccountNavigation(page: Page) {
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  await nav.getByRole('button', { name: 'Paramètres', exact: true }).click();
  await nav.getByRole('button', { name: 'Compte', exact: true }).click();
  return nav;
}

for (const locale of ['fr', 'he']) test(`billing responsive subscription, plans and history ${locale}`, async ({ page }, info) => {
  const state = await install(page, { locale }); await page.setViewportSize({ width: locale === 'fr' ? 375 : 1440, height: 1000 }); await page.goto('/1/billing'); await expect(page.getByText('Demo •••• 4242')).toBeVisible(); await page.screenshot({ path: info.outputPath(`billing-overview-${locale}.png`) }); await page.getByText(locale === 'fr' ? 'Historique des paiements' : 'היסטוריית תשלומים', { exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`billing-history-${locale}.png`) }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(state.fixture.unhandled).toEqual([]);
});

test('billing load failure offers retry without claiming there is no subscription', async ({ page }) => {
  const state = await install(page); state.control.failRead = true; await page.goto('/1/billing'); await expect(page.locator('main [role=alert]')).toContainText('Impossible de charger'); await expect(upgrade(page)).toHaveCount(0); state.control.failRead = false; await page.getByRole('button', { name: 'Réessayer', exact: true }).click(); await expect(upgrade(page)).toBeVisible(); expect(state.writes).toHaveLength(0);
});

test('billing plan change requires confirmation and serializes writes for this restaurant', async ({ page }, info) => {
  const state = await install(page); await page.goto('/2/billing'); await upgrade(page).click(); await expect(page.getByRole('alertdialog')).toHaveCSS('opacity', '1'); await page.screenshot({ path: info.outputPath('billing-confirm-fr.png'), animations: 'disabled' }); await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler', exact: true }).click(); expect(state.writes).toHaveLength(0); let release!: () => void; state.control.gate = new Promise<void>(resolve => { release = resolve; }); await upgrade(page).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Confirmer', exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); }); await expect(upgrade(page)).toBeDisabled(); release(); state.control.gate = null; await expect(page.getByText('Le nouveau forfait est confirmé. L’abonnement affiché est à jour.', { exact: true })).toBeVisible(); expect(state.writes).toEqual([{ body: { plan_tier: 'premium' }, restaurant: '2', path: '/api/v1/restaurants/2/subscription/change-plan' }]);
});

test('billing successful write and failed refresh retry only the read', async ({ page }) => {
  const state = await install(page); state.control.failAfterWrite = true; await page.goto('/1/billing'); await confirm(page); await expect(verify(page)).toBeVisible(); await expect(upgrade(page)).toBeDisabled(); await expect(page.getByText(/La relecture a échoué/)).toBeVisible(); state.control.failRead = false; await verify(page).click(); await expect(page.getByText('Le nouveau forfait est confirmé. L’abonnement affiché est à jour.', { exact: true })).toBeVisible(); expect(state.writes).toHaveLength(1);
});

test('billing uncertain applied response verifies the plan without repeating the charge-related request', async ({ page }) => {
  const state = await install(page); state.control.failWrite = true; state.control.applyAndFail = true; await page.goto('/1/billing'); await confirm(page); await verify(page).click(); await expect(page.getByText('Le nouveau forfait est confirmé. L’abonnement affiché est à jour.', { exact: true })).toBeVisible(); expect(state.writes).toHaveLength(1);
});

test('billing unapplied response reports the actual plan and permits a new explicit request', async ({ page }) => {
  const state = await install(page); state.control.failWrite = true; await page.goto('/1/billing'); await confirm(page); await verify(page).click(); await expect(page.getByText(/Le forfait demandé n’est pas celui enregistré/)).toBeVisible(); await expect(upgrade(page)).toBeEnabled(); expect(state.writes).toHaveLength(1);
});

for (const roles of [{ scopedRole: 'Manager', accountRole: 'owner' }, { scopedRole: 'Owner', accountRole: 'manager' }]) test(`billing plan changes require both scoped and account owner roles ${roles.scopedRole}`, async ({ page }) => {
  const state = await install(page, roles); await page.goto('/1/billing'); await expect(page.getByText('Seul le propriétaire de cet établissement peut changer le forfait.', { exact: true })).toBeVisible(); await expect(upgrade(page)).toHaveCount(0); await expect(page.getByRole('link', { name: 'support@foody-pos.co.il', exact: true })).toHaveAttribute('href', 'mailto:support@foody-pos.co.il?subject=Billing'); expect(state.writes).toHaveLength(0);
});

test('billing financial history preserves cents, event currency, zero, and unknown event labels', async ({ page }) => {
  const state = await install(page, { locale: 'en' }); state.control.subscription.events.push({ id: 4, subscription_id: 1, event_type: 'manual_adjustment', amount: 0, currency: '', created_at: 'invalid' }); await page.goto('/1/billing'); await expect(page.getByText('₪299.75', { exact: true })).toBeVisible(); await expect(page.getByText('$18.42', { exact: true })).toBeVisible(); await expect(page.getByText('0.00 · Currency not specified', { exact: true })).toBeVisible(); await expect(page.getByText('manual adjustment', { exact: true })).toBeVisible(); await expect(page.getByText('Date unavailable', { exact: true })).toBeVisible(); expect(state.writes).toHaveLength(0);
});

test('billing empty history and locale changes preserve the loaded subscription', async ({ page }) => {
  const state = await install(page); state.control.subscription.events = []; await page.goto('/1/billing'); await expect(page.getByText('Aucun événement de facturation pour le moment.', { exact: true })).toBeVisible(); const reads = state.control.reads; await page.getByRole('button', { name: 'Atelier Foody', exact: true }).click(); await page.getByRole('dialog').getByRole('combobox').selectOption('he'); await page.keyboard.press('Escape'); await expect(page.getByText('אין עדיין אירועי חיוב.', { exact: true })).toBeVisible(); expect(state.control.reads).toBe(reads);
});

test('billing malformed subscription never exposes change actions', async ({ page }) => {
  const state = await install(page); state.control.subscription = null; await page.goto('/1/billing'); await expect(page.locator('main [role=alert]')).toContainText('Impossible de charger'); await expect(upgrade(page)).toHaveCount(0); expect(state.writes).toHaveLength(0);
});

for (const [cycle, renewal] of [['monthly', true], ['annual', true], ['annual', false]] as const) {
test(`the owner can pay a private ${cycle} offer with renewal ${renewal} and verify the return`, async ({ page }, info) => {
  const state = await install(page);
  const checkoutCalls: unknown[] = [];
  let verifications = 0;
  let started = false;
  const offer = {
    id: 7, version: 2, title: 'Offre pilote démo', includes: 'Logiciel Foody', terms: 'Conditions de test.',
    start_date: '2026-11-09', monthly: { net_minor: 33898, vat_minor: 6102, total_minor: 40000 },
    annual: { net_minor: 386441, vat_minor: 69559, total_minor: 456000 },
  };
  const pending = { offer_id: 7, cycle, accept_renewal: renewal, status: 'pending', amount_minor: offer[cycle].total_minor, reference: 'FB-synthetic' };
  const initial = {
    offer, accepted_offer: null, agreement: null, payment: null,
    checkout_enabled: true, monthly_enabled: true, annual_renewal_enabled: true, due: true, can_resume: false,
  };
  await page.route('**/api/v1/restaurants/1/foody-billing**', async (route) => {
    const url = new URL(route.request().url());
    expect(route.request().headers()['x-restaurant-id']).toBe('1');
    if (url.pathname.endsWith('/documents')) return route.fulfill({ json: emptyDocuments });
    if (url.pathname.endsWith('/usage')) return route.fulfill({ json: { month: '2026-11', quotas: null, observed: { openai_whisper_requests: 12 }, complete: true } });
    if (url.pathname.endsWith('/checkout')) {
      checkoutCalls.push(route.request().postDataJSON());
      started = true;
      return route.fulfill({ json: { checkout_url: 'https://cst.checkout.vficloud.net/sandbox-checkout' } });
    }
    if (url.pathname.endsWith('/reconcile')) {
      verifications++;
      return route.fulfill({ json: { ...initial, due: false, accepted_offer: offer,
        agreement: { offer_id: 7, cycle, period_end: cycle === 'annual' ? '2027-11-09T10:00:00Z' : '2026-12-09T10:00:00Z', renews: renewal },
        payment: { ...pending, status: 'paid' } } });
    }
    return route.fulfill({ json: { ...initial, payment: started ? pending : null } });
  });
  await page.route('https://cst.checkout.vficloud.net/sandbox-checkout', (route) => route.fulfill({ body: 'Sandbox checkout fixture' }));
  await page.goto('/1/dashboard');
  const nav = await openAccountNavigation(page);
  const billing = nav.getByRole('link', { name: 'Facturation', exact: true });
  await expect(billing).toHaveAttribute('href', '/1/billing');
  await billing.click();
  await expect(billing).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Offre pilote démo' })).toBeVisible();
  await page.getByRole('link', { name: 'Utilisation', exact: true }).click();
  await expect(page.getByText('Transcriptions de stock OpenAI')).toBeVisible();
  await page.getByRole('link', { name: 'Abonnement', exact: true }).click();
  await expect(upgrade(page)).toHaveCount(0);
  await page.getByRole('radio', { name: cycle === 'monthly' ? /^Mensuel/ : /^Annuel/ }).check();
  const pay = page.getByRole('button', { name: 'Continuer vers Verifone' });
  await expect(pay).toBeDisabled();
  await page.getByRole('checkbox', { name: /J’accepte cette version/ }).check();
  if (cycle === 'monthly') await page.screenshot({ path: info.outputPath('checkout-fr.png'), animations: 'disabled' });
  const mandate = page.getByRole('checkbox', { name: /J’autorise Foody/ });
  await expect(mandate).not.toBeChecked();
  if (cycle === 'monthly') await expect(pay).toBeDisabled();
  else { await expect(pay).toBeEnabled(); await expect(mandate).toHaveAccessibleName(/12 mois/); }
  if (renewal) await mandate.check();
  await pay.click();
  await expect(page.getByText('Sandbox checkout fixture')).toBeVisible();
  expect(checkoutCalls).toEqual([{ offer_id: 7, cycle, accept_terms: true, accept_renewal: renewal, locale: 'fr' }]);
  await page.goto('/1/billing?foody_billing_return=1');
  await expect(page.getByText(/Paiement de test confirmé/)).toBeVisible();
  expect(verifications).toBe(1);
  expect(checkoutCalls).toHaveLength(1);
  expect(state.writes).toHaveLength(0);

  await page.goto('/2/dashboard');
  await openAccountNavigation(page);
  await expect(billing).toHaveCount(0);
});
}

test('a CST card registration waits for the owner to pay the full subscription amount', async ({ page }) => {
  await install(page);
  const offer = {
    id: 7, version: 1, title: 'Offre de test', includes: 'Logiciel', terms: 'Conditions de test', start_date: '2026-11-09',
    monthly: { net_minor: 50000, vat_minor: 9000, total_minor: 59000 },
    annual: { net_minor: 550000, vat_minor: 99000, total_minor: 649000 },
  };
  const payment = { id: 8, offer_id: offer.id, cycle: 'monthly', reference: 'FB-test', amount_minor: 59000 };
  let registered = false;
  let paid = false;
  const charges: unknown[] = [];
  await page.route('**/api/v1/restaurants/1/foody-billing**', async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname.endsWith('/documents')) return route.fulfill({ json: emptyDocuments });
    if (pathname.endsWith('/usage')) return route.fulfill({ json: { month: '2026-11', observed: {}, quotas: null } });
    if (pathname.endsWith('/reconcile')) registered = true;
    else if (pathname.endsWith('/pay-registered-card')) {
      expect(route.request().method()).toBe('POST');
      charges.push(route.request().postDataJSON());
      paid = true;
    } else expect(route.request().method()).toBe('GET');
    return route.fulfill({ json: {
      offer, accepted_offer: paid ? offer : null,
      agreement: paid ? { offer_id: offer.id, cycle: 'monthly', period_end: '2026-12-09T10:00:00Z', renews: true } : null,
      payment: { ...payment, status: paid ? 'paid' : 'pending' },
      checkout_enabled: true, monthly_enabled: true, due: !paid, can_resume: !registered, can_pay_registered_card: registered && !paid,
    } });
  });
  await page.goto('/1/billing');
  await page.getByRole('button', { name: 'Vérifier le statut du paiement' }).click();
  const pay = page.getByRole('button', { name: /Payer 590,00\s*₪ avec la carte vérifiée/ });
  await expect(pay).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reprendre le paiement Verifone' })).toHaveCount(0);
  await page.reload();
  await expect(pay).toBeVisible();
  expect(charges).toHaveLength(0);
  await pay.click();
  await expect(page.getByText(/Paiement de test confirmé/)).toBeVisible();
  await expect(pay).toHaveCount(0);
  expect(charges).toEqual([{ payment_id: 8 }]);
});

test('owner filters, views, downloads and resends the same subscription invoice', async ({ page }) => {
  await install(page);
  const price = { net_minor: 50000, vat_minor: 9000, total_minor: 59000 };
  const offer = { id: 7, version: 1, title: 'Offre de test', includes: 'Logiciel', terms: 'Test', start_date: '2026-11-01', monthly: price, annual: price };
  const document = {
    payment_id: 43, number: 4012, title: 'Offre de test', cycle: 'monthly', kind: 'renewal',
    paid_at: '2026-11-09T10:00:00Z', period_start: '2026-11-09T10:00:00Z', period_end: '2026-12-09T10:00:00Z',
    issue_state: 'ready', mail_state: 'sent', price,
  };
  let emailEnabled = false;
  let resends = 0;
  const mutations: string[] = [];
  await page.route('**/api/v1/restaurants/1/foody-billing**', async route => {
    const request = route.request();
    const { pathname, searchParams } = new URL(request.url());
    expect(request.headers()['x-restaurant-id']).toBe('1');
    if (request.method() !== 'GET') mutations.push(request.method() + ' ' + pathname);
    if (pathname.endsWith('/document-delivery')) {
      emailEnabled = request.postDataJSON().enabled;
      return route.fulfill({ json: {} });
    }
    if (pathname.endsWith('/documents/43/resend')) {
      resends++;
      return route.fulfill({ json: {} });
    }
    if (pathname.endsWith('/documents/43/pdf')) return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4\n% fixture\n%%EOF' });
    if (pathname.endsWith('/documents/archive')) {
      expect(searchParams.get('month')).toBe('2026-11');
      return route.fulfill({ contentType: 'application/zip', body: Buffer.from('504b0506' + '00'.repeat(18), 'hex') });
    }
    if (pathname.endsWith('/documents')) {
      const matches = !searchParams.has('number') || searchParams.get('number') === '4012';
      return route.fulfill({ json: { ...emptyDocuments, email_available: true, email_enabled: emailEnabled, documents: matches ? [document] : [] } });
    }
    if (pathname.endsWith('/usage')) return route.fulfill({ json: { month: '2026-11', observed: {}, quotas: null } });
    return route.fulfill({ json: { offer, due: false, checkout_enabled: false } });
  });
  await page.goto('/1/billing#documents');
  const archive = page.locator('#documents');
  await expect(archive.getByText('#4012')).toBeVisible();
  await archive.getByRole('button', { name: 'Filtres' }).click();
  await archive.getByLabel('Nº de facture').fill('9999');
  await expect(archive.getByText('Aucun paiement correspondant.')).toBeVisible();
  await archive.getByLabel('Nº de facture').fill('4012');
  await archive.getByRole('button', { name: 'Voir le PDF' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  const pdf = page.waitForEvent('download');
  await archive.getByRole('button', { name: 'Télécharger', exact: true }).click();
  expect((await pdf).suggestedFilename()).toBe('Foody-Invoice4U-TEST-4012.pdf');
  await archive.getByLabel('Mois du paiement').fill('2026-11');
  const zip = page.waitForEvent('download');
  await archive.getByRole('button', { name: 'Télécharger le mois (.zip)' }).click();
  expect((await zip).suggestedFilename()).toBe('Foody-Invoice4U-TEST-2026-11.zip');
  const resend = archive.getByRole('button', { name: 'Renvoyer par e-mail' });
  await expect(resend).toHaveCount(0);
  const delivery = archive.getByRole('checkbox');
  await delivery.click();
  await expect(delivery).toBeChecked();
  await resend.click();
  await expect(archive.getByText('Envoi demandé.')).toBeVisible();
  expect(resends).toBe(1);
  expect(mutations).toEqual(['PUT /api/v1/restaurants/1/foody-billing/document-delivery', 'POST /api/v1/restaurants/1/foody-billing/documents/43/resend']);
});

test('native invoice waits for a verified original and discloses card registration', async ({ page }) => {
  await install(page);
  const price = { net_minor: 50000, vat_minor: 9000, total_minor: 59000 };
  const offer = { id: 7, title: 'Offre de test', includes: 'Logiciel', terms: 'Test', start_date: '2026-11-01', monthly: price, annual: price };
  await page.route('**/api/v1/restaurants/1/foody-billing**', route => {
    expect(route.request().method()).toBe('GET');
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/documents')) return route.fulfill({ json: { ...emptyDocuments, native_invoices: true,
      archive_connected: false, email_available: true,
      documents: [{ payment_id: 43, title: offer.title, cycle: 'monthly', kind: 'renewal', paid_at: '2026-11-09T10:00:00Z',
        period_start: '2026-11-09T10:00:00Z', issue_state: 'pending', mail_state: 'off', verifone_invoice: true, price }] } });
    if (path.endsWith('/usage')) return route.fulfill({ json: { month: '2026-11', observed: {} } });
    return route.fulfill({ json: { offer, due: true, monthly_enabled: true, checkout_enabled: true, registration_minor: 1 } });
  });
  await page.goto('/1/billing');
  await page.getByRole('link', { name: 'Factures', exact: true }).click();
  const archive = page.locator('#documents');
  await expect(archive.getByText(/Facture demandée à Verifone/)).toBeVisible();
  await expect(archive.getByRole('button', { name: 'Voir le PDF' })).toHaveCount(0);
  await expect(archive.getByRole('checkbox', { name: /Transmettre la boîte de test/ })).toBeVisible();
  await page.getByRole('link', { name: 'Abonnement', exact: true }).click();
  await page.getByRole('radio', { name: /Mensuel/ }).check();
  await expect(page.getByText(/Verifone vérifie d’abord la carte pour 0,01.*confirmez le paiement de 590,00/)).toBeVisible();
});

test('production owner navigation uses the scoped Foody billing response', async ({ page, baseURL }) => {
  const local = new URL(baseURL!);
  expect(['localhost', '127.0.0.1']).toContain(local.hostname);
  await install(page);
  // Serve the local application at the production origin. All API calls stay in fixtures.
  await page.context().route(/^https:\/\/(api|admin)\.foody-pos\.co\.il\//, route => route.abort());
  await page.route('https://admin.foody-pos.co.il/**', async route => {
    const { pathname, search } = new URL(route.request().url());
    if (route.request().method() !== 'GET' || pathname.startsWith('/api/') || new URLSearchParams(search).has('_rsc')) return route.abort();
    await route.fulfill({ response: await page.request.get(new URL(pathname + search, local).href, { maxRedirects: 0 }) });
  });
  await page.route('**/api/v1/restaurants/1/foody-billing', route => route.fulfill({ json: { offer: { id: 7 } } }));
  await page.goto('https://admin.foody-pos.co.il/1/dashboard');
  const nav = await openAccountNavigation(page);
  await expect(nav.getByRole('link', { name: 'Facturation', exact: true })).toHaveAttribute('href', '/1/billing');
  await page.goto('https://admin.foody-pos.co.il/2/dashboard');
  await openAccountNavigation(page);
  await expect(nav.getByRole('link', { name: 'Facturation', exact: true })).toHaveCount(0);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

for (const locale of ['fr', 'he'] as const) test(`paid portal prioritizes the next charge and keeps invoice navigation in history (${locale})`, async ({ page }, info) => {
  await install(page, { locale });
  await page.setViewportSize({ width: locale === 'fr' ? 1366 : 390, height: 860 });
  await page.clock.setFixedTime(new Date('2026-11-21T12:00:00Z'));
  const monthly = { net_minor: 50000, vat_minor: 9000, total_minor: 59000 };
  const offer = { id: 11, version: 3, title: 'Foody Online', includes: 'Foody Online', terms: 'Demo terms.', start_date: '2026-11-19', monthly, annual: monthly };
  const periodEnd = '2026-12-19T10:00:00Z';
  const writes: string[] = [];
  let renews = true;
  await page.route('**/api/v1/restaurants/1/foody-billing**', route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET') {
      writes.push(path);
      expect(path).toMatch(/stop-renewal$/);
      renews = false;
    }
    if (path.endsWith('/usage')) return route.fulfill({ json: { month: '2026-11', observed: {}, complete: true } });
    if (path.endsWith('/documents')) return route.fulfill({ json: { ...emptyDocuments, email_available: true, documents: [{
      payment_id: 31, title: 'Foody Online', number: 1019, cycle: 'monthly', kind: 'checkout', paid_at: '2026-11-19T10:00:00Z',
      period_start: '2026-11-19T10:00:00Z', period_end: periodEnd, issue_state: 'ready', mail_state: 'sent', price: monthly,
    }] } });
    return route.fulfill({ json: { offer, accepted_offer: offer, agreement: { offer_id: 11, cycle: 'monthly', period_end: periodEnd, renews, card_last_four: '4242' },
      payment: { id: 31, offer_id: 11, cycle: 'monthly', amount_minor: 59000, status: 'paid' },
      checkout_enabled: true, monthly_enabled: true, annual_renewal_enabled: true, due: false } });
  });
  await page.goto('/1/billing');
  const hero = page.getByRole('region', { name: locale === 'fr' ? 'Votre abonnement' : 'המנוי שלכם', exact: true });
  await expect(hero).toContainText('Foody Online');
  await expect(hero).toContainText('590');
  await expect(hero).toContainText('19');
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByText('•••• 4242')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('overview-' + locale + '.png'), animations: 'disabled' });
  await page.getByRole('link', { name: locale === 'fr' ? 'Factures' : 'חשבוניות', exact: true }).click();
  await expect(page.locator('#documents')).toContainText('#1019');
  await expect(page.getByLabel(locale === 'fr' ? 'Mois du paiement' : 'חודש התשלום')).toBeHidden();
  await page.screenshot({ path: info.outputPath('invoices-' + locale + '.png'), animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goBack();
  await expect(hero).toBeVisible();
  expect(writes).toEqual([]);
  if (locale === 'fr') {
    await page.getByText('Gérer le renouvellement', { exact: true }).click();
    await page.getByRole('button', { name: 'Arrêter le renouvellement automatique' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler' }).click();
    expect(writes).toEqual([]);
    await page.getByRole('button', { name: 'Arrêter le renouvellement automatique' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Arrêter le renouvellement automatique' }).click();
    await expect(hero).toContainText('Fin de la période payée');
    await expect(hero).not.toContainText('Prochain prélèvement');
    expect(writes).toHaveLength(1);
  }
});

test('an amended offer keeps the accepted plan and its price separate until acceptance', async ({ page }) => {
  await install(page);
  const initial = { id: 11, version: 1, title: 'Plan actuel', includes: 'Licence initiale', terms: 'Conditions signées', start_date: '2026-11-19',
    monthly: { total_minor: 59000, net_minor: 50000, vat_minor: 9000 }, annual: { total_minor: 0, net_minor: 0, vat_minor: 0 } };
  const candidate = { ...initial, id: 12, version: 2, title: 'Offre suivante', terms: 'Nouvelles conditions', monthly: { total_minor: 70800, net_minor: 60000, vat_minor: 10800 } };
  await page.route('**/api/v1/restaurants/1/foody-billing**', route => {
    expect(route.request().method()).toBe('GET');
    if (route.request().url().endsWith('/usage')) return route.fulfill({ json: { observed: {}, month: '2026-11', complete: true } });
    return route.fulfill({ json: { offer: candidate, accepted_offer: initial, agreement: { offer_id: 11, cycle: 'monthly', period_end: '2027-12-19T10:00:00Z', renews: true },
      checkout_enabled: true, monthly_enabled: true, due: false } });
  });
  await page.goto('/1/billing');
  const current = page.getByRole('region', { name: 'Votre abonnement' });
  await expect(current).toContainText('Plan actuel');
  await expect(current).not.toContainText('708');
  await expect(page.getByRole('region', { name: 'Offre suivante' })).toContainText('708');
  await expect(page.getByRole('radio')).toHaveCount(0);
  await page.getByText('Détails de votre abonnement', { exact: true }).click();
  await expect(page.getByText('Conditions signées')).toBeVisible();
});

test('an expired trial can review a public plan and read invoices before checkout', async ({page}) => {
  await install(page);
  const requests:string[]=[];
  const seats={pos:0,chef:0,kds:0,employees:3,pos_devices:0};
  const product={id:'ordering',name:{fr:'Commande en ligne',he:'הזמנות',en:'Online ordering'},capabilities:['web_orders'],monthly_minor:50000,included:seats};
  const plan={id:'studio',name:{fr:'Studio',he:'סטודיו',en:'Studio'},modules:['ordering'],published:true,monthly_minor:55000,included:seats,capabilities:['web_orders']};
  const initial={offer:null,agreement:null,accepted_offer:null,payment:null,lifecycle:{state:'expired',trial_end:'2026-11-01T11:00:00Z'},
    plan_catalog:{version:'catalog-4',revision:4,currency:'ILS',minimum_trial_days:14,extra_pos_minor:0,products:[product],plans:[plan]},checkout_enabled:true,monthly_enabled:true,due:true,can_resume:false};
  const selected={...initial,offer:{id:17,version:1,title:'Studio',owner_selected:true,includes:'Online',terms:'Sandbox',start_date:'2026-11-01',
    monthly:{net_minor:55000,vat_minor:9900,total_minor:64900},annual:{net_minor:605000,vat_minor:108900,total_minor:713900}}};
  await page.route('**/api/v1/restaurants/1/foody-billing**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(route.request().method()==='POST') requests.push(path);
    if(path.endsWith('/documents')) return route.fulfill({json:emptyDocuments});
    if(path.endsWith('/select-plan')){
      expect(route.request().postDataJSON()).toEqual({catalog_version:'catalog-4',expected_offer_id:0,modules:[],plan_id:'studio',extra_pos_licences:0,extra_licences:{}});
      return route.fulfill({json:selected});
    }
    if(path.endsWith('/usage'))return route.fulfill({json:{month:'2026-11',observed:{},complete:true}});
    return route.fulfill({json:initial});
  });
  await page.setViewportSize({width:375,height:850});
  await page.goto('/1/billing#documents');
  const nav=page.getByRole('navigation',{name:'Facturation',exact:true});
  await expect(nav.getByRole('link',{name:'Factures'})).toHaveAttribute('aria-current','page');
  await nav.getByRole('link',{name:'Abonnement'}).click();
  await expect(page.getByRole('heading',{name:'Choisir ma formule Foody'})).toBeVisible();
  await expect(page.getByText(/Votre essai a pris fin/)).toBeVisible();
  await page.getByRole('radio',{name:/Studio/}).check();
  await page.getByRole('button',{name:'Vérifier mon abonnement'}).click();
  await expect(page.getByRole('heading',{name:'Studio'})).toBeVisible();
  await page.getByRole('button',{name:'Modifier mon choix'}).click();
  await expect(page.getByRole('radio',{name:/Studio/})).toBeVisible();
  expect(requests).toEqual(['/api/v1/restaurants/1/foody-billing/select-plan']);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
