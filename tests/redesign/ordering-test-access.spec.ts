import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

async function install(page: Page, options: { readOnly?: boolean; expired?: boolean; unavailable?: boolean; locale?: string } = {}) {
  const fixtureOptions = { empty: false, permissions: options.readOnly ? ['settings.view'] : undefined };
  const fixture = createFixture(fixtureOptions);
  const policy = { enabled: !!options.expired, allowed_ips: options.expired ? ['203.0.113.10'] : [], expires_at: options.expired ? new Date(Date.now() - 60000).toISOString() : null as string | null };
  const state = { ordering_test_access: policy, ordering_test_access_available: !options.unavailable, orders_paused: !!options.expired, orders_paused_until: null as string | null, fail: false };
  const writes: { body: any; restaurant?: string; path: string }[] = [];
  const currentIP = { value: '203.0.113.20', status: 200, requests: [] as Record<string, string>[] };
  await page.addInitScript(({ locale }) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Demo', role: 'owner', email: 'demo@foody.test' }));
    localStorage.setItem('foody_restaurant_ids', '[1,2]');
    localStorage.setItem('foody-admin-locale', locale);
  }, { locale: options.locale ?? 'fr' });
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname, restaurant = request.headers()['x-restaurant-id'];
    const response = fixture.response(request.url(), 'GET', {}, Number(restaurant) || 1);
    if (/\/restaurants\/\d+\/settings$/.test(path)) {
      if (request.method() === 'PUT') {
        const body = request.postDataJSON(); writes.push({ body, restaurant, path });
        if (state.fail) return route.fulfill({ status: 400, json: { error: 'could not update settings', details: 'ordering_test_access_ips_invalid' } });
        state.ordering_test_access = body.ordering_test_access;
        if (state.ordering_test_access.enabled) { state.orders_paused = true; state.orders_paused_until = null; }
      }
      return route.fulfill({ json: { settings: { ...(response.json as any)?.settings, ...state } } });
    }
    return route.fulfill({ status: response.status ?? 200, json: response.json ?? {} });
  });
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  await page.route('**/api/ordering-test-ip', route => {
    currentIP.requests.push(route.request().headers());
    return route.fulfill({ status: currentIP.status, json: { ip: currentIP.value } });
  });
  return { state, writes, fixture, currentIP };
}

for (const ip of ['203.0.113.20', '2001:db8::20']) test(`one click authorizes the current ${ip.includes(':') ? 'IPv6' : 'IPv4'} with a bounded default expiration`, async ({ page }) => {
  const control = await install(page);
  control.currentIP.value = ip;
  await page.goto('/2/settings/orders/test-access');
  await page.getByRole('button', { name: 'Autoriser mon IP actuelle', exact: true }).click();
  await expect(page.getByText('Accès de test actif jusqu’au', { exact: false })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /^Adresses IP publiques autorisées/ })).toHaveValue(ip);
  expect(control.writes).toHaveLength(1);
  expect(control.writes[0].restaurant).toBe('2');
  expect(control.writes[0].path).toBe('/api/v1/restaurants/2/settings');
  expect(control.writes[0].body.ordering_test_access.allowed_ips).toEqual([ip]);
  expect(Date.parse(control.writes[0].body.ordering_test_access.expires_at) - Date.now()).toBeGreaterThan(3500000);
  expect(Date.parse(control.writes[0].body.ordering_test_access.expires_at) - Date.now()).toBeLessThanOrEqual(3600000);
  expect(control.state.orders_paused).toBe(true);
  expect(control.state.orders_paused_until).toBeNull();
  expect(control.currentIP.requests).toHaveLength(1);
  expect(control.currentIP.requests[0].authorization).toBeUndefined();
  expect(control.currentIP.requests[0]['x-restaurant-id']).toBeUndefined();
  await page.reload();
  await expect(page.getByRole('textbox', { name: /^Adresses IP publiques autorisées/ })).toHaveValue(ip);
});

