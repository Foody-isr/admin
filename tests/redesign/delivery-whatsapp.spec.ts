import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';
import { createFixture } from './fixtures.mjs';
import type { DeliveryRoute } from '../../src/lib/delivery';
import type { OrderWhatsAppPreview } from '../../src/lib/api';

const day = '2026-10-23';
const route = (id: number, orders: number[]): DeliveryRoute => ({
  id, restaurant_id: 1, courier_id: id, date: day, status: 'draft', routing_provider: 'geoapify',
  planned_departure_at: `${day}T08:00:00+03:00`, total_distance_m: 1000, est_duration_s: 1800,
  customer_window_minutes: 90,
  stops: orders.map((orderId, index) => ({ id: orderId, order_id: orderId, sequence: index + 1, status: 'pending', customer_name: `Client démo ${orderId}`, customer_phone: '+12025550123', address: '1 Rue de démonstration', city: 'Ville démo', distance_from_prev_m: 500, eta_seconds: 1800, total_amount: 100, needs_geocode: false, lat: 32.1, lng: 34.1 })),
});
const preview = (id: number): OrderWhatsAppPreview => ({ id: `preview-${id}`, kind: 'delivery_reminder', status: 'ready', provider: 'meta', from: '+12025550124', recipient: '+12025550123', language: 'fr', message: `Bonjour Client démo ${id}, livraison demain entre 08H30 et 10H00. Livreur démo : +12025550125.` });

async function install(page: Page, locale = 'fr') {
  const fixture = createFixture();
  const state = { routes: [route(1, [1001, 1002]), route(2, [1003])], previews: {} as Record<number, OrderWhatsAppPreview>, previewWrites: [] as number[], sends: [] as { id: number; body: unknown; rid?: string }[], failPreview: new Set<number>(), failSend: new Set<number>(), changedSend: new Set<number>(), socket: undefined as WebSocketRoute | undefined, beforeSend: undefined as ((id: number) => Promise<void>) | undefined };
  await page.routeWebSocket(/\/ws\?/, socket => { state.socket = socket; });
  await page.clock.install({ time: new Date('2026-10-22T12:00:00+03:00') });
  await page.addInitScript(({ locale }) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'owner' }));
    localStorage.setItem('foody_restaurant_ids', '[1]');
    localStorage.setItem('foody-admin-locale', locale);
  }, { locale });
  await page.route('**/api/v1/**', async intercepted => {
    const request = intercepted.request(), url = new URL(request.url()), path = url.pathname;
    const rid = request.headers()['x-restaurant-id'];
    const message = path.match(/\/restaurants\/1\/whatsapp\/orders\/(\d+)\/(preview|send)$/);
    if (message) {
      const id = Number(message[1]);
      if (message[2] === 'preview') {
        state.previewWrites.push(id);
        expect(request.postDataJSON()).toEqual({ kind: 'delivery_reminder' });
        if (state.failPreview.has(id)) return intercepted.fulfill({ status: 422, json: { error: 'whatsapp_preview_unavailable' } });
        return intercepted.fulfill({ json: state.previews[id] ?? preview(id) });
      }
      state.sends.push({ id, body: request.postDataJSON(), rid });
      if (state.beforeSend) await state.beforeSend(id);
      if (state.changedSend.has(id)) return intercepted.fulfill({ status: 409, json: { error: 'whatsapp_preview_changed', details: { status: 'changed' } } });
      if (state.failSend.has(id)) { state.previews[id] = { ...preview(id), status: 'unknown', send_blocked_reason: 'already_attempted', previous_status: 'unknown' }; return intercepted.abort(); }
      state.previews[id] = { ...preview(id), status: 'accepted', send_blocked_reason: 'already_attempted', previous_status: 'accepted' };
      return intercepted.fulfill({ json: { status: 'accepted' } });
    }
    if (path === '/api/v1/delivery/routes') return intercepted.fulfill({ json: { routes: state.routes } });
    if (path === '/api/v1/orders') return intercepted.fulfill({ json: { orders: [], total: 0 } });
    if (/\/restaurants\/\d+\/staff$/.test(path)) return intercepted.fulfill({ json: { staff: [{ id: 1, full_name: 'Livreur démo 1', role: 'courier' }, { id: 2, full_name: 'Livreur démo 2', role: 'courier' }] } });
    if (path === '/api/v1/public/delivery/map-config') return intercepted.fulfill({ json: { provider: 'geoapify', tile_url: '/api/v1/public/delivery/map/light/{z}/{x}/{y}.png' } });
    if (path.includes('/public/delivery/map/')) return intercepted.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>' });
    const response = fixture.response(request.url(), request.method(), request.postDataJSON() ?? {}, Number(rid) || 1);
    return intercepted.fulfill({ status: response.status ?? 200, json: response.json ?? {} });
  });
  await page.route('**/*', intercepted => {
    const url = new URL(intercepted.request().url());
    if (['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/v1/')) return intercepted.fallback();
    return intercepted.abort();
  });
  return state;
}
async function open(page: Page) {
  await page.goto('/1/orders/deliveries');
  await page.getByLabel('Date des tournées', { exact: true }).fill(day);
  await page.getByRole('button', { name: 'Rappels WhatsApp', exact: true }).click();
  return page.getByRole('dialog', { name: 'Rappels WhatsApp', exact: true });
}

