import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';
import type { BlockedOrderWhatsAppAutomation, OrderWhatsAppHistoryEntry } from '../../src/lib/api';

async function install(page: Page, lostResponse = false, meta = false, completed = false, options: { pending?: boolean; readOnly?: boolean; locale?: string } = {}) {
  const fixture = createFixture({ empty: false, ...(options.readOnly ? { permissions: ['orders.view'] } : {}) });
  Object.assign(fixture.orders[0], { ...(completed ? { status: 'delivered', received_at: new Date().toISOString(), completed_at: new Date().toISOString() } : {}), order_type: 'delivery', customer_phone: '+972500000000', courier_name: 'Livreur démo', courier_phone: '+972500000001', scheduled_for: new Date(Date.now() + 86400000).toISOString(), scheduled_pickup_window_start: '10:45', scheduled_pickup_window_end: '12:15' });
  const writes: Array<{ path: string; body: unknown; restaurant?: string }> = [];
  if (options.pending) fixture.orders[0].status = 'pending_review';
  const control = { status: 'ready', kind: 'order_recap', history: [] as OrderWhatsAppHistoryEntry[], blocked: [] as BlockedOrderWhatsAppAutomation[], blockedTotal: 0, historyError: false, nextCursor: '', older: [] as OrderWhatsAppHistoryEntry[], reads: [] as string[] };
  await page.addInitScript(locale => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'owner' }));
    localStorage.setItem('foody_restaurant_ids', '[1,2]');
    localStorage.setItem('foody-admin-locale', locale);
  }, options.locale ?? 'fr');
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  await page.route('**/api/v1/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname, body = req.postDataJSON() ?? {}, restaurant = req.headers()['x-restaurant-id'];
    if (path === '/api/v1/order-workflows') return route.fulfill({ json: { workflows: [{ id: 1, order_type: 'delivery', template_source: 'simple', delivery_reminder_enabled: true, stages: [] }] } });
    if (path === '/api/v1/orders/1048/accept') {
      writes.push({ path, body, restaurant });
      fixture.orders[0].status = 'accepted';
      return route.fulfill({ json: { order: { ...fixture.orders[0], restaurant_id: Number(restaurant) }, follow_up: { whatsapp_recap: true } } });
    }
    if (path.includes('/whatsapp/orders/')) {
      if (req.method() === 'GET' && path.endsWith('/messages')) {
        control.reads.push(`${path}:${restaurant}`);
        return control.historyError ? route.fulfill({ status: 503, json: { error: 'synthetic unavailable' } }) : route.fulfill({ json: { messages: new URL(req.url()).searchParams.has('before') ? control.older : control.history, next_cursor: new URL(req.url()).searchParams.has('before') ? '' : control.nextCursor, blocked_automations: control.blocked, blocked_automations_total: control.blockedTotal } });
      }
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

const historyEntry = (id: string, status: OrderWhatsAppHistoryEntry['status'], kind = 'order_recap', provider: 'meta' | 'twilio' = 'meta'): OrderWhatsAppHistoryEntry => ({
  id, kind, status, provider, updated_at: '2026-10-15T09:05:00Z', ...(provider === 'meta' && ['delivered', 'read', 'failed'].includes(status) ? { status_at: '2026-10-15T09:04:00Z' } : {}),
});

async function history(page: Page, restaurant = 1, title = 'Messages au client') {
  await page.goto(`/${restaurant}/orders/1048`);
  await page.getByRole('button', { name: title, exact: true }).click();
  return page.getByRole('dialog', { name: title, exact: true });
}

test('acceptance does not open manual WhatsApp even when the server suggests a recap', async ({ page }) => {
  const state = await install(page, false, false, false, { pending: true });
  await page.goto('/1/orders/1048');
  await page.getByRole('button', { name: 'Accepter', exact: true }).click();
  await expect.poll(() => state.writes.filter(row => row.path.endsWith('/accept')).length).toBe(1);
  await expect(page.getByRole('button', { name: 'Accepter', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ouvrir WhatsApp', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Envoyer la confirmation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ouvrir WhatsApp', exact: true })).toBeVisible();
  expect(state.writes.filter(row => row.path.includes('/whatsapp/'))).toHaveLength(0);
});

test('order history shows genuine Meta delivery/read evidence and refreshes without sending', async ({ page }, info) => {
  const state = await install(page, false, true);
  state.control.history = [historyEntry('a', 'accepted'), historyEntry('b', 'failed', 'delivery_reminder'), historyEntry('c', 'unknown', 'satisfaction'), historyEntry('d', 'accepted', 'receipt', 'twilio')];
  state.control.history[1].failure_code = 131026;
  const drawer = await history(page, 2);
  await expect(drawer.getByRole('listitem')).toHaveCount(4);
  await expect(drawer).toContainText('La livraison n’est pas encore confirmée');
  await expect(drawer).toContainText('131026');
  await expect(drawer).toContainText('n’est pas disponible dans Foody');
  await expect(drawer.getByText('Lu', { exact: true })).toHaveCount(0);
  state.control.history[0] = historyEntry('a', 'delivered');
  await drawer.getByRole('button', { name: 'Actualiser les messages' }).click();
  await expect(drawer.getByText('Livré', { exact: true })).toBeVisible();
  state.control.history[0] = historyEntry('a', 'read');
  await drawer.getByRole('button', { name: 'Actualiser les messages' }).click();
  await expect(drawer.getByText('Lu', { exact: true })).toBeVisible();
  await expect(drawer).toContainText('Statut reçu le');
  await expect(drawer.getByRole('link', { name: 'Configurer les notifications' })).toHaveAttribute('href', '/2/settings/whatsapp');
  await page.screenshot({ path: info.outputPath('order-messages-desktop-fr.png'), animations: 'disabled' });
  expect(state.control.reads.every(path => path.startsWith('/api/v1/restaurants/2/whatsapp/orders/1048/messages:2'))).toBe(true);
  expect(state.writes).toHaveLength(0);
});

test('message history is readable with orders.view and distinguishes an outage from emptiness', async ({ page }) => {
  const state = await install(page, false, true, false, { readOnly: true });
  state.control.historyError = true;
  const drawer = await history(page);
  await expect(drawer.getByRole('alert')).toContainText('Impossible d’actualiser');
  await expect(drawer).not.toContainText('Aucun message suivi');
  await expect(drawer.getByRole('link', { name: 'Configurer les notifications' })).toHaveCount(0);
  state.control.historyError = false;
  await drawer.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect(drawer).toContainText('Aucun message suivi pour le moment');
  await expect(drawer).toContainText('Les messages envoyés depuis l’application WhatsApp');
  expect(state.writes).toHaveLength(0);
});

test('history pagination preserves messages and a failed refresh does not erase evidence', async ({ page }) => {
  const state = await install(page);
  state.control.history = [historyEntry('recent', 'read')];
  state.control.nextCursor = 'recent';
  state.control.older = [historyEntry('older', 'sent', 'receipt')];
  const drawer = await history(page);
  await drawer.getByRole('button', { name: 'Voir les messages précédents' }).click();
  await expect(drawer.getByRole('listitem')).toHaveCount(2);
  await expect(drawer.getByRole('button', { name: 'Voir les messages précédents' })).toHaveCount(0);
  state.control.historyError = true;
  await drawer.getByRole('button', { name: 'Actualiser les messages' }).click();
  await expect(drawer.getByRole('alert')).toBeVisible();
  await expect(drawer.getByText('Lu', { exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(0);
});

test('mobile Hebrew history respects RTL and remains available from order Actions', async ({ page }, info) => {
  const state = await install(page, false, true, false, { locale: 'he' });
  state.control.history = [historyEntry('read', 'read')];
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/1/orders/1048');
  await page.getByRole('button', { name: 'פעולות', exact: true }).click();
  await page.getByRole('menuitem', { name: 'הודעות ללקוח', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'הודעות ללקוח', exact: true });
  await expect(drawer.getByText('נקראה', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('order-messages-mobile-he.png'), animations: 'disabled' });
  expect(state.writes).toHaveLength(0);
});

test('open history polls provider evidence and closing it stops polling without closing the order', async ({ page }) => {
  const state = await install(page, false, true);
  await page.clock.install();
  state.control.history = [historyEntry('a', 'delivered')];
  const drawer = await history(page);
  await expect(drawer.getByText('Livré', { exact: true })).toBeVisible();
  state.control.history[0] = historyEntry('a', 'read');
  await page.clock.fastForward(11000);
  await expect(drawer.getByText('Lu', { exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'Fermer', exact: true }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Messages au client', exact: true })).toBeVisible();
  const reads = state.control.reads.length;
  await page.clock.fastForward(30000);
  expect(state.control.reads).toHaveLength(reads);
  expect(state.writes).toHaveLength(0);
});

test('blocked stage notification explains missing variables without claiming a send or retrying', async ({ page }, info) => {
  const state = await install(page, false, true);
  state.control.history = [historyEntry('confirmation', 'read')];
  state.control.blocked = [{ id: 1, kind: 'delivery_reminder', template_name: 'delivery_fr', updated_at: '2026-10-15T19:50:00Z' }];
  state.control.blockedTotal = 1;
  const drawer = await history(page, 2);
  const blocked = drawer.getByRole('region', { name: 'Notifications non envoyées', exact: true });
  await expect(blocked.getByText('Non envoyé', { exact: true })).toBeVisible();
  await expect(blocked).toContainText('le nom et le téléphone du livreur');
  await expect(blocked).toContainText('ne seront pas relancées automatiquement');
  await expect(blocked).not.toContainText('Statut reçu le');
  await expect(blocked.getByRole('link', { name: 'Vérifier le parcours de commande' })).toHaveAttribute('href', '/2/settings/orders/workflow');
  await expect(drawer.getByText('Lu', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('order-blocked-workflow-fr.png'), animations: 'disabled' });
  state.control.historyError = true;
  await drawer.getByRole('button', { name: 'Actualiser les messages' }).click();
  await expect(drawer.getByRole('alert')).toBeVisible();
  await expect(blocked).toBeVisible();
  expect(state.writes).toHaveLength(0);
});

test('blocked history works on mobile RTL for read-only staff and refresh replaces its snapshot', async ({ page }, info) => {
  const state = await install(page, false, true, false, { locale: 'he', readOnly: true });
  state.control.blocked = [{ id: 1, kind: 'delivery_reminder', template_name: 'delivery_fr', updated_at: '2026-10-15T19:50:00Z' }];
  state.control.blockedTotal = 53;
  await page.setViewportSize({ width: 375, height: 900 });
  const drawer = await history(page, 1, 'הודעות ללקוח');
  await expect(drawer.getByText('לא נשלחה', { exact: true })).toBeVisible();
  await expect(drawer.getByRole('link')).toHaveCount(0);
  await expect(drawer).toContainText('מתוך 53');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('order-blocked-workflow-he.png'), animations: 'disabled' });
  state.control.blocked = []; state.control.blockedTotal = 0;
  await drawer.getByRole('button', { name: 'רענון הודעות' }).click();
  await expect(drawer.getByText('לא נשלחה', { exact: true })).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
});
