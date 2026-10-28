import { expect, test } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

for (const variant of [
  { locale: 'fr', width: 390, type: 'pickup', label: 'Confirmer la remise au client', description: 'Confirmer que cette commande a été remise au client ?' },
  { locale: 'he', width: 1024, type: 'dine_in', label: 'אישור הגשה', description: 'לאשר שהמנות בהזמנה זו הוגשו ללקוח?' },
  { locale: 'en', width: 1440, type: 'delivery', label: 'Confirm delivery', description: 'Confirm that this order has been delivered to the customer?' },
]) test(`handoff wording and endpoint preserve order identity · ${variant.locale}`, async ({ page }, info) => {
  const fixture = createFixture({ empty: false });
  const order = fixture.orders[0];
  Object.assign(order, { order_type: variant.type, status: 'in_kitchen', payment_status: 'paid', balance_due: 0 });
  const actions: string[] = [];
  await page.addInitScript(locale => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Synthetic', role: 'owner' }));
    localStorage.setItem('foody_restaurant_ids', '[1]');
    localStorage.setItem('foody-admin-locale', locale);
  }, variant.locale);
  await page.route('**/*', route => ['localhost', '127.0.0.1', 'square-fonts-production-f.squarecdn.com'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    if (request.method() === 'POST' && request.url().includes('/orders/1048/mark-')) actions.push(new URL(request.url()).pathname);
    const response = fixture.response(request.url(), request.method(), request.postDataJSON() ?? {}, Number(request.headers()['x-restaurant-id']) || 1);
    await route.fulfill({ status: response.status ?? 200, json: response.json ?? {} });
  });
  await page.setViewportSize({ width: variant.width, height: 1000 });
  await page.goto('/1/orders/1048');
  const detail = page.getByRole('dialog').first();
  await expect(detail).toBeVisible();
  // Existing command toolbar keeps its layout; the handoff action is in its menu.
  await detail.getByRole('button', { name: /Actions|פעולות/ }).click();
  await page.getByRole('menuitem', { name: variant.label, exact: true }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText(variant.description);
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(confirm).toHaveCSS('opacity', '1');
  await page.screenshot({ path: info.outputPath('handoff-confirmation.png') });
  await confirm.getByRole('button', { name: variant.label, exact: true }).click();
  await expect.poll(() => actions.length).toBe(1);
  expect(actions[0]).toBe(`/api/v1/orders/1048/${variant.type === 'delivery' ? 'mark-delivered' : 'mark-served'}`);
  expect(actions.some(path => /financial|checks/.test(path))).toBe(false);
});

test('advertised unavailable facts show Retry and cannot expose financial legacy actions', async ({ page }, info) => {
  const fixture = createFixture({ empty: false });
  const order = fixture.orders[0];
  Object.assign(order, { status: 'in_kitchen', payment_status: 'pending', lifecycle: null });
  await page.addInitScript(() => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Synthetic', role: 'owner' }));
    localStorage.setItem('foody_restaurant_ids', '[1]');
    localStorage.setItem('foody-admin-locale', 'fr');
  });
  await page.route('**/*', route => ['localhost', '127.0.0.1', 'square-fonts-production-f.squarecdn.com'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const response = fixture.response(request.url(), request.method(), request.postDataJSON() ?? {}, Number(request.headers()['x-restaurant-id']) || 1);
    await route.fulfill({ status: response.status ?? 200, json: response.json ?? {} });
  });
  await page.goto('/1/orders/1048');
  const detail = page.getByRole('dialog').first();
  await expect(detail.getByText('Avancement de la commande indisponible', { exact: true })).toBeVisible();
  await expect(detail.getByText('Statut du paiement indisponible', { exact: true }).first()).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Réessayer', exact: true })).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Marquer prêt', exact: true })).toHaveCount(0);
  await expect(detail.getByRole('button', { name: 'Obtenir le lien de paiement', exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('lifecycle-unavailable.png') });
  Object.assign(order, { lifecycle: {
    schema_version: 1, scope: { kind: 'order', id: '1048' }, identities: { order_ids: [1048] },
    commercial: { state: 'closed', evidence: [] }, payment: { state: 'paid', evidence: [] },
    preparation: { state: 'in_progress', evidence: [], quantities: { total: 1, not_sent: 0, held: 0, in_progress: 1, ready: 0, unknown: 0 } },
    handoff: { state: 'unknown', tracking: 'unknown', evidence: [] },
  } });
  await detail.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect(detail.getByText('En cuisine', { exact: true }).first()).toBeVisible();
  await expect(detail.getByText('Payé', { exact: true }).first()).toBeVisible();
  expect(fixture.writes).toEqual([]);
});

test('v1 pending retains existing payment controls while an authorization grants no new collection', async ({ page }) => {
  const fixture = createFixture({ empty: false });
  const order = fixture.orders[0];
  const projection = {
    schema_version: 1, scope: { kind: 'order', id: '1048' }, identities: { order_ids: [1048] },
    commercial: { state: 'open', evidence: [] }, payment: { state: 'pending', evidence: [] },
    preparation: { state: 'not_sent', evidence: [], quantities: { total: 1, not_sent: 1, held: 0, in_progress: 0, ready: 0, unknown: 0 } },
    handoff: { state: 'unknown', tracking: 'unknown', evidence: [] },
  };
  Object.assign(order, { status: 'accepted', payment_status: 'pending', lifecycle: projection });
  await page.addInitScript(() => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Synthetic', role: 'owner' }));
    localStorage.setItem('foody_restaurant_ids', '[1]');
    localStorage.setItem('foody-admin-locale', 'fr');
  });
  await page.route('**/*', route => ['localhost', '127.0.0.1', 'square-fonts-production-f.squarecdn.com'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const response = fixture.response(request.url(), request.method(), request.postDataJSON() ?? {}, Number(request.headers()['x-restaurant-id']) || 1);
    await route.fulfill({ status: response.status ?? 200, json: response.json ?? {} });
  });
  for (const state of ['pending', 'authorized']) {
    order.payment_status = state; projection.payment.state = state;
    await page.goto('/1/orders/1048');
    const detail = page.getByRole('dialog').first();
    await expect(detail).toBeVisible();
    await expect(detail.getByRole('button', { name: 'Obtenir le lien de paiement', exact: true })).toHaveCount(state === 'pending' ? 1 : 0);
    await detail.getByRole('button', { name: 'Actions', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: 'Encaisser', exact: true })).toHaveCount(state === 'pending' ? 1 : 0);
    await page.keyboard.press('Escape');
  }
  expect(fixture.writes).toEqual([]);
});
