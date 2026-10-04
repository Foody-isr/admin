import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

async function install(page: Page, options: { locale?: string; permissions?: string[] } = {}) {
  const fixtureOptions = { empty: false, permissions: options.permissions };
  const fixture = createFixture(fixtureOptions);
  const control = {
    settings: { vat_rate: 18, tips_enabled: true, online_payment_only: false, weight_hold_buffer_percent: 20 } as Record<string, unknown>,
    creds: { enabled: true, masked_restaurant_id: '****1234', masked_pos_id: '****0007', masked_company_code: '****0042' } as Record<string, unknown>,
    settingsReads: 0, cibusReads: 0, omitPolicy: false, gate: null as Promise<void> | null,
  };
  const faults = { settingsGet: 0, settingsPut: 0, cibusGet: 0, cibusPut: 0 };
  const writes: { path: string; body: any; restaurant?: string }[] = [];
  await page.addInitScript(({ locale }) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'owner', email: 'demo@foody.test' }));
    localStorage.setItem('foody_restaurant_ids', '[1,2]'); localStorage.setItem('foody-admin-locale', locale);
    localStorage.setItem('foody_admin_theme', locale === 'he' ? 'dark' : 'light');
  }, { locale: options.locale ?? 'fr' });
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method(), body = request.postDataJSON() ?? {}, restaurant = request.headers()['x-restaurant-id'];
    const send = (json: unknown, status = 200) => route.fulfill({ json, status });
    const fail = () => send({ error: 'Synthetic unavailable endpoint' }, 503);
    const consume = (key: keyof typeof faults) => { if (faults[key] > 0) { faults[key]--; return true; } return false; };
    const paymentResponse = () => { const result = { ...control.settings }; if (control.omitPolicy) delete result.online_payment_only; return { settings: result }; };
    if (/\/restaurants\/\d+\/settings$/.test(path)) {
      if (method === 'GET') { control.settingsReads++; return consume('settingsGet') ? fail() : send(paymentResponse()); }
      writes.push({ path, body, restaurant }); if (control.gate) await control.gate;
      if (consume('settingsPut')) return fail(); Object.assign(control.settings, body); return send(paymentResponse());
    }
    if (/\/restaurants\/\d+\/cibus-credentials$/.test(path)) {
      if (method === 'GET') { control.cibusReads++; return consume('cibusGet') ? fail() : send(control.creds); }
      writes.push({ path, body, restaurant }); if (control.gate) await control.gate;
      if (consume('cibusPut')) return fail();
      control.creds = { enabled: true, masked_restaurant_id: '****9001', masked_pos_id: '****9002', masked_company_code: '****9003' };
      return send({ message: 'synthetic identity saved' });
    }
    const result = fixture.response(request.url(), method, body, Number(restaurant) || 1);
    return send(result.json ?? {}, result.status ?? 200);
  });
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  return { fixture, control, faults, writes };
}
const cibusLabels = ['ID restaurant Cibus', 'ID caisse (POS)', 'Code société'];
const syntheticIdentifiers = ['0001234', '0007', '0042'];
const fillIdentity = async (page: Page) => { for (let index = 0; index < 3; index++) await page.getByLabel(cibusLabels[index], { exact: true }).fill(syntheticIdentifiers[index]); };
const review = (page: Page) => page.getByRole('button', { name: 'Vérifier le remplacement', exact: true });
const confirm = (page: Page) => page.getByRole('alertdialog').getByRole('button', { name: 'Remplacer les identifiants', exact: true });
const vat = (page: Page) => page.getByRole('textbox', { name: 'Taux de TVA par défaut (%)', exact: true });
const policy = (page: Page) => page.getByRole('combobox', { name: 'Paiement en ligne obligatoire', exact: true });
const save = (page: Page) => page.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).last();
const notice = (page: Page) => page.locator('main [role=status]').filter({ hasNotText: /^Chargement/ });
const guarded = (page: Page) => page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; });

