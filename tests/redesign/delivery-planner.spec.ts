import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';
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
    socket: undefined as WebSocketRoute | undefined,
    routes: [route(1, [stop(1, 'delivered'), stop(2), stop(3)]), route(2, [stop(4, 'delivered')])],
    couriers: [{ id: 1, full_name: 'Livreur démo', role: 'courier', courier_default_end_address: '' }, { id: 2, full_name: 'Livreuse démo', role: 'courier', courier_default_end_address: '' }],
    candidates: [] as object[], writes: [] as { path: string; rid?: string }[],
    reads: [] as { date: string | null; rid?: string }[], tiles: [] as string[], mapProvider: 'geoapify', failUndo: false, failRouting: false,
  };
  await page.routeWebSocket('**/ws?**', socket => { state.socket = socket; });
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
    if (/\/delivery\/routes\/\d+\/reset-departure$/.test(path) && request.method() === 'POST') {
      state.writes.push({ path, rid });
      if (state.failUndo) return intercepted.fulfill({ status: 409, json: { error: 'departure reset blocked' } });
      const id = Number(path.split('/').at(-2));
      state.routes = state.routes.map(row => row.id === id ? { ...row, status: 'draft', started_at: null } : row);
      return intercepted.fulfill({ json: { route: state.routes.find(row => row.id === id) } });
    }
    if (path.endsWith('/optimize') && state.failRouting) return intercepted.fulfill({ status: 503, json: { error: 'location service quota exceeded' } });
    if (/\/delivery\/routes\/\d+$/.test(path) && request.method() === 'DELETE') {
      state.writes.push({ path, rid });
      if (state.failUndo) return intercepted.fulfill({ status: 400, json: { error: 'delivery operation failed', details: 'cannot change the courier on a delivered order' } });
      state.routes = state.routes.filter(row => row.id !== Number(path.split('/').pop()));
      return intercepted.fulfill({ json: { route: route(1, [], 'cancelled') } });
    }
    if (/\/restaurants\/\d+\/staff$/.test(path)) return intercepted.fulfill({ json: { staff: state.couriers } });
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
  await expect(page.locator('[data-page-actions]').getByRole('link', { name: 'Cartes et itinéraires', exact: true })).toHaveAttribute('href', '/1/settings/delivery/maps');
  await expect(page.locator('[data-page-actions]').getByRole('link', { name: 'Cartes et itinéraires', exact: true })).toHaveAttribute('data-variant', 'secondary');
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
  await expect(page.locator('[data-page-actions]').getByRole('link', { name: 'Cartes et itinéraires', exact: true })).toBeVisible();
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
  const courierSettings = page.getByRole('group', { name: 'Livreur démo', exact: true });
  await courierSettings.getByRole('combobox', { name: 'Adresse de départ' }).fill('Depot demo, Tel Aviv');
  await courierSettings.getByRole('combobox', { name: 'Destination finale' }).fill('Herzl 10, Netanya');
  await page.getByRole('textbox', { name: 'Marge du créneau communiqué au client' }).fill('1:30');
  const request = page.waitForRequest(request => request.url().includes('/delivery/routes/plan') && request.method() === 'POST');
  await page.getByRole('button', { name: 'Planifier 3 livraisons', exact: true }).click();
  const submitted = await request;
  expect(submitted.headers()['x-restaurant-id']).toBe('1');
  expect(submitted.postDataJSON().assignments).toEqual([
    { courier_id: 1, order_ids: [2001, 2002] },
    { courier_id: 2, order_ids: [2003] },
  ]);
  expect(submitted.postDataJSON().courier_ids).toEqual([1, 2]);
  expect(submitted.postDataJSON().customer_window_minutes).toBe(90);
  expect(submitted.postDataJSON().respect_order_windows).toBe(false);
  expect(submitted.postDataJSON().endpoints).toEqual([{ courier_id: 1, start_address: 'Depot demo, Tel Aviv', end_address: 'Herzl 10, Netanya' }]);
});

