import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';
import type { BlockedOrderWhatsAppAutomation, OrderWhatsAppHistoryEntry } from '../../src/lib/api';

async function install(page: Page, lostResponse = false, meta = false, completed = false, options: { pending?: boolean; readOnly?: boolean; locale?: string } = {}) {
  const fixture = createFixture({ empty: false, ...(options.readOnly ? { permissions: ['orders.view'] } : {}) });
  Object.assign(fixture.orders[0], { ...(completed ? { status: 'delivered', received_at: new Date().toISOString(), completed_at: new Date().toISOString() } : {}), order_type: 'delivery', customer_phone: '+972500000000', courier_name: 'Livreur démo', courier_phone: '+972500000001', scheduled_for: new Date(Date.now() + 86400000).toISOString(), scheduled_pickup_window_start: '10:45', scheduled_pickup_window_end: '12:15' });
  const writes: Array<{ path: string; body: unknown; restaurant?: string }> = [];
  if (options.pending) fixture.orders[0].status = 'pending_review';
  const control = { status: 'ready', kind: 'order_recap', history: [] as OrderWhatsAppHistoryEntry[], blocked: [] as BlockedOrderWhatsAppAutomation[], blockedTotal: 0, historyError: false, unavailable: new Set<number>(), notDue: new Set<number>(), changed: new Set<number>(), nextCursor: '', older: [] as OrderWhatsAppHistoryEntry[], reads: [] as string[] };
  await page.addInitScript(locale => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'owner' }));
    localStorage.setItem('foody_restaurant_ids', '[1,2]');
    localStorage.setItem('foody-admin-locale', locale);
  }, options.locale ?? 'fr');
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  await page.route('**/api/v1/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname, body = req.postDataJSON() ?? {}, restaurant = req.headers()['x-restaurant-id'];
    if (path.endsWith('/message-templates')) return route.fulfill({ json: { templates: [] } });
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
      const orderId = Number(path.split('/').at(-2));
      if (path.endsWith('/send') && control.changed.has(orderId)) return route.fulfill({ status: 409, json: { error: 'whatsapp_preview_changed', details: { status: 'changed' } } });
      if (path.endsWith('/preview') && control.unavailable.has(orderId)) return route.fulfill({ status: 422, json: { error: 'whatsapp_preview_unavailable' } });
      if (path.endsWith('/preview')) {
        control.kind = body.kind;
        return route.fulfill({ json: { id: '11111111-1111-4111-8111-111111111111', provider: meta ? 'meta' : 'twilio', kind: body.kind, status: control.status, ...(control.notDue.has(orderId) ? { send_blocked_reason: 'not_due' } : {}), language: 'fr', message: body.kind === 'delivery_reminder' ? 'Bonjour client démo, livraison demain de 10:45 à 12:15. Livreur démo au +972500000001.' : 'Confirmation approuvée de votre commande. Détail complet dans le reçu.', recipient: '+972500000000', from: '+972500000002' } });
      }
      control.status = 'accepted';
      return lostResponse ? route.fulfill({ status: 503, json: { error: 'synthetic lost response' } }) : route.fulfill({ json: { status: 'accepted' } });
    }
    const response = fixture.response(req.url(), req.method(), body, Number(restaurant) || 1);
    if (response.json && 'order' in response.json && response.json.order) response.json.order = { ...response.json.order, restaurant_id: Number(restaurant) || 1 };
    return route.fulfill({ status: response.status ?? 200, json: response.json ?? {} });
  });
  return { writes, control, fixture };
}

