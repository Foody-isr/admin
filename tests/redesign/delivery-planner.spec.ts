import { expect, test, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';
import type { DeliveryRoute, RouteStop } from '../../src/lib/delivery';

const day = '2026-10-12';
const runtimeErrors = new WeakMap<Page, string[]>();
test.afterEach(async ({ page }) => { expect(runtimeErrors.get(page) ?? []).toEqual([]); });
const stop = (id: number, status: RouteStop['status'] = 'pending'): RouteStop => ({
  id, order_id: 1000 + id, sequence: id, status,
  customer_name: `Client démo ${id}`, customer_phone: '',
  address: `${id} Rue de démonstration`, city: 'Tel Aviv',
  lat: 32.07 + id * 0.002, lng: 34.79 + id * 0.002,
  distance_from_prev_m: 900, eta_seconds: id * 600, total_amount: 90, needs_geocode: false,
});
const route = (id: number, stops: RouteStop[], status: DeliveryRoute['status'] = 'draft'): DeliveryRoute => ({
  id, restaurant_id: 1, courier_id: id, date: day, status, stops,
  routing_provider: 'geoapify', route_geometry: stops.map(stop => ({ order_id: stop.order_id, path: [[32.07,34.79],[32.07,stop.lng!],[stop.lat!,stop.lng!]] })),
  planned_departure_at: `${day}T08:00:00+03:00`, total_distance_m: 8000, est_duration_s: 2400,
});

async function install(page: Page, locale = 'fr') {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date(`${day}T08:00:00+03:00`) });
  const fixture = createFixture();
  const state = {
    routes: [route(1, [stop(1, 'delivered'), stop(2), stop(3)]), route(2, [stop(4, 'delivered')])],
    candidates: [] as object[], writes: [] as { path: string; rid?: string }[],
    reads: [] as { date: string | null; rid?: string }[], tiles: [] as string[], mapProvider: 'geoapify', failUndo: false, failRouting: false,
  };
  await page.addInitScript(({ locale }) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'manager' }));
    localStorage.setItem('foody_restaurant_ids', '[1,2]');
    localStorage.setItem('foody-admin-locale', locale);
    localStorage.setItem('foody_admin_theme', locale === 'he' ? 'dark' : 'light');
  }, { locale });
  await page.route('**/api/v1/**', async intercepted => {
    const request = intercepted.request(), url = new URL(request.url()), path = url.pathname;
    const rid = request.headers()['x-restaurant-id'];
    if (path === '/api/v1/public/delivery/map-config') return intercepted.fulfill({ json: { provider: state.mapProvider, tile_url: `/api/v1/public/delivery/map/${state.mapProvider === 'google' ? 'google' : '{style}'}/{z}/{x}/{y}.png?restaurant_id=${rid}` } });
    if (path === '/api/v1/public/delivery/map-viewport') return intercepted.fulfill({ json: { copyright: 'Synthetic map data ©2026' } });
    if (path.startsWith('/api/v1/public/delivery/map/')) { state.tiles.push(request.url()); return intercepted.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edf0ee"/><path d="M0 80H256M90 0V256" stroke="#cbd0cd" stroke-width="8"/></svg>' }); }
    if (path === '/api/v1/users/me') return intercepted.fulfill({ json: { role_name: 'Manager', permissions: ['orders.manage', 'settings.view'], user: { id: 1, role: 'manager' } } });
    if (path === '/api/v1/delivery/routes') {
      state.reads.push({ date: url.searchParams.get('date'), rid });
      const rows = url.searchParams.get('scope') === 'open' ? state.routes : state.routes.filter(row => row.date === url.searchParams.get('date'));
      return intercepted.fulfill({ json: { routes: rows.map(row => ({ ...row, restaurant_id: Number(rid) })) } });
    }
    if (path.endsWith('/optimize') && state.failRouting) return intercepted.fulfill({ status: 503, json: { error: 'location service quota exceeded' } });
    if (/\/delivery\/routes\/\d+$/.test(path) && request.method() === 'DELETE') {
      state.writes.push({ path, rid });
      if (state.failUndo) return intercepted.fulfill({ status: 400, json: { error: 'delivery operation failed', details: 'cannot change the courier on a delivered order' } });
      state.routes = state.routes.filter(row => row.id !== Number(path.split('/').pop()));
      return intercepted.fulfill({ json: { route: route(1, [], 'cancelled') } });
    }
    if (/\/restaurants\/\d+\/staff$/.test(path)) return intercepted.fulfill({ json: { staff: [{ id: 1, full_name: 'Livreur démo', role: 'courier' }, { id: 2, full_name: 'Livreuse démo', role: 'courier' }] } });
    if (path === '/api/v1/orders') return intercepted.fulfill({ json: { orders: state.candidates, total: state.candidates.length } });
    const result = fixture.response(request.url(), request.method(), request.postDataJSON() ?? {}, Number(rid) || 1);
    return intercepted.fulfill({ status: result.status ?? 200, json: result.json ?? {} });
  });
  await page.route('**/*', intercepted => {
    const url = new URL(intercepted.request().url());
    if (['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/v1/')) return intercepted.fallback();
    if (url.hostname.endsWith('.tile.openstreetmap.org')) return intercepted.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#f0f1f2"/><path d="M0 70H256M80 0V256M180 0V256" stroke="#d7dadd" stroke-width="6"/></svg>' });
    return intercepted.abort();
  });
  return state;
}

