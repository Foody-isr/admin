import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

async function install(page: Page, options: { locale?: string; permissions?: string[] } = {}) {
  const fixtureOptions = { empty: false, permissions: options.permissions };
  const fixture = createFixture(fixtureOptions);
  const control = {
    settings: { service_mode: 'table', pickup_prep_time_minutes: 20, require_dine_in_prepayment: false, require_pickup_prepayment: true, require_delivery_prepayment: true, auto_send_dine_in_to_kitchen: null, auto_send_pickup_to_kitchen: null, auto_send_delivery_to_kitchen: false, auto_send_to_kitchen: true } as Record<string, any>,
    channels: { dine_in_enabled: true, pickup_enabled: true, delivery_enabled: true }, reads: 0, failRead: false, failSave: 0, gate: null as Promise<void> | null,
  };
  const writes: { body: any; restaurant?: string; path: string }[] = [];
  await page.addInitScript(({ locale }) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture'); localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'owner', email: 'demo@foody.test' }));
    localStorage.setItem('foody_restaurant_ids', '[1,2]'); localStorage.setItem('foody-admin-locale', locale); localStorage.setItem('foody_admin_theme', locale === 'he' ? 'dark' : 'light');
  }, { locale: options.locale ?? 'fr' });
  await page.route('**/api/v1/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname, method = req.method(), body = req.postDataJSON() ?? {}, restaurant = req.headers()['x-restaurant-id'];
    if (/\/restaurants\/\d+\/settings$/.test(path)) {
      if (method === 'GET') { control.reads++; if (control.failRead) return route.fulfill({ status: 503, json: { error: 'Synthetic processing failure' } }); }
      else { writes.push({ path, restaurant, body }); if (control.gate) await control.gate; if (control.failSave) { control.failSave--; return route.fulfill({ status: 503, json: { error: 'Synthetic write failure' } }); } Object.assign(control.settings, body); }
      return route.fulfill({ json: { settings: control.settings } });
    }
    const result = fixture.response(req.url(), method, body, Number(restaurant) || 1);
    if (/\/restaurants\/\d+$/.test(path)) return route.fulfill({ json: { restaurant: { ...(result.json as { restaurant?: Record<string, unknown> } | undefined)?.restaurant, ...control.channels } } });
    return route.fulfill({ json: result.json ?? {}, status: result.status ?? 200 });
  });
  await page.route('**/*', route => ['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  return { fixture, control, writes };
}
const save = (page: Page) => page.getByRole('button', { name: 'Enregistrer les modifications', exact: true });
const prep = (page: Page) => page.locator('#processing-prep');
const kitchen = (page: Page, channel = 'pickup') => page.locator(`[data-channel=${channel}] select`).nth(1);
const payment = (page: Page, channel = 'pickup') => page.locator(`[data-channel=${channel}] select`).first();
const status = (page: Page) => page.locator('main [role=status]').filter({ hasNotText: /^Chargement/ });
const guarded = (page: Page) => page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; });

