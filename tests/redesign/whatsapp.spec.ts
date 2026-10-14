import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';
import type { MetaWhatsAppStatus, MetaWhatsAppTemplate, WhatsAppSender } from '../../src/lib/api';
import { orderNotificationTemplate } from '../../src/lib/orders/twilio-templates';

const displayName = 'Atelier Foody — service de commande de démonstration';
const senderExample: WhatsAppSender = { id: 1, restaurant_id: 1, waba_id: '123', phone_number_id: '456', sender_sid: 'synthetic-sender', sender_number: '+972500000000', display_name: displayName, status: 'ONLINE' };
async function install(page: Page, options: { locale?: string; connected?: boolean; permissions?: string[]; status?: string; sdkFailure?: boolean; otp?: 'required' | 'skip'; coexistence?: boolean; metaReady?: boolean } = {}) {
  const fixtureOptions = { empty: false, permissions: options.permissions };
  const fixture = createFixture(fixtureOptions);
  const writes: { path: string; method: string; body: any; restaurant?: string }[] = [];
  const control = {
    meta: { configured: !!options.coexistence, app_id: '100', config_id: '200', graph_version: 'v26.0', outbound_enabled: true, notifications_active: false, connection: options.metaReady ? { waba_id: '123', phone_number_id: '456', phone_number: '+12025550123', status: 'ready', subscribed: true, contacts_sync: 'requested', history_sync: 'complete', history_progress: 100, last_error: '', token_expires_at: null, notifications_enabled: false } : null } as MetaWhatsAppStatus,
    catalogue: ['order_recap', 'delivery_reminder', 'order_status', 'receipt'].map((kind, i) => ({ id: String(700 + i), name: kind, language: 'fr', status: 'APPROVED', category: 'UTILITY', parameter_format: 'POSITIONAL', components: [{ type: 'BODY', text: orderNotificationTemplate(kind as 'order_recap', 'fr') }] })) as MetaWhatsAppTemplate[],
    metaLostResponse: false,
    sender: options.connected === false ? null : { ...senderExample, status: options.status ?? 'ONLINE' } as WhatsAppSender | null,
    otp: options.otp ?? 'required', senderReads: 0,
    senderFailure: 0, settingsFailure: 0, connectFailure: 0, disconnectFailure: 0, otpFailure: 0,
    connectLostResponse: false, failConnectReadback: false,
    personalFailure: null as { error: string; details: string; status: number } | null,
    gate: null as Promise<void> | null, senderGate: null as Promise<void> | null,
  };
  await page.addInitScript(({ locale, sdkFailure }) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'owner', email: 'demo@foody.test' }));
    localStorage.setItem('foody_restaurant_ids', '[1,2]');
    localStorage.setItem('foody-admin-locale', locale);
    localStorage.setItem('foody_admin_theme', locale === 'he' ? 'dark' : 'light');
    const state = { sdkFailure, logins: [] as unknown[], initializations: 0 };
    (window as any).__wa = state;
    (window as any).FB = { init: () => { state.initializations++; if (state.sdkFailure) throw new Error('Synthetic SDK failure'); }, login: (callback: unknown, options: unknown) => { state.logins.push(options); (window as any).__waCallback = callback; }, getLoginStatus: () => {} };
  }, { locale: options.locale ?? 'fr', sdkFailure: options.sdkFailure ?? false });
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method(), body = request.postDataJSON() ?? {}, restaurant = request.headers()['x-restaurant-id'];
    const send = (json: unknown, status = 200) => route.fulfill({ json, status });
    const fail = () => send({ error: 'Synthetic WhatsApp failure' }, 503);
    if (/\/whatsapp\/meta(?:\/|$)/.test(path)) {
      if (path.endsWith('/templates') && method === 'GET') return send({ templates: control.catalogue });
      if (method === 'GET') return send(control.meta);
      writes.push({ path, method, body, restaurant });
      if (path.endsWith('/templates')) {
        const template: MetaWhatsAppTemplate = { id: String(900 + control.catalogue.length), name: body.name, language: body.language, status: 'PENDING', category: 'UTILITY', components: [{ type: 'BODY', text: body.body }] };
        control.catalogue.push(template); return send(template, 201);
      }
      if (path.endsWith('/notifications')) {
        control.meta.connection!.notifications_enabled = body.enabled;
        control.meta.notifications_active = body.enabled;
        for (const [kind, value] of Object.entries(body.templates ?? {})) {
          (control.meta.connection as any)[`${kind}_name`] = (value as any).name;
          (control.meta.connection as any)[`${kind}_language`] = (value as any).language;
        }
        if (control.metaLostResponse) return fail(); return send(control.meta);
      }
      if (path.endsWith('/signup')) return send({ state: 'a'.repeat(64), expires_at: new Date(Date.now() + 15 * 60_000).toISOString() });
      if (path.endsWith('/connect')) control.meta.connection = { waba_id: body.waba_id, phone_number_id: '456', phone_number: '+12025550123', status: 'syncing', subscribed: true, contacts_sync: 'requested', history_sync: 'requested', history_progress: 0, last_error: '', token_expires_at: null };
      return send(control.meta);
    }
    if (/\/restaurants\/\d+\/whatsapp\//.test(path)) {
      if (method === 'GET') {
        control.senderReads++;
        const row = control.sender ? { ...control.sender } : null;
        if (control.senderGate) await control.senderGate;
        if (control.senderFailure-- > 0) return fail();
        return send({ sender: row });
      }
      writes.push({ path, method, body, restaurant }); if (control.gate) await control.gate;
      if (method === 'DELETE') { if (control.disconnectFailure-- > 0) return fail(); control.sender = null; return send({ disconnected: true }); }
      if (path.endsWith('/whatsapp/personal') && control.personalFailure) return send({ error: control.personalFailure.error, details: control.personalFailure.details }, control.personalFailure.status);
      if (control.connectFailure-- > 0) { if (control.failConnectReadback) control.senderFailure = 100; return fail(); }
      control.sender = { ...senderExample, restaurant_id: Number(restaurant), waba_id: body.waba_id, phone_number_id: body.phone_number_id, sender_number: body.phone_number, display_name: body.display_name };
      if (path.endsWith('/whatsapp/personal')) control.sender = {
        ...control.sender, display_name: displayName, connection_mode: 'personal', sender_sid: body.sender_sid,
        twilio_account_sid: body.account_sid, twilio_api_key_sid: body.api_key_sid,
        content_sid_order_confirmed: body.content_sid_order_confirmed, content_sid_order_ready: body.content_sid_order_ready,
        content_sid_scheduled_confirmed: body.content_sid_scheduled_confirmed, content_sid_receipt: body.content_sid_receipt, content_sid_delivery_eta: body.content_sid_delivery_eta,
        content_sid_order_recap: body.content_sid_order_recap, content_sid_delivery_reminder: body.content_sid_delivery_reminder,
      };
      if (control.connectLostResponse) return fail();
      return send(control.sender);
    }
    if (/\/restaurants\/\d+\/settings$/.test(path)) {
      if (method === 'GET') { if (control.settingsFailure-- > 0) return fail(); return send({ settings: { require_order_approval: true, otp_mode: control.otp } }); }
      writes.push({ path, method, body, restaurant }); if (control.gate) await control.gate;
      if (control.otpFailure-- > 0) return fail(); control.otp = body.otp_mode; return send({ settings: { require_order_approval: true, otp_mode: control.otp } });
    }
    const result = fixture.response(request.url(), method, body, Number(restaurant) || 1);
    return send(result.json ?? {}, result.status ?? 200);
  });
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  return { fixture, control, writes };
}
const connection = (page: Page) => page.getByRole('region', { name: 'Connexion', exact: true });
const otp = (page: Page) => page.getByRole('region', { name: 'Validation du téléphone à la commande', exact: true });
const emit = (page: Page, origin = 'https://www.facebook.com', event = 'FINISH', identity = { waba_id: '123', phone_number_id: '456' }) => page.evaluate(({ origin, event, identity }) => window.dispatchEvent(new MessageEvent('message', { origin, data: JSON.stringify({ type: 'WA_EMBEDDED_SIGNUP', event, data: identity }) })), { origin, event, identity });
const launch = async (page: Page) => { await connection(page).getByRole('button', { name: 'Connecter WhatsApp', exact: true }).click(); await expect(connection(page)).toContainText('fenêtre Meta'); };
const prepare = async (page: Page) => { await launch(page); await emit(page); await connection(page).getByRole('textbox', { name: 'Numéro WhatsApp', exact: true }).fill('+972 (50) 000-0000'); await connection(page).getByRole('textbox', { name: 'Nom public', exact: true }).fill('  Service démo  '); };
const submit = (page: Page) => connection(page).getByRole('button', { name: 'Confirmer la connexion', exact: true });
const notice = (page: Page) => page.locator('main [role=status]').filter({ hasNotText: /^Chargement/ });
const guarded = (page: Page) => page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; });

