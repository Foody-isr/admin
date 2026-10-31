import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

test.setTimeout(90_000);
test.use({ timezoneId: 'Pacific/Honolulu' });
const cycle = (date = '2026-10-09') => ({ open_at: '2026-10-04T00:30:00+03:00', cutoff_at: '2026-10-07T22:00:00+03:00', fulfillment_days: [{ date, day_name: 'Friday', pickup_window: { start: '10:00', end: '14:00' } }] });
async function install(page: Page, options: { locale?: string; permissions?: string[]; batch?: boolean } = {}) {
  const fixtureOptions = { empty: false, permissions: options.permissions }, fixture = createFixture(fixtureOptions);
  const control = {
    settings: { ordering_settings_merge_supported:true, preorders_only: false, pickup_enabled: true, delivery_enabled: true, dine_in_enabled: false, opening_hours_config: {}, orders_paused: false, rush_mode: false, scheduling_enabled: !options.batch, batch_fulfillment_enabled: !!options.batch, scheduling_lead_time_minutes: 90, scheduling_min_days_ahead: 1, scheduling_max_days_ahead: 7, scheduling_slot_duration_minutes: 30, scheduling_require_prepayment: false, batch_order_open_day: 0, batch_order_open_time: '00:30', batch_cutoff_day: 3, batch_cutoff_time: '22:00', batch_fulfillment_days: [{ day: 5, pickup_start: '10:00', pickup_end: '14:00', delivery_start: '14:00', delivery_end: '18:00' }], batch_require_prepayment: true, batch_ordering_mode: 'calendar', scheduling_available_hours: [{ start: '11:00', end: '14:00', days: [0,1] }], scheduling_cutoff_hour: 18 } as Record<string, any>,
    simulationClock: { ordered_at: '2026-10-30T07:43:00+01:00', timezone: 'Europe/Paris' },
    reads: 0, failRead: false, failSave: 0, gate: null as Promise<void> | null, previewFail: false, previewGate: null as Promise<void> | null, previewCompleted: 0, cycles: [cycle()],
  };
  const timingPreviews: any[] = [];
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
    if (path === '/api/v1/public/address-autocomplete') return route.fulfill({ json: { suggestions: [] } });
    if (path.endsWith('/delivery/ordering-simulation') && method === 'GET') return route.fulfill({ json: control.simulationClock });
    if (/\/batch-fulfillment-config$/.test(path)) return route.fulfill({ json: { enabled: true, ordering_open: true, current_batch_open_at: '2026-10-04T00:30:00+03:00', current_batch_cutoff: '2026-10-07T22:00:00+03:00', next_batch_open_at: '2026-10-11T00:30:00+03:00' } });
    if (/\/preparation-preview$/.test(path)) {
      timingPreviews.push({ body, restaurant });
      const hours = body.opening_hours_config ?? {};
      return route.fulfill({ json: { ordered_at: '2026-10-13T23:00:00+02:00', timezone: 'Europe/Paris', lead_time_minutes: body.scheduling_lead_time_minutes, preparation_time_basis: body.scheduling_preparation_time_basis, preparation_start_time: body.scheduling_preparation_start_time, preparation_splittable: body.scheduling_preparation_splittable,
        services: ['pickup','delivery'].map(channel => { const day = hours[channel]?.wednesday; const base = day?.open ?? '09:00'; const startMinutes = Number(base.slice(0,2))*60 + Number(base.slice(3)) + (body.scheduling_preparation_time_basis === 'elapsed' ? 0 : body.scheduling_lead_time_minutes); const start = `${String(Math.floor(startMinutes/60)).padStart(2,'0')}:${String(startMinutes%60).padStart(2,'0')}`; return { order_type: channel, enabled: body[`${channel}_enabled`], first_slot: day && !day.closed ? { date: '2026-10-14', start, end: `${String(Math.floor((startMinutes+body.scheduling_slot_duration_minutes)/60)).padStart(2,'0')}:${String((startMinutes+body.scheduling_slot_duration_minutes)%60).padStart(2,'0')}` } : null, service_hours: day ?? null, hours_defaulted: false }; })
      } });
    }
    if (/\/batch-preview$/.test(path)) {
      previews.push({ body, restaurant }); const cycles = structuredClone(control.cycles), gate = control.previewGate; control.previewGate = null;
      if (gate) await gate;
      if (control.previewFail) return route.fulfill({ status: 503, json: { error: 'Synthetic preview failure' } });
      await route.fulfill({ json: { upcoming_cycles: cycles } }); control.previewCompleted++; return;
    }
    const result = fixture.response(req.url(), method, body, Number(restaurant) || 1); return route.fulfill({ json: result.json ?? {}, status: result.status ?? 200 });
  });
  await page.route('**/*', route => ['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  return { fixture, control, writes, previews, timingPreviews };
}
const save = (page: Page) => page.getByRole('button', { name: 'Enregistrer les modifications', exact: true });
const lead = (page: Page) => page.locator('#preorder-lead');
const notice = (page: Page) => page.locator('form > div [role=status]');
const preview = (page: Page) => page.getByRole('region', { name: 'Aperçu des prochaines commandes', exact: true });
const mode = (page: Page, name: string) => name === 'Dès que possible' ? page.getByRole('radio', { name: /^Commandes immédiates/ }) : page.getByRole('radiogroup', { name: 'Organisation des commandes planifiées', exact: true }).getByRole('radio', { name: new RegExp(`^${name}`) });
const openBatch = async (page: Page) => { await mode(page, 'Lot hebdomadaire').click(); };
const guarded = (page: Page) => page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; });