test('planner separates completed deliveries from work and preserves history', async ({ page }, info) => {
  const state = await install(page);
  await page.goto('/1/orders/deliveries');
  await expect(page.getByRole('heading', { name: 'Livraisons', exact: true })).toBeVisible();
  await expect(page.getByText('1 sur 3 livrés', { exact: true })).toBeVisible();
  await expect(page.getByText('Client démo 1', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Client démo 4', { exact: true })).toHaveCount(0);
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect(page.locator('.foody-stop-pin')).toHaveCount(2);
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(2);
  await expect(page.locator('.leaflet-overlay-pane path').first()).not.toHaveAttribute('stroke-dasharray', /.+/);
  await expect(page.locator('.leaflet-control-attribution')).toContainText('Geoapify');
  await expect.poll(() => page.locator('.leaflet-tile-loaded').count()).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath('delivery-planner-fr.png'), animations: 'disabled' });
  await page.getByRole('tab', { name: /Historique/ }).click();
  await expect(page.getByText('Client démo 4', { exact: true })).toBeVisible();
  await expect(page.getByText('Terminée', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Désassigner', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /4 Rue de démonstration/ }).click();
  await expect(page.getByRole('button', { name: 'Corriger l’adresse', exact: true })).toHaveCount(0);
  await expect(page.getByText(/Arrivée prévue/)).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
});

test('completed series opens an empty operational view with a usable history date', async ({ page }) => {
  const state = await install(page);
  state.routes = [route(2, [stop(4, 'delivered')])];
  await page.goto('/1/orders/deliveries');
  await expect(page.getByText('Aucune livraison en cours', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Désassigner', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: /Historique/ }).click();
  await expect(page.getByText('Client démo 4', { exact: true })).toBeVisible();
  await page.getByLabel('Date des tournées', { exact: true }).fill('2026-09-18');
  await expect(page.getByText('Aucune tournée terminée à cette date', { exact: true })).toBeVisible();
  expect(state.reads.some(read => read.date === '2026-09-18' && read.rid === '1')).toBe(true);
});

test('unassign failure closes the confirmation and displays localized feedback', async ({ page }) => {
  const state = await install(page); state.failUndo = true;
  await page.goto('/1/orders/deliveries');
  await page.getByRole('button', { name: 'Désassigner', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('2');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.locator('main [role=alert]')).toContainText('Impossible');
  await expect(page.locator('main [role=alert]')).not.toContainText('delivery operation failed');
  expect(state.writes).toEqual([{ path: '/api/v1/delivery/routes/1', rid: '1' }]);
});

test('mobile stop details and map stay usable without horizontal overflow', async ({ page }, info) => {
  await install(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/1/orders/deliveries');
  await page.getByRole('button', { name: /2 Rue de démonstration/ }).click();
  await expect(page.getByRole('button', { name: 'Corriger l’adresse', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('delivery-planner-fr-mobile.png'), animations: 'disabled', fullPage: true });
  await page.getByRole('button', { name: 'Carte', exact: true }).click();
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await page.getByRole('button', { name: 'Liste', exact: true }).click();
  await expect(page.getByText('1 sur 3 livrés', { exact: true })).toBeVisible();
});

test('a changed itinerary hides stale totals and can still be unassigned', async ({ page }) => {
  const state = await install(page);
  state.routes = [{ ...route(1, [stop(2), stop(3)]), needs_recalculation: true }];
  await page.goto('/1/orders/deliveries');
  await expect(page.getByText('Des commandes ont été retirées ou modifiées.', { exact: false })).toBeVisible();
  await expect(page.getByText('8.0 km', { exact: true })).toHaveCount(0);
  await expect(page.getByText('08:15–08:30', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Désassigner', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Désassigner', exact: true })).toHaveCount(0);
  expect(state.writes).toEqual([{ path: '/api/v1/delivery/routes/1', rid: '1' }]);
});

test('three zones assigned to two couriers send two complete allocations', async ({ page }) => {
  const state = await install(page);
  state.routes = [];
  state.candidates = ['Zone A', 'Zone B', 'Zone C'].map((city, index) => ({
    id: 2001 + index, restaurant_id: 1, order_type: 'delivery', status: 'in_kitchen',
    customer_name: `Client démo ${index}`, delivery_address: '1 Rue de démonstration', delivery_city: city,
  }));
  await page.route('**/api/v1/delivery/routes/plan**', intercepted => intercepted.fulfill({ json: { routes: [] } }));
  await page.goto('/1/orders/deliveries');
  await page.getByRole('checkbox', { name: 'Tout sélectionner', exact: true }).check();
  await page.getByRole('button', { name: 'Répartir entre les livreurs', exact: true }).first().click();
  await page.getByRole('radio', { name: /Par zone/ }).click();
  await page.locator('label').filter({ hasText: 'Zone A' }).getByRole('combobox').selectOption('1');
  await page.locator('label').filter({ hasText: 'Zone B' }).getByRole('combobox').selectOption('1');
  await page.locator('label').filter({ hasText: 'Zone C' }).getByRole('combobox').selectOption('2');
  const request = page.waitForRequest(request => request.url().includes('/delivery/routes/plan') && request.method() === 'POST');
  await page.getByRole('button', { name: 'Planifier 3 livraisons', exact: true }).click();
  const submitted = await request;
  expect(submitted.headers()['x-restaurant-id']).toBe('1');
  expect(submitted.postDataJSON().assignments).toEqual([
    { courier_id: 1, order_ids: [2001, 2002] },
    { courier_id: 2, order_ids: [2003] },
  ]);
  expect(submitted.postDataJSON().courier_ids).toEqual([1, 2]);
});

test('a changed active route offers recalculation without draft unassignment', async ({ page }) => {
  const state = await install(page);
  state.routes = [{ ...route(1, [stop(2), stop(3)], 'active'), needs_recalculation: true }];
  await page.goto('/1/orders/deliveries');
  await expect(page.getByRole('button', { name: 'Recalculer', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Désassigner', exact: true })).toHaveCount(0);
});

test('Hebrew dark mode keeps requests scoped to the active restaurant', async ({ page }, info) => {
  const state = await install(page, 'he');
  await page.goto('/2/orders/deliveries');
  await expect(page.getByRole('heading', { name: 'משלוחים', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByText('1 מתוך 3 נמסרו', { exact: true })).toBeVisible();
  await expect(page.getByText('08:15–08:30', { exact: true })).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await page.screenshot({ path: info.outputPath('delivery-planner-he-dark.png'), animations: 'disabled' });
  expect(state.reads.every(read => read.rid === '2')).toBe(true);
  await expect.poll(() => state.tiles.length).toBeGreaterThan(0);
  expect(state.tiles.every(url => url.includes('/dark-matter/') && new URL(url).searchParams.get('restaurant_id') === '2' && !url.includes('apiKey'))).toBe(true);
});

test('routing quota failure keeps the route and explains the failure locally', async ({ page }) => {
  const state = await install(page);
  state.failRouting = true;
  await page.goto('/1/orders/deliveries');
  await page.getByRole('button', { name: 'Recalculer', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Le quota du service de localisation est atteint' })).toBeVisible();
  await expect(page.getByText('1 sur 3 livrés', { exact: true })).toBeVisible();
  expect(state.routes[0].stops).toHaveLength(3);
});

test('legend highlights distinct routes assigned to the same courier', async ({ page }, info) => {
  const state = await install(page);
  state.routes = [route(11, [stop(2)]), { ...route(12, [stop(3)]), courier_id: 11 }];
  await page.goto('/1/orders/deliveries');
  const legend = page.getByLabel('Tournées sur la carte');
  await expect(legend).toBeVisible();
  const first = legend.getByRole('button', { name: /Tournée 11/ });
  const second = legend.getByRole('button', { name: /Tournée 12/ });
  await expect(first).toBeVisible(); await expect(second).toBeVisible();
  const paths = page.locator('.leaflet-overlay-pane path');
  await expect(paths).toHaveCount(2);
  expect(await paths.nth(0).getAttribute('stroke')).not.toEqual(await paths.nth(1).getAttribute('stroke'));
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(paths.nth(1)).toHaveAttribute('stroke-opacity', '0.15');
  await second.focus(); await page.keyboard.press('Enter');
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  await expect(paths.nth(0)).toHaveAttribute('stroke-opacity', '0.15');
  await page.screenshot({ path: info.outputPath('delivery-route-legend.png'), animations: 'disabled' });
});


test('map quota switch hides Google content and automatically returns after reset', async ({ page }) => {
 const state = await install(page); state.mapProvider = 'google';
 state.routes = [{ ...route(1, [{ ...stop(2), coordinate_provider: 'google' }]), routing_provider: 'google' }];
 await page.goto('/1/orders/deliveries');
 await expect(page.locator('.leaflet-control-attribution')).toContainText('Synthetic map data');
 await expect(page.locator('.foody-stop-pin')).toHaveCount(1);
 await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(1);
 state.mapProvider = 'geoapify';
 await page.clock.runFor(61000);
 await expect(page.locator('.leaflet-control-attribution')).toContainText('Geoapify');
 await expect(page.locator('.foody-stop-pin')).toHaveCount(0);
 await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(0);
 state.mapProvider = 'google';
 await page.clock.runFor(61000);
 await expect(page.locator('.leaflet-control-attribution')).toContainText('Synthetic map data');
 await expect(page.locator('.foody-stop-pin')).toHaveCount(1);
 await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(1);
});