test('previews cover every courier on the selected date without sending and show actual server text', async ({ page }) => {
  const state = await install(page);
  const drawer = await open(page);
  await expect(drawer.getByText('À envoyer : 3 / 3', { exact: true })).toBeVisible();
  await expect(drawer.getByRole('textbox', { name: 'Aperçu du message pour Client démo 1001', exact: true })).toHaveValue(preview(1001).message);
  await expect(drawer.getByRole('textbox').first()).toHaveAttribute('readonly', '');
  await expect(drawer.getByRole('link', { name: 'Configurer l’envoi automatique dans Parcours de commande', exact: true })).toHaveAttribute('href', '/1/settings/orders/workflow');
  expect(Array.from(new Set(state.previewWrites)).sort()).toEqual([1001, 1002, 1003]);
  expect(state.sends).toEqual([]);
});

test('one confirmation sends ready clients across routes and excludes previous or unavailable attempts', async ({ page }) => {
  const state = await install(page);
  state.previews[1002] = { ...preview(1002), send_blocked_reason: 'already_attempted', previous_status: 'accepted' };
  state.failPreview.add(1003);
  const drawer = await open(page);
  await expect(drawer.getByText('À envoyer : 1 / 3', { exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'Envoyer 1 rappel', exact: true }).click();
  const confirmation = page.getByRole('alertdialog');
  await expect(confirmation).toContainText('Chaque client reçoit uniquement son propre rappel');
  expect(state.sends).toEqual([]);
  await confirmation.getByRole('button', { name: 'Envoyer 1 rappel', exact: true }).click();
  await expect(drawer.getByText('À envoyer : 0 / 3', { exact: true })).toBeVisible();
  expect(state.sends).toEqual([{ id: 1001, body: { preview_id: 'preview-1001' }, rid: '1' }]);
});

test('individual customer action prepares and sends only that customer', async ({ page }) => {
  const state = await install(page);
  state.routes = [route(1, [1001])];
  await page.goto('/1/orders/deliveries');
  await page.getByLabel('Date des tournées', { exact: true }).fill(day);
  await page.getByRole('button', { name: 'WhatsApp au client', exact: true }).first().click();
  const drawer = page.getByRole('dialog', { name: 'Rappels WhatsApp', exact: true });
  await expect(drawer.getByText('À envoyer : 1 / 1', { exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'Envoyer ce rappel', exact: true }).click();
  await expect(drawer.getByText('Demande d’envoi acceptée', { exact: true })).toBeVisible();
  expect(Array.from(new Set(state.previewWrites))).toEqual([1001]);
  expect(state.sends.map(row => row.id)).toEqual([1001]);
});

test('future preview stays readable before J1 and offers no sending', async ({ page }) => {
  const state = await install(page);
  state.routes = [route(1, [1001])];
  state.previews[1001] = { ...preview(1001), send_blocked_reason: 'not_due' };
  const drawer = await open(page);
  await expect(drawer.getByText('L’envoi ouvre la veille de la livraison', { exact: false })).toBeVisible();
  await expect(drawer.getByRole('textbox').first()).toHaveValue(preview(1001).message);
  await expect(drawer.getByRole('button', { name: 'Envoyer 0 rappels', exact: true })).toBeDisabled();
  expect(state.sends).toEqual([]);
});

test('a lost send response is not retried while the other clients are processed', async ({ page }) => {
  const state = await install(page);
  state.failSend.add(1001);
  const drawer = await open(page);
  await expect(drawer.getByText('À envoyer : 3 / 3', { exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'Envoyer 3 rappels', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Envoyer 3 rappels', exact: true }).click();
  await expect(drawer.getByText('À envoyer : 0 / 3', { exact: true })).toBeVisible();
  await expect(drawer.getByText('Statut à vérifier', { exact: true })).toBeVisible();
  expect(state.sends.map(row => row.id)).toEqual([1001, 1002, 1003]);
  await drawer.getByRole('button', { name: 'Actualiser les aperçus', exact: true }).click();
  await expect(drawer.getByText('À envoyer : 0 / 3', { exact: true })).toBeVisible();
  expect(state.sends.map(row => row.id)).toEqual([1001, 1002, 1003]);
});

test('a server-rejected stale preview stops the remaining batch until refreshed', async ({ page }) => {
  const state = await install(page);
  state.changedSend.add(1001);
  const drawer = await open(page);
  await expect(drawer.getByText('À envoyer : 3 / 3', { exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'Envoyer 3 rappels', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Envoyer 3 rappels', exact: true }).click();
  await expect(drawer.getByRole('alert').filter({ hasText: 'La tournée a changé' })).toBeVisible();
  expect(state.sends.map(row => row.id)).toEqual([1001]);
  await expect(drawer.getByRole('button', { name: 'Envoyer 3 rappels', exact: true })).toBeDisabled();
});

test('Hebrew mobile previews keep text direction and avoid horizontal overflow', async ({ page }, info) => {
  const state = await install(page, 'he');
  state.routes = [route(1, [1001])];
  state.previews[1001] = { ...preview(1001), language: 'he', message: 'שלום לקוח לדוגמה, המשלוח מחר בין 08:30 ל־10:00. השליח לדוגמה.' };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/1/orders/deliveries');
  await page.locator('input[type=date]').fill(day);
  await page.getByRole('button', { name: 'תזכורות WhatsApp', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'תזכורות WhatsApp', exact: true });
  await expect(drawer.getByRole('textbox').first()).toHaveAttribute('dir', 'rtl');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('delivery-whatsapp-he-mobile.png'), animations: 'disabled' });
  expect(state.sends).toEqual([]);
});


test('live route recalculation invalidates previews before another send', async ({ page }) => {
 const state=await install(page);
 const drawer=await open(page);
 await expect(drawer.getByText('À envoyer : 3 / 3',{exact:true})).toBeVisible();
 state.routes[0].stops[0].eta_seconds+=900;
 state.previews[1001]={...preview(1001),message:'Nouveau créneau de démonstration : 09H00 et 10H30.'};
 expect(state.socket).toBeDefined();
 state.socket!.send(JSON.stringify({type:'route.updated',payload:{id:1}}));
 await expect(drawer.getByRole('alert').filter({hasText:'La tournée a changé'})).toBeVisible();
 await expect(drawer.getByRole('button',{name:'Envoyer 3 rappels',exact:true})).toBeDisabled();
 await drawer.getByRole('button',{name:'Actualiser les aperçus',exact:true}).click();
 await expect(drawer.getByRole('textbox').first()).toHaveValue(state.previews[1001].message);
 expect(state.sends).toEqual([]);
});

test('a route change during submission stops the queued clients after the in-flight result', async ({ page }) => {
 const state=await install(page);
 let finish=()=>{};
 const held=new Promise<void>(resolve=>{finish=resolve});
 state.beforeSend=async id=>{if(id===1001)await held};
 const drawer=await open(page);
 await expect(drawer.getByText('À envoyer : 3 / 3',{exact:true})).toBeVisible();
 await drawer.getByRole('button',{name:'Envoyer 3 rappels',exact:true}).click();
 await page.getByRole('alertdialog').getByRole('button',{name:'Envoyer 3 rappels',exact:true}).click();
 await expect.poll(()=>state.sends.length).toBe(1);
 state.routes[0].stops[0].eta_seconds+=900;
 state.socket!.send(JSON.stringify({type:'route.updated',payload:{id:1}}));
 await expect(drawer.getByRole('alert').filter({hasText:'La tournée a changé'})).toBeVisible();
 finish();
 await expect(drawer.getByRole('button',{name:'Actualiser les aperçus',exact:true})).toBeEnabled();
 expect(state.sends.map(row=>row.id)).toEqual([1001]);
});