async function confirmation(page: Page, restaurant = 1) {
  await page.goto(`/${restaurant}/orders/1048`);
  await page.getByRole('button', { name: 'Envoyer un message WhatsApp', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Message WhatsApp', exact: true });
  await expect(drawer.getByRole('textbox')).toBeVisible();
  return drawer;
}

test('reviews exact Twilio content and sends only the scoped preview identity', async ({ page }, info) => {
  const state = await install(page);
  await page.setViewportSize({ width: 375, height: 1000 });
  const drawer = await confirmation(page, 2);
  await expect(drawer.getByRole('textbox')).toHaveAttribute('readonly', '');
  await expect(drawer.getByRole('textbox')).toHaveValue('Confirmation approuvée de votre commande. Détail complet dans le reçu.');
  await page.screenshot({ path: info.outputPath('order-whatsapp-review-fr.png'), fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await drawer.getByRole('button', { name: 'Envoyer le message', exact: true }).click();
  await expect(drawer).toContainText('Twilio a accepté');
  await expect(drawer.getByRole('button', { name: 'Envoyer 0 messages', exact: true })).toBeDisabled();
  expect(state.writes).toEqual([
    { path: '/api/v1/restaurants/2/whatsapp/orders/1048/preview', body: { kind: 'order_recap' }, restaurant: '2' },
    { path: '/api/v1/restaurants/2/whatsapp/orders/1048/send', body: { preview_id: '11111111-1111-4111-8111-111111111111' }, restaurant: '2' },
  ]);
});

test('lost response refreshes the original dispatch without retransmission or a new preview', async ({ page }) => {
  const state = await install(page, true);
  const drawer = await confirmation(page);
  await drawer.getByRole('button', { name: 'Envoyer le message', exact: true }).click();
  await expect(drawer).toContainText('L’envoi n’est pas confirmé');
  await drawer.getByRole('button', { name: 'Actualiser', exact: true }).click();
  await expect(drawer).toContainText('Twilio a accepté');
  expect(state.writes.filter(w => w.path.endsWith('/send'))).toHaveLength(1);
  expect(state.writes.filter(w => w.path.endsWith('/preview'))).toHaveLength(1);
});

test('choosing delivery prepares the dedicated courier reminder without sending', async ({ page }) => {
  const state = await install(page);
  const drawer = await confirmation(page);
  await drawer.getByRole('radio', { name: 'Rappel de livraison', exact: true }).check();
  await expect(drawer.getByRole('textbox')).toHaveValue(/Livreur démo/);
  expect(state.writes.at(-1)?.body).toEqual({ kind: 'delivery_reminder' });
  expect(state.writes.filter(w => w.path.endsWith('/send'))).toHaveLength(0);
});

test('Meta evidence refreshes without another send', async ({ page }, info) => {
  const state = await install(page, false, true);
  const drawer = await confirmation(page);
  await expect(drawer).toContainText('Envoi via Meta direct');
  await page.screenshot({ path: info.outputPath('order-whatsapp-desktop-fr.png'), animations: 'disabled' });
  await drawer.getByRole('button', { name: 'Envoyer le message', exact: true }).click();
  await expect(drawer).toContainText('Meta a accepté');
  state.control.status = 'delivered';
  await drawer.getByRole('button', { name: 'Actualiser', exact: true }).click();
  await expect(drawer).toContainText('Livré sur le WhatsApp du destinataire');
  state.control.status = 'read';
  await drawer.getByRole('button', { name: 'Actualiser', exact: true }).click();
  await expect(drawer).toContainText('Marqué comme lu');
  expect(state.writes.filter(row => row.path.endsWith('/send'))).toHaveLength(1);
});

test('completed order exposes satisfaction in the same composer', async ({ page }) => {
  const state = await install(page, false, true, true);
  const drawer = await confirmation(page, 2);
  await drawer.getByRole('radio', { name: 'Satisfaction après commande', exact: true }).check();
  await expect.poll(() => state.writes.at(-1)?.body).toEqual({ kind: 'satisfaction' });
  await expect(drawer.getByRole('button', { name: 'Envoyer le message' })).toBeEnabled();
  await drawer.getByRole('button', { name: 'Envoyer le message' }).click();
  await expect(drawer).toContainText('Meta a accepté');
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

test('acceptance does not open the composer even when the server suggests a recap', async ({ page }) => {
  const state = await install(page, false, false, false, { pending: true });
  await page.goto('/1/orders/1048');
  await page.getByRole('button', { name: 'Accepter', exact: true }).click();
  await expect.poll(() => state.writes.filter(row => row.path.endsWith('/accept')).length).toBe(1);
  await expect(page.getByRole('dialog', { name: 'Message WhatsApp', exact: true })).toHaveCount(0);
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


test('bulk selection reviews each order and sends only ready recipients after confirmation', async ({ page }, info) => {
  const state = await install(page, false, true);
  state.control.unavailable.add(1049);
  state.control.notDue.add(1050);
  await page.goto('/1/orders/all');
  for (const id of [1048, 1049, 1050]) await page.getByRole('checkbox', { name: `Sélectionner la commande n°${id}`, exact: true }).check();
  await page.getByRole('button', { name: 'Envoyer un message WhatsApp', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Message WhatsApp', exact: true });
  await expect(drawer.getByRole('button', { name: 'Envoyer le message', exact: true })).toBeEnabled();
  await expect(drawer).toContainText('Prêts : 1/3');
  await page.screenshot({ path: info.outputPath('order-whatsapp-bulk-fr.png'), animations: 'disabled' });
  expect(state.writes.filter(row => row.path.endsWith('/send'))).toHaveLength(0);
  await drawer.getByRole('button', { name: 'Envoyer le message', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Envoyer le message', exact: true }).click();
  await expect(drawer).toContainText('Acceptés : 1');
  expect(state.writes.filter(row => row.path.endsWith('/send')).map(row => row.path)).toEqual(['/api/v1/restaurants/1/whatsapp/orders/1048/send']);
});

test('changed order stops the remaining bulk queue and requires another review', async ({ page }) => {
  const state = await install(page, false, true);
  state.control.changed.add(1049);
  await page.goto('/1/orders/all');
  for (const id of [1048, 1049, 1050]) await page.getByRole('checkbox', { name: `Sélectionner la commande n°${id}`, exact: true }).check();
  await page.getByRole('button', { name: 'Envoyer un message WhatsApp', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Message WhatsApp', exact: true });
  await expect(drawer).toContainText('Prêts : 3/3');
  await drawer.getByRole('button', { name: 'Envoyer 3 messages', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Envoyer 3 messages', exact: true }).click();
  await expect(drawer.getByRole('alert')).toContainText('Les envois restants sont arrêtés');
  expect(state.writes.filter(row => row.path.endsWith('/send')).map(row => row.path)).toEqual(['/api/v1/restaurants/1/whatsapp/orders/1048/send', '/api/v1/restaurants/1/whatsapp/orders/1049/send']);
  await expect(drawer.getByRole('button', { name: 'Envoyer le message' })).toBeDisabled();
});

test('app drafts require explicit discard and never call the Business send API', async ({ page }) => {
  const state = await install(page, false, true);
  const drawer = await confirmation(page);
  await drawer.getByRole('radio', { name: 'Application WhatsApp', exact: true }).check();
  await expect(drawer.getByRole('textbox')).not.toHaveAttribute('readonly', '');
  await drawer.getByRole('textbox').fill('Un mot personnel pour le client démo.');
  await drawer.getByRole('radio', { name: 'WhatsApp Business', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(drawer.getByRole('textbox')).toHaveValue('Un mot personnel pour le client démo.');
  await drawer.getByRole('button', { name: 'Fermer', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler', exact: true }).click();
  await page.evaluate(() => {
    window.open = () => ({ opener: null, location: { replace(url: string) { (window as unknown as { appHandoff: string }).appHandoff = url; } } }) as unknown as Window;
  });
  await drawer.getByRole('button', { name: 'Ouvrir WhatsApp', exact: true }).click();
  await expect(drawer).toContainText('Conversation ouverte');
  const handoff = await page.evaluate(() => (window as unknown as { appHandoff: string }).appHandoff);
  expect(new URL(handoff).pathname).toBe('/972500000000');
  expect(new URL(handoff).searchParams.get('text')).toBe('Un mot personnel pour le client démo.');
  expect(state.writes.filter(row => row.path.endsWith('/send'))).toHaveLength(0);
});

test('Hebrew composer fits mobile and uses native message selection', async ({ page }, info) => {
  await install(page, false, true, false, { locale: 'he' });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/1/orders/1048');
  await page.getByRole('button', { name: 'שליחת הודעת WhatsApp', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'הודעת WhatsApp', exact: true });
  await expect(drawer.getByRole('textbox')).toBeVisible();
  await expect(drawer.getByRole('combobox', { name: 'הודעה', exact: true })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'שליחת הודעה', exact: true })).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('order-whatsapp-mobile-he.png'), animations: 'disabled' });
});

test('orders.view cannot compose or select recipients', async ({ page }) => {
  const state = await install(page, false, true, false, { readOnly: true });
  await page.goto('/1/orders/1048');
  await expect(page.getByRole('button', { name: 'Messages au client', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Envoyer un message WhatsApp', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Envoyer un message WhatsApp', exact: true })).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
});


test('app drafts stay with their own recipient in a bulk review', async ({ page }) => {
  const state = await install(page, false, true);
  state.fixture.orders[1].customer_phone = '+972500000003';
  await page.goto('/1/orders/all');
  for (const id of [1048, 1049]) await page.getByRole('checkbox', { name: `Sélectionner la commande n°${id}`, exact: true }).check();
  await page.getByRole('button', { name: 'Envoyer un message WhatsApp', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Message WhatsApp', exact: true });
  await expect(drawer).toContainText('Prêts : 2/2');
  await drawer.getByRole('radio', { name: 'Application WhatsApp', exact: true }).check();
  await expect(drawer.getByRole('textbox')).toBeEditable();
  await drawer.getByRole('textbox').fill('Message pour la première commande.');
  const recipients = drawer.getByRole('group', { name: 'Destinataires', exact: true });
  await recipients.getByRole('button', { name: /#1049/ }).click();
  await expect(drawer.getByRole('textbox')).not.toHaveValue('Message pour la première commande.');
  await drawer.getByRole('textbox').fill('Message pour la deuxième commande.');
  await recipients.getByRole('button', { name: /#1048/ }).click();
  await expect(drawer.getByRole('textbox')).toHaveValue('Message pour la première commande.');
  expect(state.writes.filter(row => row.path.endsWith('/send'))).toHaveLength(0);
});

test('an uncertain dispatch is retained across message-type changes', async ({ page }) => {
  const state = await install(page, true, true);
  const drawer = await confirmation(page);
  await drawer.getByRole('button', { name: 'Envoyer le message', exact: true }).click();
  await expect(drawer).toContainText('L’envoi n’est pas confirmé');
  await drawer.getByRole('radio', { name: 'Rappel de livraison', exact: true }).check();
  await expect(drawer.getByRole('textbox')).toHaveValue(/Livreur démo/);
  await drawer.getByRole('radio', { name: 'Confirmation de commande', exact: true }).check();
  await expect(drawer).toContainText('Meta a accepté');
  expect(state.writes.filter(row => row.path.endsWith('/preview') && (row.body as { kind: string }).kind === 'order_recap')).toHaveLength(1);
  expect(state.writes.filter(row => row.path.endsWith('/send'))).toHaveLength(1);
});


test('English dark composer keeps message and send action accessible', async ({ page }, info) => {
  await install(page, false, true, false, { locale: 'en' });
  await page.goto('/1/orders/1048');
  await page.evaluate(() => { document.documentElement.classList.add('dark'); document.documentElement.dataset.theme = 'dark'; });
  await page.getByRole('button', { name: 'Send a WhatsApp message', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'WhatsApp message', exact: true });
  await expect(drawer.getByRole('textbox')).toHaveAttribute('readonly', '');
  await expect(drawer.getByRole('button', { name: 'Send message', exact: true })).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: info.outputPath('order-whatsapp-dark-en.png'), animations: 'disabled' });
});

test('Meta image attachment is displayed inline in the order message review', async ({page}) => {
 await install(page,false,true);
 let reads=0;
 await page.route('**/whatsapp/orders/1048/preview',route=>route.fulfill({json:{id:'11111111-1111-4111-8111-111111111111',provider:'meta',kind:'order_recap',status:'ready',language:'fr',message:'Confirmation approuvée avec image.',recipient:'+972500000000',from:'+972500000002',attachment:{source:'meta',template_id:'700',filename:'order_recap.png',mime_type:'image/png',format:'IMAGE'}}}));
 await page.route('**/whatsapp/meta/templates/700/image',route=>{reads++;expect(route.request().headers()['x-restaurant-id']).toBe('1');return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6t4AAAAAASUVORK5CYII=','base64')})});
 const drawer=await confirmation(page);await expect(drawer.getByRole('img',{name:'Image jointe au message WhatsApp'})).toBeVisible();expect(reads).toBeGreaterThan(0);
 await page.setViewportSize({width:375,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
