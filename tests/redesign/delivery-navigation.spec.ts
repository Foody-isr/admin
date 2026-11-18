import { expect, test } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

test('delivery pages share one sidebar entry and the old sales page is gone', async ({ page }) => {
  const fixture = createFixture();
  await page.addInitScript(language => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'owner' }));
    localStorage.setItem('foody_restaurant_ids', '[1]');
    localStorage.setItem('foody-admin-locale', language);
  }, 'fr');
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), rid = request.headers()['x-restaurant-id'];
    const result = fixture.response(request.url(), request.method(), request.postDataJSON() ?? {}, Number(rid) || 1);
    return route.fulfill({ status: result.status ?? 200, json: result.json ?? {} });
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/v1/') ? route.fallback() : route.abort();
  });
  await page.goto('/1/settings/delivery/maps');
  const sidebar = page.getByRole('navigation', { name: 'Navigation principale', exact: true });
  const module = page.getByRole('navigation', { name: 'Navigation des livraisons', exact: true });
  await expect(sidebar.getByRole('link', { name: 'Livraisons', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(sidebar.getByRole('link', { name: 'Mode livreur', exact: true })).toHaveCount(0);
  await expect(module.getByRole('link')).toHaveCount(4);
  await expect(module.getByRole('link', { name: 'Cartographie' })).toHaveAttribute('aria-current', 'page');
  const response = await page.goto('/1/delivery/tours');
  expect(response?.status()).toBe(404);
});
