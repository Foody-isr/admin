import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';
import { TEMPLATE_REGISTRY } from '../../src/lib/messages/registry';
import type { MessageTemplate, PasskeyCredential } from '../../src/lib/api';

const recapTitle = 'Confirmation de commande WhatsApp';
const keyName = 'Ordinateur de démonstration — équipe de coordination';
async function install(page: Page, options: { locale?: string; permissions?: string[]; unsupported?: boolean; emptyKeys?: boolean } = {}) {
  const fixtureOptions = { empty: false, permissions: options.permissions };
  const fixture = createFixture(fixtureOptions);
  const rows: MessageTemplate[] = ['order_recap', 'delivery_reminder'].flatMap((key, index) => [
    { id: index * 3 + 1, restaurant_id: 1, key, locale: 'fr', body: 'Bonjour {{client}} de {{restaurant}}', is_auto_translated: false, created_at: '2026-10-01T08:00:00Z', updated_at: '2026-10-01T08:00:00Z' },
    { id: index * 3 + 2, restaurant_id: 1, key, locale: 'he', body: 'שלום {{client}}', is_auto_translated: true, created_at: '2026-10-01T08:00:00Z', updated_at: '2026-10-01T08:00:00Z' },
    { id: index * 3 + 3, restaurant_id: 1, key, locale: 'en', body: 'Hello {{client}}', is_auto_translated: false, created_at: '2026-10-01T08:00:00Z', updated_at: '2026-10-01T08:00:00Z' },
  ]);
  const credentials: PasskeyCredential[] = options.emptyKeys ? [] : [
    { id: 1, name: keyName, created_at: '2026-10-01T08:00:00Z', last_used_at: '2026-10-03T10:00:00Z' },
    { id: 2, name: 'מכשיר לדוגמה · Équipe', created_at: '2026-09-26T08:00:00Z' },
  ];
  const writes: { path: string; body: any; restaurant?: string; query: string }[] = [];
  const faults = { templateLoad: 0, templateSave: 0, templateReset: 0, translation: 0, keyLoad: 0, keyDelete: 0, keyBegin: 0, keyFinish: 0 };
  const control = { saveGate: null as Promise<void> | null, keyGate: null as Promise<void> | null, failRefreshAfterWrite: false };
  await page.addInitScript(({ locale, unsupported }) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'owner', email: 'demo@foody.test' }));
    localStorage.setItem('foody_restaurant_ids', '[1,2]');
    localStorage.setItem('foody-admin-locale', locale);
    localStorage.setItem('foody_admin_theme', locale === 'he' ? 'dark' : 'light');
    localStorage.setItem('foody.passkey.device', '1');
    if (unsupported && window.PublicKeyCredential) window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = async () => false;
  }, { locale: options.locale ?? 'fr', unsupported: options.unsupported ?? false });
  if (!options.unsupported) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
      protocol: 'ctap2', transport: 'internal', hasResidentKey: true,
      hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true,
    } });
  }
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const method = request.method(), body = request.postDataJSON() ?? {}, restaurant = request.headers()['x-restaurant-id'];
    const send = (json: unknown, status = 200) => route.fulfill({ json, status });
    const fail = () => send({ error: 'Échec synthétique compte' }, 503);
    const consume = (key: keyof typeof faults) => { if (faults[key] > 0) { faults[key]--; return true; } return false; };
    if (path.includes('/message-templates')) {
      if (method === 'GET') {
        if (consume('templateLoad')) return fail();
        return send({ templates: rows });
      }
      writes.push({ path, body, restaurant, query: url.search });
      if (control.saveGate) await control.saveGate;
      const key = path.split('/').at(-2)!, locale = path.split('/').at(-1)!;
      const index = rows.findIndex(row => row.key === key && row.locale === locale);
      if (method === 'DELETE') {
        if (consume('templateReset')) return fail();
        if (index >= 0) rows.splice(index, 1);
        if (control.failRefreshAfterWrite) faults.templateLoad = 100;
        return route.fulfill({ status: 204 });
      }
      if (consume('templateSave')) return fail();
      const row = { id: 100 + rows.length, restaurant_id: Number(restaurant), key, locale, body: body.body, is_auto_translated: false, created_at: '2026-10-04T10:00:00Z', updated_at: '2026-10-04T10:00:00Z' };
      if (index >= 0) rows[index] = row; else rows.push(row);
      if (control.failRefreshAfterWrite) faults.templateLoad = 100;
      if (consume('translation')) return send({ translated_locales: [], translation_error: 'synthetic translator unavailable' });
      const translated: string[] = [];
      for (const target of rows.filter(row => row.key === key && row.locale !== locale && row.is_auto_translated)) {
        target.body = `Auto ${target.locale}: ${body.body}`; translated.push(target.locale);
      }
      return send({ translated_locales: translated });
    }
    if (path.startsWith('/api/v1/auth/webauthn/')) {
      if (method !== 'GET') writes.push({ path, body, restaurant, query: url.search });
      if (method === 'GET') { if (consume('keyLoad')) return fail(); return send({ credentials }); }
      if (path.endsWith('/begin')) {
        if (consume('keyBegin')) return fail();
        return send({ session_id: 'isolated-registration', options: { publicKey: {
          challenge: 'c3ludGhldGljLWNoYWxsZW5nZS1mb29keQ', rp: { name: 'Foody synthétique', id: 'localhost' },
          user: { id: 'ZGVtby11c2Vy', name: 'demo@foody.test', displayName: 'Équipe démo' },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }], timeout: 30000, attestation: 'none',
          authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'preferred' },
        } } });
      }
      if (path.endsWith('/finish')) {
        if (control.keyGate) await control.keyGate;
        if (consume('keyFinish')) return fail();
        const credential = { id: 3, name: url.searchParams.get('name') || 'Appareil démo', created_at: '2026-10-04T10:00:00Z' };
        credentials.unshift(credential); return send({ credential });
      }
      if (method === 'DELETE') {
        if (control.keyGate) await control.keyGate;
        if (consume('keyDelete')) return fail();
        const id = Number(path.split('/').at(-1));
        const index = credentials.findIndex(key => key.id === id); if (index >= 0) credentials.splice(index, 1);
        return route.fulfill({ status: 204 });
      }
    }
    const result = fixture.response(request.url(), method, body, Number(restaurant) || 1);
    return send(result.json ?? {}, result.status ?? 200);
  });
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  return { fixture, rows, credentials, writes, faults, control };
}

