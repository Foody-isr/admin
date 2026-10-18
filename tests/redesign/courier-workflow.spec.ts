import { expect, test, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';
import type { DeliveryRoute, RouteStop } from '../../src/lib/delivery';

const stop = (id: number): RouteStop => ({ id, order_id: 1000 + id, sequence: id, status: 'pending', customer_name: `Client démo ${id}`, customer_phone: '+972500000000', address: 'Yoram Kaniuk 1', city: 'Tel Aviv', lat: 32.07, lng: 34.79, eta_seconds: id * 600, distance_from_prev_m: 1000, total_amount: 90, needs_geocode: false });
const route = (id: number, status: DeliveryRoute['status'] = 'draft'): DeliveryRoute => ({ id, restaurant_id: 1, courier_id: 91, status, date: id === 1 ? '2026-10-14' : '2026-10-16', planned_departure_at: '2026-10-14T08:00:00+03:00', start_address: 'Dépôt démo', start_lat: 32.06, start_lng: 34.78, est_duration_s: 1800, total_distance_m: 2000, stop_service_minutes: 3, stops: id === 1 ? [stop(1), stop(2)] : [stop(3)], routing_provider: 'geoapify' });

async function install(page: Page, options: { active?: boolean; missing?: boolean; mismatch?: boolean; locale?: string } = {}) {
  const fixture = createFixture();
  const state = { routes: [route(1, options.active ? 'active' : 'draft'), route(2)], requests: [] as string[], writes: [] as { path: string; rid?: string; body: any }[], failDelivered: false, failNavigation: false, errors: [] as string[] };
  if (options.missing) Object.assign(state.routes[0].stops[0], { lat: null, lng: null, needs_geocode: true });
  page.on('pageerror', error => state.errors.push(error.message));
  await page.addInitScript(({ locale }) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 91, full_name: 'Livreur démo', role: 'courier' }));
    localStorage.setItem('foody_restaurant_ids', '[1,2]');
    localStorage.setItem('foody-admin-locale', locale);
    localStorage.setItem('foody_admin_theme', locale === 'he' ? 'dark' : 'light');
  }, { locale: options.locale ?? 'fr' });
  await page.route('**/api/v1/**', async intercepted => {
    const request = intercepted.request(), url = new URL(request.url()), path = url.pathname, rid = request.headers()['x-restaurant-id'];
    state.requests.push(path);
    if (path === '/api/v1/users/me') return intercepted.fulfill({ json: { role_name: 'Courier', permissions: ['orders.view'], user: { id: 91, role: 'courier' } } });
    if (path === '/api/v1/delivery/routes/mine/all') return intercepted.fulfill({ json: { routes: state.routes.filter(route => route.stops.some(stop => stop.status !== 'delivered' && stop.status !== 'skipped')).map(route => ({ ...route, restaurant_id: Number(rid) })) } });
    if (path === '/api/v1/public/delivery/map-config') return intercepted.fulfill({ json: { provider: 'geoapify', tile_url: `/api/v1/public/delivery/map/{style}/{z}/{x}/{y}.png?restaurant_id=${rid}` } });
    if (path.startsWith('/api/v1/public/delivery/map/')) return intercepted.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eded"/></svg>' });
    if (path.endsWith('/my-navigation-check')) {
      if (state.failNavigation) return intercepted.fulfill({ status: 503, json: { error: 'address lookup unavailable' } });
      const selected = state.routes.find(route => route.id === Number(path.split('/')[5]))!;
      return intercepted.fulfill({ json: { checks: selected.stops.map(stop => ({ stop_id: stop.id, verified: !stop.needs_geocode && !options.mismatch, reason: stop.needs_geocode ? 'missing_point' : options.mismatch ? 'different_point' : 'verified' })) } });
    }
    if (request.method() !== 'GET' && path.startsWith('/api/v1/delivery/routes/')) {
      const body = request.postDataJSON() ?? {};
      state.writes.push({ path, rid, body });
      const selected = state.routes.find(route => route.id === Number(path.split('/')[5]))!;
      if (path.endsWith('/delivered')) {
        if (state.failDelivered) return intercepted.fulfill({ status: 400, json: { error: 'delivery operation failed' } });
        const item = selected.stops.find(stop => stop.id === Number(path.split('/')[7]))!;
        item.status = 'delivered';
        if (selected.stops.every(stop => stop.status === 'delivered' || stop.status === 'skipped')) selected.status = 'completed';
      }
      if (path.endsWith('/start')) selected.status = 'active';
      if (path.endsWith('/my-settings')) Object.assign(selected, body);
      return intercepted.fulfill({ json: { route: selected } });
    }
    const result = fixture.response(request.url(), request.method(), request.postDataJSON() ?? {}, Number(rid) || 1);
    return intercepted.fulfill({ status: result.status ?? 200, json: result.json ?? {} });
  });
  await page.route('**/*', intercepted => {
    const url = new URL(intercepted.request().url());
    return ['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/v1/') ? intercepted.fallback() : intercepted.abort();
  });
  return state;
}
const run = (page: Page, id = 1) => page.locator(`[data-route-id="${id}"]`);
const card = (page: Page, id = 1) => page.locator(`[data-stop-id="${id}"]`);

