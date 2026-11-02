import { expect, test, type Page } from '@playwright/test';
import { createDashboardFixture } from './dashboard-fixture.mjs';

async function install(page: Page, weekStart: number) {
  const fixture = createDashboardFixture({ referenceDate: new Date('2026-11-02T12:00:00Z') });
  const requests: URL[] = [];
  await page.clock.install({ time: new Date('2026-11-02T12:00:00Z') });
  await page.addInitScript(() => {
    localStorage.setItem('foody_restaurant_token', 'synthetic-week-session');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Démo', role: 'owner' }));
    localStorage.setItem('foody_restaurant_ids', '[1]');
    localStorage.setItem('foody-admin-locale', 'fr');
  });
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    requests.push(url);
    const result = fixture.response(request.url(), request.method(), request.postDataJSON() ?? {}, 1);
    if (url.pathname === '/api/v1/restaurants/1' && result.json && 'restaurant' in result.json) result.json.restaurant.week_start_day = weekStart;
    await route.fulfill({ status: 'status' in result ? result.status ?? 200 : 200, json: result.json ?? {} });
  });
  return requests;
}

for (const start of [0, 1]) {
  for (const path of ['/1/orders/all', '/1/dashboard', '/1/analytics/overview']) {
    test(`${path} selects and retains a full week starting on weekday ${start}`, async ({ page }) => {
      const requests = await install(page, start);
      await page.goto(path);
      const trigger = page.locator('main button[aria-haspopup="dialog"]').first();
      await trigger.click();
      await page.getByRole('dialog').getByRole('button', { name: 'Cette semaine', exact: true }).click();
      const expected = start === 0 ? ['2026-11-01', '2026-11-07'] : ['2026-11-02', '2026-11-08'];
      const endpoint = path.includes('orders') ? '/api/v1/orders' : '/api/v1/analytics/period';
      const lastRange = () => {
        const query = requests.filter(url => url.pathname === endpoint).at(-1)?.searchParams;
        return [query?.get('from'), query?.get('to')];
      };
      await expect.poll(lastRange).toEqual(expected);
      if (path.endsWith('dashboard') || path.endsWith('overview')) {
        await page.reload();
        await expect.poll(lastRange).toEqual(expected);
      }
    });
  }
}
