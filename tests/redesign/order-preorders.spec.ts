import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

test.setTimeout(90_000);
test.use({ timezoneId: 'Pacific/Honolulu' });
const cycle = (date = '2026-10-09') => ({ open_at: '2026-10-04T00:30:00+03:00', cutoff_at: '2026-10-07T22:00:00+03:00', fulfillment_days: [{ date, day_name: 'Friday', pickup_window: { start: '10:00', end: '14:00' } }] });
async function install(page: Page, options: { locale?: string; permissions?: string[]; batch?: boolean } = {}) {
  const fixtureOptions = { empty: false, permissions: options.permissions }, fixture = createFixture(fixtureOptions);
  const control = {
    settings: { preorders_only: false, pickup_enabled: true, delivery_enabled: true, dine_in_enabled: false, opening_hours_config: {}, orders_paused: false, rush_mode: false, scheduling_enabled: !options.batch, batch_fulfillment_enabled: !!options.batch, scheduling_lead_time_minutes: 90, scheduling_min_days_ahead: 1, scheduling_max_days_ahead: 7, scheduling_slot_duration_minutes: 30, scheduling_require_prepayment: false, batch_order_open_day: 0, batch_order_open_time: '00:30', batch_cutoff_day: 3, batch_cutoff_time: '22:00', batch_fulfillment_days: [{ day: 5, pickup_start: '10:00', pickup_end: '14:00', delivery_start: '14:00', delivery_end: '18:00' }], batch_require_prepayment: true, scheduling_available_hours: [{ start: '11:00', end: '14:00', days: [0,1] }], scheduling_cutoff_hour: 18 } as Record<string, any>,
    reads: 0, failRead: false, failSave: 0, gate: null as Promise<void> | null, previewFail: false, previewGate: null as Promise<void> | null, previewCompleted: 0, cycles: [cycle()],
  };
  const writes: { body: any; restaurant?: string; path: string }[] = [], previews: any[] = [];
  await page.addInitScript(({ locale }) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture'); localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'owner', email: 'demo@foody.test' })); localStorage.setItem('foody_restaurant_ids', '[1,2]'); localStorage.setItem('foody-admin-locale', locale); localStorage.setItem('foody_admin_theme', locale === 'he' ? 'dark' : 'light');
  }, { locale: options.locale ?? 'fr' });
  await page.route('**/api/v1/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname, method = req.method(), body = req.postDataJSON() ?? {}, restaurant = req.headers()['x-restaurant-id'];
    if (/\/restaurants\/\d+\/settings$/.test(path)) {
      if (method === 'GET') { control.reads++; if (control.failRead) return route.fulfill({ status: 503, json: { error: 'Synthetic preorder failure' } }); }
      else { writes.push({ path, restaurant, body }); if (control.gate) await control.gate; if (control.failSave) { control.failSave--; return route.fulfill({ status: 503, json: { error: 'Synthetic write failure' } }); } Object.assign(control.settings, body); }
      return route.fulfill({ json: { settings: control.settings } });
    }
    if (/\/batch-fulfillment-config$/.test(path)) return route.fulfill({ json: { enabled: true, ordering_open: true, current_batch_open_at: '2026-10-04T00:30:00+03:00', current_batch_cutoff: '2026-10-07T22:00:00+03:00', next_batch_open_at: '2026-10-11T00:30:00+03:00' } });
    if (/\/batch-preview$/.test(path)) {
      previews.push({ body, restaurant }); const cycles = structuredClone(control.cycles), gate = control.previewGate; control.previewGate = null;
      if (gate) await gate;
      if (control.previewFail) return route.fulfill({ status: 503, json: { error: 'Synthetic preview failure' } });
      await route.fulfill({ json: { upcoming_cycles: cycles } }); control.previewCompleted++; return;
    }
    const result = fixture.response(req.url(), method, body, Number(restaurant) || 1); return route.fulfill({ json: result.json ?? {}, status: result.status ?? 200 });
  });
  await page.route('**/*', route => ['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  return { fixture, control, writes, previews };
}
const save = (page: Page) => page.getByRole('button', { name: 'Enregistrer les modifications', exact: true });
const lead = (page: Page) => page.locator('#preorder-lead');
const notice = (page: Page) => page.locator('form > div [role=status]');
const preview = (page: Page) => page.getByRole('region', { name: 'Aperçu des prochaines commandes', exact: true });
const mode = (page: Page, name: string) => name === 'Dès que possible' ? page.getByRole('button', { name: /^Commandes immédiates/ }) : page.getByRole('group', { name: 'Organisation des précommandes', exact: true }).getByRole('button', { name: new RegExp(`^${name}`) });
const openBatch = async (page: Page) => { await mode(page, 'Lot hebdomadaire').click(); };
const guarded = (page: Page) => page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; });