for (const locale of ['fr','he']) test(`preorders weekly schedule responsive ${locale}`, async ({ page }, info) => {
  const state = await install(page, { locale, batch: true }); await page.setViewportSize({ width: locale === 'fr' ? 375 : 1440, height: 1000 }); await page.goto('/1/settings/orders'); await expect(page.locator('#preorder-cutoff-time')).toHaveValue('22:00', { timeout: 30_000 }); await page.screenshot({ path: info.outputPath(`preorders-${locale}.png`) }); await page.locator('#preorder-0-pickup-start').scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`preorders-windows-${locale}.png`) }); await page.locator('form section ol').evaluate(element => element.scrollIntoView({ block: 'center' })); await page.screenshot({ path: info.outputPath(`preorders-preview-${locale}.png`) }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(state.fixture.unhandled).toEqual([]);
});

test('preorders preserves a 90-minute delay and hidden settings on an independent edit', async ({ page }, info) => {
  const state = await install(page); await page.setViewportSize({ width: 375, height: 1000 }); await page.goto('/2/settings/orders'); await expect(lead(page)).toHaveValue('90'); await lead(page).scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('preorders-slots-fr.png') }); await page.locator('#preorder-horizon').fill('10'); await save(page).click(); await expect(notice(page)).toContainText('Enregistré'); expect(state.writes).toEqual([{ path: '/api/v1/restaurants/2/settings', restaurant: '2', body: { scheduling_max_days_ahead: 10 } }]); expect(state.control.settings.scheduling_lead_time_minutes).toBe(90); expect(state.control.settings.scheduling_available_hours).toHaveLength(1); expect(state.control.settings.scheduling_cutoff_hour).toBe(18);
});

test('preorders preserves the legacy effective delay until it is explicitly changed and accepts zero', async ({ page }) => {
  const state = await install(page); state.control.settings.scheduling_lead_time_minutes = 0; state.control.settings.scheduling_min_days_ahead = 2; await page.goto('/1/settings/orders'); await expect(lead(page)).toHaveValue('2880'); await page.getByRole('switch', { name: 'Paiement requis à la réservation', exact: true }).click(); await save(page).click(); await expect(notice(page)).toContainText('Enregistré'); expect(state.writes[0].body).toEqual({ scheduling_require_prepayment: true }); await lead(page).fill('0'); await save(page).click(); await expect(notice(page)).toContainText('Enregistré'); expect(state.writes[1].body).toEqual({ scheduling_lead_time_minutes: 0, scheduling_min_days_ahead: 0 });
});

test('preorders mode change only writes exclusive flags and can retain drafts in inactive settings', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/orders'); await mode(page,'Dès que possible').click(); await save(page).click(); await expect(notice(page)).toContainText('Enregistré'); expect(state.writes[0].body).toEqual({ scheduling_enabled: false, batch_fulfillment_enabled: false });
  await expect(lead(page)).toHaveCount(0); await page.getByRole('radio', { name: /^Les deux/ }).click(); await lead(page).fill('91'); await mode(page,'Lot hebdomadaire').click(); await save(page).click(); await expect(notice(page)).toContainText('Enregistré'); expect(state.writes[1].body).toEqual({ scheduling_enabled: false, batch_fulfillment_enabled: true, scheduling_lead_time_minutes: 91, scheduling_min_days_ahead: 1 });
});

test('preorders inherited opening follows cutoff in the preview without pinning an opening', async ({ page }) => {
  const state = await install(page, { batch: true }); state.control.settings.batch_order_open_time = ''; state.control.settings.batch_order_open_day = 5; await page.goto('/1/settings/orders'); await expect(page.locator('#preorder-open-time')).toHaveValue(''); await expect.poll(() => state.previews.length).toBeGreaterThan(0); expect(state.previews[0].body.batch_order_open_time).toBe(''); await page.locator('#preorder-cutoff-time').fill('21:00'); await save(page).click(); await expect(notice(page)).toContainText('Enregistré'); expect(state.writes[0].body).toEqual({ batch_cutoff_time: '21:00' });
  await page.locator('#preorder-open-day').selectOption('0'); await save(page).click(); await expect(page.locator('#preorder-open-time')).toHaveAttribute('aria-invalid','true'); expect(state.writes).toHaveLength(1);
});

test('preorders prevents duplicate weekdays and an eighth day while preserving Sunday zero', async ({ page }) => {
  const state = await install(page, { batch: true }); await page.goto('/1/settings/orders'); for (let index = 0; index < 6; index++) await page.getByRole('button', { name: 'Ajouter un jour', exact: true }).click(); await expect(page.getByRole('button', { name: 'Ajouter un jour', exact: true })).toBeDisabled(); await expect(page.locator('#preorder-day-0 option[value="0"]')).toHaveJSProperty('disabled',true); await save(page).click(); await expect(notice(page)).toContainText('Enregistré'); const days = state.writes[0].body.batch_fulfillment_days; expect(new Set(days.map((value: any) => value.day)).size).toBe(7); expect(days.some((value: any) => value.day === 0)).toBe(true);
});

test('preorders validates optional windows as a pair and preserves other service times', async ({ page }) => {
  const state = await install(page, { batch: true }); await page.goto('/1/settings/orders'); await page.locator('#preorder-0-pickup-start').fill(''); await save(page).click(); await expect(page.locator('#preorder-0-pickup-start')).toBeFocused(); expect(state.writes).toHaveLength(0); await page.locator('#preorder-0-pickup-end').fill(''); await save(page).click(); await expect(notice(page)).toContainText('Enregistré'); expect(state.writes[0].body.batch_fulfillment_days[0]).toEqual({ day: 5, pickup_start: '', pickup_end: '', delivery_start: '14:00', delivery_end: '18:00' });
});

