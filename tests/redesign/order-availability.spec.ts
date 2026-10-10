import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const week = () => Object.fromEntries(days.map(day => [day, { open: '09:00', close: '22:00', closed: day === 'saturday' }]));
async function install(page: Page, options: { locale?: string; permissions?: string[]; noHours?: boolean } = {}) {
  const fixtureOptions = { empty: false, permissions: options.permissions }, fixture = createFixture(fixtureOptions);
  const control = { values: { pickup_enabled: true, dine_in_enabled: true, delivery_enabled: false, catering_only: true, timezone: 'Asia/Jerusalem', week_start_day: 1, workdays: [] as number[], opening_hours_config: options.noHours ? undefined : { pickup: week(), dine_in: week(), delivery: week() } } as Record<string, any>, reads: 0, failRead: false, failSave: 0, gate: null as Promise<void> | null };
  const writes: { body: any; restaurant?: string; path: string }[] = [];
  await page.addInitScript(({ locale }) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture'); localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'owner', email: 'demo@foody.test' }));
    localStorage.setItem('foody_restaurant_ids', '[1,2]'); localStorage.setItem('foody-admin-locale', locale); localStorage.setItem('foody_admin_theme', locale === 'he' ? 'dark' : 'light');
  }, { locale: options.locale ?? 'fr' });
  await page.route('**/api/v1/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname, method = req.method(), body = req.postDataJSON() ?? {}, restaurant = req.headers()['x-restaurant-id'];
    const result = fixture.response(req.url(), method, body, Number(restaurant) || 1);
    if (/\/restaurants\/\d+$/.test(path)) {
      if (method === 'GET') { control.reads++; if (control.failRead) return route.fulfill({ status: 503, json: { error: 'Synthetic availability failure' } }); }
      else { writes.push({ path, restaurant, body }); if (control.gate) await control.gate; if (control.failSave) { control.failSave--; return route.fulfill({ status: 503, json: { error: 'Synthetic save failure' } }); } Object.assign(control.values, body); }
      return route.fulfill({ json: { restaurant: { ...(result.json as { restaurant?: Record<string, unknown> } | undefined)?.restaurant, ...control.values } } });
    }
    return route.fulfill({ json: result.json ?? {}, status: result.status ?? 200 });
  });
  await page.route('**/*', route => ['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  return { fixture, control, writes };
}
const save = (page: Page) => page.getByRole('button', { name: 'Enregistrer les modifications', exact: true });
const opening = (page: Page) => page.getByLabel('Lundi · Ouverture', { exact: true });
const closing = (page: Page) => page.getByLabel('Lundi · Fermeture', { exact: true });
const status = (page: Page) => page.locator('main [role=status]').filter({ hasNotText: /^Chargement/ });
const guarded = (page: Page) => page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; });