for (const locale of ['fr','he']) test(`preorders weekly schedule responsive ${locale}`, async ({ page }, info) => {
  const state = await install(page, { locale, batch: true }); await page.setViewportSize({ width: locale === 'fr' ? 375 : 1440, height: 1000 }); await page.goto('/1/settings/orders/preorders'); await expect(page.locator('#preorder-cutoff-time')).toHaveValue('22:00', { timeout: 30_000 }); await page.screenshot({ path: info.outputPath(`preorders-${locale}.png`) }); await page.locator('#preorder-0-pickup-start').scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`preorders-windows-${locale}.png`) }); await page.locator('form section ol').evaluate(element => element.scrollIntoView({ block: 'center' })); await page.screenshot({ path: info.outputPath(`preorders-preview-${locale}.png`) }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(state.fixture.unhandled).toEqual([]);
});

test('preorders preserves a 90-minute delay and hidden settings on an independent edit', async ({ page }, info) => {
  const state = await install(page); await page.setViewportSize({ width: 375, height: 1000 }); await page.goto('/2/settings/orders/preorders'); await expect(lead(page)).toHaveValue('90'); await lead(page).scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('preorders-slots-fr.png') }); await page.locator('#preorder-horizon').fill('10'); await save(page).click(); await expect(notice(page)).toContainText('Enregistré'); expect(state.writes).toEqual([{ path: '/api/v1/restaurants/2/settings', restaurant: '2', body: { scheduling_max_days_ahead: 10 } }]); expect(state.control.settings.scheduling_lead_time_minutes).toBe(90); expect(state.control.settings.scheduling_available_hours).toHaveLength(1); expect(state.control.settings.scheduling_cutoff_hour).toBe(18);
});

test('preorders preserves the legacy effective delay until it is explicitly changed and accepts zero', async ({ page }) => {
  const state = await install(page); state.control.settings.scheduling_lead_time_minutes = 0; state.control.settings.scheduling_min_days_ahead = 2; await page.goto('/1/settings/orders/preorders'); await expect(lead(page)).toHaveValue('2880'); await page.getByRole('switch', { name: 'Paiement requis à la réservation', exact: true }).click(); await save(page).click(); await expect(notice(page)).toContainText('Enregistré'); expect(state.writes[0].body).toEqual({ scheduling_require_prepayment: true }); await lead(page).fill('0'); await save(page).click(); await expect(notice(page)).toContainText('Enregistré'); expect(state.writes[1].body).toEqual({ scheduling_lead_time_minutes: 0, scheduling_min_days_ahead: 0 });
});

test('preorders mode change only writes exclusive flags and can retain drafts in inactive settings', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/orders/preorders'); await mode(page,'Dès que possible').click(); await save(page).click(); await expect(notice(page)).toContainText('Enregistré'); expect(state.writes[0].body).toEqual({ scheduling_enabled: false, batch_fulfillment_enabled: false });
  await expect(lead(page)).toHaveCount(0); await page.getByRole('button', { name: /^Les deux/ }).click(); await lead(page).fill('91'); await mode(page,'Lot hebdomadaire').click(); await save(page).click(); await expect(notice(page)).toContainText('Enregistré'); expect(state.writes[1].body).toEqual({ scheduling_enabled: false, batch_fulfillment_enabled: true, scheduling_lead_time_minutes: 91, scheduling_min_days_ahead: 1 });
});

