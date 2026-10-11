import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

const currentLabel = 'Ordinateur de démonstration — équipe de coordination';
const otherLabel = 'iPhone · Safari · מכשיר לדוגמה';
const endpoint = 'https://push.invalid/synthetic-browser-subscription-00000001';
async function install(page: Page, options: { locale?: string; permissions?: string[]; supported?: boolean; worker?: boolean; local?: boolean; registered?: boolean; permission?: string; ios?: boolean } = {}) {
  const fixtureOptions = { empty: false, permissions: options.permissions };
  const fixture = createFixture(fixtureOptions);
  let prefs = { new_order_enabled: true, order_canceled_enabled: true, payment_failure_enabled: false, low_stock_enabled: true, big_order_enabled: true, big_order_threshold: 500 };
  const devices = [
    ...(options.registered === false ? [] : [{ id: 1, label: currentLabel, endpoint_tail: endpoint.slice(-24), created_at: '2026-10-01T08:00:00Z', last_used_at: '2026-10-03T09:00:00Z' }]),
    { id: 2, label: otherLabel, endpoint_tail: 'synthetic-other-device-02', created_at: '2026-09-20T08:00:00Z', last_used_at: '' },
  ];
  const writes: { path: string; body: any; restaurant?: string }[] = [];
  const reads: { path: string; restaurant?: string }[] = [];
  const faults = { preferences: 0, devices: 0, save: 0, subscribe: 0, unsubscribe: 0, remove: 0, test: 0 };
  const control = { gate: null as Promise<void> | null, failRefresh: false, testResult: { sent: 1, subscriptions_count: 1, current_device_known: true } };
  await page.addInitScript(({ locale, supported, worker, local, permission, ios, endpoint }) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'owner', email: 'demo@foody.test' }));
    localStorage.setItem('foody_restaurant_ids', '[1,2]');
    localStorage.setItem('foody-admin-locale', locale);
    localStorage.setItem('foody_admin_theme', locale === 'he' ? 'dark' : 'light');
    const state = { permission, worker, local, localFailures: 0, readFailures: 0, localStops: 0, browserCreates: 0, permissionRequests: 0, permissionResult: 'granted', key: [1, 2, 3], dropOnRead: false };
    (window as any).__push = state;
    const subscription = {
      endpoint,
      get options() { return { applicationServerKey: new Uint8Array(state.key).buffer }; },
      toJSON: () => ({ endpoint, keys: { p256dh: 'synthetic-public-key', auth: 'synthetic-auth' } }),
      unsubscribe: async () => { state.localStops++; if (state.localFailures-- > 0) throw new Error('Synthetic local stop failure'); state.local = false; return true; },
    };
    const registration = { active: { state: 'activated' }, pushManager: {
      getSubscription: async () => { if (state.readFailures-- > 0) throw new Error('Synthetic browser read failure'); if (state.dropOnRead) state.local = false; return state.local ? subscription : null; },
      subscribe: async ({ applicationServerKey }: { applicationServerKey: Uint8Array }) => { state.browserCreates++; state.local = true; state.key = Array.from(applicationServerKey); return subscription; },
    } };
    const serviceWorker = Object.assign(new EventTarget(), { ready: new Promise(() => {}), getRegistration: async () => state.worker ? registration : undefined, register: async () => registration });
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: serviceWorker });
    Object.defineProperty(window, 'Notification', { configurable: true, value: class {
      static get permission() { return state.permission; }
      static async requestPermission() { state.permissionRequests++; state.permission = state.permissionResult; return state.permission; }
    } });
    Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} });
    if (!supported) delete (window as any).PushManager;
    if (ios) { Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'iPhone Safari' }); Object.defineProperty(navigator, 'standalone', { configurable: true, value: false }); }
  }, { locale: options.locale ?? 'fr', supported: options.supported ?? true, worker: options.worker ?? true, local: options.local ?? true, permission: options.permission ?? 'default', ios: options.ios ?? false, endpoint });
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method(), body = request.postDataJSON() ?? {}, restaurant = request.headers()['x-restaurant-id'];
    const send = (json: unknown, status = 200) => route.fulfill({ json, status });
    const consume = (key: keyof typeof faults) => { if (faults[key] > 0) { faults[key]--; return true; } return false; };
    const fail = () => send({ error: 'Synthetic push failure' }, 503);
    if (path.includes('/admin/push/') || path.endsWith('/notification-preferences')) {
      if (method === 'GET') reads.push({ path, restaurant }); else { writes.push({ path, body, restaurant }); if (control.gate) await control.gate; }
      if (path.endsWith('/notification-preferences')) {
        if (method === 'GET') return consume('preferences') ? fail() : send(prefs);
        if (consume('save')) return fail();
        prefs = { ...prefs, ...body }; return send(prefs);
      }
      if (path.endsWith('/vapid-public-key')) return send({ public_key: 'AQID' });
      if (path.endsWith('/devices')) return consume('devices') ? fail() : send({ devices });
      if (path.endsWith('/subscribe')) {
        if (consume('subscribe')) return fail();
        if (!devices.some(row => row.id === 1)) devices.unshift({ id: 1, label: currentLabel, endpoint_tail: endpoint.slice(-24), created_at: '2026-10-04T10:00:00Z', last_used_at: '' });
        if (control.failRefresh) faults.devices = 100;
        return send({ ok: true });
      }
      if (path.endsWith('/unsubscribe') || method === 'DELETE') {
        if (consume(method === 'DELETE' ? 'remove' : 'unsubscribe')) return fail();
        const id = method === 'DELETE' ? Number(path.split('/').at(-1)) : 1;
        const index = devices.findIndex(row => row.id === id); if (index >= 0) devices.splice(index, 1);
        if (control.failRefresh) faults.devices = 100;
        return send({ ok: true });
      }
      if (path.endsWith('/test')) return consume('test') ? fail() : send(control.testResult);
      throw new Error(`Unhandled synthetic push route: ${method} ${path}`);
    }
    const result = fixture.response(request.url(), method, body, Number(restaurant) || 1);
    return send(result.json ?? {}, result.status ?? 200);
  });
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  return { fixture, devices, writes, reads, faults, control };
}
const browser = (page: Page) => page.getByRole('region', { name: 'Ce navigateur', exact: true });
const deviceList = (page: Page) => page.getByRole('region', { name: 'Vos appareils', exact: true });
const prefList = (page: Page) => page.getByRole('region', { name: 'Que voulez-vous recevoir ?', exact: true });
const ready = async (page: Page, rid = 1) => { await page.goto(`/${rid}/settings/notifications`); await expect(deviceList(page).getByText(otherLabel, { exact: true })).toBeVisible(); await expect(prefList(page).getByRole('switch').first()).toBeVisible(); await expect(page.getByRole('button', { name: 'Actualiser', exact: true })).toBeEnabled(); };
const remove = (page: Page, label = currentLabel) => deviceList(page).getByRole('button', { name: `Retirer · ${label}`, exact: true });
const setBrowser = (page: Page, value: Record<string, unknown>) => page.evaluate(value => Object.assign((window as any).__push, value), value);
const state = (page: Page) => page.evaluate(() => (window as any).__push);
const resync = (page: Page) => page.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'foody-push-resync' } })));

