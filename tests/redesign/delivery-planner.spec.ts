import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';
import { createFixture } from './fixtures.mjs';
import { demoTiles } from './fixtures/delivery-map';
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
  routing_provider: 'google', route_geometry: stops.map(stop => ({ order_id: stop.order_id, path: [[32.07,34.79],[32.07,stop.lng!],[stop.lat!,stop.lng!]] })),
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
    reads: [] as { date: string | null; rid?: string }[], tiles: [] as string[], failUndo: false, failRouting: false,
  };
  await page.routeWebSocket('**/ws?**', socket => { state.socket = socket; });
  await page.addInitScript(({ locale }) => {
    localStorage.setItem('foody_restaurant_portal_session', 'fp1p.e30.fixture.00');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'manager' }));
    localStorage.setItem('foody_restaurant_ids', '[1,2]');
    localStorage.setItem('foody-admin-locale', locale);
    localStorage.setItem('foody_admin_theme', locale === 'he' ? 'dark' : 'light');
  }, { locale });
  await page.route('**/api/v1/**', async intercepted => {
    const request = intercepted.request(), url = new URL(request.url()), path = url.pathname;
    const rid = request.headers()['x-restaurant-id'];
    if (path === '/api/v1/public/delivery/map-config') return intercepted.fulfill({ json: { provider: 'google', tile_url: `/api/v1/public/delivery/map/google/{z}/{x}/{y}.png?restaurant_id=${url.searchParams.get('restaurant_id')}` } });
    if (path === '/api/v1/public/delivery/map-viewport') return intercepted.fulfill({ json: { copyright: 'Synthetic map data ©2026' } });
    if (path.startsWith('/api/v1/public/delivery/map/')) { state.tiles.push(request.url()); return intercepted.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edf0ee"/><path d="M0 80H256M90 0V256" stroke="#cbd0cd" stroke-width="8"/></svg>' }); }
    if (path === '/api/v1/users/me') return intercepted.fulfill({ json: { role_name: 'Manager', permissions: ['orders.manage', 'settings.view'], user: { id: 1, role: 'manager' } } });
    if (path.startsWith('/api/v1/delivery/routes/history')) {
      const rows = state.routes.map(row => ({ ...row, status: (row.status === 'active' || row.status === 'draft') && row.stops.every(s => s.status === 'delivered' || s.status === 'skipped') ? 'completed' : row.status }))
        .filter(row => row.stops.length && (row.date < day || row.date === day && row.status === 'completed'))
        .sort((a,b) => b.date.localeCompare(a.date) || b.id - a.id);
      if (path.endsWith('/history')) {
        const owners = new Set(rows.map(row => row.courier_id));
        const filtered = rows.filter(row => !url.searchParams.get('courier_id') || row.courier_id === Number(url.searchParams.get('courier_id')));
        const offset = Number(url.searchParams.get('cursor') || 0);
        return intercepted.fulfill({ json: { routes: filtered.slice(offset, offset + 25).map(row => ({ id: row.id, status: row.status, date: row.date, courier_id: row.courier_id, stop_count: row.stops.length })),
          couriers: state.couriers.filter(row => owners.has(row.id)).map(row => ({ id: row.id, name: row.full_name })),
          next_cursor: filtered.length > offset + 25 ? String(offset + 25) : undefined } });
      }
      const result = rows.find(row => row.id === Number(path.split('/').pop()));
      return intercepted.fulfill({ status: result ? 200 : 404, json: { route: result } });
    }
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
    return intercepted.abort();
  });
  return state;
}