const recap = (page: Page) => page.getByRole('region', { name: recapTitle, exact: true });
const recapBody = (page: Page, locale = 'Français') => recap(page).getByRole('textbox', { name: `${recapTitle} · ${locale}`, exact: true });
const save = (page: Page) => recap(page).getByRole('button', { name: 'Enregistrer', exact: true });
const reset = (page: Page) => recap(page).getByRole('button', { name: 'Rétablir le texte par défaut', exact: true });
const guarded = (page: Page) => page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; });

for (const locale of ['fr', 'he']) test(`account settings message preview and passkey list responsive ${locale}`, async ({ page }, info) => {
  const state = await install(page, { locale });
  for (const row of state.rows) { const def = TEMPLATE_REGISTRY.find(def => def.key === row.key)!; if (row.locale === 'fr' || row.locale === 'he' || row.locale === 'en') row.body = def.defaults[row.locale]; }
  await page.setViewportSize({ width: locale === 'fr' ? 375 : 1440, height: 1000 });
  await page.goto('/1/settings/message-templates');
  await expect(page.locator('textarea').first()).toBeVisible();
  await page.screenshot({ path: info.outputPath(`account-templates-${locale}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.goto('/1/settings/security');
  await expect(page.getByText(keyName, { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath(`account-security-${locale}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  expect(state.fixture.unhandled).toEqual([]);
});

test('message templates retry an initial load without showing defaults as saved content', async ({ page }) => {
  const state = await install(page); state.faults.templateLoad = 100;
  await page.goto('/1/settings/message-templates');
  await expect(page.locator('main [role=alert]')).toContainText('Échec synthétique');
  await expect(page.locator('textarea')).toHaveCount(0);
  state.faults.templateLoad = 0;
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect(recapBody(page)).toHaveValue('Bonjour {{client}} de {{restaurant}}');
});

test('message templates insert tokens at the keyboard selection and update the preview without sending', async ({ page }) => {
  const state = await install(page);
  await page.goto('/1/settings/message-templates');
  const body = recapBody(page);
  await body.fill('Bonjour x');
  await body.evaluate((field: HTMLTextAreaElement) => field.setSelectionRange(8, 9));
  const token = recap(page).getByRole('button', { name: 'Nom du client', exact: true });
  await token.focus(); await page.keyboard.press('Enter');
  await expect(body).toHaveValue('Bonjour {{client}}');
  await expect(body).toBeFocused();
  await expect(recap(page).getByRole('region', { name: 'Aperçu', exact: true })).toContainText('Bonjour Client démo');
  await body.fill('Bonjour {{inconnu}}');
  await expect(body).toHaveAttribute('aria-invalid', 'true');
  await expect(recap(page).getByRole('alert')).toContainText('inconnu');
  expect(state.writes).toHaveLength(0);
});

test('message templates preserve other locale drafts and use the requested restaurant scope', async ({ page }) => {
  const state = await install(page);
  await page.goto('/2/settings/message-templates');
  await recapBody(page).fill('Bonjour corrigé {{client}}');
  await recap(page).getByRole('tab', { name: /^English/ }).click();
  await recapBody(page, 'English').fill('Unsaved English {{client}}');
  await recap(page).getByRole('tab', { name: /^Français/ }).click();
  await save(page).click();
  await expect(recap(page).getByRole('status')).toContainText('Enregistré');
  await recap(page).getByRole('tab', { name: /^English/ }).click();
  await expect(recapBody(page, 'English')).toHaveValue('Unsaved English {{client}}');
  expect(await guarded(page)).toBe(true);
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0]).toMatchObject({ path: '/api/v1/restaurants/2/message-templates/order_recap/fr', restaurant: '2', body: { body: 'Bonjour corrigé {{client}}' } });
});

for (const pending of ['Later edit', 'Bonjour {{client}} de {{restaurant}}']) test(`message templates preserve typing during a save: ${pending}`, async ({ page }) => {
  const state = await install(page);
  let release!: () => void; state.control.saveGate = new Promise<void>(resolve => { release = resolve; });
  await page.goto('/1/settings/message-templates');
  await recapBody(page).fill('Sent version');
  await save(page).click();
  await expect(recap(page).getByRole('button', { name: /Enregistrement/ })).toBeDisabled();
  await recapBody(page).fill(pending);
  release();
  await expect(recap(page).getByRole('status')).toContainText('retouches suivantes');
  await expect(recapBody(page)).toHaveValue(pending);
  await expect(save(page)).toBeEnabled();
  expect(await guarded(page)).toBe(true);
  expect(state.writes).toHaveLength(1);
});

test('message templates keep an acknowledged save after refresh failure and retry only GET', async ({ page }) => {
  const state = await install(page); state.control.failRefreshAfterWrite = true;
  await page.goto('/1/settings/message-templates');
  await recapBody(page).fill('Saved version');
  await save(page).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.locator('main [role=alert]')).toContainText('sans enregistrer à nouveau');
  await expect(recapBody(page)).toHaveValue('Saved version');
  await expect(save(page)).toBeDisabled();
  expect(await guarded(page)).toBe(false);
  state.faults.templateLoad = 0;
  await page.getByRole('button', { name: 'Actualiser', exact: true }).click();
  await expect(page.locator('main [role=alert]')).toHaveCount(0);
  expect(state.writes).toHaveLength(1);
});

