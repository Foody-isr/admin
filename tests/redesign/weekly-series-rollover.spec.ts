import { expect, test, type Page } from '@playwright/test';
import { createDashboardFixture } from './dashboard-fixture.mjs';

async function install(page: Page) {
  // Real orders exist only on the old service; all upcoming services are empty.
  const fixture = createDashboardFixture({ referenceDate: new Date('2026-10-22T12:00:00Z') });
  const requests: URL[] = [];
  let current = '2026-10-30';
  await page.clock.install({ time: new Date('2026-10-25T12:00:00Z') });
  await page.addInitScript(() => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Démo', role: 'owner' }));
    localStorage.setItem('foody_restaurant_ids', '[1]');
    localStorage.setItem('foody-admin-locale', 'fr');
    localStorage.setItem('foody_admin_theme', 'light');
    // A previously saved default must not trap the dashboard on the old batch.
    localStorage.setItem('foody.dashboard.range.v3.1.1', JSON.stringify({ from: '2026-10-23', to: '2026-10-23' }));
  });
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    requests.push(url);
    if (url.pathname === '/api/v1/orders/series') {
      await route.fulfill({ json: { series: ['2026-11-13', '2026-11-06', '2026-10-30', '2026-10-23'].map(date => ({
        date, order_count: date === '2026-10-23' ? 14 : 0, revenue: date === '2026-10-23' ? 9525 : 0, is_current: date === current,
      })) } });
      return;
    }
    const result = fixture.response(request.url(), request.method(), request.postDataJSON() ?? {}, 1);
    await route.fulfill({ status: 'status' in result ? result.status ?? 200 : 200, json: result.json ?? {} });
  });
  return { requests, advance: () => { current = '2026-11-06'; } };
}

for (const path of ['/1/dashboard', '/1/orders/all']) {
  test(`${path} defaults to an empty current batch and follows rollover without an order`, async ({ page }) => {
    const { requests, advance } = await install(page);
    await page.goto(path);
    const lastScope = () => requests.filter(url => url.pathname === '/api/v1/orders').at(-1)?.searchParams.get('from');
    await expect.poll(lastScope).toBe('2026-10-30');
    if (path.endsWith('dashboard')) {
      await expect(page.locator('.dashboard-header p')).toContainText('vendredi 30 octobre');
      await expect(page.locator('.dashboard-revenue strong')).toContainText('0,00');
    } else {
      await expect(page.locator('tbody tr')).toHaveCount(0);
    }
    advance();
    await page.clock.fastForward(61_000);
    await expect.poll(lastScope).toBe('2026-11-06');
    expect(requests.filter(url => url.pathname === '/api/v1/orders').at(-1)?.searchParams.get('date_field')).toBe('serie');
  });

  test(`${path} keeps manually selected history when the current batch changes`, async ({ page }) => {
    const { requests, advance } = await install(page);
    await page.goto(path);
    const lastScope = () => requests.filter(url => url.pathname === '/api/v1/orders').at(-1)?.searchParams.get('from');
    await expect.poll(lastScope).toBe('2026-10-30');
    const trigger = path.endsWith('dashboard')
      ? page.locator('.dashboard-header').getByRole('button', { name: /Série/ })
      : page.locator('[data-list-toolbar] button').filter({ hasText: /30\/10\/2026/ });
    await trigger.click();
    await page.getByRole('dialog').getByRole('button', { name: '23', exact: true }).click();
    await expect.poll(lastScope).toBe('2026-10-23');
    advance();
    await page.clock.fastForward(61_000);
    await expect.poll(() => requests.filter(url => url.pathname === '/api/v1/orders/series').length).toBeGreaterThan(1);
    expect(lastScope()).toBe('2026-10-23');
  });
}

test('an explicit payment-attention link retains its historical service', async ({ page }) => {
  const { requests } = await install(page);
  await page.goto('/1/orders/all?view=payment_attention&from=2026-10-23&to=2026-10-23&date_field=serie');
  await expect.poll(() => requests.filter(url => url.pathname === '/api/v1/orders').at(-1)?.searchParams.get('from')).toBe('2026-10-23');
  await page.clock.fastForward(61_000);
  expect(requests.filter(url => url.pathname === '/api/v1/orders').at(-1)?.searchParams.get('from')).toBe('2026-10-23');
});
