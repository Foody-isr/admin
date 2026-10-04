import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

async function install(page: Page, options: { locale?: string; scopedRole?: string; accountRole?: string } = {}) {
  const fixture = createFixture();
  const control = { reads: 0, failRead: false, failAfterWrite: false, failWrite: false, applyAndFail: false, gate: null as Promise<void> | null, subscription: { id: 1, restaurant_id: 1, status: 'active', plan_tier: 'starter', card_last_four: '4242', card_brand: 'Demo', current_period_end: '2026-11-04T10:30:00Z', events: [{ id: 1, subscription_id: 1, event_type: 'payment_succeeded', amount: 299.75, currency: 'ILS', created_at: '2026-10-03T09:30:00Z' }, { id: 2, subscription_id: 1, event_type: 'payment_failed', amount: 18.42, currency: 'USD', created_at: '2026-10-02T08:00:00Z' }, { id: 3, subscription_id: 1, event_type: 'plan_changed', created_at: '2026-10-01T08:00:00Z' }] } as any };
  const writes: { body: any; restaurant?: string; path: string }[] = [];
  await page.addInitScript(({ locale, accountRole }) => { localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture'); localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: accountRole, email: 'demo@foody.test' })); localStorage.setItem('foody_restaurant_ids', '[1,2]'); localStorage.setItem('foody-admin-locale', locale); localStorage.setItem('foody_admin_theme', locale === 'he' ? 'dark' : 'light'); }, { locale: options.locale ?? 'fr', accountRole: options.accountRole ?? 'owner' });
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method(), body = request.postDataJSON() ?? {}, restaurant = request.headers()['x-restaurant-id'];
    if (path === '/api/v1/users/me') return route.fulfill({ json: { permissions: ['settings.view', 'settings.edit'], role_name: options.scopedRole ?? 'Owner', user: { id: 1, full_name: 'Équipe démo', role: options.accountRole ?? 'owner' } } });
    if (/\/subscription$/.test(path)) { control.reads++; return control.failRead ? route.fulfill({ status: 503, json: { error: 'Synthetic subscription failure' } }) : route.fulfill({ json: { subscription: control.subscription && { ...control.subscription, restaurant_id: Number(restaurant) } } }); }
    if (path.endsWith('/subscription/change-plan')) {
      writes.push({ body, restaurant, path }); if (control.gate) await control.gate;
      if (!control.failWrite || control.applyAndFail) control.subscription.plan_tier = body.plan_tier;
      if (control.failAfterWrite) control.failRead = true;
      return route.fulfill({ status: control.failWrite ? 503 : 200, json: control.failWrite ? { error: 'Synthetic uncertain plan change' } : { ok: true } });
    }
    const result = fixture.response(request.url(), method, body, Number(restaurant) || 1); return route.fulfill({ json: result.json ?? {}, status: result.status ?? 200 });
  });
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  return { control, writes, fixture };
}
const upgrade = (page: Page) => page.getByRole('button', { name: 'Passer à Premium', exact: true });
async function confirm(page: Page) { await upgrade(page).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Confirmer', exact: true }).click(); }
const verify = (page: Page) => page.getByRole('button', { name: 'Vérifier l’abonnement', exact: true });

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
  const state = await install(page); state.control.subscription.events = []; await page.goto('/1/billing'); await expect(page.getByText('Aucun événement de facturation pour le moment.', { exact: true })).toBeVisible(); const reads = state.control.reads; await page.getByRole('button', { name: 'Foody · Profil', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'עברית', exact: true }).click(); await page.keyboard.press('Escape'); await expect(page.getByText('אין עדיין אירועי חיוב.', { exact: true })).toBeVisible(); expect(state.control.reads).toBe(reads);
});

test('billing malformed subscription never exposes change actions', async ({ page }) => {
  const state = await install(page); state.control.subscription = null; await page.goto('/1/billing'); await expect(page.locator('main [role=alert]')).toContainText('Impossible de charger'); await expect(upgrade(page)).toHaveCount(0); expect(state.writes).toHaveLength(0);
});
