import { expect, test, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';
import type { DeliveryRoute, RouteStop } from '../../src/lib/delivery';

const stop = (id: number): RouteStop => ({ id, order_id: 1000 + id, sequence: id, status: 'pending', customer_name: `Client démo ${id}`, customer_phone: '+972500000000', address: 'Yoram Kaniuk 1', city: 'Tel Aviv', lat: 32.07, lng: 34.79, eta_seconds: id * 600, distance_from_prev_m: 1000, total_amount: 90, needs_geocode: false });
const route = (id: number, status: DeliveryRoute['status'] = 'draft'): DeliveryRoute => ({ id, restaurant_id: 1, courier_id: 91, status, date: id === 1 ? '2026-10-14' : '2026-10-16', planned_departure_at: '2026-10-14T08:00:00+03:00', start_address: 'Dépôt démo', start_lat: 32.06, start_lng: 34.78, est_duration_s: 1800, total_distance_m: 2000, stop_service_minutes: 3, stops: id === 1 ? [stop(1), stop(2)] : [stop(3)], routing_provider: 'geoapify' });

async function install(page: Page, options: { active?: boolean; missing?: boolean; mismatch?: boolean; locale?: string; role?: 'superadmin' | 'owner' | 'manager' | 'courier'; roleName?: string } = {}) {
  const fixture = createFixture();
  const state = { routes: [route(1, options.active ? 'active' : 'draft'), route(2)], requests: [] as string[], courierRequests: [] as { path: string; courierId: string | null; rid?: string }[], writes: [] as { path: string; rid?: string; courierId?: string | null; body: any }[], failDelivered: false, failDeliveredStatus: 400, failNavigation: false, errors: [] as string[] };
  if (options.missing) Object.assign(state.routes[0].stops[0], { lat: null, lng: null, needs_geocode: true });
  page.on('pageerror', error => state.errors.push(error.message));
  await page.addInitScript(({ locale, role }) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 91, full_name: 'Livreur démo', role }));
    localStorage.setItem('foody_restaurant_ids', '[1,2]');
    localStorage.setItem('foody-admin-locale', locale);
    localStorage.setItem('foody_admin_theme', locale === 'he' ? 'dark' : 'light');
  }, { locale: options.locale ?? 'fr', role: options.role ?? 'courier' });
  await page.route('**/api/v1/**', async intercepted => {
    const request = intercepted.request(), url = new URL(request.url()), path = url.pathname, rid = request.headers()['x-restaurant-id'];
    state.requests.push(path);
    const courierId = url.searchParams.get('courier_id');
    state.courierRequests.push({ path, courierId, rid });
    if (path === '/api/v1/users/me') return intercepted.fulfill({ json: { role_name: options.roleName ?? (options.role === 'superadmin' ? 'Super Admin' : options.role === 'owner' ? 'Owner' : options.role === 'manager' ? 'Manager' : 'Courier'), permissions: options.role === 'superadmin' || options.role === 'owner' || options.role === 'manager' ? ['orders.view', 'orders.manage'] : ['orders.view'], user: { id: 91, role: options.role ?? 'courier' } } });
    if (path.match(/\/restaurants\/\d+\/staff$/)) return intercepted.fulfill({ json: { staff: [{ id: 91, full_name: 'Livreur Alpha', role: 'courier' }, { id: 92, full_name: 'Livreur Beta', role: 'waiter', role_name: 'Courier' }, { id: 93, full_name: 'Manager démo', role: 'manager' }] } });
    if (path === '/api/v1/delivery/routes/mine/all') return intercepted.fulfill({ json: { routes: state.routes.filter(route => courierId === null || route.courier_id === Number(courierId)).filter(route => route.stops.some(stop => stop.status !== 'delivered' && stop.status !== 'skipped')).map(route => ({ ...route, restaurant_id: Number(rid) })) } });
    if (path === '/api/v1/public/delivery/map-config') return intercepted.fulfill({ json: { provider: 'geoapify', tile_url: `/api/v1/public/delivery/map/{style}/{z}/{x}/{y}.png?restaurant_id=${rid}` } });
    if (path.startsWith('/api/v1/public/delivery/map/')) return intercepted.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eded"/></svg>' });
    if (path.endsWith('/my-navigation-check')) {
      if (state.failNavigation) return intercepted.fulfill({ status: 503, json: { error: 'address lookup unavailable' } });
      const selected = state.routes.find(route => route.id === Number(path.split('/')[5]))!;
      return intercepted.fulfill({ json: { checks: selected.stops.map(stop => ({ stop_id: stop.id, verified: !stop.needs_geocode && !options.mismatch, reason: stop.needs_geocode ? 'missing_point' : options.mismatch ? 'different_point' : 'verified' })) } });
    }
    if (request.method() !== 'GET' && path.startsWith('/api/v1/delivery/routes/')) {
      const body = request.postDataJSON() ?? {};
      state.writes.push({ path, rid, courierId, body });
      const selected = state.routes.find(route => route.id === Number(path.split('/')[5]))!;
      if (path.endsWith('/delivered')) {
        if (state.failDelivered) return intercepted.fulfill({ status: state.failDeliveredStatus, json: { error: 'delivery operation failed' } });
        const item = selected.stops.find(stop => stop.id === Number(path.split('/')[7]))!;
        item.status = 'delivered';
        if (selected.stops.every(stop => stop.status === 'delivered' || stop.status === 'skipped')) selected.status = 'completed';
      }
      if (path.endsWith('/start')) selected.status = 'active';
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

for (const locale of ['fr', 'he']) {
  test(`fixed delivery action follows the selected timeline stop (${locale})`, async ({ page }) => {
    const state = await install(page, { active: true, locale });
    state.routes[0].stops[1].address = 'Destination sélectionnée 2';
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/1/orders/deliveries');
    await card(page, 2).locator('button[aria-expanded]').click();
    const dock = run(page).getByTestId('courier-action-dock');
    await expect(dock).toContainText(locale === 'he' ? 'העצירה הנבחרת 02' : 'Arrêt sélectionné 02');
    await expect(dock).toContainText('Destination sélectionnée 2');
    await dock.getByRole('button', { name: locale === 'he' ? 'סמן נמסר' : 'Marquer livrée', exact: true }).click();
    await expect.poll(() => state.routes[0].stops[1].status).toBe('delivered');
    expect(state.routes[0].stops[0].status).toBe('pending');
    expect(state.writes.map(write => write.path)).toEqual(['/api/v1/delivery/routes/1/stops/2/delivered']);
    expect(state.errors).toEqual([]);
  });
}

test('fixed navigation and delivery actions follow the selected map pin', async ({ page }) => {
  const state = await install(page, { active: true }); useDemoRoute(state); await demoTiles(page);
  await page.goto('/1/orders/deliveries');
  await run(page).getByTitle('4: Avenue des Oliviers 4', { exact: true }).click();
  const dock = run(page).getByTestId('courier-action-dock');
  await expect(dock).toContainText('Arrêt sélectionné 04');
  await expect(dock).toContainText('Avenue des Oliviers 4');
  await dock.getByRole('button', { name: 'Choisir une application de navigation' }).click();
  const destination = new URL((await page.getByRole('menuitem', { name: 'Waze' }).getAttribute('href'))!);
  const selected = state.routes[0].stops[3];
  expect(destination.searchParams.get('ll')).toBe(`${selected.lat},${selected.lng}`);
  await page.keyboard.press('Escape');
  await dock.getByRole('button', { name: 'Marquer livrée', exact: true }).click();
  await expect.poll(() => state.routes[0].stops[3].status).toBe('delivered');
  expect(state.routes[0].stops[0].status).toBe('pending');
  expect(state.writes.map(write => write.path)).toEqual(['/api/v1/delivery/routes/1/stops/4/delivered']);
});

test('selecting a finished stop disables completion without targeting a different order', async ({ page }) => {
  const state = await install(page, { active: true }); state.routes[0].stops[0].status = 'delivered';
  await page.goto('/1/orders/deliveries');
  await card(page, 1).locator('button[aria-expanded]').click();
  const dock = run(page).getByTestId('courier-action-dock');
  await expect(dock).toContainText('Arrêt sélectionné 01');
  await expect(dock.getByRole('button', { name: 'Marquer livrée', exact: true })).toBeDisabled();
  expect(state.routes[0].stops[1].status).toBe('pending');
  expect(state.writes).toEqual([]);
});

test('an obsolete route response preserves the selected stop and does not complete another order', async ({ page }) => {
  const state = await install(page, { active: true }); state.failDelivered = true; state.failDeliveredStatus = 409;
  await page.goto('/1/orders/deliveries');
  await card(page, 2).locator('button[aria-expanded]').click();
  await run(page).getByTestId('courier-action-dock').getByRole('button', { name: 'Marquer livrée', exact: true }).click();
  await expect(run(page).getByText('Impossible de marquer cette commande comme livrée. Réessayez.')).toBeVisible();
  expect(state.routes[0].stops.every(stop => stop.status === 'pending')).toBe(true);
  expect(state.writes.map(write => write.path)).toEqual(['/api/v1/delivery/routes/1/stops/2/delivered']);
});

for (const paymentMethod of ['cash', 'credit_card', 'verifone', undefined]) {
  test(`courier shows the order amount only for cash: ${paymentMethod ?? 'unknown'}`, async ({ page }) => {
    const state = await install(page);
    Object.assign(state.routes[0].stops[0], { total_amount: 987, payment_method: paymentMethod });
    await page.goto('/1/orders/deliveries');
    await expect(card(page)).toBeVisible();
    const amount = card(page).getByText(/987/);
    if (paymentMethod === 'cash') await expect(amount).toBeVisible();
    else await expect(amount).toHaveCount(0);
    expect(state.errors).toEqual([]);
  });
}

test('courier selects any assigned route and can call before departure', async ({ page }) => {
  const state = await install(page); await page.goto('/1/orders/deliveries');
  await page.getByRole('combobox', { name: 'Choisir une tournée' }).selectOption('2');
  await expect(card(page, 3)).toBeVisible();
  await page.getByRole('combobox', { name: 'Choisir une tournée' }).selectOption('1');
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(card(page).getByRole('link', { name: 'Appeler', exact: true })).toHaveAttribute('href', 'tel:+972500000000');
  await expect(run(page).getByTestId('courier-action-dock').getByRole('button', { name: 'Marquer livrée' })).toHaveCount(0);
  expect(state.requests).not.toContain('/api/v1/delivery/available');
  await expect.poll(() => state.requests.includes('/api/v1/public/delivery/map-config')).toBe(true);
  expect(state.errors).toEqual([]);
});

test('start then deliver directly without requiring the arrived action', async ({ page }) => {
  const state = await install(page); await page.goto('/1/orders/deliveries');
  await expect(run(page).getByRole('button', { name: 'Démarrer la tournée', exact: true })).toBeEnabled();
  await page.waitForLoadState('networkidle');
  const initialNavigationChecks = state.requests.filter(path => path === '/api/v1/delivery/routes/1/my-navigation-check').length;
  expect(initialNavigationChecks).toBeGreaterThan(0);
  await run(page).getByRole('button', { name: 'Démarrer la tournée', exact: true }).click();
  await run(page).getByTestId('courier-action-dock').getByRole('button', { name: 'Marquer livrée', exact: true }).click();
  await expect.poll(() => state.routes[0].stops[0].status).toBe('delivered');
  expect(state.writes.map(write => write.path)).toEqual(['/api/v1/delivery/routes/1/start', '/api/v1/delivery/routes/1/stops/1/delivered']);
  expect(state.writes.every(write => write.rid === '1')).toBe(true);
  await page.getByRole('combobox', { name: 'Choisir une tournée' }).selectOption('2');
  await expect(run(page, 2).getByRole('button', { name: 'Démarrer la tournée' })).toBeDisabled();
  await page.getByRole('combobox', { name: 'Choisir une tournée' }).selectOption('1');
  await expect(card(page, 2)).toHaveAttribute('aria-current', 'step');
  await page.waitForLoadState('networkidle');
  expect(state.requests.filter(path => path === '/api/v1/delivery/routes/1/my-navigation-check')).toHaveLength(initialNavigationChecks);
  expect(state.errors).toEqual([]);
});

test('delivery failure keeps the order pending and displays feedback', async ({ page }) => {
  const state = await install(page, { active: true }); state.failDelivered = true; await page.goto('/1/orders/deliveries');
  await card(page, 2).getByRole('button', { name: /Sélectionner l’arrêt/ }).click();
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

test('Hebrew mobile keeps call and delivered actions visible without overflow', async ({ page }, info) => {
  const state = await install(page, { active: true, locale: 'he' }); await page.setViewportSize({ width: 375, height: 812 }); await page.goto('/1/orders/deliveries');
  await expect(card(page).getByRole('link', { name: 'התקשר', exact: true })).toBeVisible();
  await expect(run(page).getByTestId('courier-action-dock').getByRole('button', { name: 'סמן נמסר', exact: true })).toBeVisible();
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
  await expect(run(page).getByTestId('courier-action-dock').getByRole('button', { name: 'Marquer livrée' })).toBeEnabled();
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
  await run(page).getByTestId('courier-action-dock').getByRole('button', { name: 'Marquer livrée', exact: true }).click();
  await expect(card(page)).toHaveCount(0);
  await expect(page.getByText('Dépôt retour', { exact: true })).toBeVisible();
  expect(state.errors).toEqual([]);
});

function useDemoRoute(state: Awaited<ReturnType<typeof install>>) {
  const points: Array<[number, number]> = [[32.088, 34.786], [32.097, 34.776], [32.107, 34.787], [32.115, 34.801], [32.126, 34.805], [32.182, 34.87], [32.082, 34.845]];
  Object.assign(state.routes[0], { date: '2026-10-23', planned_departure_at: '2026-10-23T08:15:00+03:00', timezone: 'Asia/Jerusalem', customer_window_minutes: 90, est_duration_s: 7500, total_distance_m: 53500, start_lat: 32.016, start_lng: 34.773, start_address: 'Dépôt démo · Holon', stops: points.map(([lat, lng], index) => ({ ...stop(index + 1), lat, lng, address: `Avenue des Oliviers ${index + 1}`, city: index === 5 ? 'Ra’anana' : 'Tel Aviv', delivery_floor: '3', delivery_apt: '12', delivery_notes: index === 0 ? 'Entrée côté jardin. Sonner à l’arrivée.' : undefined })) });
  const path: Array<[number, number]> = [[32.016, 34.773], ...points];
  state.routes[0].route_geometry = points.map((_, index) => ({ order_id: 1001 + index, path: [path[index], [path[index + 1][0], path[index][1]], path[index + 1]] }));
  state.routes[1].stops = [{ ...stop(8), sequence: 1 }];
}

// Deterministic illustrated tiles: no production map, customer data or paid API calls.
async function demoTiles(page: Page) {
  await page.route('**/api/v1/public/delivery/map/**', async intercepted => {
    const match = new URL(intercepted.request().url()).pathname.match(/\/(\d+)\/(\d+)\/(\d+)\.png$/);
    if (!match) return intercepted.fallback();
    const [, z, tx, ty] = match.map(Number), world = 256 * 2 ** z;
    const point = (lat: number, lng: number) => { const sin = Math.sin(lat * Math.PI / 180); return [(lng + 180) / 360 * world - tx * 256, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * world - ty * 256]; };
    const project = (points: Array<[number, number]>) => points.map(([lat, lng]) => point(lat, lng).join(',')).join(' ');
    const coast = project([[31.7, 34.7], [32.02, 34.745], [32.09, 34.765], [32.16, 34.792], [32.4, 34.825]]);
    let streets = '';
    for (let lat = 31.98; lat <= 32.25; lat += 0.008) streets += `<polyline points="${project([[lat, 34.74], [lat + 0.01, 34.92]])}" fill="none" stroke="#fff" stroke-width="3"/>`;
    for (let lng = 34.75; lng <= 34.94; lng += 0.009) streets += `<polyline points="${project([[31.98, lng], [32.25, lng + 0.02]])}" fill="none" stroke="#fff" stroke-width="3"/>`;
    const labels = ([[32.08, 34.806, 'Tel Aviv'], [32.018, 34.796, 'Holon'], [32.175, 34.85, 'Ra’anana']] as const).map(([lat, lng, label]) => { const [x, y] = point(lat, lng); return `<text x="${x}" y="${y}" font-family="Arial" font-size="15" fill="#69746e">${label}</text>`; }).join('');
    return intercepted.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#f0f0e7"/>${streets}<polygon points="-10000,-10000 -10000,10000 ${coast}" fill="#b9dce9"/>${labels}</svg>` });
  });
}

test('mobile map, search, pin selection and adjustable panel keep the action dock visible', async ({ page }, info) => {
  const state = await install(page); useDemoRoute(state); await demoTiles(page);
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/1/orders/deliveries');
  await expect(run(page).locator('.foody-courier-stop-pin')).toHaveCount(7);
  const dock = run(page).getByTestId('courier-action-dock');
  await expect(dock.getByRole('button', { name: 'Démarrer la tournée', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Leaflet's resize observer and tile fade complete after the viewport layout settles.
  await page.waitForTimeout(500);
  await expect(run(page).locator('.leaflet-tile-loaded').first()).toHaveCSS('opacity', '1');
  await page.screenshot({ path: info.outputPath('courier-fr-mobile.png') });
  await run(page).getByRole('button', { name: 'Rechercher un arrêt' }).click();
  await expect(run(page).getByRole('searchbox', { name: 'Rechercher un arrêt' })).toHaveCSS('font-size', '16px');
  await run(page).getByRole('searchbox', { name: 'Rechercher un arrêt' }).fill('Oliviers 6');
  await expect(run(page).locator('[data-stop-id]')).toHaveCount(1);
  await run(page).getByRole('searchbox', { name: 'Rechercher un arrêt' }).fill('absent');
  await expect(run(page).getByText('Aucun arrêt correspondant')).toBeVisible();
  await run(page).getByTitle('7: Avenue des Oliviers 7', { exact: true }).click();
  await expect(card(page, 7).getByRole('button', { name: /Sélectionner l’arrêt/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(card(page, 7).getByRole('button', { name: /Sélectionner l’arrêt/ })).toBeInViewport();
  await run(page).getByTitle('4: Avenue des Oliviers 4', { exact: true }).press('Enter');
  await expect(card(page, 4).getByRole('button', { name: /Sélectionner l’arrêt/ })).toHaveAttribute('aria-expanded', 'true');
  const grip = run(page).getByRole('slider', { name: 'Ajuster la hauteur de la liste' });
  await grip.focus(); await grip.press('End'); await expect(grip).toHaveAttribute('aria-valuenow', '86');
  await expect(dock.getByRole('button', { name: 'Démarrer la tournée', exact: true })).toBeInViewport();
  await grip.press('Home'); await expect(grip).toHaveAttribute('aria-valuenow', '34');
  await grip.evaluate(async element => { await Promise.all(element.parentElement!.getAnimations().map(animation => animation.finished)); });
  await expect(dock.getByRole('button', { name: 'Démarrer la tournée', exact: true })).toBeInViewport();
  const box = (await grip.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2, box.y - 220); await page.mouse.up();
  await expect(grip).toHaveAttribute('aria-valuenow', '56');
  await run(page).getByRole('button', { name: 'Afficher toute la tournée' }).click();
  expect(state.writes).toEqual([]); expect(state.errors).toEqual([]);
});

test('desktop map and dark Hebrew mobile show the same route controls', async ({ page }, info) => {
  const state = await install(page, { active: true, locale: 'he' }); useDemoRoute(state); await demoTiles(page);
  await page.goto('/1/orders/deliveries');
  await expect(run(page).locator('.foody-courier-stop-pin')).toHaveCount(7);
  await expect(run(page).getByTestId('courier-action-dock').getByRole('button', { name: 'סמן נמסר' })).toBeInViewport();
  const checksBeforeSelection = state.requests.filter(path => path.endsWith('/my-navigation-check')).length;
  await page.waitForTimeout(500);
  await expect(run(page).locator('.leaflet-tile-loaded').first()).toHaveCSS('opacity', '1');
  await page.screenshot({ path: info.outputPath('courier-he-desktop.png') });
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(run(page).getByTestId('courier-action-dock').getByRole('button', { name: 'סמן נמסר' })).toBeInViewport();
  await expect(run(page).getByRole('button', { name: 'הצגת כל המסלול' })).toBeInViewport();
  await page.waitForTimeout(500);
  await expect(run(page).locator('.leaflet-tile-loaded').first()).toHaveCSS('opacity', '1');
  await page.screenshot({ path: info.outputPath('courier-he-mobile-map.png') });
  await page.getByRole('combobox', { name: 'בחירת מסלול' }).selectOption('2');
  await expect(run(page, 2).getByRole('button', { name: 'התחל מסלול', exact: true })).toBeDisabled();
  await page.getByRole('combobox', { name: 'בחירת מסלול' }).selectOption('1');
  await expect(run(page).locator('.foody-courier-stop-pin')).toHaveCount(7);
  expect(state.requests.filter(path => path.endsWith('/my-navigation-check'))).toHaveLength(checksBeforeSelection);
  expect(state.writes).toEqual([]); expect(state.errors).toEqual([]);
});

test('switching the viewed route keeps the active GPS reporter running', async ({ page }) => {
  const state = await install(page, { active: true });
  await page.addInitScript(() => {
    const tracker = { watches: 0, clears: 0 };
    Object.assign(window, { courierGpsFixture: tracker });
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      watchPosition: () => ++tracker.watches,
      clearWatch: () => { tracker.clears++; },
    } });
  });
  await page.goto('/1/orders/deliveries');
  await expect(run(page).getByTestId('courier-action-dock').getByRole('button', { name: 'Marquer livrée' })).toBeEnabled();
  const before = await page.evaluate(() => (window as any).courierGpsFixture);
  expect(before.watches - before.clears).toBe(1);
  await page.getByRole('combobox', { name: 'Choisir une tournée' }).selectOption('2');
  await expect(run(page, 2)).toBeVisible();
  await page.getByRole('combobox', { name: 'Choisir une tournée' }).selectOption('1');
  expect(await page.evaluate(() => (window as any).courierGpsFixture)).toEqual(before);
  expect(state.writes).toEqual([]); expect(state.errors).toEqual([]);
});

test('manager courier preview fits inside the administration shell', async ({ page }) => {
  const state = await install(page, { role: 'manager' });
  await page.goto('/1/orders/courier-mode');
  await expect(run(page).getByTestId('courier-action-dock').getByRole('button', { name: 'Démarrer la tournée' })).toBeInViewport();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(run(page).getByTestId('courier-action-dock').getByRole('button', { name: 'Démarrer la tournée' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(state.errors).toEqual([]);
});

for (const role of ['owner', 'superadmin'] as const) {
  for (const locale of ['fr', 'en', 'he']) {
    test(`${role} switches between restaurant couriers in the shared workspace (${locale})`, async ({ page }, info) => {
      const state = await install(page, { role, active: true, locale });
      state.routes[1].courier_id = 92;
      let watches = 0;
      await page.exposeFunction('recordLocationWatch', () => { watches++; });
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'geolocation', { value: {
          watchPosition: () => { (window as any).recordLocationWatch(); return 1; },
          clearWatch: () => {},
        } });
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/1/orders/courier-mode');
      const label = locale === 'he' ? 'צפייה בתור שליח' : locale === 'en' ? 'View as courier' : 'Voir comme livreur';
      const picker = page.getByRole('combobox', { name: label });
      await expect(picker).toHaveValue('91');
      await expect(picker.locator('option')).toHaveCount(2);
      await expect(card(page, 1)).toBeVisible();
      await expect(card(page, 3)).toHaveCount(0);
      await expect(run(page).getByTestId('courier-action-dock')).toBeInViewport();
      await picker.selectOption('92');
      await expect(card(page, 3)).toBeVisible();
      await expect(card(page, 1)).toHaveCount(0);
      await expect(page.getByRole('combobox', { name: locale === 'he' ? 'בחירת מסלול' : locale === 'en' ? 'Select a route' : 'Choisir une tournée' })).toHaveValue('2');
      await picker.selectOption('91');
      await expect(card(page, 1)).toBeVisible();
      const selections = state.courierRequests.filter(request => request.path.endsWith('/mine/all')).map(request => request.courierId);
      expect(selections.filter((id, index) => id !== selections[index - 1])).toEqual(['91', '92', '91']);
      expect(state.courierRequests.filter(request => request.path.includes('/delivery/routes/')).every(request => request.rid === '1' && request.courierId !== null)).toBe(true);
      expect(state.requests).not.toContain('/api/v1/delivery/available');
      expect(watches).toBe(0);
      expect(state.requests).not.toContain('/api/v1/delivery/location');
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('foody_restaurant_user')!).role)).toBe(role);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`${role}-courier-${locale}.png`), fullPage: true });
      expect(state.errors).toEqual([]);
    });
  }

  test(`${role} courier actions retain the selected courier and active restaurant`, async ({ page }) => {
    const state = await install(page, { role, active: true });
    state.routes[1].courier_id = 92;
    await page.goto('/2/orders/courier-mode');
    await page.getByRole('combobox', { name: 'Voir comme livreur' }).selectOption('92');
    await expect(card(page, 3)).toBeVisible();
    await run(page, 2).getByRole('button', { name: 'Démarrer la tournée', exact: true }).click();
    await run(page, 2).getByTestId('courier-action-dock').getByRole('button', { name: 'Marquer livrée', exact: true }).click();
    await expect.poll(() => state.routes[1].stops[0].status).toBe('delivered');
    expect(state.writes.map(write => ({ path: write.path, rid: write.rid, courierId: write.courierId }))).toEqual([
      { path: '/api/v1/delivery/routes/2/start', rid: '2', courierId: '92' },
      { path: '/api/v1/delivery/routes/2/stops/3/delivered', rid: '2', courierId: '92' },
    ]);
    expect(state.routes[0].stops.every(stop => stop.status === 'pending')).toBe(true);
    expect(state.errors).toEqual([]);
  });

  test(`${role}: a late response from the previous courier cannot replace the new selection`, async ({ page }) => {
    const state = await install(page, { role });
    state.routes[1].courier_id = 92;
    await page.goto('/1/orders/courier-mode');
    await expect(card(page, 1)).toBeVisible();
    const picker = page.getByRole('combobox', { name: 'Voir comme livreur' });
    await picker.selectOption('92');
    await expect(card(page, 3)).toBeVisible();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    let waiting = false;
    let released = false;
    await page.route(url => url.pathname === '/api/v1/delivery/routes/mine/all', async intercepted => {
      if (new URL(intercepted.request().url()).searchParams.get('courier_id') !== '91') {
        return intercepted.fallback();
      }
      waiting = true;
      await pending;
      await intercepted.fulfill({ json: { routes: [state.routes[0]] } });
      released = true;
    });
    await picker.selectOption('91');
    await expect.poll(() => waiting).toBe(true);
    await picker.selectOption('92');
    await expect(card(page, 3)).toBeVisible();
    release();
    await expect.poll(() => released).toBe(true);
    await expect(picker).toHaveValue('92');
    await expect(card(page, 3)).toBeVisible();
    await expect(card(page, 1)).toHaveCount(0);
    expect(state.errors).toEqual([]);
  });

  test(`${role} staff loading can recover and an empty list never loads their own routes`, async ({ page }) => {
    const state = await install(page, { role });
    let failure = true;
    await page.route('**/api/v1/restaurants/1/staff', intercepted => intercepted.fulfill(
      failure ? { status: 503, json: { error: 'unavailable' } } : { json: { staff: [] } }
    ));
    await page.goto('/1/orders/courier-mode');
    const retry = page.getByRole('button', { name: 'Réessayer', exact: true });
    await expect(retry).toBeVisible();
    failure = false;
    await retry.click();
    await expect(page.getByRole('status')).toHaveText('Aucun livreur n’est configuré pour ce restaurant.');
    expect(state.requests).not.toContain('/api/v1/delivery/routes/mine/all');
    expect(state.errors).toEqual([]);
  });

}

test('manager courier mode keeps its own route without the owner selector', async ({ page }) => {
  const state = await install(page, { role: 'manager' });
  await page.goto('/1/orders/courier-mode');
  await expect(card(page, 1)).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Voir comme livreur' })).toHaveCount(0);
  expect(state.courierRequests.filter(request => request.path.includes('/delivery/routes/')).every(request => request.courierId === null)).toBe(true);
  expect(state.requests).not.toContain('/api/v1/restaurants/1/staff');
  expect(state.errors).toEqual([]);
});

test('an incomplete route hides old finish, distance and arrival estimates', async ({ page }) => {
  const state = await install(page);
  Object.assign(state.routes[0], { needs_recalculation: true, routing_error: 'routing service unavailable' });
  await page.goto('/1/orders/deliveries');
  await expect(run(page).getByText(/Fin estimée/)).toHaveCount(0);
  await expect(run(page).getByText('2 km', { exact: true })).toHaveCount(0);
  await expect(run(page).getByText(/Arrivée prévue/)).toHaveCount(0);
  await expect(run(page).getByTestId('courier-action-dock').getByText('—', { exact: true })).toBeVisible();
  expect(state.errors).toEqual([]);
});


test('a global owner cannot select couriers in a restaurant managed by another owner', async ({ page }) => {
  const state = await install(page, { role: 'owner', roleName: 'Manager' });
  await page.goto('/1/orders/courier-mode');
  await expect(card(page, 1)).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Voir comme livreur' })).toHaveCount(0);
  expect(state.requests).not.toContain('/api/v1/restaurants/1/staff');
  expect(state.courierRequests.filter(request => request.path.includes('/delivery/routes/')).every(request => request.courierId === null)).toBe(true);
  expect(state.errors).toEqual([]);
});

for (const role of ['courier', 'owner', 'superadmin'] as const) {
  for (const locale of ['fr', 'en', 'he']) {
    test(`${role} executes the saved itinerary without planning controls (${locale})`, async ({ page }) => {
      const state = await install(page, { role, locale });
      const before = JSON.stringify(state.routes);
      await page.goto('/1/orders/courier-mode');
      await expect(card(page)).toBeVisible();
      for (const title of ['Ajuster', 'Options de la tournée', 'Options de l’arrêt', 'Corriger l’adresse', 'Réoptimiser', 'Refine', 'Route options', 'Stop options', 'Correct address', 'Reoptimize', 'התאמה', 'אפשרויות מסלול', 'אפשרויות עצירה']) {
        await expect(run(page).getByRole('button', { name: title, exact: true })).toHaveCount(0);
      }
      await expect(run(page).getByRole('spinbutton')).toHaveCount(0);
      await expect(run(page).getByRole('menuitem')).toHaveCount(0);
      await run(page).locator('summary').click();
      await expect(run(page).locator('details')).toHaveAttribute('open', '');
      await card(page, 2).locator('button[aria-expanded]').click();
      await expect(card(page, 2).getByRole('link', { name: locale === 'he' ? 'התקשר' : locale === 'fr' ? 'Appeler' : 'Call', exact: true })).toBeVisible();
      expect(JSON.stringify(state.routes)).toBe(before);
      expect(state.writes).toEqual([]);
      expect(state.errors).toEqual([]);
      // Starting and delivery remain real operations; existing action tests cover them.
    });
  }
}

test('refreshing a saved route warning does not recalculate or write the plan', async ({ page }) => {
  const state = await install(page);
  Object.assign(state.routes[0], { routing_warning: 'quota_exceeded', needs_recalculation: true });
  const before = JSON.stringify(state.routes);
  await page.goto('/1/orders/courier-mode');
  await expect(card(page)).toBeVisible();
  const reads = state.requests.filter(path => path.endsWith('/mine/all')).length;
  await run(page).getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect.poll(() => state.requests.filter(path => path.endsWith('/mine/all')).length).toBeGreaterThan(reads);
  expect(state.writes).toEqual([]);
  expect(JSON.stringify(state.routes)).toBe(before);
});