async function openOtp(page: Page) {
  const details = page.getByTestId('wa-otp-settings');
  if (await details.getAttribute('open') === null) await details.locator('summary').click();
}
async function chooseMeta(page: Page, label: string, value: string) {
  await page.getByRole('button', { name: `Configurer · ${label}`, exact: true }).click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel(label, { exact: true }).selectOption(value);
  await editor.getByRole('button', { name: 'Terminé', exact: true }).click();
}

test('Square WhatsApp overview keeps setup details collapsed and pending approval visible', async ({ page }, info) => {
  const state = await install(page, { coexistence: true, metaReady: true });
  state.control.meta.connection!.status = 'syncing';
  state.control.meta.connection!.history_progress = 0;
  state.control.catalogue.forEach(row => { row.status = 'PENDING'; });
  await page.goto('/2/settings/whatsapp');
  await expect(page.getByRole('heading', { name: 'Messages aux clients', exact: true })).toBeVisible();
  await expect(page.getByTestId('wa-other-connections')).not.toHaveAttribute('open');
  await expect(page.getByTestId('wa-otp-settings')).not.toHaveAttribute('open');
  await expect(page.getByText('4 en attente de validation', { exact: true })).toBeVisible();
  await expect(page.getByText('Envoi automatique à la confirmation de la commande.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Activer les notifications Meta' })).toBeDisabled();
  await expect(page.getByText('Compte WhatsApp:', { exact: false })).toBeHidden();
  await page.screenshot({ path: info.outputPath('whatsapp-square-desktop-fr.png'), fullPage: true });
  expect(state.writes).toHaveLength(0);
});