test('preorders inherited opening follows cutoff in the preview without pinning an opening', async ({ page }) => {
  const state = await install(page, { batch: true }); state.control.settings.batch_order_open_time = ''; state.control.settings.batch_order_open_day = 5; await page.goto('/1/settings/orders/preorders'); await expect(page.locator('#preorder-open-time')).toHaveValue(''); await expect.poll(() => state.previews.length).toBeGreaterThan(0); expect(state.previews[0].body.batch_order_open_time).toBe(''); await page.locator('#preorder-cutoff-time').fill('21:00'); await save(page).click(); await expect(notice(page)).toContainText('Enregistré'); expect(state.writes[0].body).toEqual({ batch_cutoff_time: '21:00' });
  await page.locator('#preorder-open-day').selectOption('0'); await save(page).click(); await expect(page.locator('#preorder-open-time')).toHaveAttribute('aria-invalid','true'); expect(state.writes).toHaveLength(1);
});

test('preorders prevents duplicate weekdays and an eighth day while preserving Sunday zero', async ({ page }) => {
  const state = await install(page, { batch: true }); await page.goto('/1/settings/orders/preorders'); for (let index = 0; index < 6; index++) await page.getByRole('button', { name: 'Ajouter un jour', exact: true }).click(); await expect(page.getByRole('button', { name: 'Ajouter un jour', exact: true })).toBeDisabled(); await expect(page.locator('#preorder-day-0 option[value="0"]')).toHaveJSProperty('disabled',true); await save(page).click(); await expect(notice(page)).toContainText('Enregistré'); const days = state.writes[0].body.batch_fulfillment_days; expect(new Set(days.map((value: any) => value.day)).size).toBe(7); expect(days.some((value: any) => value.day === 0)).toBe(true);
});

test('preorders validates optional windows as a pair and preserves other service times', async ({ page }) => {
  const state = await install(page, { batch: true }); await page.goto('/1/settings/orders/preorders'); await page.locator('#preorder-0-pickup-start').fill(''); await save(page).click(); await expect(page.locator('#preorder-0-pickup-start')).toBeFocused(); expect(state.writes).toHaveLength(0); await page.locator('#preorder-0-pickup-end').fill(''); await save(page).click(); await expect(notice(page)).toContainText('Enregistré'); expect(state.writes[0].body.batch_fulfillment_days[0]).toEqual({ day: 5, pickup_start: '', pickup_end: '', delivery_start: '14:00', delivery_end: '18:00' });
});

test('preorders validates active batch days and can clear the inactive schedule', async ({ page }) => {
  const state = await install(page, { batch: true }); await page.goto('/1/settings/orders/preorders'); await page.getByRole('button', { name: 'Supprimer · Vendredi', exact: true }).click(); await save(page).click(); await expect(page.locator('#preorder-validation')).toContainText('Aucun jour'); expect(state.writes).toHaveLength(0); await mode(page,'Dès que possible').click(); await save(page).click(); await expect(notice(page)).toContainText('Enregistré'); expect(state.writes[0].body).toEqual({ scheduling_enabled: false, batch_fulfillment_enabled: false, batch_fulfillment_days: [] });
});

test('preorders preview failure retries without persistence and keeps restaurant-local calendar dates', async ({ page }) => {
  const state = await install(page, { batch: true }); state.control.previewFail = true; await page.goto('/1/settings/orders/preorders'); await expect(preview(page).getByRole('alert')).toContainText('indisponible', { timeout: 30_000 }); state.control.previewFail = false; await preview(page).getByRole('button', { name: 'Réessayer', exact: true }).click(); await expect(preview(page)).toContainText('dim. 4 oct. 2026 · 00:30'); await expect(preview(page)).toContainText('ven. 9 oct. 2026'); expect(state.writes).toHaveLength(0);
});

test('preorders ignores an old preview response after a newer draft has resolved', async ({ page }) => {
  const state = await install(page, { batch: true }); let release!: () => void; state.control.previewGate = new Promise<void>(resolve => { release = resolve; }); await page.goto('/1/settings/orders/preorders'); await expect.poll(() => state.previews.length).toBe(1); state.control.cycles = [cycle('2026-10-16')]; await page.locator('#preorder-cutoff-time').fill('21:00'); await expect(preview(page)).toContainText('ven. 16 oct. 2026'); release(); await expect.poll(() => state.control.previewCompleted).toBe(2); await expect(preview(page)).not.toContainText('ven. 9 oct. 2026');
});