test('preorders validates active batch days and can clear the inactive schedule', async ({ page }) => {
  const state = await install(page, { batch: true }); await page.goto('/1/settings/orders'); await page.getByRole('button', { name: 'Supprimer · Vendredi', exact: true }).click(); await save(page).click(); await expect(page.locator('#preorder-validation')).toContainText('Aucun jour'); expect(state.writes).toHaveLength(0); await mode(page,'Dès que possible').click(); await save(page).click(); await expect(notice(page)).toContainText('Enregistré'); expect(state.writes[0].body).toEqual({ scheduling_enabled: false, batch_fulfillment_enabled: false, batch_fulfillment_days: [] });
});

test('preorders preview failure retries without persistence and keeps restaurant-local calendar dates', async ({ page }) => {
  const state = await install(page, { batch: true }); state.control.previewFail = true; await page.goto('/1/settings/orders'); await expect(preview(page).getByRole('alert')).toContainText('indisponible', { timeout: 30_000 }); state.control.previewFail = false; await preview(page).getByRole('button', { name: 'Réessayer', exact: true }).click(); await expect(preview(page)).toContainText('dim. 4 oct. 2026 · 00:30'); await expect(preview(page)).toContainText('ven. 9 oct. 2026'); expect(state.writes).toHaveLength(0);
});

test('preorders ignores an old preview response after a newer draft has resolved', async ({ page }) => {
  const state = await install(page, { batch: true }); let release!: () => void; state.control.previewGate = new Promise<void>(resolve => { release = resolve; }); await page.goto('/1/settings/orders'); await expect.poll(() => state.previews.length).toBe(1); state.control.cycles = [cycle('2026-10-16')]; await page.locator('#preorder-cutoff-time').fill('21:00'); await expect(preview(page)).toContainText('ven. 16 oct. 2026'); release(); await expect.poll(() => state.control.previewCompleted).toBe(2); await expect(preview(page)).not.toContainText('ven. 9 oct. 2026');
});

test('preorders distinguishes failed loading and failed serialized saving, retaining the draft', async ({ page }) => {
  const state = await install(page); state.control.failRead = true; await page.goto('/1/settings/orders'); await expect(page.locator('main [role=alert]')).toContainText('Impossible de charger'); await expect(lead(page)).toHaveCount(0); state.control.failRead = false; await page.getByRole('button', { name: 'Réessayer', exact: true }).click(); await lead(page).fill('120'); state.control.failSave = 1; let release!: () => void; state.control.gate = new Promise<void>(resolve => { release = resolve; }); await save(page).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); }); await expect(lead(page)).toHaveJSProperty('readOnly',true); await expect(mode(page,'Lot hebdomadaire')).toBeDisabled(); release(); state.control.gate = null; await expect(page.locator('main [role=alert]')).toContainText('n’a pas pu être confirmé'); await expect(lead(page)).toHaveValue('120'); await save(page).click(); await expect(notice(page)).toContainText('Enregistré'); expect(state.writes).toHaveLength(2);
});

test('preorders validates precise delays and duration without discarding hidden drafts', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/orders'); for (const value of ['','-1','1.5']) { await lead(page).fill(value); await save(page).click(); await expect(lead(page)).toHaveAttribute('aria-invalid','true'); } await lead(page).fill('90'); await page.locator('#preorder-duration').fill('7'); await mode(page,'Lot hebdomadaire').click(); await save(page).click(); await expect(page.locator('#preorder-duration')).toBeFocused(); await expect(mode(page,'Lot hebdomadaire')).toBeChecked(); expect(state.writes).toHaveLength(0);
});

test('preorders guards reset and navigation while retaining the draft on locale change', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/orders'); await lead(page).fill('121'); const reads = state.control.reads; expect(await guarded(page)).toBe(true); await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: 'Restaurant', exact: true }).click(); await page.getByRole('link', { name: 'Service et délais', exact: true }).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler', exact: true }).click(); await expect(lead(page)).toHaveValue('121'); await page.getByRole('button', { name: 'Réinitialiser', exact: true }).click(); await page.getByRole('button', { name: 'Abandonner les modifications', exact: true }).click(); await expect(lead(page)).toHaveValue('90'); await lead(page).fill('122'); await page.getByRole('button', { name: 'Atelier Foody', exact: true }).click(); await page.getByRole('dialog').getByRole('combobox').selectOption('he'); await page.keyboard.press('Escape'); await expect(lead(page)).toHaveValue('122'); expect(state.control.reads).toBe(reads);
});

test('preorders legacy entry scopes read-only users and permits a nonpersistent preview', async ({ page }) => {
  const state = await install(page, { permissions: ['settings.view'], batch: true }); await page.goto('/2/settings/scheduled-orders'); await expect(page).toHaveURL(/\/2\/settings\/orders$/); await expect(page.locator('#preorder-cutoff-time')).toHaveJSProperty('readOnly',true); await expect(save(page)).toHaveCount(0); await expect(page.getByRole('button', { name: 'Ajouter un jour', exact: true })).toHaveCount(0); await expect.poll(() => state.previews.length).toBeGreaterThan(0); expect(state.previews[0].restaurant).toBe('2'); expect(state.writes).toHaveLength(0);
});

test('preorders English and Hebrew weekdays use localized names with LTR times', async ({ page }) => {
  const state = await install(page, { locale: 'en', batch: true }); await page.goto('/1/settings/orders'); await expect(page.locator('#preorder-open-day option[value="0"]')).toHaveText('Sunday'); await expect(page.locator('#preorder-open-time')).toHaveAttribute('dir','ltr'); await page.getByRole('button', { name: 'Atelier Foody', exact: true }).click(); await page.getByRole('dialog').getByRole('combobox').selectOption('he'); await page.keyboard.press('Escape'); await expect(page.locator('#preorder-open-day option[value="0"]')).not.toHaveText('Sunday'); expect(state.writes).toHaveLength(0);
});