test('Square WhatsApp template editor supports inspection without edit permission', async ({ page }) => {
  const state = await install(page, { coexistence: true, metaReady: true, permissions: ['settings.view'] });
  state.control.meta.connection!.order_recap_name = 'order_recap';
  state.control.meta.connection!.order_recap_language = 'fr';
  await page.goto('/2/settings/whatsapp');
  const view = page.getByRole('button', { name: 'Voir · Confirmation détaillée de commande', exact: true });
  await view.click();
  const editor = page.getByRole('dialog');
  await expect(editor.getByLabel('Confirmation détaillée de commande', { exact: true })).toBeDisabled();
  await expect(editor).toContainText(orderNotificationTemplate('order_recap', 'fr'));
  await editor.getByRole('button', { name: 'Terminé', exact: true }).click();
  await expect(view).toBeFocused();
  expect(state.writes).toHaveLength(0);
});

test('Square WhatsApp template creation preserves an edited message when closing is cancelled', async ({ page }, info) => {
  const state = await install(page, { coexistence: true, metaReady: true });
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.goto('/1/settings/whatsapp');
  await page.getByRole('button', { name: 'Créer un modèle', exact: true }).click();
  const editor = page.getByRole('dialog');
  const body = `${orderNotificationTemplate('order_recap', 'fr')} À bientôt.`;
  await editor.getByLabel('Texte du modèle').fill(body);
  await editor.getByRole('button', { name: 'Fermer', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(editor.getByLabel('Texte du modèle')).toHaveValue(body);
  await page.screenshot({ path: info.outputPath('whatsapp-square-editor-mobile-fr.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(state.writes).toHaveLength(0);
});

for (const locale of ['fr', 'he']) test(`Square WhatsApp mobile overview and model preview ${locale}`, async ({ page }, info) => {
  const state = await install(page, { coexistence: true, metaReady: true, locale });
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.goto('/2/settings/whatsapp');
  const configure = page.getByRole('button', { name: locale === 'fr' ? /^Configurer ·/ : /^הגדרה ·/ }).first();
  await expect(configure).toBeVisible();
  const copy = await page.locator('.wa-channel-copy').boundingBox();
  const refresh = await page.locator('.wa-channel > button').boundingBox();
  expect(copy!.width).toBeGreaterThan(200);
  expect(refresh!.y).toBeGreaterThanOrEqual(copy!.y + copy!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`whatsapp-square-mobile-${locale}.png`), animations: 'disabled' });
  await configure.click();
  const editor = page.getByRole('dialog');
  await editor.getByRole('combobox').selectOption('order_recap|fr');
  await expect(editor.locator('.wa-preview')).toContainText('votre commande est confirmée');
  await page.screenshot({ path: info.outputPath(`whatsapp-square-preview-${locale}.png`), animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(state.writes).toHaveLength(0);
});

const coexistence = (page: Page) => page.getByRole('region', { name: 'Votre numéro WhatsApp', exact: true });
for (const order of ['code-first', 'event-first', 'missing-event']) test(`Meta coexistence completes ${order} without activating Twilio routing`, async ({ page }) => {
  const state = await install(page, { connected: false, coexistence: true });
  await page.goto('/2/settings/whatsapp');
  await coexistence(page).getByRole('textbox', { name: 'Numéro WhatsApp Business actuel' }).fill('+1 (202) 555-0123');
  await coexistence(page).getByRole('button', { name: 'Préparer la connexion' }).click();
  await coexistence(page).getByRole('button', { name: 'Continuer avec Meta' }).click();
  const code = () => page.evaluate(() => (window as any).__waCallback({ authResponse: { code: 'one-use-code' } }));
  const identity = () => page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { origin: 'https://www.facebook.com', data: { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING', data: { waba_id: '123' } } })));
  if (order === 'event-first') { await identity(); expect(state.writes).toHaveLength(1); await code(); }
  else { await code(); if (order === 'code-first') await identity(); }
  await expect(coexistence(page)).toContainText('Synchronisation en cours');
  await expect(page.getByText('Les notifications sur ce numéro ne sont pas activées', { exact: true })).toBeVisible();
  expect(state.writes).toEqual([
    expect.objectContaining({ path: '/api/v1/restaurants/2/whatsapp/meta/signup', restaurant: '2', body: { phone_number: '+12025550123' } }),
    expect.objectContaining({ path: '/api/v1/restaurants/2/whatsapp/meta/connect', restaurant: '2', body: { state: 'a'.repeat(64), code: 'one-use-code', ...(order === 'event-first' ? { waba_id: '123' } : {}) } }),
  ]);
  const login = await page.evaluate(() => (window as any).__wa.logins[0]);
  expect(login).toMatchObject({ config_id: '200', extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3' } });
  expect(JSON.stringify(login)).not.toContain('solutionID');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('one-use-code');
  expect(state.control.sender).toBeNull();
});

test('Meta coexistence cancellation ignores late authorization and spoofed events', async ({ page }) => {
  const state = await install(page, { connected: false, coexistence: true }); await page.goto('/1/settings/whatsapp');
  await coexistence(page).getByRole('textbox', { name: 'Numéro WhatsApp Business actuel' }).fill('+12025550123');
  await coexistence(page).getByRole('button', { name: 'Préparer la connexion' }).click();
  await coexistence(page).getByRole('button', { name: 'Continuer avec Meta' }).click();
  await emit(page, 'https://evil.test', 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING');
  await coexistence(page).getByRole('button', { name: 'Annuler', exact: true }).click();
  await page.evaluate(() => (window as any).__waCallback({ authResponse: { code: 'late' } }));
  await emit(page, 'https://www.facebook.com', 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING');
  expect(state.writes).toHaveLength(1);
  await expect(coexistence(page).getByRole('button', { name: 'Préparer la connexion' })).toBeVisible();
});

test('native Meta templates are reviewed and require explicit activation for the selected restaurant', async ({ page }, info) => {
  const state = await install(page, { coexistence: true, metaReady: true });
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.goto('/2/settings/whatsapp');
  const region = page.getByRole('region', { name: 'Modèles de notifications Meta', exact: true });
  const activate = region.getByRole('button', { name: 'Activer les notifications Meta' });
  await expect(activate).toBeDisabled();
  await chooseMeta(page, 'Confirmation détaillée de commande', 'order_recap|fr');
  await chooseMeta(page, 'Rappel de livraison avec livreur', 'delivery_reminder|fr');
  await expect(activate).toBeEnabled();
  await activate.click();
  await expect(region).toContainText('Les notifications WhatsApp sont activées');
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0]).toMatchObject({ path: '/api/v1/restaurants/2/whatsapp/meta/notifications', method: 'PUT', restaurant: '2', body: { enabled: true, templates: { order_recap: { name: 'order_recap', language: 'fr' }, delivery_reminder: { name: 'delivery_reminder', language: 'fr' } } } });
  await page.screenshot({ path: info.outputPath('whatsapp-meta-templates-fr.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await region.getByText('Bibliothèque des modèles', { exact: false }).click();
  await region.getByRole('button', { name: 'Utiliser les réglages Twilio existants' }).click();
  await expect(region).toContainText('Les notifications sur ce numéro ne sont pas activées');
  expect(state.writes[1].body).toEqual({ enabled: false });
});

test('native Meta submission preserves reviewed text and pending templates cannot activate sending', async ({ page }) => {
  const state = await install(page, { coexistence: true, metaReady: true }); await page.goto('/1/settings/whatsapp');
  const region = page.getByRole('region', { name: 'Modèles de notifications Meta', exact: true });
  await region.getByRole('button', { name: 'Créer un modèle', exact: true }).click();
  const creator = page.getByRole('dialog');
  await creator.getByLabel('Type de notification', { exact: true }).selectOption('delivery_reminder');
  await expect(creator.getByLabel('Texte du modèle')).toHaveValue(orderNotificationTemplate('delivery_reminder', 'fr'));
  await creator.getByRole('button', { name: 'Soumettre à Meta', exact: true }).click();
  await expect(region).toContainText('Modèle soumis à Meta');
  expect(state.writes[0]).toMatchObject({ body: { kind: 'delivery_reminder', name: 'foody_delivery_reminder_fr', language: 'fr', body: orderNotificationTemplate('delivery_reminder', 'fr') } });
  await page.getByRole('button', { name: 'Configurer · Rappel de livraison avec livreur', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Rappel de livraison avec livreur', { exact: true }).locator('option[value="foody_delivery_reminder_fr|fr"]')).toHaveAttribute('disabled', '');
  await page.getByRole('dialog').getByRole('button', { name: 'Terminé', exact: true }).click();
  await expect(region.getByRole('button', { name: 'Activer les notifications Meta' })).toBeDisabled();
});

test('lost Meta activation response is read back without repeating the write', async ({ page }) => {
  const state = await install(page, { coexistence: true, metaReady: true }); state.control.metaLostResponse = true;
  await page.goto('/1/settings/whatsapp'); const region = page.getByRole('region', { name: 'Modèles de notifications Meta', exact: true });
  await chooseMeta(page, 'Confirmation détaillée de commande', 'order_recap|fr');
  await chooseMeta(page, 'Rappel de livraison avec livreur', 'delivery_reminder|fr');
  await region.getByRole('button', { name: 'Activer les notifications Meta' }).click();
  await expect(region).toContainText('Les notifications WhatsApp sont activées');
  expect(state.writes).toHaveLength(1);
});

async function preparePersonal(page: Page) {
  await connection(page).getByRole('radio', { name: 'Mon propre compte Twilio', exact: true }).check();
  const fields = {
    'Twilio Account SID': `AC${'1'.repeat(32)}`, 'API Key SID': `SK${'2'.repeat(32)}`,
    'Secret de la clé API': 'synthetic-personal-secret-only', 'WhatsApp Sender SID': `XE${'3'.repeat(32)}`,
    'Numéro WhatsApp': '+972 (50) 000-0000', 'Identifiant Meta WhatsApp Business Account (WABA)': '123', 'Meta Phone Number ID': '456',
    'Confirmation de commande': `HX${'4'.repeat(32)}`, 'Statut de commande': `HX${'5'.repeat(32)}`,
  };
  for (const [label, value] of Object.entries(fields)) await connection(page).getByLabel(label, { exact: true }).fill(value);
}

test('personal WhatsApp connects the selected restaurant without Meta signup and never redisplays its secret', async ({ page }, info) => {
  const state = await install(page, { connected: false }); await page.setViewportSize({ width: 375, height: 1000 });
  await page.goto('/2/settings/whatsapp'); await preparePersonal(page);
  await expect(connection(page).getByRole('radio', { name: 'Géré par Foody', exact: true })).toBeDisabled();
  await expect(connection(page).getByLabel('Secret de la clé API', { exact: true })).toHaveAttribute('type', 'password');
  await page.screenshot({ path: info.outputPath('whatsapp-personal-fr.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await connection(page).getByRole('button', { name: 'Vérifier et enregistrer', exact: true }).click();
  await expect(connection(page)).toContainText('Twilio vous facture directement');
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0]).toMatchObject({ path: '/api/v1/restaurants/2/whatsapp/personal', method: 'PUT', restaurant: '2', body: { account_sid: `AC${'1'.repeat(32)}`, api_key_sid: `SK${'2'.repeat(32)}`, secret: 'synthetic-personal-secret-only', phone_number: '+972500000000' } });
  expect(await page.evaluate(() => (window as any).__wa.logins.length)).toBe(0);
  await connection(page).getByRole('button', { name: 'Modifier ma configuration', exact: true }).click();
  await expect(connection(page).getByLabel('Secret de la clé API', { exact: true })).toHaveValue('');
  await expect(connection(page).getByRole('button', { name: 'Vérifier et enregistrer', exact: true })).toBeEnabled();
  await connection(page).getByRole('button', { name: 'Vérifier et enregistrer', exact: true }).click();
  await expect(connection(page).getByRole('button', { name: 'Modifier ma configuration', exact: true })).toBeVisible();
  expect(state.writes[1].body.secret).toBe('');
  expect(await guarded(page)).toBe(false);
});

test('personal WhatsApp rejects invalid IDs and requires a fresh secret for a different account', async ({ page }) => {
  const state = await install(page, { connected: false }); await page.goto('/1/settings/whatsapp'); await preparePersonal(page);
  const save = connection(page).getByRole('button', { name: 'Vérifier et enregistrer', exact: true });
  await connection(page).getByLabel('Twilio Account SID', { exact: true }).fill('ACinvalid'); await expect(save).toBeDisabled();
  await connection(page).getByLabel('Twilio Account SID', { exact: true }).fill(`AC${'1'.repeat(32)}`); await save.click();
  await connection(page).getByRole('button', { name: 'Modifier ma configuration', exact: true }).click();
  await connection(page).getByLabel('Twilio Account SID', { exact: true }).fill(`AC${'9'.repeat(32)}`); await expect(save).toBeDisabled();
  expect(state.writes).toHaveLength(1);
});

test('personal WhatsApp failed verification clears the secret and lost responses never resubmit automatically', async ({ page }) => {
  const state = await install(page, { connected: false }); state.control.connectFailure = 1;
  await page.goto('/1/settings/whatsapp'); await preparePersonal(page);
  await connection(page).getByRole('button', { name: 'Vérifier et enregistrer', exact: true }).click();
  await expect(connection(page).getByRole('alert')).toContainText('vérifiée ou enregistrée');
  await expect(connection(page).getByLabel('Secret de la clé API', { exact: true })).toHaveValue('');
  await connection(page).getByLabel('Secret de la clé API', { exact: true }).fill('synthetic-personal-secret-only');
  state.control.connectLostResponse = true;
  await connection(page).getByRole('button', { name: 'Vérifier et enregistrer', exact: true }).click();
  await expect(connection(page).getByRole('status')).toContainText('configuration a pu être enregistrée');
  await expect(connection(page).getByRole('button', { name: 'Vérifier et enregistrer', exact: true })).toBeDisabled();
  expect(state.writes).toHaveLength(2);
  await connection(page).getByRole('button', { name: 'Fermer et vérifier la connexion', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Quitter la configuration', exact: true }).click();
  await expect(connection(page)).toContainText('Twilio vous facture directement');
});

test('personal WhatsApp identifies a pending template and keeps a rejected edit retryable', async ({ page }) => {
  const state = await install(page, { connected: false });
  await page.goto('/1/settings/whatsapp'); await preparePersonal(page);
  await connection(page).getByRole('button', { name: 'Vérifier et enregistrer', exact: true }).click();
  await connection(page).getByRole('button', { name: 'Modifier ma configuration', exact: true }).click();
  state.control.personalFailure = { error: 'whatsapp_personal_template_pending', details: 'content_sid_order_confirmed', status: 422 };
  const readsBefore = state.control.senderReads;
  await connection(page).getByRole('button', { name: 'Vérifier et enregistrer', exact: true }).click();
  await expect(connection(page).getByRole('alert')).toContainText('Confirmation de commande : L’approbation WhatsApp est encore Pending');
  await expect(connection(page).getByRole('alert')).toContainText('Approved');
  await expect(connection(page).getByLabel('Secret de la clé API', { exact: true })).toHaveValue('');
  await expect(connection(page).getByRole('button', { name: 'Vérifier et enregistrer', exact: true })).toBeEnabled();
  expect(state.control.senderReads).toBe(readsBefore);
  expect(state.writes).toHaveLength(2);
  state.control.personalFailure = null;
  await connection(page).getByRole('button', { name: 'Vérifier et enregistrer', exact: true }).click();
  await expect(connection(page).getByRole('button', { name: 'Modifier ma configuration', exact: true })).toBeVisible();
});

test('personal WhatsApp never displays unknown provider text or field names', async ({ page }) => {
  const state = await install(page, { connected: false });
  state.control.personalFailure = { error: 'synthetic-private-provider-text', details: 'synthetic-private-field', status: 502 };
  await page.goto('/1/settings/whatsapp'); await preparePersonal(page);
  await connection(page).getByRole('button', { name: 'Vérifier et enregistrer', exact: true }).click();
  await expect(connection(page).getByRole('alert')).toContainText('vérifiée ou enregistrée');
  await expect(connection(page)).not.toContainText('synthetic-private');
  expect(state.writes).toHaveLength(1);
});

test('personal WhatsApp revoked credentials remain editable while their live status is explicitly unverified', async ({ page }) => {
  const state = await install(page, { connected: false }); await page.goto('/1/settings/whatsapp'); await preparePersonal(page);
  await connection(page).getByRole('button', { name: 'Vérifier et enregistrer', exact: true }).click();
  await expect(connection(page).getByRole('button', { name: 'Modifier ma configuration', exact: true })).toBeVisible();
  state.control.sender!.status_refresh_failed = true;
  await page.reload();
  await expect(connection(page)).toContainText('État non vérifié');
  await expect(connection(page).getByRole('alert')).toContainText('remplacez vos identifiants');
  await connection(page).getByRole('button', { name: 'Modifier ma configuration', exact: true }).click();
  await expect(connection(page).getByLabel('Secret de la clé API', { exact: true })).toBeEditable();
});

test('personal WhatsApp setup remains usable in Hebrew on mobile', async ({ page }, info) => {
  await install(page, { connected: false, locale: 'he' }); await page.setViewportSize({ width: 375, height: 1000 });
  await page.goto('/1/settings/whatsapp');
  await page.getByRole('radio', { name: 'חשבון Twilio שלי', exact: true }).check();
  await expect(page.getByLabel('Twilio Account SID', { exact: true })).toBeEditable();
  await expect(page.getByRole('button', { name: 'אימות ושמירה', exact: true })).toBeDisabled();
  await page.screenshot({ path: info.outputPath('whatsapp-personal-he.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

for (const locale of ['fr', 'he']) test(`whatsapp connection and phone policy responsive ${locale}`, async ({ page }, info) => {
  const state = await install(page, { locale });
  await page.setViewportSize({ width: locale === 'fr' ? 375 : 1440, height: 1000 });
  await page.goto('/1/settings/whatsapp'); await openOtp(page);
  await expect(page.getByText(displayName, { exact: true })).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(2);
  await page.screenshot({ path: info.outputPath(`whatsapp-${locale}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  expect(state.fixture.unhandled).toEqual([]);
});

test('whatsapp sender load failure does not masquerade as disconnected and retries independently', async ({ page }) => {
  const state = await install(page); state.control.senderFailure = 100;
  await page.goto('/1/settings/whatsapp'); await openOtp(page);
  await expect(connection(page).getByRole('alert')).toBeVisible();
  await expect(connection(page).getByRole('button', { name: 'Connecter WhatsApp', exact: true })).toHaveCount(0);
  await expect(otp(page).getByRole('radio')).toHaveCount(2);
  state.control.senderFailure = 0;
  await connection(page).getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect(page.getByText(displayName, { exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(0);
});

test('whatsapp failed phone-policy load never invents a default', async ({ page }) => {
  const state = await install(page, { otp: 'skip' }); state.control.settingsFailure = 100;
  await page.goto('/1/settings/whatsapp'); await openOtp(page);
  await expect(otp(page).getByRole('alert')).toBeVisible(); await expect(otp(page).getByRole('radio')).toHaveCount(0);
  state.control.settingsFailure = 0;
  await otp(page).getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect(otp(page).getByRole('radio', { name: 'Désactiver les codes de validation', exact: true })).toBeChecked();
});

test('whatsapp ignores unsolicited, deceptive-origin and stale signup messages', async ({ page }) => {
  const state = await install(page, { connected: false }); await page.goto('/1/settings/whatsapp');
  await emit(page); await expect(connection(page).getByRole('textbox')).toHaveCount(0);
  await launch(page);
  for (const origin of ['https://notfacebook.com', 'http://facebook.com', 'https://facebook.com.attacker.test']) await emit(page, origin);
  await expect(connection(page).getByRole('textbox')).toHaveCount(0);
  await emit(page, 'https://www.facebook.com', 'CANCEL');
  await expect(notice(page)).toContainText('Inscription annulée');
  await emit(page); await expect(connection(page).getByRole('textbox')).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
});

test('whatsapp registration preserves reviewed identity and serializes the confirmed request', async ({ page }, info) => {
  const state = await install(page, { connected: false }); await page.setViewportSize({ width: 375, height: 1000 }); await page.goto('/2/settings/whatsapp'); await prepare(page);
  await emit(page, 'https://www.facebook.com', 'FINISH', { waba_id: 'unwanted', phone_number_id: 'replacement' });
  await page.screenshot({ path: info.outputPath('whatsapp-review-fr.png') });
  let release!: () => void; state.control.gate = new Promise<void>(resolve => { release = resolve; });
  await submit(page).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(connection(page).getByRole('textbox', { name: 'Nom public', exact: true })).toBeDisabled();
  await expect.poll(() => state.writes.length).toBe(1);
  release();
  await expect(notice(page)).toContainText('expéditeur est enregistré');
  expect(state.writes[0]).toMatchObject({ path: '/api/v1/restaurants/2/whatsapp/connect', restaurant: '2', body: { waba_id: '123', phone_number_id: '456', phone_number: '+972500000000', display_name: 'Service démo' } });
  expect(await guarded(page)).toBe(false);
});

test('whatsapp invalid phone cannot submit and cancelling a draft requires confirmation', async ({ page }) => {
  const state = await install(page, { connected: false }); await page.goto('/1/settings/whatsapp'); await prepare(page);
  const phone = connection(page).getByRole('textbox', { name: 'Numéro WhatsApp', exact: true });
  await phone.fill('0500000000'); await expect(phone).toHaveAttribute('aria-invalid', 'true'); await expect(submit(page)).toBeDisabled();
  expect(await guarded(page)).toBe(true);
  const cancel = connection(page).getByRole('button', { name: 'Annuler', exact: true }); await cancel.click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler', exact: true }).click(); await expect(cancel).toBeFocused(); await expect(phone).toHaveValue('0500000000');
  await cancel.click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Quitter la configuration', exact: true }).click();
  await expect(connection(page).getByRole('textbox')).toHaveCount(0); expect(await guarded(page)).toBe(false); expect(state.writes).toHaveLength(0);
});

test('whatsapp SDK initialization failure is recoverable without opening a real Meta window', async ({ page }) => {
  const state = await install(page, { connected: false, sdkFailure: true }); await page.goto('/1/settings/whatsapp');
  await expect(connection(page).getByRole('alert')).toContainText('fenêtre de connexion Meta');
  await page.evaluate(() => { (window as any).__wa.sdkFailure = false; });
  await connection(page).getByRole('button', { name: 'Réessayer', exact: true }).click();
  await launch(page);
  await emit(page, 'https://www.facebook.com', 'ERROR');
  await expect(page.locator('main [role=alert]')).toContainText('n’a pas abouti');
  expect(state.writes).toHaveLength(0);
  expect(await page.evaluate(() => (window as any).__wa.logins.length)).toBe(1);
});

test('whatsapp does not register again after a lost response when GET recovers the saved sender', async ({ page }) => {
  const state = await install(page, { connected: false }); state.control.connectLostResponse = true;
  await page.goto('/1/settings/whatsapp'); await prepare(page); await submit(page).click();
  await expect(notice(page)).toContainText('expéditeur enregistré a été retrouvé');
  await expect(connection(page).getByRole('textbox')).toHaveCount(0);
  expect(state.writes).toHaveLength(1);
});

test('whatsapp failed registration keeps details and requires confirmation before a second attempt', async ({ page }) => {
  const state = await install(page, { connected: false }); state.control.connectFailure = 1;
  await page.goto('/1/settings/whatsapp'); await prepare(page); await submit(page).click();
  await expect(page.locator('main [role=alert]')).toContainText('a pu être créé');
  await expect(connection(page).getByRole('textbox', { name: 'Nom public', exact: true })).toHaveValue('  Service démo  ');
  await connection(page).getByRole('button', { name: 'Relancer l’inscription', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('prestataire');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler', exact: true }).click(); expect(state.writes).toHaveLength(1);
  await connection(page).getByRole('button', { name: 'Relancer l’inscription', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Relancer l’inscription', exact: true }).click();
  await expect(notice(page)).toContainText('expéditeur est enregistré'); expect(state.writes).toHaveLength(2);
});

test('whatsapp uncertain registration retries only verification until the saved state is known', async ({ page }) => {
  const state = await install(page, { connected: false }); state.control.connectFailure = 1; state.control.failConnectReadback = true;
  await page.goto('/1/settings/whatsapp'); await prepare(page); await submit(page).click();
  await expect(page.locator('main [role=alert]')).toContainText('a pu être créé');
  await expect(connection(page).getByRole('button', { name: 'Relancer l’inscription', exact: true })).toHaveCount(0);
  await connection(page).getByRole('button', { name: 'Vérifier l’association enregistrée', exact: true }).click();
  await expect(page.locator('main [role=alert]')).toContainText('n’a pas pu être vérifiée');
  state.control.senderFailure = 0; state.control.sender = { ...senderExample };
  await connection(page).getByRole('button', { name: 'Vérifier l’association enregistrée', exact: true }).click();
  await expect(page.getByText(displayName, { exact: true })).toBeVisible(); expect(state.writes).toHaveLength(1);
});

test('whatsapp disconnect explains local scope, supports cancellation and preserves the sender after failure', async ({ page }) => {
  const state = await install(page); state.control.disconnectFailure = 1; await page.goto('/2/settings/whatsapp');
  const disconnect = connection(page).getByRole('button', { name: 'Déconnecter de Foody', exact: true }); await disconnect.click();
  await expect(page.getByRole('alertdialog')).toContainText('ne supprime pas votre compte');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler', exact: true }).click(); await expect(disconnect).toBeFocused();
  await disconnect.click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Déconnecter de Foody', exact: true }).click();
  await expect(page.locator('main [role=alert]')).toBeVisible(); await expect(page.getByText(displayName, { exact: true })).toBeVisible();
  await disconnect.click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Déconnecter de Foody', exact: true }).click();
  await expect(notice(page)).toContainText('retirée de Foody');
  expect(state.writes).toHaveLength(2); expect(state.writes.every(row => row.restaurant === '2' && row.method === 'DELETE')).toBe(true);
});

test('whatsapp phone policy preserves confirmed values on failure and writes only otp_mode', async ({ page }) => {
  const state = await install(page); state.control.otpFailure = 1; await page.goto('/2/settings/whatsapp'); await openOtp(page);
  const skip = otp(page).getByRole('radio', { name: 'Désactiver les codes de validation', exact: true });
  await skip.click(); await expect(page.locator('main [role=alert]')).toBeVisible();
  await expect(otp(page).getByRole('radio', { name: 'Activer les codes de validation', exact: true })).toBeChecked();
  let release!: () => void; state.control.gate = new Promise<void>(resolve => { release = resolve; });
  await skip.click(); await expect(skip).toBeDisabled(); await expect(otp(page).getByRole('radio').first()).toBeDisabled();
  release(); await expect(skip).toBeChecked();
  expect(state.writes).toHaveLength(2); expect(state.writes[1]).toMatchObject({ restaurant: '2', body: { otp_mode: 'skip' } });
});

test('whatsapp saving OTP while the sender loads does not invent a disconnected state', async ({ page }) => {
  const state = await install(page); let release!: () => void; state.control.senderGate = new Promise<void>(resolve => { release = resolve; });
  await page.goto('/1/settings/whatsapp'); await openOtp(page);
  await otp(page).getByRole('radio', { name: 'Désactiver les codes de validation', exact: true }).click();
  await expect(otp(page).getByRole('radio', { name: 'Désactiver les codes de validation', exact: true })).toBeChecked();
  await expect(connection(page).getByRole('status')).toContainText('Chargement');
  await expect(connection(page).getByRole('button', { name: 'Connecter WhatsApp', exact: true })).toHaveCount(0);
  release(); await expect(page.getByText(displayName, { exact: true })).toBeVisible();
});

test('whatsapp polling failure keeps the sender visible and can be refreshed', async ({ page }) => {
  const state = await install(page, { status: 'CREATING' }); await page.goto('/1/settings/whatsapp');
  await expect(connection(page)).toContainText('Inscription en cours'); state.control.senderFailure = 100;
  await expect(connection(page).getByRole('alert')).toBeVisible({ timeout: 12000 });
  await expect(page.getByText(displayName, { exact: true })).toBeVisible();
  await expect(connection(page).getByRole('button', { name: 'Déconnecter de Foody', exact: true })).toBeDisabled();
  state.control.senderFailure = 0; state.control.sender!.status = 'ONLINE';
  await connection(page).getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect(connection(page)).toContainText('En ligne'); expect(state.writes).toHaveLength(0);
});

test('whatsapp ignores a late poll after the sender has been disconnected', async ({ page }) => {
  const state = await install(page, { status: 'CREATING' }); await page.goto('/1/settings/whatsapp'); await expect(page.getByText(displayName, { exact: true })).toBeVisible();
  let release!: () => void; state.control.senderGate = new Promise<void>(resolve => { release = resolve; });
  await expect.poll(() => state.control.senderReads, { timeout: 12000 }).toBe(2);
  await connection(page).getByRole('button', { name: 'Déconnecter de Foody', exact: true }).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Déconnecter de Foody', exact: true }).click();
  await expect(notice(page)).toContainText('retirée de Foody');
  release(); await expect(connection(page).getByRole('button', { name: 'Connecter WhatsApp', exact: true })).toBeVisible();
  await expect(page.getByText(displayName, { exact: true })).toHaveCount(0);
});

test('whatsapp read-only users can inspect status and policy without starting signup or changing either', async ({ page }) => {
  const state = await install(page, { permissions: ['settings.view'] }); await page.goto('/1/settings/whatsapp'); await openOtp(page);
  await expect(page.getByText(displayName, { exact: true })).toBeVisible();
  await expect(otp(page).getByRole('radio').first()).toBeDisabled();
  await expect(connection(page).getByRole('button', { name: 'Déconnecter de Foody', exact: true })).toHaveCount(0);
  await emit(page); expect(state.writes).toHaveLength(0);
  expect(await page.evaluate(() => (window as any).__wa.initializations)).toBe(0);
});

test('personal Twilio accepts the dedicated pair without legacy templates and shows copyable contracts', async ({ page }) => {
  const state = await install(page, { connected: false });
  await page.goto('/1/settings/whatsapp'); await preparePersonal(page);
  await connection(page).getByLabel('Confirmation de commande', { exact: true }).fill('');
  await connection(page).getByLabel('Statut de commande', { exact: true }).fill('');
  const save = connection(page).getByRole('button', { name: 'Vérifier et enregistrer', exact: true });
  await expect(save).toBeDisabled();
  await connection(page).getByLabel('Confirmation détaillée de commande', { exact: true }).fill(`HX${'6'.repeat(32)}`);
  await expect(save).toBeDisabled();
  await connection(page).getByLabel('Rappel de livraison avec livreur', { exact: true }).fill(`HX${'7'.repeat(32)}`);
  await expect(save).toBeEnabled();
  await connection(page).getByText('Texte suggéré à créer dans Twilio', { exact: true }).first().click();
  await expect(connection(page).locator('pre').first()).toContainText('récapitulatif complet ici : {{8}}');
  await connection(page).getByText('Texte suggéré à créer dans Twilio', { exact: true }).nth(1).click();
  await expect(connection(page).locator('pre').nth(1)).toContainText('Boker tov {{1}} 🧡');
  await expect(connection(page).locator('pre').nth(1)).toContainText('le livreur ({{3}})');
  await expect(connection(page).locator('pre').nth(1)).toContainText('choisi {{4}} pour votre Shabbat ✨');
  await expect(connection(page)).toContainText('3 nom complet et téléphone du livreur · 4 restaurant');
  await save.click();
  expect(state.writes[0].body).toMatchObject({
    content_sid_order_recap: `HX${'6'.repeat(32)}`, content_sid_delivery_reminder: `HX${'7'.repeat(32)}`,
    content_sid_order_confirmed: '', content_sid_order_ready: '',
  });
});