for (const mode of ['coordinates', 'canonical text', 'unlocated Google address', 'manual recovery', 'unavailable Details'] as const) {
  test(`dispatch corrects the customer delivery address using ${mode}`, async ({ page }) => {
    const state = await install(page);
    const order = {
      id: 1002, restaurant_id: 1, order_type: 'delivery', customer_name: 'Client démo',
      delivery_address: '2 Rue de démonstration', delivery_city: 'Tel Aviv',
      delivery_floor: '3', delivery_apt: '8', delivery_entry_code: 'TEST', delivery_notes: 'Note de démonstration',
    };
    const suggestion = {
      id: 'address-demo', address: 'Rue Démo 12', city: 'Tel Aviv', street: 'Rue Démo', house_number: '12',
    };
    const location = { lat: 32.08, lng: 34.78 };
    const saved = { address: suggestion.address, city: suggestion.city };
    const operations: string[] = [];
    const geocodes: { address: string | null; city: string | null }[] = [];
    let correction: Record<string, unknown> | undefined;
    await page.route('**/api/v1/orders/1002?**', request => request.fulfill({ json: { order } }));
    await page.route('**/api/v1/delivery/address-autocomplete?**', async request => {
      const url = new URL(request.request().url());
      expect(url.searchParams.get('restaurant_id')).toBe('1');
      return request.fulfill({ json: { suggestions: [{ ...suggestion, city: 'Tel Aviv, Israel', kind: 'prediction', lookup_token: 'demo-token' }] } });
    });
    await page.route('**/api/v1/delivery/address-autocomplete/resolve?**', request =>
      mode === 'unavailable Details' ? request.fulfill({ status: 503, json: { error: 'unavailable' } })
        : request.fulfill({ json: { suggestion: mode === 'coordinates' ? { ...suggestion, ...location } : suggestion } }));
    await page.route('**/api/v1/public/geocode?**', async request => {
      const query = new URL(request.request().url()).searchParams;
      geocodes.push({ address: query.get('address'), city: query.get('city') });
      const found = mode !== 'unlocated Google address';
      return request.fulfill({ json: found ? { found, ...location } : { found } });
    });
    await page.route('**/api/v1/orders/1002/customer-details?**', async request => {
      operations.push('save');
      expect(request.request().method()).toBe('PUT');
      expect(request.request().headers()['x-restaurant-id']).toBe('1');
      correction = request.request().postDataJSON();
      return request.fulfill({ json: { order: { ...order, ...correction } } });
    });
    await page.route('**/api/v1/delivery/routes/1/optimize?**', async request => {
      operations.push('optimize');
      if (mode === 'coordinates') return request.fulfill({ status: 500, json: { error: 'demo recalculation error' } });
      if (mode === 'unlocated Google address') {
        state.routes[0].stops[1] = { ...state.routes[0].stops[1], ...saved, lat: null, lng: null, needs_geocode: true };
      }
      return request.fulfill({ json: { route: state.routes[0] } });
    });

    await page.goto('/1/orders/deliveries');
    await page.getByRole('button', { name: /2 Rue de démonstration/ }).click();
    await page.getByRole('button', { name: 'Corriger l’adresse', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Modifier le client' });
    const address = dialog.getByRole('combobox', { name: 'Adresse de livraison' });
    const save = dialog.getByRole('button', { name: 'Enregistrer', exact: true });
    await expect(address).toHaveValue('2 Rue de démonstration, Tel Aviv');
    await expect(dialog.getByRole('textbox', { name: 'Ville', exact: true })).toHaveCount(0);
    await address.fill('12 ru Demo Tel Av');
    await expect(save).toBeDisabled();

    if (mode === 'manual recovery') {
      await dialog.getByRole('button', { name: 'Saisir l’adresse manuellement', exact: true }).click();
      const manualAddress = dialog.getByRole('textbox', { name: 'Adresse de livraison' });
      const manualCity = dialog.getByRole('textbox', { name: 'Ville', exact: true });
      saved.address = 'Rue Démo 24';
      saved.city = 'Ville Démo';
      await manualAddress.fill(saved.address);
      await manualCity.fill(saved.city);
    } else {
      await dialog.getByRole('option').getByRole('button').click();
      if (mode === 'unavailable Details') {
        await expect(dialog.getByRole('textbox', { name: 'Adresse de livraison' })).toHaveValue(suggestion.address);
        await expect(dialog.getByRole('textbox', { name: 'Ville', exact: true })).toHaveValue(suggestion.city);
        await expect(dialog.getByText(/Vérifiez la rue, le numéro et la ville/)).toBeVisible();
      } else await expect(address).toHaveValue('Rue Démo 12, Tel Aviv');
    }

    await save.click();
    await expect(dialog).toHaveCount(0);
    expect(operations).toEqual(['save']);
    expect(geocodes).toEqual([]);
    expect(correction).toEqual({
      name: order.customer_name, update_customer_profile: true,
      delivery_address: saved.address, delivery_city: saved.city,
      delivery_floor: order.delivery_floor, delivery_apt: order.delivery_apt,
      delivery_entry_code: order.delivery_entry_code, delivery_notes: order.delivery_notes,
      ...(mode === 'coordinates' ? { delivery_latitude: location.lat, delivery_longitude: location.lng } : {}),
    });
  });
}

for (const locale of ['fr', 'he'] as const) {
  test(`a numbered ${locale} suggestion survives street-only Details and keeps its assigned stop`, async ({ page }) => {
    const state = await install(page, locale);
    const street = locale === 'he' ? 'רחוב הדגמה' : 'Demo Street';
    const city = locale === 'he' ? 'נתניה' : 'Netanya';
    const label = `${street} 6`;
    const order = { id: 1002, restaurant_id: 1, order_type: 'delivery', customer_name: 'Demo',
      delivery_address: '2 Rue de démonstration', delivery_city: 'Tel Aviv' };
    const originalStops = state.routes[0].stops.map(stop => stop.id);
    const operations: string[] = [];
    const point = { lat: 32.28, lng: 34.85 };
    let searches = 0;
    await page.route('**/api/v1/orders/1002?**', request => request.fulfill({ json: { order } }));
    await page.route('**/api/v1/delivery/address-autocomplete?**', request => {
      searches++;
      return request.fulfill({ json: { suggestions: ['Other City', city].map((name, index) => ({
        id: `prediction-${index}`, kind: 'prediction', address: label, city: `${name}, Israel`, lookup_token: `demo-${index}`,
      })) } });
    });
    await page.route('**/api/v1/delivery/address-autocomplete/resolve?**', request => {
      expect(request.request().postDataJSON().lookup_token).toBe('demo-1');
      return request.fulfill({ json: { suggestion: {
        id: 'canonical-route', kind: 'street', address: street, street, city, house_number: '', lat: 30, lng: 35,
      } } });
    });
    await page.route('**/api/v1/public/geocode?**', request => {
      expect(new URL(request.request().url()).searchParams.get('address')).toBe(label);
      operations.push('geocode');
      return request.fulfill({ json: { found: false } });
    });
    await page.route('**/api/v1/orders/1002/customer-details?**', request => {
      const data = request.request().postDataJSON();
      expect(data.delivery_address).toBe(label);
      expect(data.delivery_city).toBe(city);
      if (locale === 'he') expect(data).toMatchObject({ delivery_latitude: point.lat, delivery_longitude: point.lng, delivery_pin_confirmed: true });
      else {
        expect(data).not.toHaveProperty('delivery_latitude');
        expect(data).not.toHaveProperty('delivery_longitude');
      }
      operations.push('save');
      Object.assign(state.routes[0].stops[1], { address: label, city });
      return request.fulfill({ json: { order: { ...order, ...data } } });
    });
    await page.route('**/api/v1/delivery/routes/1/optimize?**', request => {
      operations.push('optimize');
      Object.assign(state.routes[0].stops[1], { address: label, city, ...point, needs_geocode: false, coordinate_provider: 'google' });
      return request.fulfill({ json: { route: state.routes[0] } });
    });
    await page.goto('/1/orders/deliveries');
    await page.getByRole('button', { name: /2 Rue de démonstration/ }).click();
    await page.getByRole('button', { name: locale === 'he' ? 'תיקון כתובת' : 'Corriger l’adresse', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const input = dialog.getByRole('combobox');
    await input.fill(label);
    const option = dialog.getByRole('option').filter({ hasText: city });
    await expect(option).toBeVisible();
    if (locale === 'he') {
      await input.press('ArrowDown');
      await input.press('Enter');
    } else await option.click();
    await expect(input).toHaveValue(`${label}, ${city}`);
    const save = dialog.getByRole('button', { name: locale === 'he' ? 'שמור' : 'Enregistrer', exact: true });
    await expect(save).toBeEnabled();
    const searchesAfterSelection = searches;
    await page.clock.runFor(500);
    await expect(dialog.getByRole('listbox')).toHaveCount(0);
    expect(searches).toBe(searchesAfterSelection);
    if (locale === 'he') {
      const pin = dialog.getByRole('textbox', { name: /נקודת משלוח/ });
      await pin.fill('invalid');
      await expect(save).toBeDisabled();
      await pin.fill(`${point.lat}, ${point.lng}`);
    }
    await save.click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: new RegExp(label) }).first()).toBeVisible();
    expect(operations).toEqual(['save']);
    expect(state.routes[0].stops.map(stop => stop.id)).toEqual(originalStops);
  });
}

for (const locale of ['fr', 'he'] as const) {
  test(`staff can save an unnumbered Google street in ${locale} with the selected city`, async ({ page }) => {
    const state = await install(page, locale);
    const street = 'שדרת הדגמה';
    const city = 'נתניה';
    const order = { id: 1002, restaurant_id: 1, order_type: 'delivery', customer_name: 'Demo',
      delivery_address: 'Example Avenue 14', delivery_city: 'Netanya', delivery_entry_code: 'test entry', delivery_floor: '0' };
    const stops = state.routes[0].stops.map(stop => stop.id);
    let saved: Record<string, unknown> | undefined;
    let recalculated = 0;
    await page.route('**/api/v1/orders/1002?**', req => req.fulfill({ json: { order } }));
    await page.route('**/api/v1/delivery/address-autocomplete?**', req => req.fulfill({ json: { suggestions: [
      { id: 'street-choice', kind: 'prediction', address: street, city: city + ', ישראל', lookup_token: 'fixture-street' },
    ] } }));
    await page.route('**/api/v1/delivery/address-autocomplete/resolve?**', req => req.fulfill({ json: { suggestion: {
      id: 'route', kind: 'street', address: street, street, city, lat: 31, lng: 35,
    } } }));
    await page.route('**/api/v1/public/geocode?**', req => req.fulfill({ json: { found: false } }));
    await page.route('**/api/v1/orders/1002/customer-details?**', req => {
      saved = req.request().postDataJSON();
      return req.fulfill({ json: { order: { ...order, ...saved } } });
    });
    await page.route('**/api/v1/delivery/routes/1/optimize?**', req => {
      recalculated++;
      return req.fulfill({ json: { route: state.routes[0] } });
    });
    await page.goto('/1/orders/deliveries');
    await page.getByRole('button', { name: /2 Rue de démonstration/ }).click();
    await page.getByRole('button', { name: locale === 'he' ? 'תיקון כתובת' : 'Corriger l’adresse', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const input = dialog.getByRole('combobox');
    await input.fill(street);
    const result = dialog.getByRole('option', { name: new RegExp(street) });
    await expect(result).toBeVisible();
    if (locale === 'he') await input.press('Enter');
    else await result.click();
    await expect(input).toHaveValue(street + ', ' + city);
    await expect(dialog.getByRole('listbox')).toHaveCount(0);
    const save = dialog.getByRole('button', { name: locale === 'he' ? 'שמור' : 'Enregistrer', exact: true });
    await expect(save).toBeEnabled();
    const number = dialog.getByRole('textbox', { name: locale === 'he' ? /מספר בית/ : /Numéro de rue/ });
    await expect(number).toHaveValue('');
    if (locale === 'fr') {
      await expect(dialog.getByRole('button', { name: 'Reprendre le n° 14 de la commande' })).toHaveCount(0);
      await number.fill('14');
      await expect(number).toHaveValue('14');
    }
    await save.click();
    await expect(dialog).toHaveCount(0);
    expect(saved).toMatchObject({ delivery_address: locale === 'fr' ? street + ' 14' : street,
      delivery_city: city, delivery_floor: '0', delivery_entry_code: 'test entry' });
    expect(saved).not.toHaveProperty('delivery_latitude');
    expect(saved).not.toHaveProperty('delivery_longitude');
    expect(recalculated).toBe(0);
    expect(state.routes[0].stops.map(stop => stop.id)).toEqual(stops);
  });
}

async function openMap(page: Page) {
  const toggle = page.getByRole('button', { name: /^(Carte|מפה|Map)$/ });
  if (await toggle.isVisible()) await toggle.click();
}

async function openSettings(page: Page) {
  const details = page.locator('details').filter({ has: page.getByText('Réglages de la tournée', { exact: true }) }).first();
  if (await details.getAttribute('open') === null) await details.locator('summary').click();
}

test('dispatch shows the stop awaiting a result, preserves reports, and sends a scoped reminder', async ({ page }) => {
  const state = await install(page);
  state.routes[0].status = 'active';
  state.routes[0].stops[1].navigation_started_at = '2026-10-12T05:30:00Z';
  state.routes[0].stops[2].status = 'skipped';
  state.routes[0].stops[2].issue_reason = 'wrong_address';
  await page.route('**/api/v1/delivery/routes/1/courier-reminder?**', intercepted => {
    const request = intercepted.request();
    state.writes.push({ path: new URL(request.url()).pathname, rid: request.headers()['x-restaurant-id'] });
    return intercepted.fulfill({ json: { accepted: 1 } });
  });
  await page.goto('/1/orders/deliveries');
  await expect(page.getByText('Résultat à confirmer', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Annuler le départ', exact: true })).toHaveCount(0);
  const issues = page.getByRole('region', { name: 'Incidents de livraison signalés' });
  await expect(issues).toContainText('Adresse incorrecte');
  await expect(issues.getByRole('link', { name: 'Ouvrir la commande' })).toHaveAttribute('href', '/1/orders/1003');
  await page.getByRole('button', { name: 'Rappeler le livreur', exact: true }).click();
  await expect(page.getByText('Rappel accepté pour envoi.')).toBeVisible();
  expect(state.writes).toEqual([{ path: '/api/v1/delivery/routes/1/courier-reminder', rid: '1' }]);
});

test('planner separates completed deliveries from work and preserves history', async ({ page }, info) => {
  const state = await install(page);
  await page.goto('/1/orders/deliveries');
  await expect(page.getByRole('heading', { name: 'Répartition des livraisons', exact: true })).toBeVisible();
  await expect(page.getByText('1 sur 3 livrés', { exact: true })).toBeVisible();
  await expect(page.locator('tbody tr[data-stop-id="1"]')).toHaveCount(0);
  await expect(page.locator('tbody tr[data-stop-id="4"]')).toHaveCount(0);
  await openMap(page);
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect(page.locator('.foody-stop-pin')).toHaveCount(2);
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(2);
  await expect(page.locator('.leaflet-overlay-pane path').first()).not.toHaveAttribute('stroke-dasharray', /.+/);
  await expect(page.locator('.leaflet-control-attribution')).toContainText('Synthetic map data');
  await expect.poll(() => page.locator('.leaflet-tile-loaded').count()).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath('delivery-planner-fr.png'), animations: 'disabled' });
  await page.getByRole('tab', { name: /Historique/ }).click();
  await page.getByRole('button', { name: /Livreuse démo.*#2/ }).click();
  await expect(page.locator('tbody tr[data-stop-id="4"]')).toBeVisible();
  await expect(page.getByText('Terminée', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Désassigner', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /4 Rue de démonstration/ }).click();
  await expect(page.getByRole('button', { name: 'Corriger l’adresse', exact: true })).toHaveCount(0);
  await expect(page.getByText(/Arrivée prévue/)).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
});

test('completed series opens the archive independently of the planning date', async ({ page }) => {
  const state = await install(page);
  state.routes = [route(2, [stop(4, 'delivered')])];
  await page.goto('/1/orders/deliveries');
  await expect(page.getByText('Aucune livraison en cours', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Désassigner', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: /Historique/ }).click();
  await page.getByRole('button', { name: /Livreuse démo.*#2/ }).click();
  await expect(page.locator('tbody tr[data-stop-id="4"]')).toBeVisible();
  await expect(page.getByLabel('Date des tournées', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Retour à l’historique' }).click();
  await expect(page.getByRole('button', { name: /Livreuse démo.*#2/ })).toBeVisible();
  expect(state.writes).toHaveLength(0);
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
  await openMap(page);
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await page.getByRole('button', { name: 'Masquer la carte', exact: true }).click();
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

test('three zones group bilingual city variants and send two complete allocations', async ({ page }) => {
  const state = await install(page);
  state.routes = [];
  state.candidates = ['Tel Aviv', 'Zone B', 'Zone C', 'תל אביב-יפו', 'tel-aviv yafo'].map((city, index) => ({
    id: 2001 + index, restaurant_id: 1, order_type: 'delivery', status: 'in_kitchen',
    customer_name: `Client démo ${index}`, delivery_address: '1 Rue de démonstration', delivery_city: city,
  }));
  await page.route('**/api/v1/delivery/routes/plan**', intercepted => intercepted.fulfill({ json: { routes: [] } }));
  await page.goto('/1/orders/deliveries');
  await page.getByRole('checkbox', { name: 'Tout sélectionner', exact: true }).check();
  await page.getByRole('button', { name: 'Répartir entre les livreurs', exact: true }).first().click();
  await page.getByRole('radio', { name: /Par zone/ }).click();
  const telAviv = page.locator('label').filter({ hasText: 'Tel Aviv' });
  await expect(telAviv).toContainText('3');
  await telAviv.getByRole('combobox').selectOption('1');
  await page.locator('label').filter({ hasText: 'Zone B' }).getByRole('combobox').selectOption('1');
  await page.locator('label').filter({ hasText: 'Zone C' }).getByRole('combobox').selectOption('2');
  const courierSettings = page.getByRole('group', { name: 'Livreur démo', exact: true });
  await courierSettings.getByRole('combobox', { name: 'Adresse de départ' }).fill('Depot demo, Tel Aviv');
  await courierSettings.getByRole('combobox', { name: 'Destination finale' }).fill('Herzl 10, Netanya');
  await page.getByRole('textbox', { name: 'Marge du créneau communiqué au client' }).fill('1:30');
  const request = page.waitForRequest(request => request.url().includes('/delivery/routes/plan') && request.method() === 'POST');
  await page.getByRole('button', { name: 'Planifier 5 livraisons', exact: true }).click();
  const submitted = await request;
  expect(submitted.headers()['x-restaurant-id']).toBe('1');
  expect(submitted.postDataJSON().assignments).toEqual([
    { courier_id: 1, order_ids: [2001, 2002, 2004, 2005] },
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
  await openSettings(page);
  await expect(page.getByText('Créneaux des commandes respectés', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Modifier', exact: true }).click();
  const choice = page.getByRole('switch', { name: 'Respecter les créneaux des commandes', exact: true });
  await expect(choice).toBeChecked();
  await choice.press('Space');
  await page.screenshot({ path: info.outputPath('route-order-windows-fr.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect.poll(() => saved?.respect_order_windows).toBe(false);
  await expect(page.getByText('Horaires calculés par la tournée', { exact: true })).toBeVisible();
  await openSettings(page);
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
  await expect(dialog).toContainText('2 arrêts en attente');
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
  await expect(page.getByRole('heading', { name: 'Répartition des livraisons', exact: true })).toBeVisible();
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
  await expect(page.getByRole('heading', { name: 'שיבוץ משלוחים', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByText('1 מתוך 3 נמסרו', { exact: true })).toBeVisible();
  await expect(page.getByText('08:15–08:30', { exact: true })).toHaveAttribute('dir', 'ltr');
  await openMap(page);
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await page.screenshot({ path: info.outputPath('delivery-planner-he-dark.png'), animations: 'disabled' });
  expect(state.reads.every(read => read.rid === '2')).toBe(true);
  await expect.poll(() => state.tiles.length).toBeGreaterThan(0);
  expect(state.tiles.every(url => url.includes('/map/google/') && new URL(url).searchParams.get('restaurant_id') === '2' && !url.includes('apiKey'))).toBe(true);
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
  state.routes = [{ ...route(1, [located, pending]), routing_provider: 'google', needs_recalculation: true, routing_error: 'location service quota exceeded', route_geometry: [], total_distance_m: 0, est_duration_s: 0 }];
  await page.goto('/1/orders/deliveries');
  await expect(page.getByText('Le quota du service de localisation est atteint. Réessayez plus tard. Vos tournées existantes sont conservées.', { exact: true })).toBeVisible();
  await expect(page.getByText('Position temporairement indisponible — vérifiez le service cartographique', { exact: true })).toBeVisible();
  await expect(page.getByText('Position introuvable — exclue du calcul du trajet', { exact: true })).toHaveCount(0);
  await openMap(page);
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
  await openMap(page);
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
  await page.getByRole('navigation', { name: 'Choisir une tournée' }).getByRole('button', { name: /Tournée 1$/ }).click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(paths.nth(1)).toHaveAttribute('stroke-opacity', '0.15');
  await page.screenshot({ path: info.outputPath('delivery-route-legend.png'), animations: 'disabled' });
});


test('Google routes display their markers, geometry and map attribution together', async ({page}) => {
 const state=await install(page);
 state.routes=[{...route(1,[{...stop(2),coordinate_provider:'google'}]),start_lat:32,start_lng:34,end_lat:32.3,end_lng:34.3}];
 await page.goto('/1/orders/deliveries'); await openMap(page);
 await expect(page.locator('.leaflet-control-attribution')).toContainText('Synthetic map data');
 await expect(page.locator('.foody-stop-pin')).toHaveCount(1);
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
  await openSettings(page);
  await page.getByRole('button', { name: 'Modifier', exact: true }).click();
  await page.getByLabel('Départ prévu', { exact: true }).fill('2026-10-19T08:00');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Choisissez des livraisons prévues à la même date que la tournée.' }).first()).toBeVisible();
  expect(state.routes[0].date).toBe(day);
});

test('the same address field recovers after three provider failures', async ({ page }) => {
  const state = await install(page);
  state.routes = [route(1, [stop(2)])];
  let attempts = 0;
  await page.route('**/api/v1/delivery/address-autocomplete**', intercepted => {
    if (++attempts <= 3) return intercepted.fulfill({ status: 503, json: { error: 'unavailable' } });
    return intercepted.fulfill({ json: { suggestions: [{ id: 'sample', address: 'Example 6', city: 'Netanya', street: 'Example', house_number: '6' }] } });
  });
  await page.goto('/1/orders/deliveries');
  await openSettings(page);
  await page.getByRole('button', { name: 'Modifier', exact: true }).click();
  const field = page.getByRole('combobox', { name: 'Destination finale', exact: true });
  await field.fill('Example 6');
  await expect(page.getByRole('button', { name: 'Réessayer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await page.getByRole('option', { name: /Example 6/ }).click();
  await expect(field).toHaveValue('Example 6, Netanya');
  expect(attempts).toBe(4);
});

test('a directory outage keeps the day and its stops visible', async ({ page }) => {
  const state = await install(page);
  state.routes = [route(1, Array.from({ length: 21 }, (_, i) => stop(i + 1)))];
  await page.route('**/api/v1/restaurants/1/staff**', intercepted => intercepted.fulfill({ status: 503, json: { error: 'unavailable' } }));
  await page.goto('/1/orders/deliveries');
  await expect(page.getByText('21 Rue de démonstration', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Réessayer', exact: true })).toBeVisible();
});

test('a city selection is retained once and can be saved as the final destination', async ({ page }) => {
  const state = await install(page);
  state.routes = [route(1, [stop(2)])];
  let searches = 0;
  await page.route('**/api/v1/delivery/address-autocomplete**', async intercepted => {
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
  await openSettings(page);
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
  await openSettings(page);
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
  await page.getByRole('button', { name: /^À affecter/ }).click();
  await page.getByRole('checkbox', { name: 'Tout sélectionner', exact: true }).check();
  await page.getByRole('button', { name: 'Répartir entre les livreurs', exact: true }).first().click();
  await expect(page.getByRole('group', { name: 'Livreur démo', exact: true }).getByRole('combobox', { name: 'Destination finale' })).toHaveValue('Destination déjà enregistrée');
});


test('dispatcher identifies missing and stale GPS and moves the courier without recalculating the route', async ({ page }) => {
  const state = await install(page);
  state.routes[0].status = 'active';
  await page.goto('/1/orders/deliveries');
  await openMap(page);
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

test('dispatcher pins an unassigned delivery and inserts it before a saved stop', async ({ page }, info) => {
  const state = await install(page);
  state.routes = [route(1, [stop(1), stop(2)])];
  const order = { id: 2009, restaurant_id: 1, order_type: 'delivery', status: 'accepted', customer_name: 'Client test',
    delivery_address: '12 rue Démo', delivery_city: 'תל אביב-יפו', scheduled_for: day };
  state.candidates = [order];
  await page.route('**/api/v1/orders/2009?**', request => request.fulfill({ json: { order } }));
  let correction: any;
  await page.route('**/api/v1/orders/2009/customer-details?**', request => {
    correction = request.request().postDataJSON();
    return request.fulfill({ json: { order: { ...order, ...correction } } });
  });
  const geocodes: string[] = [];
  page.on('request', request => { if (request.url().includes('/public/geocode?')) geocodes.push(request.url()); });
  await page.goto('/1/orders/deliveries');
  await page.getByRole('button', { name: /^À affecter/ }).click();
  await page.getByRole('button', { name: 'Corriger l’adresse #2009' }).click();
  const editor = page.getByRole('dialog', { name: 'Modifier le client' });
  await editor.getByRole('button', { name: 'Saisir l’adresse manuellement' }).click();
  const point = editor.getByRole('textbox', { name: /Point GPS/ });
  await point.fill('500, 34');
  await expect(editor.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  await point.fill('32.08, 34.78');
  await expect(editor.getByRole('link', { name: 'Vérifier ce point dans Google Maps' })).toHaveAttribute('href', /query=32.08%2C34.78/);
  await page.screenshot({ path: info.outputPath('confirmed-delivery-point.png'), animations: 'disabled' });
  await editor.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(editor).toHaveCount(0);
  expect(correction).toMatchObject({ delivery_pin_confirmed: true, delivery_latitude: 32.08, delivery_longitude: 34.78, delivery_city: 'תל אביב-יפו' });
  expect(geocodes).toEqual([]);
  await page.getByRole('button', { name: 'Ajouter à une tournée' }).click();
  const insert = page.getByRole('dialog', { name: 'Ajouter à une tournée' });
  await insert.getByRole('combobox', { name: 'Position de l’arrêt' }).selectOption('1');
  const sequence = page.getByRole('region', { name: 'Ordre des arrêts après insertion' });
  await expect(sequence.getByRole('listitem')).toHaveCount(3);
  await expect(sequence.getByText('Nouvel arrêt')).toBeVisible();
  await page.screenshot({ path: info.outputPath('insert-planned-delivery.png'), animations: 'disabled' });
  await page.route('**/api/v1/delivery/routes/1/insert-stop?**', request => {
    expect(request.request().headers()['x-restaurant-id']).toBe('1');
    expect(request.request().postDataJSON()).toEqual({ order_id: 2009, before_stop_id: 2 });
    state.routes[0].stops.splice(1, 0, { ...stop(9), order_id: 2009, sequence: 2 });
    state.candidates = [];
    return request.fulfill({ json: { route: state.routes[0] } });
  });
  await insert.getByRole('button', { name: 'Ajouter la livraison' }).click();
  await expect(page.getByRole('status').filter({ hasText: '2009' })).toContainText('tournée nº 1');
  expect(state.writes).toEqual([]);
});

test('a manager can undo a departure when only navigation was opened', async ({ page }) => {
  const state = await install(page);
  const pending = { ...stop(1), navigation_started_at: day + 'T09:00:00Z' };
  state.routes = [route(1, [pending, stop(2)], 'active')];
  await page.goto('/1/orders/deliveries');
  await page.getByRole('button', { name: 'Annuler le départ', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirmer' }).click();
  await expect.poll(() => state.writes.map(write => write.path)).toEqual(['/api/v1/delivery/routes/1/reset-departure']);
});

test('dispatch opens today with an old active route and links to the next planned day', async ({ page }) => {
  const state = await install(page);
  state.routes = [
    { ...route(1, [stop(1)], 'active'), date: '2026-08-21' },
    { ...route(2, [stop(2)]), date: '2026-10-16' },
  ];
  await page.goto('/1/orders/deliveries');
  const date = page.getByLabel('Date des tournées', { exact: true });
  await expect(page.getByRole('button', { name: /Prochain jour planifié/ })).toBeVisible();
  await expect(date).toHaveValue(day);
  expect(state.reads.some(read => read.date === '2026-08-21')).toBe(false);
  await page.getByRole('button', { name: /Prochain jour planifié/ }).click();
  await expect(date).toHaveValue('2026-10-16');
  await expect(page).toHaveURL(/date=2026-10-16/);
  await page.reload();
  await expect(date).toHaveValue('2026-10-16');
  await page.getByRole('button', { name: "Aujourd'hui" }).click();
  await expect(date).toHaveValue(day);
  expect(state.writes).toEqual([]);
});

test('a manager reviews the exact mistaken report before restoring all stops', async ({ page }) => {
  const state = await install(page);
  const started = day + 'T09:00:00Z', reported = day + 'T09:04:00Z';
  const skipped: RouteStop = { ...stop(1, 'skipped'), issue_reason: 'other', issue_review_at: reported };
  state.routes = [{ ...route(1, [skipped, stop(2)], 'active'), started_at: started }];
  let attempts = 0;
  await page.route('**/api/v1/delivery/routes/1/reset-departure?**', request => {
    expect(request.request().postDataJSON()).toEqual({ started_at: started, issues: [{ stop_id: 1, reason: 'other', reported_at: reported }] });
    attempts++;
    state.routes = [route(1, [stop(1), stop(2)])];
    return request.fulfill({ json: { route: state.routes[0] } });
  });
  await page.goto('/1/orders/deliveries');
  const reset = page.getByRole('button', { name: 'Annuler le départ', exact: true });
  await reset.click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('#1001');
  await expect(dialog).toContainText('Autre problème');
  await dialog.getByRole('button', { name: 'Annuler', exact: true }).click();
  expect(attempts).toBe(0);
  await reset.click();
  await dialog.getByRole('button', { name: 'Corriger les signalements et annuler le départ' }).click();
  await expect(page.getByText('Départ annulé. Le livreur et l’ordre des arrêts sont conservés.')).toBeVisible();
  await expect(reset).toHaveCount(0);
  expect(attempts).toBe(1);
});

test('bilingual dispatch filters retain selections and change service days independently of search', async ({ page }, info) => {
  const state = await install(page);
  await demoTiles(page);
  state.routes[0] = route(1, [
    stop(1), { ...stop(2), lat: 32.062, lng: 34.772 }, { ...stop(3), lat: 32.095, lng: 34.805 },
  ]);
  state.routes[1] = route(2, [stop(4, 'delivered')], 'completed');
  state.candidates = ['תל אביב-יפו', 'Haïfa'].map((city, index) => ({
    id: 2040 + index, restaurant_id: 1, order_type: 'delivery', status: 'in_kitchen',
    customer_name: ['Isa Démo', 'Léa Démo'][index], delivery_address: '10 Rue exemple', delivery_city: city,
  }));
  await page.goto('/1/orders/deliveries');
  const queue = page.getByRole('searchbox', { name: /Rechercher une commande/ });
  const routes = page.getByRole('searchbox', { name: /Rechercher un livreur/ });
  const select = page.getByRole('checkbox', { name: 'Tout sélectionner', exact: true });
  await expect(page.locator('tbody tr[data-stop-id="2"]')).toBeVisible();
  await page.screenshot({ path: info.outputPath('delivery-dispatch-workspace-fr.png'), animations: 'disabled' });
  await page.getByRole('button', { name: /^À affecter/ }).click();
  await expect(page.getByText('Léa Démo', { exact: true })).toBeVisible();
  await queue.fill('Tel-Aviv Yafo');
  await expect(page.getByText('Isa Démo', { exact: true })).toBeVisible();
  await expect(page.getByText('Léa Démo', { exact: true })).toHaveCount(0);
  await expect(select).toBeChecked();
  await select.click();
  await expect(select).not.toBeChecked();
  await page.getByRole('button', { name: 'Actualiser', exact: true }).click();
  await expect(select).not.toBeChecked();
  await queue.fill('חיפה');
  await expect(select).toBeChecked();
  await expect(page.getByText('Léa Démo', { exact: true })).toBeVisible();
  await queue.fill('Isa');
  await expect(select).not.toBeChecked();
  await page.getByRole('button', { name: /^Tournée 3$/ }).click();
  await routes.fill('1003');
  await expect(page.locator('tbody tr[data-stop-id="3"]')).toBeVisible();
  await expect(page.locator('tbody tr[data-stop-id="2"]')).toHaveCount(0);
  await routes.fill('aucun arrêt');
  await page.getByRole('button', { name: 'Effacer les filtres' }).click();
  await expect(page.locator('tbody tr[data-stop-id="2"]')).toBeVisible();
  await page.getByRole('button', { name: 'Jour suivant' }).click();
  await expect(page.getByLabel('Date des tournées', { exact: true })).toHaveValue('2026-10-13');
  await page.getByRole('button', { name: 'Jour précédent' }).click();
  await expect(page.getByLabel('Date des tournées', { exact: true })).toHaveValue(day);
  expect(state.writes).toEqual([]);
});


test('dispatch workspace isolates a missing entrance and preserves all stops when adding after a stop', async ({ page }, info) => {
  const state = await install(page);
  const stops = Array.from({ length: 21 }, (_, index) => stop(index + 1));
  stops[20] = { ...stops[20], address: 'רחוב הדגמה 6', city: 'נתניה', needs_geocode: true, lat: null, lng: null };
  state.routes = [{ ...route(1, stops), route_geometry: [] }];
  state.candidates = [{ id: 2900, order_type: 'delivery', status: 'in_kitchen', customer_name: 'Client test', delivery_address: '12 Rue test', delivery_city: 'Netanya', restaurant_id: 1 }];
  await page.setViewportSize({ width: 1280, height: 850 });
  await page.goto('/1/orders/deliveries');
  const routeFilter = page.getByRole('button', { name: /^Tournée 21$/ });
  await expect(routeFilter).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.foody-stop-pin')).toHaveCount(20);
  await page.getByRole('button', { name: 'Adresses à préciser 1' }).click();
  await expect(page.locator('tbody tr[data-stop-id]')).toHaveCount(1);
  await expect(page.locator('.foody-stop-pin')).toHaveCount(0);
  await page.getByRole('button', { name: 'Masquer la carte' }).click();
  await page.getByRole('button', { name: /רחוב הדגמה 6/ }).click();
  const detail = page.getByRole('region', { name: 'Détail de l’arrêt' });
  await expect(detail).toContainText('#1021');
  await expect(detail).toContainText('Adresse enregistrée · entrée à préciser');
  await expect(detail.getByRole('button', { name: 'Corriger l’adresse' })).toBeVisible();
  await detail.getByRole('button', { name: 'Fermer' }).click();
  await routeFilter.click();
  await page.getByRole('button', { name: 'Carte', exact: true }).click();
  await page.getByRole('searchbox').last().fill('1004');
  await expect(page.locator('tbody tr[data-stop-id]')).toHaveCount(1);
  const marker = page.locator('.foody-stop-pin');
  await expect(marker).toHaveCount(1);
  await marker.click();
  await expect(detail).toContainText('#1004');
  await expect(page.locator('tr[data-stop-id="4"] button')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.foody-selected-pin')).toHaveCount(1);
  await page.screenshot({ path: info.outputPath('dispatch-linked-map.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Ajouter une livraison', exact: true }).click();
  const insert = page.getByRole('dialog', { name: 'Ajouter à une tournée' });
  await insert.getByLabel('Position de l’arrêt').selectOption('4');
  const preview = insert.getByRole('region', { name: 'Ordre des arrêts après insertion' });
  await expect(preview.getByRole('listitem')).toHaveText([/1004/, /2900/, /1005/]);
  await page.route('**/api/v1/delivery/routes/1/insert-stop?**', async intercepted => {
    expect(intercepted.request().postDataJSON()).toEqual({ order_id: 2900, before_stop_id: 5 });
    expect(intercepted.request().headers()['x-restaurant-id']).toBe('1');
    const updated = [...stops.slice(0, 4), { ...stop(90), order_id: 2900 }, ...stops.slice(4)];
    state.routes[0] = { ...state.routes[0], stops: updated.map((s, index) => ({ ...s, sequence: index + 1 })), needs_recalculation: true, calculation_pending: true };
    state.candidates = [];
    await intercepted.fulfill({ json: { route: state.routes[0] } });
  });
  await insert.getByRole('button', { name: 'Ajouter la livraison' }).click();
  await expect(page.getByRole('button', { name: 'Tournée 22', exact: true })).toBeVisible();
  await expect(page.locator('tbody tr[data-stop-id]')).toHaveCount(22);
  const ids = await page.locator('tbody tr[data-stop-id]').evaluateAll(rows => rows.map(row => Number(row.getAttribute('data-stop-id'))));
  expect(ids.filter(id => id !== 90)).toEqual(stops.map(stop => stop.id));
  expect(ids.slice(3, 6)).toEqual([4, 90, 5]);
  expect(state.writes).toEqual([]);
});

test('desktop dispatch shares the Admin sidebar and keeps the table beside the map', async ({ page }, info) => {
  const state = await install(page);
  await demoTiles(page);
  await page.setViewportSize({ width: 1440, height: 812 });
  const friday = '2026-11-20';
  await page.clock.setSystemTime(new Date(friday + 'T08:00:00+02:00'));
  const streets = ['Rue des Oliviers', 'Rue des Cyprès', 'Allée du Jardin', 'רחוב הזית', 'Passage du Marché'];
  const stops = Array.from({ length: 21 }, (_, i) => ({
    ...stop(i + 1), address: streets[i % streets.length] + ' ' + (i + 2), city: i < 10 ? 'Tel Aviv' : 'Herzliya',
    lat: 32.055 + Math.floor(i / 4) * .018 + (i % 4) * .0009,
    lng: 34.779 + (Math.floor(i / 4) % 2 ? 3 - i % 4 : i % 4) * .013 + Math.floor(i / 4) * .004,
  }));
  const last = { ...stops[20], address: 'Allée des Jasmins 6', city: 'Netanya', needs_geocode: true, lat: null, lng: null };
  state.routes = [{ ...route(1, [...stops.slice(0, 20), last]), date: friday, timezone: 'Asia/Jerusalem',
    planned_departure_at: friday + 'T09:00:00+02:00', customer_window_minutes: 30,
    route_geometry: stops.slice(0, 20).map((s, i) => {
      const prev = stops[Math.max(i - 1, 0)];
      return { order_id: s.order_id, path: [[prev.lat, prev.lng], [s.lat, prev.lng], [s.lat, s.lng]] };
    }),
  }];
  state.candidates = [{ id: 2900, restaurant_id: 1, order_type: 'delivery', status: 'in_kitchen', customer_name: 'Client test', delivery_address: '12 Rue test', delivery_city: 'Netanya', scheduled_for: friday }];
  await page.goto('/1/orders/deliveries?date=' + friday);
  const map = page.getByRole('complementary', { name: 'Carte et détail de l’arrêt' });
  const panel = page.getByRole('region', { name: 'Tournées des livreurs', exact: true });
  const footer = panel.getByText('21 livraisons affichées');
  const detail = map.getByRole('region', { name: 'Détail de l’arrêt' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Répartition des livraisons');
  await expect(page.getByRole('button', { name: 'Tournée 21', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(map.getByText('20 points', { exact: true })).toBeVisible();
  await expect(detail.getByRole('heading')).toHaveText('Allée des Jasmins 6, Netanya');
  await expect(panel.getByRole('columnheader')).toHaveText(['Arrêt', 'Client', 'Adresse', 'Créneau']);
  const cells = panel.locator('tr[data-stop-id="1"]').getByRole('cell');
  await expect(cells.nth(0)).toHaveText('1');
  await expect(cells.nth(1)).toContainText(stops[0].customer_name);
  await expect(cells.nth(1)).toContainText('#1001');
  await expect(cells.nth(2)).toContainText(stops[0].address);
  await expect(cells.nth(3)).toContainText(/\d{2}:\d{2}/);
  await expect(footer).toBeVisible();
  await expect(map.locator('.foody-stop-pin')).toHaveCount(20);
  await expect.poll(() => map.locator('.leaflet-tile-loaded').count()).toBeGreaterThan(0);
  await expect(map.locator('.leaflet-control-attribution')).toContainText('Synthetic map data');
  const sidebar = page.getByRole('navigation', { name: 'Navigation principale', exact: true });
  await expect(sidebar.getByRole('link', { name: 'Livraisons', exact: true })).toHaveAttribute('aria-current', 'page');
  const left = (await panel.boundingBox())!, right = (await map.boundingBox())!;
  const rail = (await sidebar.boundingBox())!;
  expect(left.x).toBeGreaterThanOrEqual(rail.x + rail.width);
  expect(left.x + left.width).toBeLessThan(right.x);
  expect(Math.abs(left.y - right.y)).toBeLessThan(2);
  expect(left.width / right.width).toBeCloseTo(1.6, 1);
  expect(Math.abs(left.height - right.height)).toBeLessThan(2);
  expect((await footer.boundingBox())!.y).toBeLessThan(812);
  const search = panel.getByRole('searchbox');
  await expect(search).toBeVisible();
  const active = page.getByRole('button', { name: 'Ajouter une livraison', exact: true });
  const buttonColor = await active.evaluate(el => getComputedStyle(el).backgroundColor);
  const actionColor = await active.evaluate(el => getComputedStyle(el).getPropertyValue('--action').trim());
  expect(buttonColor).toBe('rgb(23, 23, 23)');
  expect(actionColor).toBe('#171717');
  await page.screenshot({ path: info.outputPath('dispatch-foody-desktop.png'), animations: 'disabled' });
  await search.fill('no such street');
  await expect(panel.getByText('Aucun résultat')).toBeVisible();
  await expect(search).toBeFocused();
  await search.fill('1002');
  await expect(panel.locator('tbody tr')).toHaveCount(1);
  await panel.locator('tbody button').click();
  await expect(detail).toContainText('#1002');
  await panel.getByRole('button', { name: 'Masquer la carte' }).click();
  await expect(page.getByRole('region', { name: 'Détail de l’arrêt' })).toContainText('#1002');
  await sidebar.getByRole('link', { name: 'Accueil', exact: true }).click();
  await expect(page).toHaveURL(/\/1\/dashboard$/);
  await page.goBack();
  await expect(page).toHaveURL('/1/orders/deliveries?date=' + friday);
  await expect(panel).toBeVisible();
  expect(state.writes).toEqual([]);
});

test('archive spans all dates, loads older routes and filters former couriers', async ({ page }) => {
  const state = await install(page);
  state.routes = [
    ...Array.from({ length: 26 }, (_, index) => ({ ...route(100 + index, [stop(200 + index)]), courier_id: 1, date: '2026-10-09' })),
    { ...route(7, [stop(7), stop(8)]), courier_id: 2, date: '2025-03-07' },
    { ...route(9, [stop(9)]), date: '2026-11-06' },
  ];
  await page.goto('/1/orders/deliveries?date=2020-01-01&view=history');
  await expect(page.getByLabel('Date des tournées', { exact: true })).toHaveCount(0);
  const client = page.getByRole('combobox', { name: 'Livreur', exact: true });
  await expect(client).toBeVisible();
  await expect(page.getByRole('button', { name: /Livreur démo.*#125/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /#7 ·/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Afficher les tournées plus anciennes' }).click();
  await expect(page.getByRole('button', { name: /Livreuse démo.*#7/ })).toBeVisible();
  await client.selectOption('2');
  await expect(page.getByRole('button', { name: /#125 ·/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Livreuse démo.*#7/ }).click();
  await expect(page.locator('tr[data-stop-id="8"]')).toBeVisible();
  await expect(page.getByText('Départ à confirmer', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retour à l’historique' }).click();
  await expect(client).toHaveValue('2');
  expect(state.writes).toHaveLength(0);
});

test('switching routes replaces the stops above the fold and keeps separate runs for one courier', async ({ page }) => {
  const state = await install(page);
  state.routes = [
    { ...route(8, Array.from({ length: 21 }, (_, i) => stop(i + 1))), courier_id: 1 },
    { ...route(9, [stop(28)]), courier_id: 2 },
    { ...route(10, [stop(35)]), courier_id: 2 },
  ];
  await page.goto('/1/orders/deliveries');
  const picker = page.getByRole('navigation', { name: 'Choisir une tournée' });
  const third = picker.getByRole('button', { name: /Livreuse démo · Tournée 3/ });
  await expect(third).toBeInViewport();
  await third.click();
  await expect(page.locator('tr[data-stop-id="35"]')).toBeInViewport();
  await expect(page.locator('tr[data-stop-id="1"]')).toHaveCount(0);
  await picker.getByRole('button', { name: /Livreuse démo · Tournée 2/ }).click();
  await expect(page.locator('tr[data-stop-id="28"]')).toBeInViewport();
  await picker.getByRole('button', { name: 'Toutes les tournées' }).click();
  await expect(page.locator('tr[data-stop-id="1"]')).toBeInViewport();
  expect(state.writes).toHaveLength(0);
});