test('preorders distinguishes failed loading and failed serialized saving, retaining the draft', async ({ page }) => {
  const state = await install(page); state.control.failRead = true; await page.goto('/1/settings/orders/preorders'); await expect(page.locator('main [role=alert]')).toContainText('Impossible de charger'); await expect(lead(page)).toHaveCount(0); state.control.failRead = false; await page.getByRole('button', { name: 'Réessayer', exact: true }).click(); await lead(page).fill('120'); state.control.failSave = 1; let release!: () => void; state.control.gate = new Promise<void>(resolve => { release = resolve; }); await save(page).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); }); await expect(lead(page)).toHaveJSProperty('readOnly',true); await expect(mode(page,'Lot hebdomadaire')).toBeDisabled(); release(); state.control.gate = null; await expect(page.locator('main [role=alert]')).toContainText('n’a pas pu être confirmé'); await expect(lead(page)).toHaveValue('120'); await save(page).click(); await expect(notice(page)).toContainText('Enregistré'); expect(state.writes).toHaveLength(2);
});

test('preorders validates precise delays and duration without discarding hidden drafts', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/orders/preorders'); for (const value of ['','-1','1.5']) { await lead(page).fill(value); await save(page).click(); await expect(lead(page)).toHaveAttribute('aria-invalid','true'); } await lead(page).fill('90'); await page.locator('#preorder-duration').fill('7'); await mode(page,'Lot hebdomadaire').click(); await save(page).click(); await expect(page.locator('#preorder-duration')).toBeFocused(); await expect(mode(page,'Lot hebdomadaire')).toHaveAttribute('aria-pressed','true'); expect(state.writes).toHaveLength(0);
});

test('preorders guards reset and navigation while retaining the draft on locale change', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/orders/preorders'); await lead(page).fill('121'); const reads = state.control.reads; expect(await guarded(page)).toBe(true); await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: 'Restaurant', exact: true }).click(); await page.getByRole('link', { name: 'Service et délais', exact: true }).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler', exact: true }).click(); await expect(lead(page)).toHaveValue('121'); await page.getByRole('button', { name: 'Réinitialiser', exact: true }).click(); await page.getByRole('button', { name: 'Abandonner les modifications', exact: true }).click(); await expect(lead(page)).toHaveValue('90'); await lead(page).fill('122'); await page.getByRole('button', { name: 'Atelier Foody', exact: true }).click(); await page.getByRole('dialog').getByRole('combobox').selectOption('he'); await page.keyboard.press('Escape'); await expect(lead(page)).toHaveValue('122'); expect(state.control.reads).toBe(reads);
});

test('preorders legacy entry scopes read-only users and permits a nonpersistent preview', async ({ page }) => {
  const state = await install(page, { permissions: ['settings.view'], batch: true }); await page.goto('/2/settings/scheduled-orders'); await expect(page).toHaveURL(/\/2\/settings\/orders$/); await expect(page.locator('#preorder-cutoff-time')).toHaveJSProperty('readOnly',true); await expect(save(page)).toHaveCount(0); await expect(page.getByRole('button', { name: 'Ajouter un jour', exact: true })).toHaveCount(0); await expect.poll(() => state.previews.length).toBeGreaterThan(0); expect(state.previews[0].restaurant).toBe('2'); expect(state.writes).toHaveLength(0);
});

test('preorders English and Hebrew weekdays use localized names with LTR times', async ({ page }) => {
  const state = await install(page, { locale: 'en', batch: true }); await page.goto('/1/settings/orders/preorders'); await expect(page.locator('#preorder-open-day option[value="0"]')).toHaveText('Sunday'); await expect(page.locator('#preorder-open-time')).toHaveAttribute('dir','ltr'); await page.getByRole('button', { name: 'Atelier Foody', exact: true }).click(); await page.getByRole('dialog').getByRole('combobox').selectOption('he'); await page.keyboard.press('Escape'); await expect(page.locator('#preorder-open-day option[value="0"]')).not.toHaveText('Sunday'); expect(state.writes).toHaveLength(0);
});

