import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const week = () => Object.fromEntries(days.map(day => [day, { open: '09:00', close: '22:00', closed: day === 'saturday' }]));
async function install(page: Page, options: { locale?: string; permissions?: string[]; noHours?: boolean; strictBatch?: boolean } = {}) {
  const fixtureOptions = { empty: false, permissions: options.permissions };
  const fixture = createFixture(fixtureOptions);
  const control = {
    values: { pickup_enabled: true, dine_in_enabled: false, delivery_enabled: true, catering_only: true, timezone: 'Asia/Jerusalem', week_start_day: 1, workdays: [] as number[], opening_hours_config: options.noHours ? undefined : { pickup: week(), dine_in: week(), delivery: week() } } as Record<string, any>,
    settings: { preorders_only: !!options.strictBatch, scheduling_enabled: false, batch_fulfillment_enabled: !!options.strictBatch, scheduling_max_days_ahead: 7, scheduling_slot_duration_minutes: 30, scheduling_require_prepayment: false, batch_require_prepayment: false, batch_order_open_day: 0, batch_order_open_time: '09:00', batch_cutoff_day: 3, batch_cutoff_time: '22:00', batch_fulfillment_days: [{ day: 5, pickup_start: '10:00', pickup_end: '14:00', delivery_start: '14:00', delivery_end: '18:00' }] } as Record<string, any>,
    failRead: false, failSave: false,
  };
  const writes: { body: any; restaurant?: string; path: string }[] = [];
  await page.addInitScript(({ locale }) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'owner', email: 'demo@foody.test' }));
    localStorage.setItem('foody_restaurant_ids', '[1,2]');
    localStorage.setItem('foody-admin-locale', locale);
    localStorage.setItem('foody_admin_theme', locale === 'he' ? 'dark' : 'light');
  }, { locale: options.locale ?? 'fr' });
  await page.route('**/api/v1/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname, method = req.method(), body = req.postDataJSON() ?? {}, restaurant = req.headers()['x-restaurant-id'];
    const result = fixture.response(req.url(), 'GET', {}, Number(restaurant) || 1);
    if (/\/restaurants\/\d+(\/settings)?$/.test(path)) {
      if (method === 'GET' && control.failRead) return route.fulfill({ status: 503, json: { error: 'Synthetic availability failure' } });
      if (method !== 'GET') {
        writes.push({ path, restaurant, body });
        if (control.failSave) return route.fulfill({ status: 503, json: { error: 'Synthetic save failure' } });
        Object.assign(control.settings, body);
        for (const key of Object.keys(control.values)) if (key in body) control.values[key] = body[key];
      }
      const json = result.json as any;
      return route.fulfill({ json: path.endsWith('/settings') ? { settings: { ...json?.settings, ...control.settings, ...control.values } } : { restaurant: { ...json?.restaurant, ...control.values } } });
    }
    return route.fulfill({ json: result.json ?? {}, status: result.status ?? 200 });
  });
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  return { fixture, control, writes };
}
const save = (page: Page) => page.getByRole('button', { name: 'Enregistrer les modifications', exact: true });
const opening = (page: Page) => page.locator('#intake-pickup-monday-open');
const notice = (page: Page) => page.locator('form [role=status]').filter({ hasNotText: /^Chargement/ });