for (const locale of ['fr', 'he']) test(`notifications preferences and devices responsive ${locale}`, async ({ page }, info) => {
  const fixture = await install(page, { locale });
  await page.setViewportSize({ width: locale === 'fr' ? 375 : 1440, height: 1000 });
  await page.goto('/1/settings/notifications');
  await expect(page.getByText(otherLabel, { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath(`notifications-${locale}.png`), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  if (locale === 'fr') { await page.getByRole('region', { name: 'Vos appareils', exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('notifications-devices-fr.png') }); }
  expect(fixture.fixture.unhandled).toEqual([]);
});

test('notifications missing worker does not block preferences or device management', async ({ page }) => {
  const fixture = await install(page, { worker: false, local: false, registered: false });
  await ready(page);
  await browser(page).getByRole('button', { name: 'Activer les notifications', exact: true }).click();
  await expect(page.locator('main [role=alert]')).toContainText('n’est pas prêt');
  expect(fixture.writes).toHaveLength(0);
  await prefList(page).getByRole('switch', { name: 'Nouvelle commande', exact: true }).click();
  expect(fixture.writes[0].body).toEqual({ new_order_enabled: false });
});

for (const resource of ['preferences', 'devices'] as const) test(`notifications recover ${resource} independently`, async ({ page }) => {
  const fixture = await install(page); fixture.faults[resource] = 100;
  await page.goto('/1/settings/notifications');
  const failed = resource === 'preferences' ? prefList(page) : deviceList(page);
  const healthy = resource === 'preferences' ? deviceList(page) : prefList(page);
  await expect(failed.getByRole('alert')).toBeVisible();
  await expect(healthy.getByRole('alert')).toHaveCount(0);
  if (resource === 'devices') await expect(browser(page)).toContainText('n’est pas vérifiée');
  fixture.faults[resource] = 0;
  await failed.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect(failed.getByRole('alert')).toHaveCount(0);
  expect(fixture.writes).toHaveLength(0);
});

test('notifications serialize preferences without losing another setting and keep confirmed values on failure', async ({ page }) => {
  const fixture = await install(page); await ready(page, 2);
  let release!: () => void; fixture.control.gate = new Promise<void>(resolve => { release = resolve; });
  const order = prefList(page).getByRole('switch', { name: 'Nouvelle commande', exact: true });
  await order.click();
  await expect(prefList(page).getByRole('switch', { name: 'Stock bas', exact: true })).toBeDisabled();
  release(); fixture.control.gate = null;
  await expect(order).not.toBeChecked();
  fixture.faults.save = 1;
  await prefList(page).getByRole('switch', { name: 'Stock bas', exact: true }).click();
  await expect(page.locator('main [role=alert]')).toBeVisible();
  await expect(prefList(page).getByRole('switch', { name: 'Stock bas', exact: true })).toBeChecked();
  await expect(order).not.toBeChecked();
  expect(fixture.writes).toHaveLength(2);
  expect(fixture.writes.every(row => row.restaurant === '2')).toBe(true);
  expect(fixture.writes[1].body).toEqual({ low_stock_enabled: false });
});

test('notifications unsupported browser still shows account preferences and allows removing another device', async ({ page }) => {
  const fixture = await install(page, { supported: false }); await ready(page);
  await expect(browser(page)).toContainText('ne prend pas en charge');
  await remove(page, otherLabel).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Retirer', exact: true }).click();
  await expect(deviceList(page).getByText(otherLabel, { exact: true })).toHaveCount(0);
  expect(fixture.writes).toHaveLength(1);
  expect((await state(page)).localStops).toBe(0);
});

for (const mode of ['denied', 'ios'] as const) test(`notifications explain ${mode} without attempting enrollment`, async ({ page }) => {
  const fixture = await install(page, { local: false, permission: mode === 'denied' ? 'denied' : 'default', ios: mode === 'ios' }); await ready(page);
  await expect(browser(page)).toContainText(mode === 'denied' ? 'Notifications bloquées' : 'accueil');
  await expect(browser(page).getByRole('button')).toHaveCount(0);
  expect(fixture.writes).toHaveLength(0);
});

test('notifications read-only state displays choices and permits only the existing test action', async ({ page }) => {
  const fixture = await install(page, { permissions: ['settings.view'] }); await ready(page);
  await expect(prefList(page).getByRole('switch').first()).toBeDisabled();
  await expect(remove(page)).toHaveCount(0);
  await browser(page).getByRole('button', { name: 'Envoyer un test', exact: true }).click();
  await expect(page.locator('main [role=status]').filter({ hasNotText: /^Chargement/ })).toContainText('Notification de test envoyée');
  expect(fixture.writes).toHaveLength(1); expect(fixture.writes[0].body).toEqual({ endpoint });
});

test('notifications distinguish a browser subscription from restaurant registration and retry failed registration without creating another local subscription', async ({ page }) => {
  const fixture = await install(page, { registered: false }); fixture.faults.subscribe = 1;
  await ready(page, 2);
  await expect(browser(page)).toContainText('ne figure pas');
  await expect(browser(page).getByRole('button', { name: 'Envoyer un test', exact: true })).toHaveCount(0);
  await browser(page).getByRole('button', { name: 'Activer les notifications', exact: true }).click();
  await expect(page.locator('main [role=alert]')).toBeVisible();
  await browser(page).getByRole('button', { name: 'Activer les notifications', exact: true }).click();
  await expect(browser(page)).toContainText('Notifications activées');
  expect((await state(page)).browserCreates).toBe(0);
  expect(fixture.writes.filter(row => row.path.endsWith('/subscribe'))).toHaveLength(2);
  expect(fixture.writes.every(row => row.restaurant === '2')).toBe(true);
});

test('notifications preserve a successful registration across a failed list refresh', async ({ page }) => {
  const fixture = await install(page, { local: false, registered: false }); fixture.control.failRefresh = true; await ready(page);
  await browser(page).getByRole('button', { name: 'Activer les notifications', exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(deviceList(page).getByRole('alert')).toBeVisible();
  await expect(page.locator('main [role=status]').filter({ hasNotText: /^Chargement/ })).toContainText('Notifications activées');
  fixture.faults.devices = 0;
  await deviceList(page).getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect(browser(page)).toContainText('Notifications activées');
  expect(fixture.writes.filter(row => row.path.endsWith('/subscribe'))).toHaveLength(1);
  expect((await state(page)).browserCreates).toBe(1);
});

test('notifications never send a test to every device when the local subscription disappears', async ({ page }) => {
  const fixture = await install(page); await ready(page);
  await setBrowser(page, { local: false });
  await browser(page).getByRole('button', { name: 'Envoyer un test', exact: true }).click();
  await expect(page.locator('main [role=alert]')).toContainText('n’est pas abonné');
  expect(fixture.writes).toHaveLength(0);
});

for (const known of [true, false]) test(`notifications report an unsuccessful test without claiming delivery, device known ${known}`, async ({ page }) => {
  const fixture = await install(page); fixture.control.testResult = { sent: 0, subscriptions_count: known ? 1 : 0, current_device_known: known }; await ready(page);
  await browser(page).getByRole('button', { name: 'Envoyer un test', exact: true }).click();
  await expect(page.locator('main [role=status]').filter({ hasNotText: /^Chargement/ })).toContainText(known ? 'Impossible de livrer' : 'n’est pas abonné');
});

test('notifications confirm removal, restore focus on cancel and preserve the row on failure', async ({ page }) => {
  const fixture = await install(page); fixture.faults.remove = 1; await ready(page);
  await remove(page).click();
  await expect(page.getByRole('alertdialog')).toContainText(currentLabel);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(remove(page)).toBeFocused(); expect(fixture.writes).toHaveLength(0);
  await remove(page).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Retirer', exact: true }).click();
  await expect(page.locator('main [role=alert]')).toBeVisible();
  await expect(deviceList(page).getByText(currentLabel, { exact: true })).toBeVisible();
  expect((await state(page)).localStops).toBe(0);
});

for (const action of ['disable', 'remove'] as const) test(`notifications resume only the local stop after confirmed server ${action}`, async ({ page }) => {
  const fixture = await install(page); await ready(page);
  await setBrowser(page, { localFailures: 1 });
  if (action === 'disable') await browser(page).getByRole('button', { name: 'Désactiver', exact: true }).click();
  else { await remove(page).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Retirer', exact: true }).click(); }
  await expect(page.locator('main [role=alert]')).toContainText('confirmé sur le serveur');
  await expect(deviceList(page).getByText(currentLabel, { exact: true })).toHaveCount(0);
  await resync(page);
  await page.getByRole('button', { name: 'Terminer l’arrêt dans ce navigateur', exact: true }).click();
  await expect(page.locator('main [role=status]').filter({ hasNotText: /^Chargement/ })).toContainText('arrêtées');
  expect(fixture.writes).toHaveLength(1);
  expect((await state(page)).localStops).toBe(2);
  expect((await state(page)).local).toBe(false);
});

test('notifications stop locally after server failure and expose the remaining server row for cleanup', async ({ page }) => {
  const fixture = await install(page); fixture.faults.unsubscribe = 1; await ready(page);
  await browser(page).getByRole('button', { name: 'Désactiver', exact: true }).click();
  await expect(page.locator('main [role=alert]')).toContainText('retirez l’entrée restante');
  expect((await state(page)).local).toBe(false);
  await remove(page).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Retirer', exact: true }).click();
  await expect(deviceList(page).getByText(currentLabel, { exact: true })).toHaveCount(0);
  expect(fixture.writes).toHaveLength(2); expect((await state(page)).localStops).toBe(1);
});

test('notifications background repair does not create a subscription when none exists', async ({ page }) => {
  const fixture = await install(page, { permission: 'granted', local: false, registered: false }); await ready(page);
  await resync(page);
  await prefList(page).getByRole('switch', { name: 'Nouvelle commande', exact: true }).click();
  await expect(prefList(page).getByRole('switch', { name: 'Nouvelle commande', exact: true })).not.toBeChecked();
  expect(fixture.writes.filter(row => row.path.endsWith('/subscribe'))).toHaveLength(0);
  expect((await state(page)).browserCreates).toBe(0);
});

test('notifications serialize a slow background repair before manual disable', async ({ page }) => {
  const fixture = await install(page); await ready(page);
  let release!: () => void; fixture.control.gate = new Promise<void>(resolve => { release = resolve; });
  await setBrowser(page, { permission: 'granted' }); await resync(page);
  await expect.poll(() => fixture.writes.filter(row => row.path.endsWith('/subscribe')).length).toBe(1);
  await browser(page).getByRole('button', { name: 'Désactiver', exact: true }).click();
  release(); fixture.control.gate = null;
  await expect(page.locator('main [role=status]').filter({ hasNotText: /^Chargement/ })).toContainText('arrêtées');
  await resync(page);
  await page.getByRole('button', { name: 'Actualiser', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Actualiser', exact: true })).toBeEnabled();
  expect(fixture.writes.map(row => row.path.split('/').at(-1))).toEqual(['subscribe', 'unsubscribe']);
  expect((await state(page)).local).toBe(false);
});

test('notifications VAPID rotation repairs the subscription and surfaces a failed local stop', async ({ page }) => {
  const fixture = await install(page, { registered: false }); await ready(page);
  await setBrowser(page, { key: [4, 5, 6], localFailures: 1 });
  await browser(page).getByRole('button', { name: 'Activer les notifications', exact: true }).click();
  await expect(page.locator('main [role=alert]')).toBeVisible();
  expect(fixture.writes).toHaveLength(0);
  await browser(page).getByRole('button', { name: 'Activer les notifications', exact: true }).click();
  await expect(browser(page)).toContainText('Notifications activées');
  expect((await state(page)).browserCreates).toBe(1);
  expect((await state(page)).localStops).toBe(2);
});