for (const locale of ['fr', 'he']) test(`payment and Cibus settings responsive ${locale}`, async ({ page }, info) => {
  const state = await install(page, { locale }); await page.setViewportSize({ width: locale === 'fr' ? 375 : 1440, height: 1000 });
  await page.goto('/1/settings/payments'); await expect(page.getByRole('combobox')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`payment-settings-${locale}.png`), fullPage: true });
  if (locale === 'fr') { await page.locator('form button[type=submit]').last().scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('payment-settings-lower-fr.png') }); }
  await page.goto('/1/settings/cibus'); await expect(page.locator('input[type=password]')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`cibus-settings-${locale}.png`), fullPage: true });
  if (locale === 'he') {
    const input = page.locator('input[name=cibus_restaurant_id]'); await input.fill('0001234');
    const reveal = input.locator('..').getByRole('button'); await reveal.click(); await expect(input).toHaveAttribute('type', 'text');
    const fieldBounds = await input.boundingBox(), buttonBounds = await reveal.boundingBox();
    expect(buttonBounds!.x).toBeGreaterThan(fieldBounds!.x + fieldBounds!.width - 50);
    await page.screenshot({ path: info.outputPath('cibus-identifier-he.png') });
  }
  expect(state.fixture.unhandled).toEqual([]);
});

test('Cibus loading errors are distinct from a disabled provider and recover without mutation', async ({ page }) => {
  const state = await install(page); state.faults.cibusGet = 100; await page.goto('/1/settings/cibus');
  await expect(page.locator('main [role=alert]')).toBeVisible(); await expect(page.locator('input[type=password]')).toHaveCount(0);
  await expect(page.getByText('Non activé', { exact: true })).toHaveCount(0);
  state.faults.cibusGet = 0; await page.getByRole('button', { name: 'Réessayer', exact: true }).click(); await expect(review(page)).toBeDisabled(); expect(state.writes).toHaveLength(0);
});

test('Cibus disabled provider exposes no terminal replacement action', async ({ page }) => {
  const state = await install(page); state.control.creds = { enabled: false }; await page.goto('/1/settings/cibus');
  await expect(page.getByText('Non activé', { exact: true })).toBeVisible(); await expect(review(page)).toHaveCount(0);
  await expect(page.locator('input[type=password]')).toHaveCount(0); expect(state.writes).toHaveLength(0);
});

test('Cibus requires all three identifiers and focuses the first missing field', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/cibus'); await page.getByLabel(cibusLabels[0], { exact: true }).fill('1001'); await review(page).click();
  await expect(page.getByLabel(cibusLabels[1], { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel(cibusLabels[1], { exact: true })).toBeFocused(); await expect(page.getByRole('alertdialog')).toHaveCount(0); expect(state.writes).toHaveLength(0);
});

for (const value of ['****1234', '0000', '9223372036854775808']) test(`Cibus refuses invalid replacement ${value}`, async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/cibus'); await fillIdentity(page); await page.getByLabel(cibusLabels[0], { exact: true }).fill(value); await review(page).click();
  await expect(page.getByLabel(cibusLabels[0], { exact: true })).toHaveAttribute('aria-invalid', 'true'); await expect(page.getByRole('alertdialog')).toHaveCount(0); expect(state.writes).toHaveLength(0);
});

test('Cibus confirms complete replacement, preserves leading zeroes and freezes double submits', async ({ page }) => {
  const state = await install(page); await page.goto('/2/settings/cibus'); await fillIdentity(page); await review(page).click();
  await expect(page.getByRole('alertdialog')).toContainText('trois identifiants'); expect(state.writes).toHaveLength(0);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler', exact: true }).click(); await expect(review(page)).toBeFocused();
  await review(page).click(); let release!: () => void; state.control.gate = new Promise<void>(resolve => { release = resolve; });
  await confirm(page).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.getByLabel(cibusLabels[0], { exact: true })).toHaveJSProperty('readOnly', true); expect(await guarded(page)).toBe(true);
  release(); state.control.gate = null;
  await expect(page.getByText('Les identifiants du terminal ont été enregistrés.', { exact: true })).toBeVisible(); await expect(review(page)).toBeDisabled();
  expect(state.writes).toEqual([{ path: '/api/v1/restaurants/2/cibus-credentials', restaurant: '2', body: { cibus_restaurant_id: '0001234', cibus_pos_id: '0007', cibus_company_code: '0042' } }]);
  for (const label of cibusLabels) await expect(page.getByLabel(label, { exact: true })).toHaveValue('');
  await expect(page.getByText('****9001', { exact: true })).toBeVisible(); expect(await guarded(page)).toBe(false);
  expect(await page.evaluate(() => Object.values(localStorage).join('|'))).not.toContain('0001234');
});

