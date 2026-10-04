import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

async function install(page: Page, permissions = ['settings.edit']) {
  const fixture = createFixture();
  const requests: { path: string; method: string; rid?: string }[] = [];
  await page.addInitScript(() => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'manager', email: 'demo@foody.test' }));
    localStorage.setItem('foody_restaurant_ids', '[1,2]');
    localStorage.setItem('foody-admin-locale', 'fr');
    localStorage.setItem('foody_admin_theme', 'light');
  });
  await page.route('**/api/v1/**', async route => {
    const req = route.request(), url = new URL(req.url()), rid = req.headers()['x-restaurant-id'];
    requests.push({ path: url.pathname, method: req.method(), rid });
    if (url.pathname === '/api/v1/users/me') return route.fulfill({ json: { role_name: 'Custom', permissions, user: { id: 1, full_name: 'Équipe démo', role: 'manager' } } });
    const result = fixture.response(req.url(), req.method(), req.postDataJSON() ?? {}, Number(rid) || 1);
    return route.fulfill({ status: result.status ?? 200, json: result.json ?? {} });
  });
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  return { fixture, requests };
}

for (const legacy of ['website', 'website-v2']) {
  test(`retired ${legacy} redirects the restaurant and query before rendering`, async ({ request }) => {
    const response = await request.get(`/2/${legacy}?page=menu&tab=appearance`, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toBe('/2/website-v3?page=menu&tab=appearance');
  });
  test(`retired ${legacy} bookmark opens the retained V3 surface without writing`, async ({ page }) => {
    const state = await install(page);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(`/2/${legacy}?page=menu`);
    await expect(page).toHaveURL(/\/2\/website-v3\?page=menu$/);
    await expect(page.getByRole('heading', { name: 'Ouvrez le builder sur un écran plus large' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Retour à l’administration' })).toHaveAttribute('href', '/2/dashboard');
    expect(state.requests.some(item => item.method !== 'GET')).toBe(false);
    expect(state.requests.filter(item => item.path === '/api/v1/chain/branches').every(item => item.rid === '2')).toBe(true);
    expect(state.fixture.unhandled).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('website aliases retain the website editing permission at the V3 destination', async ({ page }) => {
  const state = await install(page, ['settings.view']);
  await page.goto('/2/website');
  await expect(page).toHaveURL(/\/2\/website-v3$/);
  await expect(page.getByRole('heading', { name: "Vous n'avez pas accès à cette section" })).toBeVisible();
  expect(state.requests.some(item => item.path.includes('website-draft') || item.path === '/api/v1/chain/branches')).toBe(false);
  expect(state.requests.some(item => item.method !== 'GET')).toBe(false);
});

if (process.env.FOODY_PREVIEW_PRODUCTION === '1') {
  for (const path of ['/design-system', '/design-system/order-detail']) {
    test(`internal preview ${path} remains unavailable in a production build`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(404);
    });
  }
}