test('real order deadlines require an explicit planning choice', async ({ page }) => {
  const state = await install(page);
  state.routes = [];
  state.candidates = [{ id: 2001, restaurant_id: 1, order_type: 'delivery', status: 'in_kitchen', customer_name: 'Client démo', delivery_address: '1 Rue démo', delivery_city: 'Ville démo' }];
  await page.route('**/api/v1/delivery/routes/plan**', intercepted => intercepted.fulfill({ json: { routes: [] } }));
  await page.goto('/1/orders/deliveries');
  await page.getByRole('checkbox', { name: 'Tout sélectionner', exact: true }).check();
  await page.getByRole('button', { name: 'Répartir entre les livreurs', exact: true }).first().click();
  const choice = page.getByRole('switch', { name: 'Respecter les créneaux des commandes', exact: true });
  await expect(choice).not.toBeChecked();
  await choice.press('Space');
  const request = page.waitForRequest(request => request.url().includes('/delivery/routes/plan') && request.method() === 'POST');
  await page.getByRole('button', { name: 'Planifier 1 livraisons', exact: true }).click();
  expect((await request).postDataJSON().respect_order_windows).toBe(true);
});

test('an existing route can disable saved order deadlines and retain the choice', async ({ page }, info) => {
  const state = await install(page);
  state.routes = [{ ...route(1, [stop(2)]), respect_order_windows: true }];
  let saved: Record<string, unknown> | undefined;
  await page.route('**/api/v1/delivery/routes/1/settings**', async intercepted => {
    saved = intercepted.request().postDataJSON();
    state.routes[0] = { ...state.routes[0], ...saved } as DeliveryRoute;
    return intercepted.fulfill({ json: { route: state.routes[0] } });
  });
  await page.goto('/1/orders/deliveries');
  await expect(page.getByText('Créneaux des commandes respectés', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Modifier', exact: true }).click();
  const choice = page.getByRole('switch', { name: 'Respecter les créneaux des commandes', exact: true });
  await expect(choice).toBeChecked();
  await choice.press('Space');
  await page.screenshot({ path: info.outputPath('route-order-windows-fr.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect.poll(() => saved?.respect_order_windows).toBe(false);
  await expect(page.getByText('Horaires calculés par la tournée', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Modifier', exact: true }).click();
  await expect(choice).not.toBeChecked();
});

test('a changed active route offers recalculation without draft unassignment', async ({ page }) => {
  const state = await install(page);
  state.routes = [{ ...route(1, [stop(2), stop(3)], 'active'), needs_recalculation: true }];
  await page.goto('/1/orders/deliveries');
  await expect(page.getByRole('button', { name: 'Recalculer', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Désassigner', exact: true })).toHaveCount(0);
});

test('an accidental departure can return to a draft before unassignment', async ({ page }) => {
  const state = await install(page);
  state.routes = [route(1, [stop(2), stop(3)], 'active')];
  await page.goto('/1/orders/deliveries');
  await page.getByRole('button', { name: 'Annuler le départ', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('2 arrêts non commencés');
  await expect(dialog).toContainText('En préparation');
  await expect(dialog).toContainText('messages déjà envoyés');
  await dialog.getByRole('button', { name: 'Annuler', exact: true }).click();
  expect(state.writes).toHaveLength(0);
  await page.getByRole('button', { name: 'Annuler le départ', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Désassigner', exact: true })).toBeVisible();
  expect(state.writes).toEqual([{ path: '/api/v1/delivery/routes/1/reset-departure', rid: '1' }]);
  await page.getByRole('button', { name: 'Désassigner', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Désassigner', exact: true })).toHaveCount(0);
});

for (const progress of ['arrived', 'delivered', 'skipped'] as const) test(`departure reset is hidden after an ${progress} stop`, async ({ page }) => {
  const state = await install(page);
  state.routes = [route(1, [stop(2, progress), stop(3)], 'active')];
  await page.goto('/1/orders/deliveries');
  await expect(page.getByRole('heading', { name: 'Livraisons', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Annuler le départ', exact: true })).toHaveCount(0);
});

test('departure reset conflict explains recorded progress without unassigning', async ({ page }) => {
  const state = await install(page);
  state.routes = [route(1, [stop(2)], 'active')];
  state.failUndo = true;
  await page.goto('/1/orders/deliveries');
  await page.getByRole('button', { name: 'Annuler le départ', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.locator('main [role=alert]')).toContainText('tous les arrêts doivent encore être en attente');
  await expect(page.getByRole('button', { name: 'Désassigner', exact: true })).toHaveCount(0);
  expect(state.routes[0].status).toBe('active');
});

test('Hebrew departure reset remains restaurant scoped', async ({ page }) => {
  const state = await install(page, 'he');
  state.routes = [route(1, [stop(2)], 'active')];
  await page.goto('/2/orders/deliveries');
  await page.getByRole('button', { name: 'ביטול היציאה', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('השליח נשאר משויך');
  await page.getByRole('alertdialog').getByRole('button', { name: 'אישור', exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0].rid).toBe('2');
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

test('a road quota retains known positions and does not label pending lookups as invalid addresses', async ({ page }) => {
  const state = await install(page);
  const located = { ...stop(2), coordinate_provider: 'google' };
  const pending = { ...stop(3), needs_geocode: true, lat: null, lng: null };
  state.mapProvider = 'google';
  state.routes = [{ ...route(1, [located, pending]), routing_provider: 'google', needs_recalculation: true, routing_error: 'location service quota exceeded', route_geometry: [], total_distance_m: 0, est_duration_s: 0 }];
  await page.goto('/1/orders/deliveries');
  await expect(page.getByText('Le quota du service de localisation est atteint. Réessayez plus tard. Vos tournées existantes sont conservées.', { exact: true })).toBeVisible();
  await expect(page.getByText('Position temporairement indisponible — vérifiez le service cartographique', { exact: true })).toBeVisible();
  await expect(page.getByText('Position introuvable — exclue du calcul du trajet', { exact: true })).toHaveCount(0);
  await expect(page.locator('.foody-stop-pin')).toHaveCount(1);
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /2 Rue de démonstration/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /3 Rue de démonstration/ })).toBeVisible();
  expect(state.writes).toHaveLength(0);
});

test('legend highlights distinct routes assigned to the same courier', async ({ page }, info) => {
  const state = await install(page);
  state.routes = [{ ...route(39, [stop(2)]), courier_id: 1 }, { ...route(40, [stop(3)]), courier_id: 1 }];
  await page.goto('/1/orders/deliveries');
  const legend = page.getByLabel('Tournées sur la carte');
  await expect(legend).toBeVisible();
  const first = legend.getByRole('button', { name: 'Livreur démo · Tournée 1', exact: true });
  const second = legend.getByRole('button', { name: 'Livreur démo · Tournée 2', exact: true });
  await expect(first).toBeVisible(); await expect(second).toBeVisible();
  await expect(page.getByText(/Tournée (39|40)/)).toHaveCount(0);
  const ribbon = page.getByRole('button', { name: 'Livreur démo Tournée 1', exact: true });
  await expect(ribbon).toBeVisible();
  const paths = page.locator('.leaflet-overlay-pane path');
  await expect(paths).toHaveCount(2);
  expect(await paths.nth(0).getAttribute('stroke')).not.toEqual(await paths.nth(1).getAttribute('stroke'));
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(paths.nth(1)).toHaveAttribute('stroke-opacity', '0.15');
  await second.focus(); await page.keyboard.press('Enter');
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  await expect(paths.nth(0)).toHaveAttribute('stroke-opacity', '0.15');
  await ribbon.click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(paths.nth(1)).toHaveAttribute('stroke-opacity', '0.15');
  await page.screenshot({ path: info.outputPath('delivery-route-legend.png'), animations: 'disabled' });
});


test('map quota switch hides Google content and automatically returns after reset', async ({ page }) => {
 const state = await install(page); state.mapProvider = 'google';
 state.routes = [{ ...route(1, [{ ...stop(2), coordinate_provider: 'google' }]), routing_provider: 'google', start_lat: 32.0, start_lng: 34.0, end_lat: 32.3, end_lng: 34.3 }];
 await page.goto('/1/orders/deliveries');
 await expect(page.locator('.leaflet-control-attribution')).toContainText('Synthetic map data');
 await expect(page.locator('.foody-stop-pin')).toHaveCount(1);
 await expect(page.locator('.leaflet-marker-icon')).toHaveCount(3);
 await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(1);
 state.mapProvider = 'geoapify';
 await page.clock.runFor(61000);
 await expect(page.locator('.leaflet-control-attribution')).toContainText('Geoapify');
 await expect(page.locator('.foody-stop-pin')).toHaveCount(0);
 await expect(page.locator('.leaflet-marker-icon')).toHaveCount(0);
 await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(0);
 state.mapProvider = 'google';
 await page.clock.runFor(61000);
 await expect(page.locator('.leaflet-control-attribution')).toContainText('Synthetic map data');
 await expect(page.locator('.foody-stop-pin')).toHaveCount(1);
 await expect(page.locator('.leaflet-marker-icon')).toHaveCount(3);
 await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(1);
});


test('duration separates driving, waiting and handovers on mobile', async ({ page }, info) => {
  const state = await install(page);
  state.routes = [{ ...route(1, [stop(2)]), est_duration_s: 3900, est_travel_s: 180, est_waiting_s: 3540, est_service_s: 180 }];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/1/orders/deliveries');
  await expect(page.getByText('1h 5min', { exact: true })).toBeVisible();
  await expect(page.getByText('durée totale', { exact: true })).toBeVisible();
  const breakdown = page.locator('dl').filter({ hasText: 'Attente' });
  await expect(breakdown).toContainText('Trajet : 3 min');
  await expect(breakdown).toContainText('Attente : 59 min');
  await expect(breakdown).toContainText('Remise : 3 min');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('delivery-duration-breakdown-fr.png'), animations: 'disabled' });
});

test('planning pool follows the selected delivery date', async ({ page }) => {
  const state = await install(page);
  state.routes = [];
  state.candidates = [{ id: 2001, restaurant_id: 1, order_type: 'delivery', status: 'in_kitchen', customer_name: 'Delivery next week', delivery_address: '1 Synthetic street', delivery_city: 'Synthetic city', scheduled_for: '2026-10-19T00:00:00Z' }];
  await page.goto('/1/orders/deliveries');
  await expect(page.getByText('Delivery next week', { exact: true })).toHaveCount(0);
  await page.getByLabel('Date des tournées', { exact: true }).fill('2026-10-19');
  await expect(page.getByText('Delivery next week', { exact: true })).toBeVisible();
  await page.getByLabel('Date des tournées', { exact: true }).fill(day);
  await expect(page.getByText('Delivery next week', { exact: true })).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
});

test('changing a route to another delivery day shows a localized rejection', async ({ page }) => {
  const state = await install(page);
  state.routes = [route(1, [stop(2)])];
  await page.route('**/api/v1/delivery/routes/1/settings**', intercepted => intercepted.fulfill({ status: 400, json: { error: 'delivery date differs from route date' } }));
  await page.goto('/1/orders/deliveries');
  await page.getByRole('button', { name: 'Modifier', exact: true }).click();
  await page.getByLabel('Départ prévu', { exact: true }).fill('2026-10-19T08:00');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Choisissez des livraisons prévues à la même date que la tournée.' }).first()).toBeVisible();
  expect(state.routes[0].date).toBe(day);
});

test('a city selection is retained once and can be saved as the final destination', async ({ page }) => {
  const state = await install(page);
  state.routes = [route(1, [stop(2)])];
  let searches = 0;
  await page.route('**/api/v1/public/address-autocomplete**', async intercepted => {
    if (intercepted.request().url().includes('/resolve')) {
      return intercepted.fulfill({ json: { suggestion: { id: 'city-demo', kind: 'place', address: "Ra'anana, Israel", city: "Ra'anana" } } });
    }
    searches++;
    return intercepted.fulfill({ json: { suggestions: [{ id: 'city-demo', kind: 'prediction', address: "Ra'anana", city: 'Israel', lookup_token: 'synthetic-selection' }] } });
  });
  let saved: Record<string, unknown> | undefined;
  await page.route('**/api/v1/delivery/routes/1/settings**', async intercepted => {
    saved = intercepted.request().postDataJSON();
    state.routes[0] = { ...state.routes[0], ...saved } as DeliveryRoute;
    return intercepted.fulfill({ json: { route: state.routes[0] } });
  });
  await page.goto('/1/orders/deliveries');
  await page.getByRole('button', { name: 'Modifier', exact: true }).click();
  const field = page.getByRole('combobox', { name: 'Destination finale', exact: true });
  await field.fill('Raanana');
  await page.clock.runFor(350);
  await page.getByRole('option', { name: "Ra'anana, Israel", exact: true }).getByRole('button').click();
  await expect(field).toHaveValue("Ra'anana, Israel");
  await expect(page.getByRole('listbox')).toHaveCount(0);
  const searched = searches;
  await field.focus();
  await page.clock.runFor(1000);
  expect(searches).toBe(searched);
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect.poll(() => saved?.end_address).toBe("Ra'anana, Israel");
  await page.getByRole('button', { name: 'Modifier', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Destination finale', exact: true })).toHaveValue("Ra'anana, Israel");
});

for (const override of ['start', 'clear']) test(`courier profile defaults are visible and ${override} changes preserve the intended endpoint`, async ({ page }) => {
  const state = await install(page);
  state.routes = [];
  state.couriers[0].courier_default_end_address = 'Destination démo du profil';
  state.candidates = [{ id: 2001, restaurant_id: 1, order_type: 'delivery', status: 'in_kitchen', customer_name: 'Client démo', delivery_address: '1 Rue démo', delivery_city: 'Ville démo' }];
  await page.route('**/api/v1/delivery/routes/plan**', intercepted => intercepted.fulfill({ json: { routes: [] } }));
  await page.goto('/1/orders/deliveries');
  await page.getByRole('checkbox', { name: 'Tout sélectionner', exact: true }).check();
  await page.getByRole('button', { name: 'Répartir entre les livreurs', exact: true }).first().click();
  const settings = page.getByRole('group', { name: 'Livreur démo', exact: true });
  await expect(settings.getByRole('combobox', { name: 'Destination finale' })).toHaveValue('Destination démo du profil');
  if (override === 'start') await settings.getByRole('combobox', { name: 'Adresse de départ' }).fill('Départ démo');
  else await settings.getByRole('combobox', { name: 'Destination finale' }).fill('');
  const request = page.waitForRequest(request => request.url().includes('/delivery/routes/plan') && request.method() === 'POST');
  await page.getByRole('button', { name: 'Planifier 1 livraisons', exact: true }).click();
  const submitted = await request;
  expect(submitted.postDataJSON().endpoints).toEqual([{ courier_id: 1, start_address: override === 'start' ? 'Départ démo' : '', end_address: override === 'clear' ? '' : 'Destination démo du profil' }]);
});

test('a saved route final destination takes precedence over the updated staff default', async ({ page }) => {
  const state = await install(page);
  state.routes = [{ ...route(1, [stop(2)]), end_address: 'Destination déjà enregistrée' }];
  state.couriers[0].courier_default_end_address = 'Nouvelle destination du profil';
  state.candidates = [{ id: 2001, restaurant_id: 1, order_type: 'delivery', status: 'in_kitchen', customer_name: 'Client démo', delivery_address: '1 Rue démo', delivery_city: 'Ville démo' }];
  await page.goto('/1/orders/deliveries');
  await page.getByRole('checkbox', { name: 'Tout sélectionner', exact: true }).check();
  await page.getByRole('button', { name: 'Répartir entre les livreurs', exact: true }).first().click();
  await expect(page.getByRole('group', { name: 'Livreur démo', exact: true }).getByRole('combobox', { name: 'Destination finale' })).toHaveValue('Destination déjà enregistrée');
});


test('dispatcher identifies missing and stale GPS and moves the courier without recalculating the route', async ({ page }) => {
  const state = await install(page);
  state.routes[0].status = 'active';
  await page.goto('/1/orders/deliveries');
  await expect(page.getByText('Aucune position du livreur reçue. Vérifiez la localisation sur son téléphone.')).toBeVisible();
  await expect.poll(() => Boolean(state.socket)).toBe(true);
  const updated_at = await page.evaluate(() => new Date().toISOString());
  const fix = { courier_id: 1, route_id: 1, lat: 32.074, lng: 34.794, updated_at };
  state.socket!.send(JSON.stringify({ type: 'courier.location', payload: fix }));
  const marker = page.getByTitle('Position du livreur', { exact: true });
  await expect(marker).toHaveCount(1);
  await expect(marker.locator('svg')).toBeVisible();
  await expect(page.getByRole('tooltip', { name: 'Position du livreur', exact: true })).toBeVisible();
  await expect(page.getByText(/Position du livreur reçue à/)).toBeVisible();
  const before = await marker.getAttribute('style');
  state.socket!.send(JSON.stringify({ type: 'courier.location', payload: { ...fix, lat: 32.08, lng: 34.8, updated_at: new Date(Date.parse(updated_at) + 1000).toISOString() } }));
  await expect(marker).not.toHaveAttribute('style', before!);
  await page.clock.fastForward(95000);
  await expect(page.getByTitle('Position ancienne du livreur', { exact: true })).toHaveCount(1);
  await expect(page.getByRole('tooltip', { name: 'Position ancienne du livreur', exact: true })).toBeVisible();
  await expect(page.getByText(/Position ancienne du livreur — dernière réception/)).toBeVisible();
  expect(state.writes).toHaveLength(0);
});