test('Cibus failed write preserves the complete draft and never prints an endpoint error', async ({ page }) => {
  const state = await install(page); state.faults.cibusPut = 1; await page.goto('/1/settings/cibus'); await fillIdentity(page); await review(page).click(); await confirm(page).click();
  await expect(page.locator('main [role=alert]')).toContainText('n’a pas pu être confirmé'); await expect(page.locator('main')).not.toContainText('Synthetic unavailable endpoint');
  for (let index = 0; index < 3; index++) await expect(page.getByLabel(cibusLabels[index], { exact: true })).toHaveValue(syntheticIdentifiers[index]);
  await review(page).click(); await confirm(page).click(); await expect(page.getByText('Les identifiants du terminal ont été enregistrés.', { exact: true })).toBeVisible(); expect(state.writes).toHaveLength(2);
});

test('Cibus acknowledged write with failed readback retries GET only', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/cibus'); await fillIdentity(page); const initialReads = state.control.cibusReads; state.faults.cibusGet = 1;
  await review(page).click(); await confirm(page).click(); await expect(page.locator('main [role=alert]')).toContainText('Enregistrement confirmé');
  await expect(page.getByText('****1234', { exact: true })).toHaveCount(0); await expect(page.locator('input[type=password]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click(); await expect(page.getByText('****9001', { exact: true })).toBeVisible();
  await expect(review(page)).toBeDisabled(); expect(state.writes).toHaveLength(1); expect(state.control.cibusReads).toBe(initialReads + 2); expect(await guarded(page)).toBe(false);
});

test('Cibus draft survives interface-language change without another GET', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/cibus'); await fillIdentity(page); const reads = state.control.cibusReads;
  await page.getByRole('button', { name: 'Foody · Profil', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'English', exact: true }).click(); await page.keyboard.press('Escape');
  await expect(page.getByLabel('Cibus Restaurant ID', { exact: true })).toHaveValue('0001234'); expect(state.control.cibusReads).toBe(reads); expect(state.writes).toHaveLength(0);
});

test('Cibus clearing and internal navigation preserve the draft until confirmation', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/cibus'); await fillIdentity(page);
  await page.getByRole('link', { name: 'Sécurité', exact: true }).click(); await expect(page.getByRole('alertdialog')).toBeVisible(); await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(page).toHaveURL(/cibus$/); await expect(page.getByLabel(cibusLabels[0], { exact: true })).toHaveValue('0001234');
  await page.getByRole('button', { name: 'Effacer', exact: true }).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Abandonner les modifications', exact: true }).click();
  await expect(review(page)).toBeDisabled(); expect(await guarded(page)).toBe(false); expect(state.writes).toHaveLength(0);
});

test('Cibus read-only permission exposes masked status without credential inputs', async ({ page }) => {
  const state = await install(page, { permissions: ['settings.view'] }); await page.goto('/1/settings/cibus');
  await expect(page.getByText('****1234', { exact: true })).toBeVisible(); await expect(review(page)).toHaveCount(0); await expect(page.locator('input[type=password]')).toHaveCount(0); expect(state.writes).toHaveLength(0);
});

for (const issue of ['failure', 'incomplete']) test(`payments refuse unavailable initial values ${issue}`, async ({ page }) => {
  const state = await install(page); if (issue === 'failure') state.faults.settingsGet = 100; else delete state.control.settings.tips_enabled;
  await page.goto('/1/settings/payments'); await expect(page.locator('main [role=alert]')).toBeVisible(); await expect(vat(page)).toHaveCount(0); await expect(save(page)).toBeDisabled();
  state.faults.settingsGet = 0; state.control.settings.tips_enabled = true; await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect(vat(page)).toHaveValue('18'); expect(state.writes).toHaveLength(0);
});

test('payments omitted policy stays unknown and is never rewritten by VAT changes', async ({ page }) => {
  const state = await install(page); state.control.omitPolicy = true; delete state.control.settings.weight_hold_buffer_percent; await page.goto('/2/settings/payments');
  await expect(policy(page)).toHaveValue('unknown'); await expect(page.getByText('Marge actuelle indisponible', { exact: true })).toBeVisible();
  await vat(page).fill('0'); await vat(page).blur(); await expect(vat(page)).toHaveValue('0'); await save(page).click(); await expect(notice(page)).toContainText('Enregistré');
  expect(state.writes).toEqual([{ path: '/api/v1/restaurants/2/settings', restaurant: '2', body: { vat_rate: 0 } }]); await expect(policy(page)).toHaveValue('unknown');
  expect(state.fixture.unhandled).toEqual([]);
});

