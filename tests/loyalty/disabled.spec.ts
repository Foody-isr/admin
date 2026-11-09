import { test, expect } from '@playwright/test';
import { createFixture } from '../redesign/fixtures.mjs';

test('default build flag keeps navigation and direct route unavailable without loyalty API calls', async ({ page }) => {
  const fixture = createFixture(); let calls = 0;
  await page.addInitScript(() => {
    localStorage.setItem('foody_restaurant_token', 'isolated-disabled-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Synthetic', role: 'owner' }));
    localStorage.setItem('foody_restaurant_ids', '[1]'); localStorage.setItem('foody-admin-locale', 'fr');
  });
  await page.route('**/*', route => ['localhost', '127.0.0.1', 'square-fonts-production-f.squarecdn.com'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  await page.routeWebSocket('**', socket => socket.close());
  await page.route('**/api/v1/**', route => {
    if (route.request().url().includes('/loyalty/checkout-resolutions')) calls++;
    const response = fixture.response(route.request().url(), route.request().method(), {}, 1);
    return route.fulfill({ status: response.status ?? 200, json: response.json ?? {} });
  });
  await page.goto('/1/dashboard');
  await expect(page.locator('a[href="/1/loyalty/checkouts"]')).toHaveCount(0);
  await page.goto('/1/loyalty/checkouts');
  await expect(page.getByText('Ce suivi n’est pas encore disponible pour ce restaurant.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Paiements fidélité en attente', exact: true })).toHaveCount(0);
  expect(calls).toBe(0);
});