test('message templates expose partial translation failure and allow retry for an unchanged source', async ({ page }) => {
  const state = await install(page); state.faults.translation = 1;
  await page.goto('/1/settings/message-templates');
  await recapBody(page).fill('Source enregistrée');
  await save(page).click();
  await expect(recap(page).getByRole('status')).toContainText('autres langues');
  await recap(page).getByRole('button', { name: 'Réessayer les traductions', exact: true }).click();
  await expect(recap(page).getByRole('status')).toContainText('Enregistré');
  expect(state.writes).toHaveLength(2);
  expect(state.writes[1].body).toEqual(state.writes[0].body);
  await recap(page).getByRole('tab', { name: /^עברית/ }).click();
  await expect(recapBody(page, 'עברית')).toHaveValue('Auto he: Source enregistrée');
});

test('message templates save failure leaves the draft recoverable', async ({ page }) => {
  const state = await install(page); state.faults.templateSave = 1;
  await page.goto('/1/settings/message-templates');
  await recapBody(page).fill('Brouillon'); await save(page).click();
  await expect(recap(page).getByRole('alert')).toContainText('Échec synthétique');
  await expect(recapBody(page)).toHaveValue('Brouillon');
  await save(page).click();
  await expect(recap(page).getByRole('status')).toContainText('Enregistré');
  expect(await guarded(page)).toBe(false);
});