test('preorders keeps historical values on an unrelated change and never clears a saved opening silently', async ({ page }) => {
  const state = await install(page); state.control.settings.scheduling_slot_duration_minutes = 3; state.control.settings.scheduling_max_days_ahead = 0; await page.goto('/1/settings/orders'); await page.getByRole('switch', { name: 'Paiement requis à la réservation', exact: true }).click(); await save(page).click(); await expect(notice(page)).toContainText('Enregistré'); expect(state.writes[0].body).toEqual({ scheduling_require_prepayment: true }); await openBatch(page); await page.locator('#preorder-open-time').fill(''); await save(page).click(); await expect(page.locator('#preorder-validation')).toContainText('ne peut pas être effacée'); expect(state.writes).toHaveLength(1);
});


test('strict weekly ordering hides irrelevant hours, retains them and saves services with the policy', async ({ page }, info) => {
  const state = await install(page, { batch: true });
  await page.goto('/1/settings/orders');
  await page.getByRole('radio', { name: /^Précommandes uniquement/ }).click();
  await expect(page.locator('#intake-pickup-sunday-open')).toHaveCount(0);
  await expect(page.locator('#intake-dine-in').getByRole('switch', { name: 'Sur place', exact: true })).toBeChecked();
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
  await page.getByRole('radio', { name: /^Les deux/ }).click();
  await expect(page.locator('#intake-pickup-sunday-open')).toBeVisible();
  await page.getByRole('radio', { name: /^Commandes immédiates/ }).click();
  await expect(page.locator('#preorder-cutoff-time')).toHaveCount(0);
});

test('strict slot ordering keeps receiving hours and preserves drafts across mode switches', async ({ page }) => {
  const state = await install(page);
  await page.goto('/1/settings/orders');
  await page.getByRole('radio', { name: /^Précommandes uniquement/ }).click();
  await page.getByRole('button', { name: 'Utiliser les horaires par service', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Horaires de retrait et livraison', exact: true })).toBeVisible();
  await page.locator('#intake-pickup-sunday-open').fill('11:00');
  await mode(page, 'Lot hebdomadaire').click();
  await expect(page.locator('#intake-pickup-sunday-open')).toHaveCount(0);
  await mode(page, 'Date et horaires de service').click();
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

test('preparation clock, custom start and continuity save as a sparse restaurant-scoped patch', async ({ page }, info) => {
  const state = await install(page);
  await page.goto('/1/settings/orders');
  await page.getByRole('radio', { name: /^Pendant les horaires du service/ }).click();
  await expect(page.getByRole('switch', { name: 'Répartir la préparation sur plusieurs services' })).not.toBeChecked();
  await expect(page.locator('[data-preparation-preview]')).not.toContainText('6 h');
  await page.getByRole('switch', { name: 'Répartir la préparation sur plusieurs services' }).click();
  await expect.poll(() => state.timingPreviews.at(-1)?.body.scheduling_preparation_splittable).toBe(true);
  await save(page).click();
  await expect(notice(page)).toContainText('Enregistré');
  expect(state.writes[0].body).toEqual({ scheduling_preparation_time_basis: 'opening_hours', scheduling_preparation_splittable: true });
  await page.getByRole('radio', { name: /^Horaire de début de production personnalisé/ }).click();
  await page.locator('#preorder-preparation-start').fill('07:00');
  await save(page).click();
  await expect(notice(page)).toContainText('Enregistré');
  expect(state.writes[1].body).toEqual({ scheduling_preparation_time_basis: 'custom_start', scheduling_preparation_start_time: '07:00' });
  await page.getByRole('radiogroup', { name: 'Quand compte le délai de préparation ?' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('preparation-settings-fr.png') });
});

test('suggested delivery hours require an explicit apply and can copy saved pickup hours', async ({ page }) => {
  const state = await install(page);
  await page.goto('/1/settings/orders');
  await page.getByRole('button', { name: 'Livraison', exact: true }).click();
  await expect(page.locator('#intake-services').getByText(/pas encore enregistrés/)).toBeVisible();
  await expect(save(page)).toBeDisabled();
  await page.getByRole('button', { name: 'Utiliser les horaires proposés', exact: true }).first().click();
  await save(page).click();
  await expect(notice(page)).toContainText('Enregistré');
  expect(state.writes[0].body.opening_hours_config.delivery.monday).toEqual({open:'09:00',close:'22:00',closed:false});
});

test('missing delivery days can copy pickup hours without replacing existing days', async ({ page }) => {
  const state = await install(page);
  const pickup = Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day => [day,{open:'10:00',close:'18:00',closed:false}]));
  const hours = { pickup, delivery:{friday:{open:'11:00',close:'16:00',closed:false}} };
  state.control.settings.opening_hours_config = hours;
  await page.route('**/api/v1/restaurants/1', route => route.fulfill({json:{restaurant:{id:1,name:'Atelier Foody',timezone:'Europe/Paris',pickup_enabled:true,delivery_enabled:true,dine_in_enabled:false,opening_hours_config:hours}}}));
  await page.goto('/1/settings/orders');
  await page.getByRole('button', {name:'Livraison',exact:true}).click();
  await page.getByRole('button', {name:'Copier les horaires de retrait pour les jours manquants',exact:true}).click();
  await save(page).click();
  await expect(notice(page)).toContainText('Enregistré');
  const saved = state.writes[0].body.opening_hours_config;
  expect(saved.delivery.monday).toEqual(pickup.monday);
  expect(saved.delivery.friday).toEqual(hours.delivery.friday);
});


test('preparation preview follows actual delay, service hours and saved versus unsaved values', async ({ page }, info) => {
  const state = await install(page);
  state.control.settings.scheduling_preparation_time_basis = 'opening_hours';
  state.control.settings.scheduling_lead_time_minutes = 180;
  state.control.settings.scheduling_available_hours = [];
  const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const hours = { pickup: Object.fromEntries(days.map(day => [day,{open:'09:00',close:'22:00',closed:false}])), delivery: Object.fromEntries(days.map(day => [day,{open:'10:00',close:'21:00',closed:false}])) };
  state.control.settings.opening_hours_config = hours;
  await page.route('**/api/v1/restaurants/1', route => route.fulfill({json:{restaurant:{id:1,name:'Atelier Foody',timezone:'Europe/Paris',pickup_enabled:true,delivery_enabled:true,dine_in_enabled:false,opening_hours_config:hours}}}));
  await page.goto('/1/settings/orders');
  await page.locator('summary').filter({hasText:'Aperçu du calendrier par défaut'}).click();
  const panel = page.locator('[data-preparation-preview]');
  await expect(panel).toContainText('paramètres enregistrés');
  await expect(panel).toContainText('3 heures');
  await expect(panel).toContainText('12:00–12:30');
  await expect(panel).toContainText('13:00–13:30');
  await expect(panel).toContainText('Europe/Paris');
  await expect(panel).not.toContainText('6 h');
  await lead(page).fill('90');
  await expect(panel).toContainText('1 heure 30 minutes');
  await expect(panel).toContainText('10:30–11:00');
  await expect(panel).toContainText('pas encore enregistrées');
  await page.locator('#intake-pickup-wednesday-open').fill('11:00');
  await expect(panel).toContainText('12:30–13:00');
  await expect(panel).toContainText('11:00–22:00');
  expect(state.writes).toHaveLength(0);
  expect(state.timingPreviews.at(-1).restaurant).toBe('1');
  await save(page).click();
  await expect(panel).toContainText('paramètres enregistrés');
  await expect(panel).toContainText('12:30–13:00');
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('dynamic-preparation-preview-fr.png') });
});

