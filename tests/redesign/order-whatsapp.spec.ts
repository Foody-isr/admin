import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

async function install(page: Page, lostResponse = false, meta = false, completed = false) {
  const fixture = createFixture({ empty: false });
  Object.assign(fixture.orders[0], { ...(completed ? { status: 'delivered', received_at: new Date().toISOString(), completed_at: new Date().toISOString() } : {}), order_type: 'delivery', customer_phone: '+972500000000', courier_name: 'Livreur démo', courier_phone: '+972500000001', scheduled_for: new Date(Date.now() + 86400000).toISOString(), scheduled_pickup_window_start: '10:45', scheduled_pickup_window_end: '12:15' });
  const writes: Array<{ path: string; body: unknown; restaurant?: string }> = [];
  const control = { status: 'ready', kind: 'order_recap' };
  await page.addInitScript(() => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'owner' }));
    localStorage.setItem('foody_restaurant_ids', '[1,2]');
    localStorage.setItem('foody-admin-locale', 'fr');
  });
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  await page.route('**/api/v1/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname, body = req.postDataJSON() ?? {}, restaurant = req.headers()['x-restaurant-id'];
    if (path === '/api/v1/order-workflows') return route.fulfill({ json: { workflows: [{ id: 1, order_type: 'delivery', template_source: 'simple', delivery_reminder_enabled: true, stages: [] }] } });
    if (path.includes('/whatsapp/orders/')) {
      if (req.method() === 'GET') return route.fulfill({ json: { id: '11111111-1111-4111-8111-111111111111', status: control.status, provider: meta ? 'meta' : 'twilio' } });
      writes.push({ path, body, restaurant });
      if (path.endsWith('/preview')) {
        control.kind = body.kind;
        return route.fulfill({ json: { id: '11111111-1111-4111-8111-111111111111', provider: meta ? 'meta' : 'twilio', kind: body.kind, status: control.status, language: 'fr', message: body.kind === 'delivery_reminder' ? 'Bonjour client démo, livraison demain de 10:45 à 12:15. Livreur démo au +972500000001.' : 'Confirmation approuvée de votre commande. Détail complet dans le reçu.', recipient: '+972500000000', from: '+972500000002' } });
      }
      control.status = 'accepted';
      return lostResponse ? route.fulfill({ status: 503, json: { error: 'synthetic lost response' } }) : route.fulfill({ json: { status: 'accepted' } });
    }
    const response = fixture.response(req.url(), req.method(), body, Number(restaurant) || 1);
    if (response.json && 'order' in response.json && response.json.order) response.json.order = { ...response.json.order, restaurant_id: Number(restaurant) || 1 };
    return route.fulfill({ status: response.status ?? 200, json: response.json ?? {} });
  });
  return { writes, control };
}

async function confirmation(page: Page, restaurant = 1) {
  await page.goto(`/${restaurant}/orders/1048`);
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Envoyer la confirmation', exact: true }).click();
  return page.getByRole('region', { name: 'Message WhatsApp automatique', exact: true });
}

test('review exact Twilio content and send only the scoped preview identity', async ({ page }, info) => {
  const state = await install(page);
  await page.setViewportSize({ width: 375, height: 1000 });
  const region = await confirmation(page, 2);
  await region.getByRole('button', { name: 'Préparer le message', exact: true }).click();
  await expect(region.getByRole('textbox')).toHaveAttribute('readonly', '');
  await expect(region.getByRole('textbox')).toHaveValue('Confirmation approuvée de votre commande. Détail complet dans le reçu.');
  await expect(page.getByRole('button', { name: 'Ouvrir WhatsApp', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('order-twilio-review-fr.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await region.getByRole('button', { name: 'Confirmer l’envoi', exact: true }).click();
  await expect(region.getByRole('status')).toContainText('Accepté par Twilio');
  await expect(region.getByRole('button', { name: 'Confirmer l’envoi', exact: true })).toHaveCount(0);
  expect(state.writes).toEqual([
    { path: '/api/v1/restaurants/2/whatsapp/orders/1048/preview', body: { kind: 'order_recap' }, restaurant: '2' },
    { path: '/api/v1/restaurants/2/whatsapp/orders/1048/send', body: { preview_id: '11111111-1111-4111-8111-111111111111' }, restaurant: '2' },
  ]);
});

test('lost send response refreshes evidence without retransmission', async ({ page }) => {
  const state = await install(page, true);
  const region = await confirmation(page);
  await region.getByRole('button', { name: 'Préparer le message', exact: true }).click();
  await region.getByRole('button', { name: 'Confirmer l’envoi', exact: true }).click();
  await expect(region.getByRole('alert')).toContainText('n’est pas confirmé');
  await expect(region.getByRole('button', { name: 'Confirmer l’envoi', exact: true })).toHaveCount(0);
  await region.getByRole('button', { name: 'Vérifier l’aperçu et le résultat', exact: true }).click();
  await expect(region.getByRole('status')).toContainText('Accepté par Twilio');
  expect(state.writes.filter(w => w.path.endsWith('/send'))).toHaveLength(1);
});

test('delivery action prepares its dedicated courier reminder', async ({ page }) => {
  const state = await install(page);
  await page.goto('/1/orders/1048');
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Envoyer les infos de livraison', exact: true }).click();
  const region = page.getByRole('region', { name: 'Message WhatsApp automatique', exact: true });
  await expect(region).toContainText('préparez et envoyez le rappel la veille de la livraison');
  await region.getByRole('button', { name: 'Préparer le message', exact: true }).click();
  await expect(region.getByRole('textbox')).toHaveValue(/Livreur démo/);
  expect(state.writes[0].body).toEqual({ kind: 'delivery_reminder' });
  expect(state.writes.filter(w => w.path.endsWith('/send'))).toHaveLength(0);
});

test('Meta delivery evidence is refreshed without another send', async ({ page }) => {
  const state = await install(page, false, true); const region = await confirmation(page);
  await region.getByRole('button', { name: 'Préparer le message', exact: true }).click();
  await expect(region).toContainText('Envoi via Meta direct');
  await region.getByRole('button', { name: 'Confirmer l’envoi', exact: true }).click();
  await expect(region.getByRole('status')).toContainText('Accepté par Meta. La réception n’est pas encore confirmée');
  state.control.status = 'delivered';
  await region.getByRole('button', { name: 'Actualiser le suivi de livraison', exact: true }).click();
  await expect(region.getByRole('status')).toContainText('Livré sur le WhatsApp du destinataire');
  state.control.status = 'read';
  await region.getByRole('button', { name: 'Actualiser le suivi de livraison', exact: true }).click();
  await expect(region.getByRole('status')).toContainText('Marqué comme lu');
  expect(state.writes.filter(row => row.path.endsWith('/send'))).toHaveLength(1);
});


test('completed order exposes satisfaction review and sends only a scoped preview', async ({ page }) => {
  const state = await install(page, false, true, true);
  await page.goto('/2/orders/1048');
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Envoyer le message de satisfaction', exact: true }).click();
  const region = page.getByRole('region', { name: 'Satisfaction après commande', exact: true });
  await region.getByRole('button', { name: 'Préparer le message', exact: true }).click();
  expect(state.writes[0]).toEqual({ path: '/api/v1/restaurants/2/whatsapp/orders/1048/preview', body: { kind: 'satisfaction' }, restaurant: '2' });
  await region.getByRole('button', { name: 'Confirmer l’envoi', exact: true }).click();
  await expect(region.getByRole('status')).toContainText('Accepté par Meta');
  expect(state.writes.filter(write => write.path.endsWith('/send'))).toHaveLength(1);
});