for (const locale of ['fr','he']) test(`order availability responsive hours and workdays ${locale}`, async ({ page }, info) => {
  const state = await install(page, { locale }); await page.setViewportSize({ width: locale === 'fr' ? 375 : 1440, height: 1000 }); await page.goto('/1/settings/orders/availability');
  await expect(page.locator('input[type=time]').first()).toHaveValue('09:00', { timeout: 30_000 }); await page.screenshot({ path: info.outputPath(`order-availability-${locale}.png`) });
  await page.locator('input[type=time]').first().scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`order-hours-${locale}.png`) });
  await page.locator('form select').last().scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`order-workdays-${locale}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(state.fixture.unhandled).toEqual([]);
});

test('availability retries failed loading without exposing default editable values', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/orders/availability'); await expect(opening(page)).toHaveValue('09:00'); await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: 'Commandes et livraison', exact: true }).click(); await page.getByRole('link', { name: 'Prise de commandes', exact: true }).click(); await expect(page.getByRole('radio', { name: /^Commandes immédiates/ })).toBeChecked({ timeout: 30_000 }); state.control.failRead = true; await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: 'Restaurant', exact: true }).click(); await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Horaires et disponibilité', exact: true }).click(); await expect(page.locator('main [role=alert]')).toContainText('Impossible de charger la disponibilité'); await expect(opening(page)).toHaveCount(0);
  state.control.failRead = false; await page.getByRole('button', { name: 'Réessayer', exact: true }).click(); await expect(opening(page)).toHaveValue('09:00'); expect(state.writes).toHaveLength(0);
});

test('availability mode-only save leaves absent hours, automatic workdays and hidden catering untouched', async ({ page }) => {
  const state = await install(page, { noHours: true, permissions: ['settings.view','settings.edit'] }); await page.goto('/2/settings/orders/availability'); await page.getByRole('switch', { name: 'Livraison', exact: true }).click(); await save(page).click(); await expect(status(page)).toContainText('Enregistré');
  expect(state.writes).toEqual([{ path: '/api/v1/restaurants/2', restaurant: '2', body: { delivery_enabled: true } }]); expect(state.control.values.workdays).toEqual([]); expect(state.control.values.catering_only).toBe(true);
});

test('availability keeps overnight and all-day values and preserves other channels', async ({ page }) => {
  const state = await install(page); const dineIn = structuredClone(state.control.values.opening_hours_config.dine_in); await page.goto('/1/settings/orders/availability');
  await opening(page).fill('22:00'); await closing(page).fill('02:00'); await save(page).click(); await expect(status(page)).toContainText('Enregistré'); expect(state.writes[0].body.opening_hours_config.pickup.monday).toEqual({ open: '22:00', close: '02:00', closed: false }); expect(state.writes[0].body.opening_hours_config.dine_in).toEqual(dineIn); expect(Object.keys(state.writes[0].body)).toEqual(['opening_hours_config']);
  await opening(page).fill('00:00'); await closing(page).fill('00:00'); await save(page).click(); await expect(status(page)).toContainText('Enregistré'); expect(state.writes[1].body.opening_hours_config.pickup.monday.open).toBe('00:00');
});

test('availability proposed hours are explicit and initialise only when an hours field is changed', async ({ page }) => {
  const state = await install(page, { noHours: true }); await page.goto('/1/settings/orders/availability'); await expect(page.getByText(/jours non renseignés affichent les horaires proposés/)).toBeVisible(); await expect(save(page)).toBeDisabled();
  await opening(page).fill('10:00'); await save(page).click(); await expect(status(page)).toContainText('Enregistré'); const config = state.writes[0].body.opening_hours_config; expect(config.pickup.monday.open).toBe('10:00'); expect(config.delivery.sunday).toEqual({ open: '09:00', close: '22:00', closed: false });
});

test('availability validates incomplete time and preserves draft through failed serialized save', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/orders/availability'); await opening(page).fill(''); await save(page).click(); await expect(opening(page)).toHaveAttribute('aria-invalid','true'); await expect(opening(page)).toBeFocused(); expect(state.writes).toHaveLength(0);
  await opening(page).fill('08:30'); state.control.failSave = 1; let release!: () => void; state.control.gate = new Promise<void>(resolve => { release = resolve; }); await save(page).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); }); await expect(page.getByRole('switch').first()).toBeDisabled(); await expect(opening(page)).toBeDisabled(); release(); state.control.gate = null;
  await expect(page.locator('main [role=alert]')).toContainText('n’a pas pu être enregistrée'); await expect(opening(page)).toHaveValue('08:30'); expect(await guarded(page)).toBe(true); await save(page).click(); await expect(status(page)).toContainText('Enregistré'); expect(state.writes).toHaveLength(2); expect(await guarded(page)).toBe(false);
});

test('availability retains hours while a service is disabled and reopened', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/orders/availability'); await opening(page).fill('07:15'); await page.getByRole('switch', { name: 'À emporter', exact: true }).click(); await expect(opening(page)).toHaveValue('09:00'); await page.getByRole('switch', { name: 'À emporter', exact: true }).click(); await expect(opening(page)).toHaveValue('07:15'); await save(page).click(); await expect(status(page)).toContainText('Enregistré'); expect(state.writes[0].body).not.toHaveProperty('pickup_enabled');
});

test('availability custom workdays preserve Sunday zero and clearing them restores automatic mode', async ({ page }) => {
  const state = await install(page); state.control.values.workdays = [0]; await page.goto('/1/settings/orders/availability'); const choices = page.getByRole('group', { name: /^Jours d['’]ouverture$/ });
  await expect(choices.getByRole('button', { name: 'Dimanche', exact: true })).toHaveAttribute('aria-pressed','true'); await page.getByRole('combobox', { name: 'Premier jour de la semaine', exact: true }).selectOption('0'); await save(page).click(); await expect(status(page)).toContainText('Enregistré'); expect(state.writes[0].body).toEqual({ week_start_day: 0 });
  await choices.getByRole('button', { name: 'Dimanche', exact: true }).click(); await expect(page.getByRole('combobox', { name: /^Jours d['’]ouverture$/ })).toHaveValue('auto'); await save(page).click(); await expect(status(page)).toContainText('Enregistré'); expect(state.writes[1].body).toEqual({ workdays: [] });
});

test('availability protects navigation and reset, then preserves draft across locale changes', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/orders/availability'); await opening(page).fill('08:00'); const reads = state.control.reads;
  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: 'Commandes et livraison', exact: true }).click(); await page.getByRole('link', { name: 'Prise de commandes', exact: true }).click(); await expect(page.getByRole('alertdialog')).toBeVisible(); await page.getByRole('button', { name: 'Annuler', exact: true }).click(); await expect(opening(page)).toHaveValue('08:00');
  await page.getByRole('button', { name: 'Réinitialiser', exact: true }).click(); await page.getByRole('button', { name: 'Abandonner les modifications', exact: true }).click(); await expect(opening(page)).toHaveValue('09:00'); await opening(page).fill('08:45');
  await page.getByRole('button', { name: 'Atelier Foody', exact: true }).click(); await page.getByRole('dialog').getByRole('combobox').selectOption('he'); await page.keyboard.press('Escape'); await expect(page.locator('#availability-pickup-monday-open')).toHaveValue('08:45'); expect(state.control.reads).toBe(reads);
});

test('availability read-only and legacy opening-hours entry use the same scoped view', async ({ page }) => {
  const state = await install(page, { permissions: ['settings.view'] }); await page.goto('/2/settings/opening-hours'); await expect(page).toHaveURL(/\/2\/settings\/orders\/availability$/); await expect(opening(page)).toHaveJSProperty('readOnly',true); await expect(page.getByRole('switch').first()).toBeDisabled(); await expect(save(page)).toHaveCount(0); expect(state.writes).toHaveLength(0);
});

test('availability English labels keep times LTR inside the restaurant time zone', async ({ page }) => {
  const state = await install(page, { locale: 'en' }); await page.goto('/1/settings/orders/availability'); await expect(page.getByLabel('Monday · Opening time', { exact: true })).toHaveValue('09:00'); await expect(page.getByLabel('Monday · Opening time', { exact: true })).toHaveAttribute('dir','ltr'); await expect(page.getByText('Asia/Jerusalem', { exact: true })).toBeVisible(); expect(state.writes).toHaveLength(0);
});


test('availability distinguishes catering from disabled standard modes and preserves hidden hours', async ({ page }) => {
  const state = await install(page); state.control.values.pickup_enabled = false; state.control.values.dine_in_enabled = false;
  await page.goto('/1/settings/orders/availability'); await expect(page.getByText(/Le traiteur conserve ses réglages/)).toBeVisible(); await expect(page.locator('input[type=time]')).toHaveCount(0);
  await page.getByRole('switch', { name: 'Traiteur uniquement', exact: true }).click(); await save(page).click(); await expect(status(page)).toContainText('Enregistré'); expect(state.writes[0].body).toEqual({ catering_only: false });
});


test('strict weekly availability only edits table hours and preserves pickup hours', async ({ page }) => {
  const state = await install(page);
  const pickupHours = structuredClone(state.control.values.opening_hours_config.pickup);
  await page.route('**/restaurants/1/settings', route => route.fulfill({ json: { settings: { preorders_only: true, batch_fulfillment_enabled: true } } }));
  await page.goto('/1/settings/orders/availability');
  await expect(page.getByRole('switch', { name: 'À emporter', exact: true })).toHaveCount(0);
  await expect(page.getByRole('switch', { name: 'Sur place', exact: true })).toBeVisible();
  await page.locator('#availability-dine_in-monday-open').fill('10:30');
  await save(page).click();
  await expect(status(page)).toContainText('Enregistré');
  expect(state.writes[0].body.opening_hours_config.pickup).toEqual(pickupHours);
  expect(state.writes[0].body.opening_hours_config.dine_in.monday.open).toBe('10:30');
});