test('preparation preview discards a retired response, reports failure and retries without saving', async ({ page }) => {
  const state = await install(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let requests = 0, fail = false;
  await page.route('**/preparation-preview', async route => {
    const body = route.request().postDataJSON(); requests++;
    if (body.scheduling_lead_time_minutes === 90) await gate;
    if (fail) return route.fulfill({status:503,json:{}});
    return route.fulfill({json:{ordered_at:'2026-10-13T23:00:00+02:00',timezone:'Europe/Paris',lead_time_minutes:body.scheduling_lead_time_minutes,preparation_time_basis:body.scheduling_preparation_time_basis,preparation_splittable:body.scheduling_preparation_splittable,services:[{order_type:'pickup',enabled:true,first_slot:{date:'2026-10-14',start:'15:00',end:'15:30'},service_hours:{open:'12:00',close:'20:00'},hours_defaulted:false},{order_type:'delivery',enabled:false,first_slot:null,service_hours:null,hours_defaulted:false}]}});
  });
  await page.goto('/1/settings/orders');
  await expect.poll(() => requests).toBeGreaterThan(0);
  await lead(page).fill('180');
  await page.locator('summary').filter({hasText:'Aperçu du calendrier par défaut'}).click();
  const panel = page.locator('[data-preparation-preview]');
  await expect(panel).toContainText('3 heures');
  release();
  await expect(panel).not.toContainText('1 heure 30 minutes');
  fail = true;
  await lead(page).fill('240');
  await expect(panel.getByRole('alert')).toBeVisible();
  await expect(panel).not.toContainText('15:00');
  fail = false;
  await panel.getByRole('button', {name:'Réessayer',exact:true}).click();
  await expect(panel).toContainText('4 heures');
  await expect(panel).toContainText('Service désactivé');
  expect(state.writes).toHaveLength(0);
});


test('manual opening is explicit, retains delivery settings and restores the calendar', async ({ page }, info) => {
  const state = await install(page, { batch: true });
  state.control.settings.orders_paused = true;
  await page.goto('/2/settings/orders');
  await page.getByRole('radio', { name: /^Ouverture manuelle/ }).click();
  await expect(page.locator('#preorder-open-time')).toHaveCount(0);
  await expect(page.locator('#preorder-0-delivery-start')).toHaveValue('14:00');
  expect(state.writes).toHaveLength(0);
  state.control.cycles = [{ ...cycle(), open_at: '', cutoff_at: '' }];
  await expect.poll(() => state.previews.at(-1)?.body.batch_ordering_mode).toBe('manual');
  await save(page).click();
  await expect(notice(page)).toContainText('Enregistré');
  expect(state.writes[0].body).toEqual({ batch_ordering_mode: 'manual' });
  await expect(page.getByRole('combobox', { name: 'Reprise des commandes', exact: true })).toHaveCount(0);
  await expect(page.getByRole('switch', { name: 'Mettre en pause les commandes en ligne', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radiogroup', { name: 'Ouverture des commandes', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('manual-opening-fr.png') });
  await page.getByRole('radio', { name: /^Selon un calendrier/ }).click();
  await expect(page.locator('#preorder-open-time')).toHaveValue('00:30');
  await expect(page.locator('#preorder-cutoff-time')).toHaveValue('22:00');
  state.control.cycles = [cycle()];
  await save(page).click();
  await expect(notice(page)).toContainText('Enregistré');
  expect(state.writes[1].body).toEqual({ batch_ordering_mode: 'calendar' });
  expect(state.control.settings.batch_fulfillment_days[0].day).toBe(5);
});

test('read-only users cannot change manual opening', async ({ page }) => {
  const state = await install(page, { batch: true, permissions: ['settings.view'] });
  await page.goto('/1/settings/orders');
  await expect(page.getByRole('radio', { name: /^Ouverture manuelle/ })).toBeDisabled();
  expect(state.writes).toHaveLength(0);
});


for (const locale of ['fr', 'he', 'en']) test(`manual opening localized and responsive ${locale}`, async ({ page }, info) => {
  const state = await install(page, { batch: true, locale });
  state.control.settings.batch_ordering_mode = 'manual';
  state.control.settings.orders_paused = true;
  state.control.cycles = [{ ...cycle(), open_at: '', cutoff_at: '' }];
  await page.setViewportSize({ width: locale === 'fr' ? 375 : 1280, height: 1000 });
  await page.goto('/1/settings/orders');
  await expect(page.locator('#preorder-cutoff-time')).toHaveCount(0);
  await page.getByRole('radiogroup', { name: locale === 'fr' ? 'Ouverture des commandes' : locale === 'he' ? 'פתיחת הזמנות' : 'Opening of orders', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath(`manual-opening-${locale}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const toggle = page.getByRole('switch', { name: locale === 'fr' ? 'Mettre en pause les commandes en ligne' : locale === 'he' ? 'השהיית הזמנות מקוונות' : 'Pause online orders', exact: true });
  if (locale === 'fr') {
    await toggle.click(); await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click(); await expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(state.writes.map(write => write.body)).toEqual([
      { orders_paused: false, orders_paused_until: '', rush_mode: false },
      { orders_paused: true, orders_paused_until: '', rush_mode: false },
    ]);
  }
});

test('older API leaves the new opening choice unavailable without mutating settings', async ({ page }) => {
  const state = await install(page, { batch: true });
  delete state.control.settings.batch_ordering_mode;
  await page.goto('/1/settings/orders');
  await expect(page.getByRole('radio', { name: /^Ouverture manuelle/ })).toBeDisabled();
  await expect(page.getByText('Mettez à jour l’API avant de modifier le mode d’ouverture.')).toBeVisible();
  expect(state.writes).toHaveLength(0);
});

 test('saved ordering simulation uses basket, address and date without creating an order',async({page},info)=>{
 const state=await install(page);state.control.settings.scheduling_available_hours=[];
 await page.route('**/api/v1/menu/items?*',route=>route.fulfill({json:{items:[{id:10,name:'Roulé de démonstration',preparation_lead_time_minutes:30}]}}));
 await page.route('**/api/v1/delivery/zones?*',route=>route.fulfill({json:{zones:[{id:1,restaurant_id:1,name:'Secteur local — 10 €',type:'postal_codes',postal_codes:['75017'],is_active:true,created_at:'',schedule:{mode:'customer',days:[0,1,2,3,4,5],offer_pickup:false,same_day:{days:[1,2,3,4,5],time_mode:'restaurant',transit_minutes:60}}}]}}));
 const calls:{body:any;restaurant:string|undefined}[]=[];
 await page.route('**/api/v1/delivery/ordering-simulation',route=>{
  if(route.request().method()==='GET')return route.fallback();
  const body=route.request().postDataJSON();calls.push({body,restaurant:route.request().headers()['x-restaurant-id']});const remote=body.address.includes('94000');
  return route.fulfill({json:{deliverable:true,resolved:true,zone_id:remote?2:1,delivery_fee:remote?15:10,schedule:{enabled:true,evaluated_at:'2026-10-30T07:43:00+01:00',timezone:'Europe/Paris',delivery_mode:'customer',lead_time_minutes:30,constrained_by:{menu_item_id:10,name:'Roulé de démonstration',lead_time_minutes:30},slots_by_date:{...(remote?{}:{'2026-10-30':[{start:'11:00',end:'14:00'}]}),'2026-11-01':[{start:'09:30',end:'10:30'}]},delivery_day_policies:{'2026-10-30':{mode:'restaurant',...(remote?{unavailable_reason:'same_day_disabled'}:{estimated_windows:[{start:'11:00',end:'14:00'}]})}}}}});
 });
 await page.setViewportSize({width:375,height:1000});await page.goto('/1/settings/orders');
 await expect(page.getByRole('radio',{name:/^Commandes planifiées/})).toBeVisible();
 await page.getByText('Simuler une commande',{exact:true}).click();const panel=page.locator('#ordering-simulation');
 await panel.getByRole('button',{name:'Ajouter un article',exact:true}).click();
 await panel.getByRole('combobox',{name:'Adresse complète de livraison',exact:true}).fill('11 Rue de démonstration 75017 Paris');
 await panel.locator('input[type=date]').fill('2026-10-30');
 await panel.getByRole('button',{name:'Vérifier les disponibilités',exact:true}).click();
 const result=panel.locator('[data-ordering-simulation-result]');await expect(result).toContainText('11:00–14:00');await expect(result).toContainText('horaire à confirmer');await expect(result).toContainText('Roulé de démonstration');
 expect(calls[0].body.items).toEqual([{id:10,quantity:1}]);expect(calls[0].body.ordered_at).toBe('2026-10-30T07:43');expect(calls[0].restaurant).toBe('1');
 expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await result.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('ordering-simulation-fr.png')});
 await panel.getByRole('combobox',{name:'Adresse complète de livraison',exact:true}).fill('Adresse de démonstration 94000 Créteil');await expect(result).toHaveCount(0);
 await panel.getByRole('button',{name:'Vérifier les disponibilités',exact:true}).click();await expect(result).toContainText('n’est pas autorisée');await expect(result).toContainText('2026-11-01');
 await lead(page).fill('181');await expect(panel.getByRole('button',{name:'Vérifier les disponibilités',exact:true})).toBeDisabled();await expect(result).toHaveCount(0);
 expect(state.writes).toHaveLength(0);
 });


test('editing settings during simulation catalogue loading cannot strand the preview',async({page})=>{
 const state=await install(page);let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let requested=false;
 await page.route('**/api/v1/menu/items?*',async route=>{requested=true;await gate;return route.fulfill({json:{items:[{id:10,name:'Roulé de démonstration'}]}});});
 await page.route('**/api/v1/delivery/zones?*',route=>route.fulfill({json:{zones:[]}}));
 await page.goto('/1/settings/orders');await page.getByText('Simuler une commande',{exact:true}).click();await expect.poll(()=>requested).toBe(true);
 await lead(page).fill('91');release();
 const panel=page.locator('#ordering-simulation');await expect(panel.getByRole('button',{name:'Ajouter un article',exact:true})).toBeEnabled();
 await expect(panel.getByText('Enregistrez vos modifications avant de simuler les règles enregistrées.',{exact:true})).toBeVisible();
 expect(state.writes).toHaveLength(0);
});

for (const locale of ['fr', 'en', 'he'] as const) test(`simulation ordering clock and Now use the restaurant server clock ${locale}`, async ({ page }, info) => {
  const state = await install(page, { locale });
  await page.route('**/api/v1/menu/items?*', route => route.fulfill({ json: { items: [{ id: 10, name: 'Synthetic roll', preparation_lead_time_minutes: 30 }] } }));
  await page.route('**/api/v1/delivery/zones?*', route => route.fulfill({ json: { zones: [] } }));
  const requests: any[] = [];
  await page.route('**/api/v1/delivery/ordering-simulation', route => {
    if (route.request().method() === 'GET') return route.fallback();
    const body = route.request().postDataJSON(); requests.push({ body, restaurant: route.request().headers()['x-restaurant-id'] });
    const date = body.ordered_at.slice(0, 10), start = body.ordered_at.endsWith('14:30') ? '16:00' : '13:00';
    return route.fulfill({ json: { resolved: true, deliverable: true, delivery_fee: 10, schedule: { enabled: true, evaluated_at: `${body.ordered_at}:00+01:00`, timezone: 'Europe/Paris', lead_time_minutes: 30, delivery_mode: 'customer', slots_by_date: { [date]: [{ start, end: '18:30' }] }, delivery_day_policies: { [date]: { mode: 'restaurant', estimated_windows: [{ start, end: '18:30' }] } } } } });
  });
  await page.setViewportSize({ width: locale === 'he' ? 1440 : 375, height: 1000 });
  await page.goto('/1/settings/orders'); const panel = page.locator('#ordering-simulation'); await panel.locator('summary').click();
  const at = panel.locator('#simulation-ordered-at'), receiving = panel.locator('input[type=date]');
  await expect(at).toHaveValue('2026-10-30T07:43'); await expect(at).toHaveAttribute('dir', 'ltr'); await expect(panel).toContainText('Europe/Paris');
  await at.fill('2026-11-02T11:30'); await expect(receiving).toHaveValue('2026-11-02'); await expect(panel).toContainText(locale === 'fr' ? 'lundi' : locale === 'en' ? 'Monday' : 'יום שני');
  await panel.locator('fieldset > button').click(); await panel.locator('input[type=text]').fill('Synthetic address 75017 Paris');
  const run = panel.getByRole('button', { name: locale === 'fr' ? 'Vérifier les disponibilités' : locale === 'en' ? 'Check availability' : 'בדיקת זמינות', exact: true });
  await run.click(); const result = panel.locator('[data-ordering-simulation-result]'); await expect(result).toContainText('13:00–18:30'); await expect(result).toContainText('2026-11-02 · 11:30 · Europe/Paris');
  expect(requests[0]).toEqual({ body: { service: 'delivery', address: 'Synthetic address 75017 Paris', ordered_at: '2026-11-02T11:30', items: [{ id: 10, quantity: 1 }] }, restaurant: '1' });
  await at.fill('2026-11-02T14:30'); await expect(result).toHaveCount(0); await run.click(); await expect(result).toContainText('16:00–18:30');
  state.control.simulationClock.ordered_at = '2026-11-03T08:05:00+01:00';
  await panel.getByRole('button', { name: locale === 'fr' ? 'Maintenant' : locale === 'en' ? 'Now' : 'עכשיו', exact: true }).click();
  await expect(at).toHaveValue('2026-11-03T08:05'); await expect(receiving).toHaveValue('2026-11-03'); await expect(result).toHaveCount(0); expect(requests).toHaveLength(2);
  await at.fill(''); await expect(run).toBeDisabled(); await at.fill('2026-11-02T11:30');
  expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true); expect(state.writes).toHaveLength(0);
  await panel.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`simulation-time-${locale}.png`) });
});

test('simulation rejects ambiguous local time and a server result using another clock', async ({ page }) => {
  const state = await install(page);
  await page.route('**/api/v1/menu/items?*', route => route.fulfill({ json: { items: [{ id: 10, name: 'Synthetic roll' }] } }));
  await page.route('**/api/v1/delivery/zones?*', route => route.fulfill({ json: { zones: [] } }));
  let ambiguous = true;
  await page.route('**/api/v1/delivery/ordering-simulation', route => {
    if (route.request().method() === 'GET') return route.fallback();
    if (ambiguous) return route.fulfill({ status: 400, json: { error: 'ordering_simulation_time_invalid' } });
    return route.fulfill({ json: { resolved: true, deliverable: true, schedule: { enabled: true, evaluated_at: '2026-10-30T07:43:00+01:00', timezone: 'Europe/Paris', lead_time_minutes: 30, slots_by_date: {} } } });
  });
  await page.goto('/1/settings/orders'); const panel = page.locator('#ordering-simulation'); await panel.locator('summary').click();
  await panel.locator('fieldset > button').click(); await panel.locator('input[type=text]').fill('Synthetic address');
  const at = panel.locator('#simulation-ordered-at'); await at.fill('2026-10-25T02:30'); await panel.locator('input[type=date]').fill('2026-10-25');
  const run = panel.getByRole('button', { name: 'Vérifier les disponibilités', exact: true }); await run.click();
  await expect(panel.getByRole('alert')).toContainText('apparaît deux fois'); await expect(at).toHaveAttribute('aria-invalid', 'true');
  ambiguous = false; await at.fill('2026-11-02T11:30'); await run.click(); await expect(panel.getByRole('alert')).toContainText('n’a pas pu vérifier');
  await expect(panel.locator('[data-ordering-simulation-result]')).toHaveCount(0); expect(state.writes).toHaveLength(0);
});

for (const locale of ['fr', 'en', 'he'] as const) test(`simulation address autocomplete resolves a scoped selection ${locale}`, async ({ page }, info) => {
  const state = await install(page, { locale });
  await page.route('**/api/v1/menu/items?*', route => route.fulfill({ json: { items: [{ id: 10, name: 'Synthetic roll' }] } }));
  await page.route('**/api/v1/delivery/zones?*', route => route.fulfill({ json: { zones: [] } }));
  const searches: any[] = [], resolutions: any[] = [], simulations: any[] = [];
  let resolveSelection!: () => void;
  const selectionGate = new Promise<void>(resolve => { resolveSelection = resolve; });
  await page.route('**/api/v1/public/address-autocomplete?*', route => {
    const request = route.request();
    searches.push({ body: request.postDataJSON(), restaurant: request.headers()['x-restaurant-id'], query: new URL(request.url()).searchParams.get('restaurant_id') });
    return route.fulfill({ json: { suggestions: [{ id: 'synthetic-paris', kind: 'prediction', address: '11 Rue de démonstration', city: 'Paris', lookup_token: 'synthetic-address-choice' }] } });
  });
  await page.route('**/api/v1/public/address-autocomplete/resolve?*', async route => {
    resolutions.push({ body: route.request().postDataJSON(), restaurant: route.request().headers()['x-restaurant-id'] });
    await selectionGate;
    return route.fulfill({ json: { suggestion: { id: 'synthetic-paris', kind: 'address', address: '11 Rue de démonstration', city: 'Paris' } } });
  });
  await page.route('**/api/v1/delivery/ordering-simulation', route => {
    if (route.request().method() === 'GET') return route.fallback();
    simulations.push(route.request().postDataJSON());
    return route.fulfill({ json: { resolved: true, deliverable: false } });
  });
  await page.setViewportSize({ width: locale === 'he' ? 1440 : 375, height: 1000 });
  await page.goto('/1/settings/orders'); const panel = page.locator('#ordering-simulation'); await panel.locator('summary').click();
  await panel.locator('fieldset > button').click();
  const field = panel.locator('input[role=combobox]');
  await expect(field).toHaveAccessibleName(locale === 'fr' ? 'Adresse complète de livraison' : locale === 'en' ? 'Full delivery address' : 'כתובת משלוח מלאה');
  await field.fill('11 Rue démo');
  await expect(panel.getByRole('option', { name: '11 Rue de démonstration, Paris', exact: true })).toBeVisible();
  expect(searches.at(-1)).toMatchObject({ body: { text: '11 Rue démo', lang: locale }, restaurant: '1', query: '1' });
  expect(searches.at(-1).body.session_id).toBeTruthy();
  await page.screenshot({ path: info.outputPath(`simulation-address-${locale}.png`) });
  await field.press('ArrowDown'); await field.press('Enter');
  const run = panel.getByRole('button', { name: locale === 'fr' ? 'Vérifier les disponibilités' : locale === 'en' ? 'Check availability' : 'בדיקת זמינות', exact: true });
  await expect.poll(() => resolutions.length).toBe(1); await expect(run).toBeDisabled(); expect(simulations).toHaveLength(0);
  resolveSelection();
  await expect(field).toHaveValue('11 Rue de démonstration, Paris'); await expect(run).toBeEnabled();
  expect(resolutions[0]).toEqual({ body: { lookup_token: 'synthetic-address-choice' }, restaurant: '1' });
  await run.click(); expect(simulations[0].address).toBe('11 Rue de démonstration, Paris');
  await expect(panel.locator('[data-ordering-simulation-result]')).toBeVisible();
  await field.fill('Autre adresse'); await expect(panel.locator('[data-ordering-simulation-result]')).toHaveCount(0);
  await panel.locator('select').first().selectOption('pickup'); await expect(field).toHaveCount(0); await expect(run).toBeEnabled();
  expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true); expect(state.writes).toHaveLength(0);
});

test('simulation keeps manual address entry available when autocomplete fails', async ({ page }) => {
  const state = await install(page);
  await page.route('**/api/v1/menu/items?*', route => route.fulfill({ json: { items: [{ id: 10, name: 'Synthetic roll' }] } }));
  await page.route('**/api/v1/delivery/zones?*', route => route.fulfill({ json: { zones: [] } }));
  await page.route('**/api/v1/public/address-autocomplete?*', route => route.fulfill({ status: 503, json: { error: 'Synthetic unavailable' } }));
  let submitted: any;
  await page.route('**/api/v1/delivery/ordering-simulation', route => {
    if (route.request().method() === 'GET') return route.fallback();
    submitted = route.request().postDataJSON(); return route.fulfill({ json: { resolved: false, deliverable: false } });
  });
  await page.goto('/1/settings/orders'); const panel = page.locator('#ordering-simulation'); await panel.locator('summary').click();
  await panel.locator('fieldset > button').click(); await panel.locator('input[role=combobox]').fill('11 Rue de démonstration, 75017 Paris');
  await expect(panel.getByText('Les suggestions sont indisponibles. Vous pouvez saisir l’adresse complète manuellement.')).toBeVisible();
  await panel.getByRole('button', { name: 'Vérifier les disponibilités', exact: true }).click();
  expect(submitted.address).toBe('11 Rue de démonstration, 75017 Paris'); expect(state.writes).toHaveLength(0);
});