test('message templates confirm a locale reset and keep its acknowledged default when refresh fails', async ({ page }) => {
  const state = await install(page); state.control.failRefreshAfterWrite = true;
  await page.goto('/1/settings/message-templates');
  await recapBody(page).fill('Unsaved draft');
  await reset(page).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(reset(page)).toBeFocused();
  await expect(recapBody(page)).toHaveValue('Unsaved draft');
  await reset(page).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Rétablir le texte par défaut', exact: true }).click();
  await expect(recap(page).getByRole('status')).toContainText('Texte par défaut');
  await expect(recapBody(page)).toHaveValue(/\{\{salutation\}\}/);
  await expect(page.locator('main [role=alert]')).toContainText('sans enregistrer à nouveau');
  await expect(reset(page)).toBeDisabled();
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].path).toBe('/api/v1/restaurants/1/message-templates/order_recap/fr');
  state.faults.templateLoad = 0;
  await page.getByRole('button', { name: 'Actualiser', exact: true }).click();
  expect(state.writes).toHaveLength(1);
});

test('message templates protect a reset in flight and retain the draft after failure', async ({ page }) => {
  const state = await install(page); state.faults.templateReset = 1;
  let release!: () => void; state.control.saveGate = new Promise<void>(resolve => { release = resolve; });
  await page.goto('/1/settings/message-templates'); await recapBody(page).fill('Keep me');
  await reset(page).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Rétablir le texte par défaut', exact: true }).click();
  await expect(recapBody(page)).toHaveJSProperty('readOnly', true);
  await expect(save(page)).toBeDisabled();
  release();
  await expect(recap(page).getByRole('alert')).toContainText('Échec synthétique');
  await expect(recapBody(page)).toHaveValue('Keep me');
  await expect(recapBody(page)).toHaveJSProperty('readOnly', false);
});

test('message templates enforce the server UTF-8 limit and permit an intentional empty template', async ({ page }) => {
  const state = await install(page);
  await page.goto('/1/settings/message-templates');
  await recapBody(page).fill('א'.repeat(4001));
  await expect(recap(page).getByRole('alert')).toContainText('trop long');
  await expect(save(page)).toBeDisabled();
  await recapBody(page).fill(''); await save(page).click();
  await expect(recap(page).getByRole('status')).toContainText('Enregistré');
  expect(state.writes[0].body).toEqual({ body: '' });
});

test('message templates stay readable and copyable without settings.edit', async ({ page }) => {
  const state = await install(page, { permissions: ['settings.view'] });
  await page.goto('/1/settings/message-templates');
  await expect(recapBody(page)).toHaveJSProperty('readOnly', true);
  await expect(recapBody(page)).toBeEnabled();
  await expect(save(page)).toHaveCount(0);
  await expect(recap(page).getByRole('button', { name: 'Nom du client', exact: true })).toBeDisabled();
  expect(state.writes).toHaveLength(0);
});

test('security load failure is recoverable and does not masquerade as an empty list', async ({ page }) => {
  const state = await install(page); state.faults.keyLoad = 100;
  await page.goto('/1/settings/security');
  await expect(page.locator('main [role=alert]')).toContainText('Échec synthétique');
  await expect(page.getByRole('button', { name: 'Ajouter une clé d’accès', exact: true })).toHaveCount(0);
  state.faults.keyLoad = 0;
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect(page.getByText(keyName, { exact: true })).toBeVisible();
});

test('security unsupported enrollment still permits managing existing account keys', async ({ page }) => {
  const state = await install(page, { unsupported: true, permissions: ['settings.view'] });
  await page.goto('/2/settings/security');
  await expect(page.getByText(keyName, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ajouter une clé d’accès', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: `Supprimer · ${keyName}`, exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText(keyName);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer', exact: true }).click();
  await expect(page.getByText(keyName, { exact: true })).toHaveCount(0);
  expect(state.writes[0]).toMatchObject({ path: '/api/v1/auth/webauthn/credentials/1' });
  expect(state.writes[0].restaurant).toBeUndefined();
});