test('courier sees all assignments without tabs and can call before departure', async ({ page }) => {
  const state = await install(page); await page.goto('/1/orders/deliveries');
  await expect(card(page, 3)).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(card(page).getByRole('link', { name: 'Appeler', exact: true })).toHaveAttribute('href', 'tel:+972500000000');
  await expect(card(page).getByRole('button', { name: 'Marquer livrée' })).toBeDisabled();
  await expect(card(page).getByText('Démarrez cette tournée pour marquer les commandes comme livrées.')).toBeVisible();
  expect(state.requests).not.toContain('/api/v1/delivery/available');
  expect(state.requests).not.toContain('/api/v1/public/delivery/map-config');
  expect(state.errors).toEqual([]);
});

test('start then deliver directly without requiring the arrived action', async ({ page }) => {
  const state = await install(page); await page.goto('/1/orders/deliveries');
  await run(page).getByRole('button', { name: 'Démarrer la tournée', exact: true }).click();
  await card(page).getByRole('button', { name: 'Marquer livrée', exact: true }).click();
  await expect.poll(() => state.routes[0].stops[0].status).toBe('delivered');
  expect(state.writes.map(write => write.path)).toEqual(['/api/v1/delivery/routes/1/start', '/api/v1/delivery/routes/1/stops/1/delivered']);
  expect(state.writes.every(write => write.rid === '1')).toBe(true);
  await expect(run(page, 2).getByRole('button', { name: 'Démarrer la tournée' })).toBeDisabled();
  await expect(card(page, 2)).toHaveAttribute('aria-current', 'step');
  await page.waitForLoadState('networkidle');
  expect(state.requests.filter(path => path === '/api/v1/delivery/routes/1/my-navigation-check')).toHaveLength(1);
  expect(state.errors).toEqual([]);
});

test('delivery failure keeps the order pending and displays feedback', async ({ page }) => {
  const state = await install(page, { active: true }); state.failDelivered = true; await page.goto('/1/orders/deliveries');
  await card(page, 2).getByRole('button', { name: 'Marquer livrée', exact: true }).click();
  await expect(run(page).getByText('Impossible de marquer cette commande comme livrée. Réessayez.')).toBeVisible();
  expect(state.routes[0].stops[1].status).toBe('pending');
  expect(state.errors).toEqual([]);
});

test('Waze uses a coordinate destination for a Latin address', async ({ page }) => {
  const state = await install(page); await page.goto('/1/orders/deliveries');
  await card(page).getByRole('button', { name: 'Choisir une application de navigation' }).click();
  const url = new URL((await page.getByRole('menuitem', { name: 'Waze' }).getAttribute('href'))!);
  expect(url.searchParams.get('ll')).toBe('32.07,34.79'); expect(url.searchParams.get('q')).toBeNull();
  expect(state.errors).toEqual([]);
});