test('preorders keeps historical values on an unrelated change and never clears a saved opening silently', async ({ page }) => {
  const state = await install(page); state.control.settings.scheduling_slot_duration_minutes = 3; state.control.settings.scheduling_max_days_ahead = 0; await page.goto('/1/settings/orders/preorders'); await page.getByRole('switch', { name: 'Paiement requis à la réservation', exact: true }).click(); await save(page).click(); await expect(notice(page)).toContainText('Enregistré'); expect(state.writes[0].body).toEqual({ scheduling_require_prepayment: true }); await openBatch(page); await page.locator('#preorder-open-time').fill(''); await save(page).click(); await expect(page.locator('#preorder-validation')).toContainText('ne peut pas être effacée'); expect(state.writes).toHaveLength(1);
});


test('strict weekly ordering hides irrelevant hours, retains them and saves services with the policy', async ({ page }, info) => {
  const state = await install(page, { batch: true });
  await page.goto('/1/settings/orders');
  await page.getByRole('button', { name: /^Précommandes uniquement/ }).click();
  await expect(page.locator('#intake-pickup-sunday-open')).toHaveCount(0);
  await expect(page.getByRole('switch', { name: 'Sur place', exact: true })).toHaveCount(0);
  await expect(page.locator('#preorder-cutoff-time')).toBeVisible();
  await page.getByRole('switch', { name: 'Livraison', exact: true }).click();
  await expect(page.locator('#preorder-0-delivery-start')).toHaveCount(0);
  await save(page).click();
  await expect(notice(page)).toContainText('Enregistré');
  expect(state.writes[0].body).toEqual({ preorders_only: true, delivery_enabled: false });
  expect(state.control.settings.batch_fulfillment_days[0].delivery_start).toBe('14:00');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('strict-weekly-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 375, height: 1000 });
  await expect.poll(async () => (await page.locator('main[data-workspace-shell]').boundingBox())?.x).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('strict-weekly-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: /^Les deux/ }).click();
  await expect(page.locator('#intake-pickup-sunday-open')).toBeVisible();
  await page.getByRole('button', { name: /^Commandes immédiates/ }).click();
  await expect(page.locator('#preorder-cutoff-time')).toHaveCount(0);
});

test('strict slot ordering keeps receiving hours and preserves drafts across mode switches', async ({ page }) => {
  const state = await install(page);
  await page.goto('/1/settings/orders');
  await page.getByRole('button', { name: /^Précommandes uniquement/ }).click();
  await page.getByRole('button', { name: 'Utiliser les horaires par service', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Horaires de retrait et livraison', exact: true })).toBeVisible();
  await page.locator('#intake-pickup-sunday-open').fill('11:00');
  await mode(page, 'Lot hebdomadaire').click();
  await expect(page.locator('#intake-pickup-sunday-open')).toHaveCount(0);
  await mode(page, 'Date et créneau').click();
  await expect(page.locator('#intake-pickup-sunday-open')).toHaveValue('11:00');
  await save(page).click();
  await expect(notice(page)).toContainText('Enregistré');
  expect(state.writes[0].body.preorders_only).toBe(true);
  expect(state.writes[0].body.opening_hours_config.pickup.sunday.open).toBe('11:00');
  expect(state.writes[0].body.opening_hours_config.delivery).toBeUndefined();
});


test('an invalid delivery draft remains correctable after disabling delivery', async ({ page }) => {
  await install(page, { batch: true });
  await page.goto('/1/settings/orders');
  await page.locator('#preorder-0-delivery-start').fill('');
  await page.getByRole('switch', { name: 'Livraison', exact: true }).click();
  await save(page).click();
  await expect(page.locator('#preorder-0-delivery-start')).toBeFocused();
  await page.locator('#preorder-0-delivery-start').fill('14:30');
  await save(page).click();
  await expect(notice(page)).toContainText('Enregistré');
});
