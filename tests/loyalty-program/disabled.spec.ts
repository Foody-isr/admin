import { test, expect } from '@playwright/test';
import { createFixture } from '../redesign/fixtures.mjs';
test('default configuration hides the program and makes zero loyalty requests', async ({ page }) => {
  const fixture = createFixture(); let calls = 0;
  await page.addInitScript(() => { localStorage.setItem('foody_restaurant_token', 'isolated-program-fixture'); localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Synthetic operator', role: 'owner' })); localStorage.setItem('foody_restaurant_ids', '[1]'); localStorage.setItem('foody-admin-locale', 'fr'); });
  await page.routeWebSocket('**', socket => socket.close());
  await page.route('**/*', route => ['localhost', '127.0.0.1', 'square-fonts-production-f.squarecdn.com'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  await page.route('**/api/v1/**', route => { const req = route.request(); if (new URL(req.url()).pathname.includes('/loyalty/')) calls++; const response = fixture.response(req.url(), req.method(), req.postDataJSON() ?? {}, 1); return route.fulfill({ status: response.status ?? 200, json: response.json ?? {} }); });
  await page.goto('/1/loyalty/program'); await expect(page.getByText('La configuration de la fidélité n’est pas encore disponible.', { exact: true })).toBeVisible(); await expect(page.getByRole('link', { name: 'Programme de fidélité', exact: true })).toHaveCount(0); expect(calls).toBe(0);
});