test('unlocated address is warned before departure and before Waze text search', async ({ page }) => {
  const state = await install(page, { missing: true }); await page.goto('/1/orders/deliveries');
  await expect(card(page).getByText(/Adresse non vérifiée/)).toBeVisible();
  await card(page).getByRole('button', { name: 'Choisir une application de navigation' }).click();
  await page.getByRole('menuitem', { name: 'Waze' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Yoram Kaniuk 1, Tel Aviv');
  await expect(page.getByRole('alertdialog')).toContainText('en hébreu');
  await page.getByRole('button', { name: 'Retour', exact: true }).click();
  expect(state.errors).toEqual([]);
});

test('courier saves a per-stop duration including an explicit zero', async ({ page }) => {
  const state = await install(page); await page.goto('/2/orders/deliveries');
  await run(page).getByRole('button', { name: 'Modifier', exact: true }).click();
  const input = run(page).getByRole('spinbutton', { name: 'Temps à chaque arrêt (minutes)' });
  await input.fill('8'); await run(page).getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(run(page).getByText('8 min à chaque arrêt')).toBeVisible();
  await run(page).getByRole('button', { name: 'Modifier', exact: true }).click();
  await input.fill('0'); await run(page).getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(run(page).getByText('0 min à chaque arrêt')).toBeVisible();
  expect(state.writes.map(write => write.body.stop_service_minutes)).toEqual([8, 0]);
  expect(state.writes.every(write => write.rid === '2')).toBe(true);
  expect(state.errors).toEqual([]);
});

test('Hebrew mobile keeps call and delivered actions visible without overflow', async ({ page }, info) => {
  const state = await install(page, { active: true, locale: 'he' }); await page.setViewportSize({ width: 375, height: 812 }); await page.goto('/1/orders/deliveries');
  await expect(card(page).getByRole('link', { name: 'התקשר', exact: true })).toBeVisible();
  await expect(card(page).getByRole('button', { name: 'סמן נמסר', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('courier-he-mobile.png'), fullPage: true });
  expect(state.errors).toEqual([]);
});


test('a mismatched cached point is flagged before Waze and never used as its GPS destination', async ({ page }) => {
  const state = await install(page, { mismatch: true }); await page.goto('/1/orders/deliveries');
  await expect(run(page).getByText(/destinations de livraison à vérifier/)).toBeVisible();
  await expect(card(page).getByText(/Adresse non vérifiée/)).toBeVisible();
  await card(page).getByRole('button', { name: 'Choisir une application de navigation' }).click();
  const url = new URL((await page.getByRole('menuitem', { name: 'Waze' }).getAttribute('href'))!);
  expect(url.searchParams.get('ll')).toBeNull();
  expect(url.searchParams.get('q')).toBe('Yoram Kaniuk 1, Tel Aviv');
  expect(state.errors).toEqual([]);
});

test('failed address verification leaves operational actions available and permits retry', async ({ page }) => {
  const state = await install(page, { active: true }); state.failNavigation = true; await page.goto('/1/orders/deliveries');
  await expect(run(page).getByText(/La vérification des adresses est momentanément indisponible/)).toBeVisible();
  await expect(card(page).getByRole('link', { name: 'Appeler', exact: true })).toBeVisible();
  await expect(card(page).getByRole('button', { name: 'Marquer livrée' })).toBeEnabled();
  state.failNavigation = false;
  await run(page).getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect(run(page).getByText(/La vérification des adresses est momentanément indisponible/)).toHaveCount(0);
  expect(state.errors).toEqual([]);
});


test('finishing the last delivery preserves the final destination without retaining delivered orders', async ({ page }) => {
  const state = await install(page, { active: true });
  state.routes = state.routes.slice(0, 1); state.routes[0].stops = state.routes[0].stops.slice(0, 1);
  Object.assign(state.routes[0], { end_address: 'Dépôt retour', end_lat: 32.08, end_lng: 34.8 });
  await page.goto('/1/orders/deliveries');
  await card(page).getByRole('button', { name: 'Marquer livrée', exact: true }).click();
  await expect(card(page)).toHaveCount(0);
  await expect(page.getByText('Dépôt retour', { exact: true })).toBeVisible();
  expect(state.errors).toEqual([]);
});

test('courier selects endpoint suggestions and saves a 90-minute communication range', async ({ page }, info) => {
  const state = await install(page);
  const lookups: Array<{ path: string; body: any; rid?: string }> = [];
  await page.route('**/api/v1/public/address-autocomplete**', async intercepted => {
    const request = intercepted.request(), path = new URL(request.url()).pathname;
    lookups.push({ path, body: request.postDataJSON(), rid: request.headers()['x-restaurant-id'] });
    if (path.endsWith('/resolve')) return intercepted.fulfill({ json: { suggestion: { id: 'demo-home', address: 'Herzl 10', city: 'Netanya', token: 'synthetic' } } });
    return intercepted.fulfill({ json: { suggestions: [{ id: 'demo-home', address: 'Herzl 10', city: 'Netanya', kind: 'prediction', lookup_token: 'synthetic-lookup' }] } });
  });
  await page.goto('/2/orders/deliveries');
  await run(page).getByRole('button', { name: 'Modifier', exact: true }).click();
  await run(page).getByRole('combobox', { name: 'Adresse de départ' }).fill('Herzl');
  await run(page).getByRole('option', { name: /Herzl 10/ }).click();
  await run(page).getByRole('combobox', { name: 'Destination finale' }).fill('Netanya');
  await run(page).getByRole('combobox', { name: 'Destination finale' }).press('ArrowDown');
  await expect(run(page).getByRole('option', { name: /Herzl 10/ })).toBeVisible();
  await run(page).getByRole('combobox', { name: 'Destination finale' }).press('Enter');
  await run(page).getByRole('textbox', { name: 'Marge du créneau communiqué au client' }).fill('1h30');
  await page.screenshot({ path: info.outputPath('courier-route-endpoints-fr.png'), fullPage: true });
  await run(page).getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0].body).toMatchObject({ start_address: 'Herzl 10, Netanya', end_address: 'Herzl 10, Netanya', customer_window_minutes: 90 });
  expect(lookups.every(row => row.rid === '2')).toBe(true);
  expect(lookups.filter(row => row.path.endsWith('/resolve'))).toHaveLength(2);
  expect(state.errors).toEqual([]);
});