for (const locale of ['fr', 'he']) test(`unified availability has one navigation entry and fits the viewport ${locale}`, async ({ page }, info) => {
  const state = await install(page, { locale });
  await page.setViewportSize({ width: locale === 'fr' ? 375 : 1440, height: 1000 });
  await page.goto('/1/settings/orders');
  await expect(opening(page)).toHaveValue('09:00', { timeout: 30_000 });
  await expect(page.locator('a[href="/1/settings/orders/availability"]')).toHaveCount(0);
  if (locale === 'he') await expect(page.locator('a[href="/1/settings/orders"][aria-current="page"]')).toHaveCount(1);
  await page.screenshot({ path: info.outputPath(`unified-availability-${locale}.png`), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(state.fixture.unhandled).toEqual([]);
});

for (const legacy of ['orders/availability', 'orders/preorders', 'opening-hours', 'scheduled-orders']) test(`legacy ${legacy} opens the unified editor with restaurant and read-only access preserved`, async ({ page }) => {
  const state = await install(page, { permissions: ['settings.view'] });
  await page.goto(`/2/settings/${legacy}`);
  await expect(page).toHaveURL(/\/2\/settings\/orders$/);
  await expect(opening(page)).toHaveValue('09:00', { timeout: 30_000 });
  await expect(opening(page)).toBeDisabled();
  await expect(save(page)).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
});

test('unified availability preserves absent hours on a service-only edit and scopes the save', async ({ page }) => {
  const state = await install(page, { noHours: true });
  await page.goto('/2/settings/orders');
  await page.getByRole('switch', { name: 'Livraison', exact: true }).click();
  await save(page).click();
  await expect(notice(page)).toContainText('Enregistré');
  expect(state.writes).toEqual([{ path: '/api/v1/restaurants/2/settings', restaurant: '2', body: { delivery_enabled: false } }]);
  expect(state.control.values.opening_hours_config).toBeUndefined();
});

test('unified availability preserves overnight, all-day and unrelated channel hours', async ({ page }) => {
  const state = await install(page), other = structuredClone(state.control.values.opening_hours_config);
  await page.goto('/1/settings/orders');
  await opening(page).fill('22:00');
  await page.locator('#intake-pickup-monday-close').fill('02:00');
  await save(page).click();
  await expect(notice(page)).toContainText('Enregistré');
  expect(state.writes[0].body.opening_hours_config.pickup.monday).toEqual({ open: '22:00', close: '02:00', closed: false });
  expect(state.writes[0].body.opening_hours_config.delivery).toEqual(other.delivery);
  expect(state.writes[0].body.opening_hours_config.dine_in).toEqual(other.dine_in);
  await opening(page).fill('00:00');
  await page.locator('#intake-pickup-monday-close').fill('00:00');
  await save(page).click();
  await expect(notice(page)).toContainText('Enregistré');
  expect(state.writes[1].body.opening_hours_config.pickup.monday).toEqual({ open: '00:00', close: '00:00', closed: false });
});

test('unified availability validates hours and retains the draft after a failed save', async ({ page }) => {
  const state = await install(page);
  await page.goto('/1/settings/orders');
  await opening(page).fill('');
  await save(page).click();
  await expect(opening(page)).toBeFocused();
  await expect(opening(page)).toHaveAttribute('aria-invalid', 'true');
  expect(state.writes).toHaveLength(0);
  await opening(page).fill('08:30');
  state.control.failSave = true;
  await save(page).click();
  await expect(page.locator('form [role=alert]')).toBeVisible();
  await expect(opening(page)).toHaveValue('08:30');
  state.control.failSave = false;
  await save(page).click();
  await expect(notice(page)).toContainText('Enregistré');
});

test('strict weekly lots ignore classic closed days and retain their hours through calendar edits', async ({ page }, info) => {
  const state = await install(page, { strictBatch: true });
  for (const channel of ['pickup', 'delivery']) for (const day of days) state.control.values.opening_hours_config[channel][day].closed = true;
  const retained = structuredClone(state.control.values.opening_hours_config);
  await page.goto('/1/settings/orders');
  await expect(page.getByRole('radio', { name: /^Précommandes uniquement/ })).toBeChecked();
  await expect(page.locator('[id^="intake-pickup-"], [id^="intake-delivery-"]')).toHaveCount(0);
  await page.locator('#preorder-open-day').selectOption('1');
  await page.locator('#preorder-open-time').fill('08:00');
  await page.locator('#preorder-cutoff-time').fill('21:00');
  await page.locator('#preorder-day-0').selectOption('6');
  await page.locator('#preorder-0-delivery-start').fill('15:00');
  await save(page).click();
  await expect(notice(page)).toContainText('Enregistré');
  expect(state.writes[0].body).toMatchObject({ batch_order_open_day: 1, batch_order_open_time: '08:00', batch_cutoff_time: '21:00', batch_fulfillment_days: [{ day: 6, pickup_start: '10:00', pickup_end: '14:00', delivery_start: '15:00', delivery_end: '18:00' }] });
  expect(state.writes[0].body).not.toHaveProperty('opening_hours_config');
  expect(state.control.values.opening_hours_config).toEqual(retained);
  await page.screenshot({ path: info.outputPath('strict-weekly-unified.png'), fullPage: true });
  await page.getByRole('radio', { name: /^Commandes immédiates/ }).click();
  await expect(page.locator('input[type=checkbox]').first()).toBeChecked();
});

test('table-service hours stay independent on the same page during strict weekly preorders', async ({ page }) => {
  const state = await install(page, { strictBatch: true });
  state.control.values.dine_in_enabled = true;
  await page.goto('/1/settings/orders');
  await expect(page.locator('#intake-pickup-monday-open')).toHaveCount(0);
  await page.locator('#intake-dine_in-monday-open').fill('12:00');
  await save(page).click();
  await expect(notice(page)).toContainText('Enregistré');
  expect(state.writes[0].body.opening_hours_config.dine_in.monday.open).toBe('12:00');
  expect(state.control.settings.preorders_only).toBe(true);
  expect(state.control.settings.batch_fulfillment_enabled).toBe(true);
});

test('General retains week and catering settings and only persists changed fields', async ({ page }) => {
  const state = await install(page);
  state.control.values.workdays = [0];
  await page.goto('/2/settings');
  await page.getByRole('combobox', { name: 'Premier jour de la semaine', exact: true }).selectOption('0');
  await page.getByRole('switch', { name: 'Traiteur uniquement', exact: true }).click();
  await save(page).click();
  await expect(notice(page)).toContainText('Enregistré');
  expect(state.writes).toEqual([{ path: '/api/v1/restaurants/2', restaurant: '2', body: { week_start_day: 0, catering_only: false } }]);
  const choices = page.getByRole('group', { name: /^Jours d['’]ouverture$/ });
  await expect(choices.getByRole('button', { name: 'Dimanche', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await choices.getByRole('button', { name: 'Dimanche', exact: true }).click();
  await save(page).click();
  await expect(notice(page)).toContainText('Enregistré');
  expect(state.writes[1].body).toEqual({ workdays: [] });
});

test('General hides catering without permission and preserves its value on a week edit', async ({ page }) => {
  const state = await install(page, { permissions: ['settings.view', 'settings.edit'] });
  await page.goto('/1/settings');
  await expect(page.getByRole('switch', { name: 'Traiteur uniquement', exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Premier jour de la semaine', exact: true }).selectOption('0');
  await save(page).click();
  await expect(notice(page)).toContainText('Enregistré');
  expect(state.writes[0].body).toEqual({ week_start_day: 0 });
  expect(state.control.values.catering_only).toBe(true);
});

test('table-service edits remain available when saved preorder services are disabled', async ({ page }) => {
  const state = await install(page, { strictBatch: true });
  state.control.values.pickup_enabled = false;
  state.control.values.delivery_enabled = false;
  await page.goto('/1/settings/orders');
  await page.getByRole('switch', { name: 'Sur place', exact: true }).click();
  await save(page).click();
  await expect(notice(page)).toContainText('Enregistré');
  expect(state.writes[0].body).toEqual({ dine_in_enabled: true });
  expect(state.control.settings.preorders_only).toBe(true);
});

test('preorders still require a service when enabling the policy or disabling its last service', async ({ page }) => {
  const state = await install(page, { strictBatch: true });
  state.control.values.pickup_enabled = false;
  await page.goto('/1/settings/orders');
  await page.getByRole('switch', { name: 'Livraison', exact: true }).click();
  await save(page).click();
  await expect(page.locator('#preorder-validation')).toContainText('Activez');
  expect(state.writes).toHaveLength(0);
});
