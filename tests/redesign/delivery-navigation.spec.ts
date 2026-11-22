import { expect, test } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

test.afterEach(async ({ page }) => {
  expect((await page.pageErrors()).map(error => error.message)).toEqual([]);
});

test.beforeEach(async ({ page }) => {
  const fixture = createFixture();
  await page.addInitScript(language => {
    localStorage.setItem('foody_restaurant_portal_session', 'fp1p.e30.fixture.00');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'owner' }));
    localStorage.setItem('foody_restaurant_ids', '[1]');
    localStorage.setItem('foody-admin-locale', language);
  }, 'fr');
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), rid = request.headers()['x-restaurant-id'];
    const { pathname } = new URL(request.url());
    if (pathname === '/api/v1/delivery/routes' || pathname === '/api/v1/delivery/routes/mine/all') {
      return route.fulfill({ json: { routes: [] } });
    }
    if (pathname === '/api/v1/delivery/routes/history') {
      return route.fulfill({ json: { routes: [], couriers: [], next_cursor: null } });
    }
    const result = fixture.response(request.url(), request.method(), request.postDataJSON() ?? {}, Number(rid) || 1);
    return route.fulfill({ status: result.status ?? 200, json: result.json ?? {} });
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/v1/') ? route.fallback() : route.abort();
  });
});

test('dispatch, courier preview and zones share the restaurant navigation', async ({ page }) => {
  await page.goto('/1/orders/deliveries');
  const sidebar = page.getByRole('navigation', { name: 'Navigation principale', exact: true });
  const module = page.getByRole('navigation', { name: 'Navigation des livraisons', exact: true });
  await expect(sidebar.getByRole('link', { name: 'Livraisons', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(sidebar.getByRole('link', { name: 'Mode livreur', exact: true })).toHaveCount(0);
  await expect(module.getByRole('link')).toHaveCount(3);
  await expect(module.getByRole('link', { name: 'Répartition' })).toHaveAttribute('aria-current', 'page');
  await module.getByRole('link', { name: 'Mode livreur' }).click();
  await expect(module.getByRole('link', { name: 'Mode livreur' })).toHaveAttribute('aria-current', 'page');
  await module.getByRole('link', { name: 'Zones' }).click();
  await expect(module.getByRole('link', { name: 'Zones' })).toHaveAttribute('aria-current', 'page');
  await expect(sidebar.getByRole('link', { name: 'Livraisons', exact: true })).toHaveAttribute('aria-current', 'page');
  const response = await page.goto('/1/delivery/tours');
  expect(response?.status()).toBe(404);
});

test('mobile dispatch opens the Admin menu and navigates directly to its restaurant', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/1/orders/deliveries?view=history');
  const menu = page.getByRole('button', { name: 'Navigation principale', exact: true });
  const sidebar = page.getByRole('navigation', { name: 'Navigation principale', exact: true });
  await expect(page.getByRole('navigation', { name: 'Navigation des livraisons' })).toBeVisible();
  await expect(sidebar).toBeHidden();
  await menu.click();
  await expect(sidebar.getByRole('link', { name: 'Livraisons', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Escape');
  await expect(sidebar).toBeHidden();
  await menu.click();
  await sidebar.getByRole('link', { name: 'Accueil', exact: true }).click();
  await expect(page).toHaveURL(/\/1\/dashboard$/);
  await expect(sidebar).toBeHidden();
});