test('payments explicitly set a missing policy and preserve its receipt when PUT omits it', async ({ page }) => {
  const state = await install(page); state.control.omitPolicy = true; await page.goto('/1/settings/payments');
  await policy(page).selectOption('true'); await save(page).click(); await expect(notice(page)).toContainText('Enregistré'); await expect(policy(page)).toHaveValue('true');
  expect(state.writes[0].body).toEqual({ online_payment_only: true }); await expect(save(page)).toBeDisabled();
  await policy(page).selectOption('false'); await save(page).click(); await expect(notice(page)).toContainText('Enregistré'); expect(state.writes[1].body).toEqual({ online_payment_only: false });
  await page.reload(); await expect(policy(page)).toHaveValue('unknown'); expect(state.writes).toHaveLength(2);
});

test('payments preserve fractional VAT and serialize saves with a recoverable draft', async ({ page }) => {
  const state = await install(page); state.faults.settingsPut = 1; await page.goto('/1/settings/payments'); await vat(page).fill('8.5');
  await page.getByRole('switch').click(); let release!: () => void; state.control.gate = new Promise<void>(resolve => { release = resolve; });
  await save(page).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); }); await expect(vat(page)).toHaveJSProperty('readOnly', true); await expect(policy(page)).toBeDisabled();
  release(); state.control.gate = null; await expect(page.locator('main [role=alert]')).toBeVisible(); await expect(vat(page)).toHaveValue('8.5'); await expect(page.getByRole('switch')).not.toBeChecked();
  await save(page).click(); await expect(notice(page)).toContainText('Enregistré'); expect(state.writes).toHaveLength(2); expect(state.writes[1].body).toEqual({ vat_rate: 8.5, tips_enabled: false });
});

test('payments do not invent card connection, rounding, suggested-tip or weight-buffer writes', async ({ page }) => {
  const state = await install(page); state.control.settings.weight_hold_buffer_percent = 0; await page.goto('/1/settings/payments');
  const weight = page.getByRole('textbox', { name: 'Marge d’empreinte au poids %', exact: true }); await expect(weight).toHaveValue('0'); await expect(weight).toHaveJSProperty('readOnly', true);
  await expect(page.locator('main')).toContainText('état de connexion n’est pas disponible'); await expect(page.getByRole('button', { name: 'Connecter', exact: true })).toHaveCount(0);
  await page.getByRole('switch').click(); await save(page).click(); await expect(notice(page)).toContainText('Enregistré'); expect(state.writes[0].body).toEqual({ tips_enabled: false });
  await page.getByRole('link', { name: 'Ouvrir les réglages Cibus', exact: true }).click(); await expect(page).toHaveURL('/1/settings/cibus'); await expect(review(page)).toBeDisabled();
});

test('payments retain draft across locale changes and confirm reset to the saved baseline', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/payments'); await vat(page).fill('12'); const reads = state.control.settingsReads;
  await page.getByRole('button', { name: 'Foody · Profil', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'English', exact: true }).click(); await page.keyboard.press('Escape');
  await expect(page.getByRole('textbox', { name: 'Default VAT rate (%)', exact: true })).toHaveValue('12'); expect(state.control.settingsReads).toBe(reads);
  await page.getByRole('button', { name: 'Reset', exact: true }).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Default VAT rate (%)', exact: true })).toHaveValue('18'); expect(state.writes).toHaveLength(0); expect(await guarded(page)).toBe(false);
});

test('payments protect navigation with an unsaved policy selection', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/payments'); await policy(page).selectOption('true');
  await page.getByRole('link', { name: 'Ouvrir les réglages Cibus', exact: true }).click(); await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler', exact: true }).click(); await expect(policy(page)).toHaveValue('true');
  expect(state.writes).toHaveLength(0); expect(await guarded(page)).toBe(true);
});

test('payments read-only fields remain copyable without save actions', async ({ page }) => {
  const state = await install(page, { permissions: ['settings.view'] }); await page.goto('/1/settings/payments');
  await expect(vat(page)).toHaveJSProperty('readOnly', true); await expect(vat(page)).toBeEnabled(); await expect(policy(page)).toBeDisabled(); await expect(page.getByRole('switch')).toBeDisabled(); await expect(save(page)).toHaveCount(0); expect(state.writes).toHaveLength(0);
});