test('security confirms deletion, restores focus on cancel and preserves the key after failure', async ({ page }) => {
  const state = await install(page); state.faults.keyDelete = 1;
  await page.goto('/1/settings/security');
  const remove = page.getByRole('button', { name: `Supprimer · ${keyName}`, exact: true });
  await remove.click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(remove).toBeFocused(); expect(state.writes).toHaveLength(0);
  await remove.click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer', exact: true }).click();
  await expect(page.locator('main [role=alert]')).toBeVisible();
  await expect(page.getByText(keyName, { exact: true })).toBeVisible();
  await remove.click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer', exact: true }).click();
  await expect(page.getByText(keyName, { exact: true })).toHaveCount(0);
});

test('security removing the last key clears only the local passkey hint', async ({ page }) => {
  const state = await install(page); state.credentials.splice(1);
  await page.goto('/1/settings/security');
  await page.getByRole('button', { name: `Supprimer · ${keyName}`, exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Clé d’accès supprimée');
  expect(await page.evaluate(() => localStorage.getItem('foody.passkey.device'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('foody_restaurant_token'))).toBe('isolated-ui-fixture');
  expect(state.writes).toHaveLength(1);
});

test('security enrollment uses an isolated virtual authenticator and freezes its label until acknowledgment', async ({ page }) => {
  const state = await install(page, { emptyKeys: true });
  let release!: () => void; state.control.keyGate = new Promise<void>(resolve => { release = resolve; });
  await page.goto('/2/settings/security');
  const name = page.getByRole('textbox', { name: 'Nom', exact: true });
  await name.fill('Appareil démo de coordination');
  await page.getByRole('button', { name: 'Ajouter une clé d’accès', exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(name).toBeDisabled();
  await expect.poll(() => state.writes.filter(write => write.path.endsWith('/finish')).length).toBe(1);
  release();
  await expect(page.getByText('Appareil démo de coordination', { exact: true })).toBeVisible();
  await expect(name).toHaveValue('');
  expect(state.writes.filter(write => write.path.endsWith('/begin'))).toHaveLength(1);
  expect(state.writes.find(write => write.path.endsWith('/finish'))?.restaurant).toBeUndefined();
});

for (const code of ['NotAllowedError', 'InvalidStateError']) test(`security enrollment handles ${code} without claiming a new credential`, async ({ page }) => {
  const state = await install(page);
  await page.goto('/1/settings/security');
  await page.evaluate(code => { navigator.credentials.create = async () => { throw new DOMException('synthetic browser result', code); }; }, code);
  await page.getByRole('textbox', { name: 'Nom', exact: true }).fill('Label retained');
  await page.getByRole('button', { name: 'Ajouter une clé d’accès', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ajouter une clé d’accès', exact: true })).toBeEnabled();
  await expect(page.getByRole('textbox', { name: 'Nom', exact: true })).toHaveValue('Label retained');
  if (code === 'InvalidStateError') await expect(page.locator('main [role=alert]')).toContainText('déjà');
  else await expect(page.locator('main [role=alert]')).toHaveCount(0);
  expect(state.writes.filter(write => write.path.endsWith('/finish'))).toHaveLength(0);
});

test('security enrollment failure preserves the label and permits retry', async ({ page }) => {
  const state = await install(page); state.faults.keyBegin = 1;
  await page.goto('/1/settings/security');
  const name = page.getByRole('textbox', { name: 'Nom', exact: true });
  await name.fill('Appareil à reprendre');
  await page.getByRole('button', { name: 'Ajouter une clé d’accès', exact: true }).click();
  await expect(page.locator('main [role=alert]')).toBeVisible();
  await expect(name).toHaveValue('Appareil à reprendre');
  await page.getByRole('button', { name: 'Ajouter une clé d’accès', exact: true }).click();
  await expect(page.getByText('Appareil à reprendre', { exact: true })).toBeVisible();
  expect(state.writes.filter(write => write.path.endsWith('/begin'))).toHaveLength(2);
});