for (const locale of ['fr','he']) test(`processing responsive policies ${locale}`, async ({ page }, info) => {
  const state = await install(page, { locale }); await page.setViewportSize({ width: locale === 'fr' ? 375 : 1440, height: 1000 }); await page.goto('/1/settings/orders/processing'); await expect(prep(page)).toHaveValue('20');
  await page.screenshot({ path: info.outputPath(`processing-${locale}.png`) }); await page.locator('[data-channel=pickup]').scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`processing-policies-${locale}.png`) }); await prep(page).scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`processing-details-${locale}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(state.fixture.unhandled).toEqual([]);
});

test('processing exposes failed or incomplete reads and retries without editable defaults', async ({ page }) => {
  const state = await install(page); state.control.failRead = true; await page.goto('/1/settings/orders/processing'); await expect(page.locator('main [role=alert]')).toContainText('Impossible de charger'); await expect(prep(page)).toHaveCount(0);
  state.control.failRead = false; delete state.control.settings.require_pickup_prepayment; await page.getByRole('button', { name: 'Réessayer', exact: true }).click(); await expect(page.locator('main [role=alert]')).toBeVisible();
  state.control.settings.require_pickup_prepayment = true; await page.getByRole('button', { name: 'Réessayer', exact: true }).click(); await expect(prep(page)).toHaveValue('20'); expect(state.writes).toHaveLength(0);
});

test('processing prep-only save preserves null and absent inheritance and is scoped to restaurant two', async ({ page }) => {
  const state = await install(page); delete state.control.settings.auto_send_dine_in_to_kitchen; await page.goto('/2/settings/orders/processing'); await expect(kitchen(page)).toHaveValue('inherited'); await expect(kitchen(page, 'dine_in')).toHaveValue('inherited'); await expect(kitchen(page, 'delivery')).toHaveValue('false');
  await prep(page).fill('0'); await save(page).click(); await expect(status(page)).toContainText('Enregistré'); expect(state.writes).toEqual([{ path: '/api/v1/restaurants/2/settings', restaurant: '2', body: { pickup_prep_time_minutes: 0 } }]); expect(state.control.settings.auto_send_pickup_to_kitchen).toBeNull(); expect(state.control.settings).not.toHaveProperty('auto_send_dine_in_to_kitchen');
});

test('processing kitchen override can be reverted before save but cannot pretend to restore inheritance afterwards', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/orders/processing'); await kitchen(page).selectOption('true'); await kitchen(page).selectOption('inherited'); await expect(save(page)).toBeDisabled();
  await kitchen(page).selectOption('false'); await save(page).click(); await expect(status(page)).toContainText('Enregistré'); expect(state.writes[0].body).toEqual({ auto_send_pickup_to_kitchen: false }); await expect(kitchen(page).locator('option[value=inherited]')).toHaveCount(0);
});

test('processing preserves historical service mode and preparation estimate on independent payment change', async ({ page }) => {
  const state = await install(page); state.control.settings.service_mode = 'drive_thru'; state.control.settings.pickup_prep_time_minutes = 360; await page.goto('/1/settings/orders/processing');
  await expect(page.getByRole('combobox', { name: 'Mode de service', exact: true })).toHaveValue('drive_thru'); await expect(page.getByText(/Ce mode de service existant/)).toBeVisible(); await payment(page).selectOption('false'); await save(page).click(); await expect(status(page)).toContainText('Enregistré'); expect(state.writes[0].body).toEqual({ require_pickup_prepayment: false }); await expect(prep(page)).toHaveValue('360');
});

test('processing validates empty fractional and out-of-range estimates and focuses the input', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/orders/processing');
  for (const value of ['', '1.5', '-1', '241']) { await prep(page).fill(value); await save(page).click(); await expect(prep(page)).toHaveAttribute('aria-invalid','true'); await expect(prep(page)).toBeFocused(); }
  expect(state.writes).toHaveLength(0); await prep(page).fill('240'); await save(page).click(); await expect(status(page)).toContainText('Enregistré'); expect(state.writes[0].body).toEqual({ pickup_prep_time_minutes: 240 });
});

test('processing freezes edits and serializes writes while preserving the failed draft', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/orders/processing'); await prep(page).fill('25'); state.control.failSave = 1; let release!: () => void; state.control.gate = new Promise<void>(resolve => { release = resolve; });
  await save(page).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); }); await expect(kitchen(page)).toBeDisabled(); await expect(prep(page)).toHaveJSProperty('readOnly',true); expect(await guarded(page)).toBe(true); await page.getByRole('link', { name: 'Horaires et disponibilité', exact: true }).click(); await expect(page).toHaveURL(/\/processing$/); release(); state.control.gate = null;
  await expect(page.locator('main [role=alert]')).toContainText('n’a pas pu être confirmé'); await expect(prep(page)).toHaveValue('25'); await save(page).click(); await expect(status(page)).toContainText('Enregistré'); expect(state.writes).toHaveLength(2); expect(await guarded(page)).toBe(false);
});

test('processing retains its draft through locale changes and confirms reset and navigation', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/orders/processing'); await prep(page).fill('45'); const reads = state.control.reads;
  await page.getByRole('link', { name: 'Horaires et disponibilité', exact: true }).click(); await expect(page.getByRole('alertdialog')).toBeVisible(); await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  await page.getByRole('button', { name: 'Réinitialiser', exact: true }).click(); await page.getByRole('button', { name: 'Abandonner les modifications', exact: true }).click(); await expect(prep(page)).toHaveValue('20'); await prep(page).fill('45');
  await page.getByRole('button', { name: 'Foody · Profil', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'עברית', exact: true }).click(); await page.keyboard.press('Escape'); await expect(prep(page)).toHaveValue('45'); expect(state.control.reads).toBe(reads);
});

test('processing read-only users can review settings without changing policies', async ({ page }) => {
  const state = await install(page, { permissions: ['settings.view'] }); await page.goto('/1/settings/orders/processing'); await expect(kitchen(page)).toBeDisabled(); await expect(prep(page)).toHaveJSProperty('readOnly',true); await expect(save(page)).toHaveCount(0); expect(state.writes).toHaveLength(0);
});

test('processing disabled channels retain their settings and remain inaccessible to edits', async ({ page }) => {
  const state = await install(page); state.control.channels.dine_in_enabled = false; state.control.channels.pickup_enabled = false; await page.goto('/1/settings/orders/processing'); await expect(kitchen(page)).toBeDisabled(); await expect(payment(page, 'dine_in')).toBeDisabled(); await expect(prep(page)).toHaveJSProperty('readOnly',true);
  await payment(page, 'delivery').selectOption('false'); await save(page).click(); await expect(status(page)).toContainText('Enregistré'); expect(state.writes[0].body).toEqual({ require_delivery_prepayment: false });
});

test('processing English labels and numeric direction are explicit', async ({ page }) => {
  const state = await install(page, { locale: 'en' }); await page.goto('/1/settings/orders/processing'); await expect(page.getByRole('combobox', { name: 'Pickup orders · When should the kitchen be notified?', exact: true })).toHaveValue('inherited'); await expect(prep(page)).toHaveAttribute('dir','ltr'); expect(state.writes).toHaveLength(0);
});

test('processing explicit service and automatic dispatch choices save only their own properties', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/orders/processing'); await page.getByRole('combobox', { name: 'Mode de service', exact: true }).selectOption('counter'); await kitchen(page, 'dine_in').selectOption('true'); await payment(page, 'dine_in').selectOption('true'); await save(page).click(); await expect(status(page)).toContainText('Enregistré'); expect(state.writes[0].body).toEqual({ service_mode: 'counter', require_dine_in_prepayment: true, auto_send_dine_in_to_kitchen: true }); await expect(save(page)).toBeDisabled();
});

test('processing all inactive channels expose no editable policy or false closure claim', async ({ page }) => {
  const state = await install(page); state.control.channels = { dine_in_enabled: false, pickup_enabled: false, delivery_enabled: false }; await page.goto('/1/settings/orders/processing'); for (const channel of ['dine_in','pickup','delivery']) await expect(kitchen(page,channel)).toBeDisabled(); await expect(save(page)).toBeDisabled(); await expect(page.getByRole('link', { name: 'Gérer les modes', exact: true })).toHaveCount(3); expect(state.writes).toHaveLength(0);
});
