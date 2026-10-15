import { test, expect } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

test('map settings track tenant usage, preserve caps and contact Foody for upgrades', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const fixture = createFixture();
  const writes: { rid?: string; preference: string }[] = [];
  const status = { preference: 'auto', active_provider: 'geoapify', reason: 'quota', google: { available: false, month: '2026-10', resets_at: '2026-11-01T08:01:00Z', counters: [{ sku: 'tiles', used: 130, limit: 90000, available: true }, { sku: 'optimization_fleet', used: 40, limit: 900, available: false }] } };
  await page.addInitScript(() => {
    localStorage.setItem('foody_restaurant_token', 'isolated-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, role: 'owner', full_name: 'Équipe démo' }));
    localStorage.setItem('foody_restaurant_ids', '[1]');
    if (!localStorage.getItem('foody-admin-locale')) localStorage.setItem('foody-admin-locale', 'fr');
  });
  await page.route('**/api/v1/**', async intercepted => {
    const request = intercepted.request(), path = new URL(request.url()).pathname;
    const rid = request.headers()['x-restaurant-id'];
    if (path === '/api/v1/users/me') return intercepted.fulfill({ json: { role_name: 'Owner', permissions: ['settings.edit', 'settings.view'], user: { id: 1, role: 'owner' } } });
    if (path === '/api/v1/delivery/zones') return intercepted.fulfill({ json: { zones: [{ id: 1, restaurant_id: Number(rid), name: 'Centre', type: 'cities', cities: ['Tel Aviv'], is_active: true, delivery_fee: 15, min_order: 50 }] } });
    if (path === '/api/v1/restaurants/1/settings') return intercepted.fulfill({ json: { settings: { id: 1, restaurant_id: 1, minimum_order_delivery: 50 } } });
    if (path === '/api/v1/public/geocode') return intercepted.fulfill({ json: { found: true, lat: 32.08, lng: 34.82 } });
    if (path === '/api/v1/public/delivery/map-config') return intercepted.fulfill({ json: { provider: 'geoapify', tile_url: '/api/v1/public/delivery/map/{style}/{z}/{x}/{y}.png?restaurant_id=1' } });
    if (path.startsWith('/api/v1/public/delivery/map/')) return intercepted.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edf0ee"/></svg>' });
    if (path === '/api/v1/delivery/providers') {
      if (request.method() === 'PUT') { const input = request.postDataJSON(); writes.push({ rid, preference: input.preference }); status.preference = input.preference; status.reason = input.preference === 'geoapify' ? 'manual' : 'quota'; }
      return intercepted.fulfill({ json: status });
    }
    const value = fixture.response(request.url(), request.method(), request.postDataJSON() ?? {}, Number(rid) || 1);
    return intercepted.fulfill({ status: value.status ?? 200, json: value.json ?? {} });
  });
  await page.route('**/*', intercepted => ['localhost', '127.0.0.1'].includes(new URL(intercepted.request().url()).hostname) ? intercepted.fallback() : intercepted.abort());
  await page.goto('/1/settings/delivery');
  await expect(page.getByRole('heading', { name: 'Zones de livraison', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ajouter une zone', exact: true })).toBeEnabled();
  await expect(page.getByRole('textbox', { name: 'Commande minimum par défaut (₪)', exact: true })).toHaveValue('50');
  const shortcut = page.locator('[data-page-actions]').getByRole('link', { name: 'Cartes et itinéraires', exact: true });
  await expect(shortcut).toHaveAttribute('data-variant', 'secondary');
  await page.screenshot({ path: info.outputPath('delivery-zone-header-fr.png'), animations: 'disabled' });
  await shortcut.click();
  await expect(page).toHaveURL(/\/1\/settings\/delivery\/maps$/);
  await expect(page.getByRole('heading', { name: 'Cartes et itinéraires' })).toBeVisible();
  const navigation = page.getByRole('navigation', { name: 'Navigation principale', exact: true });
  await expect(navigation.getByRole('link', { name: 'Cartes et itinéraires', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(navigation.getByRole('link', { name: 'Zones de livraison', exact: true })).not.toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-page-actions]').getByRole('link', { name: 'Zones de livraison', exact: true })).toBeVisible();
  await expect(page.getByText('130', { exact: false })).toBeVisible();
  await expect(page.getByText('Plafond de la plateforme atteint', { exact: true })).toBeVisible();
  await page.getByRole('radio', { name: /Geoapify uniquement/ }).check();
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('enregistré');
  expect(writes).toEqual([{ rid: '1', preference: 'geoapify' }]);
  await page.getByRole('radio', { name: /Google de préférence/ }).check();
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText('Plafond de la plateforme atteint', { exact: true })).toBeVisible();
  await expect(page.getByText('Service actif').locator('..')).toContainText('Geoapify');
  await page.getByRole('button', { name: 'Upgrade', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Aucun paiement');
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  await page.getByRole('heading', { name: 'Cartes et itinéraires' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('delivery-maps-settings-fr.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await page.locator('main').boundingBox())?.width ?? 0).toBeGreaterThan(388);
  await page.getByRole('heading', { name: 'Cartes et itinéraires' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('delivery-maps-settings-mobile.png'), fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('header').getByRole('button', { name: 'Articles et cartes', exact: true }).click();
  await expect(navigation.getByRole('link', { name: 'Cartes et itinéraires', exact: true })).toBeVisible();
  await navigation.getByRole('link', { name: 'Cartes et itinéraires', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cartes et itinéraires', exact: true })).toBeVisible();
  await page.evaluate(() => localStorage.setItem('foody-admin-locale', 'he'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'מפות ומסלולים', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.screenshot({ path: info.outputPath('delivery-maps-settings-he.png'), animations: 'disabled' });
  expect(errors).toEqual([]);
});