test('current IP authorization keeps existing IPs and the chosen deadline without duplicates', async ({ page }) => {
  const control = await install(page, { expired: true });
  control.currentIP.value = '203.0.113.10';
  await page.goto('/1/settings/orders/test-access');
  await page.getByRole('textbox', { name: /^Adresses IP publiques autorisées/ }).fill('203.0.113.10\n2001:db8::1');
  const until = await page.evaluate(() => { const date = new Date(Date.now() + 7200000); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`; });
  await page.locator('#ordering-test-expiry').fill(until);
  await page.getByRole('button', { name: 'Autoriser mon IP actuelle', exact: true }).click();
  await expect(page.getByText('Accès de test actif jusqu’au', { exact: false })).toBeVisible();
  expect(control.writes[0].body.ordering_test_access.allowed_ips).toEqual(['203.0.113.10', '2001:db8::1']);
  await expect(page.locator('#ordering-test-expiry')).toHaveValue(until);
  expect(control.state.orders_paused).toBe(true);
});

test('failed or invalid IP detection never changes saved restaurant access', async ({ page }) => {
  const control = await install(page);
  await page.goto('/1/settings/orders/test-access');
  control.currentIP.status = 503;
  await page.getByRole('button', { name: 'Autoriser mon IP actuelle', exact: true }).click();
  await expect(page.getByText('Impossible de détecter votre IP. Réessayez ou saisissez-la manuellement.')).toBeVisible();
  control.currentIP.status = 200; control.currentIP.value = 'unexpected-response';
  await page.getByRole('button', { name: 'Autoriser mon IP actuelle', exact: true }).click();
  await expect(page.getByText('Impossible de détecter votre IP. Réessayez ou saisissez-la manuellement.')).toBeVisible();
  expect(control.writes).toHaveLength(0);
  expect(control.state.ordering_test_access.enabled).toBe(false);
  await expect(page.getByRole('switch', { name: 'Activer l’accès de test' })).not.toBeChecked();
});

test('restaurant can activate, persist and revoke test access without reopening public orders', async ({ page }) => {
  const control = await install(page);
  await page.goto('/2/settings/orders/test-access');
  await page.getByRole('switch', { name: 'Activer l’accès de test' }).click();
  await page.getByRole('textbox', { name: /^Adresses IP publiques autorisées/ }).fill('203.0.113.10\n2001:db8::1');
  await page.getByRole('button', { name: 'Enregistrer l’accès de test', exact: true }).click();
  await expect(page.getByText('Accès de test actif jusqu’au', { exact: false })).toBeVisible();
  expect(control.writes[0].restaurant).toBe('2');
  expect(control.writes[0].path).toBe('/api/v1/restaurants/2/settings');
  expect(control.writes[0].body.ordering_test_access.allowed_ips).toEqual(['203.0.113.10', '2001:db8::1']);
  expect(Date.parse(control.writes[0].body.ordering_test_access.expires_at)).toBeGreaterThan(Date.now());
  await page.reload();
  await expect(page.getByRole('textbox', { name: /^Adresses IP publiques autorisées/ })).toHaveValue('203.0.113.10\n2001:db8::1');
  await page.getByRole('button', { name: 'Désactiver maintenant' }).click();
  await expect(page.getByText('L’accès de test est désactivé', { exact: true })).toBeVisible();
  expect(control.state.orders_paused).toBe(true);
  expect(control.writes.at(-1)?.body).toEqual({ ordering_test_access: { enabled: false, allowed_ips: [], expires_at: null } });
});

test('invalid deadlines and failed IP saves keep the draft and saved policy unchanged', async ({ page }) => {
  const control = await install(page);
  await page.goto('/1/settings/orders/test-access');
  await page.getByRole('switch', { name: 'Activer l’accès de test' }).click();
  await page.getByRole('textbox', { name: /^Adresses IP publiques autorisées/ }).fill('invalid-address');
  await page.locator('#ordering-test-expiry').fill('2000-01-01T12:00');
  await page.getByRole('button', { name: 'Enregistrer l’accès de test', exact: true }).click();
  await expect(page.getByText('Choisissez une expiration future dans les 7 prochains jours.')).toBeVisible();
  expect(control.writes).toHaveLength(0);
  await page.locator('#ordering-test-expiry').fill('2099-01-01T12:00');
  await page.getByRole('button', { name: 'Enregistrer l’accès de test', exact: true }).click();
  expect(control.writes).toHaveLength(0);
  await page.locator('#ordering-test-expiry').fill(await page.evaluate(() => { const date = new Date(Date.now() + 3600000); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`; }));
  control.state.fail = true;
  await page.getByRole('button', { name: 'Enregistrer l’accès de test', exact: true }).click();
  await expect(page.getByText('Saisissez entre 1 et 32 adresses IPv4 ou IPv6 publiques valides, sans plage IP.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: /^Adresses IP publiques autorisées/ })).toHaveValue('invalid-address');
  expect(control.state.ordering_test_access.enabled).toBe(false);
});

test('expired access remains closed and settings readers cannot edit', async ({ page }) => {
  const control = await install(page, { readOnly: true, expired: true });
  await page.goto('/1/settings/orders/test-access');
  await expect(page.getByText('L’accès de test a expiré', { exact: true })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Activer l’accès de test' })).toBeDisabled();
  await expect(page.getByRole('textbox', { name: /^Adresses IP publiques autorisées/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Enregistrer l’accès de test' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Autoriser mon IP actuelle' })).toHaveCount(0);
  expect(control.writes).toHaveLength(0);
});

test('Hebrew layout fits mobile and unavailable access cannot be enabled', async ({ page }, info) => {
  await install(page, { locale: 'he', unavailable: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/1/settings/orders/test-access');
  await expect(page.getByRole('switch', { name: 'הפעלת גישת בדיקה' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'אישור כתובת ה־IP הנוכחית שלי' })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('test-access-he-mobile.png'), fullPage: true });
});
