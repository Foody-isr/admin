import { expect, test, type Page } from '@playwright/test';
import { createDashboardFixture } from './dashboard-fixture.mjs';

async function install(page: Page) {
  // Real orders exist only on the old service; all upcoming services are empty.
  const fixture = createDashboardFixture({ referenceDate: new Date('2026-10-22T12:00:00Z') });
  const requests: URL[] = [];
  let current = '2026-10-30';
  let secondDay = '2026-10-31';
  await page.clock.install({ time: new Date('2026-10-25T12:00:00Z') });
  await page.addInitScript(() => {
    localStorage.setItem('foody_restaurant_portal_session', 'fp1p.e30.fixture.00');
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
    if (url.pathname === '/api/v1/orders/fulfillment-series') {
      await route.fulfill({ json: { series: ['2026-11-13', '2026-11-06', '2026-10-30', '2026-10-23'].map(date => ({
        key: date, timezone: 'Asia/Jerusalem', revision: secondDay === '2026-10-31' ? 1 : 2, is_current: date === current,
        days: (date === '2026-10-30' ? [date, secondDay] : [date]).map(day => ({ date: day, day_name: 'Friday' })),
      })) } });
      return;
    }
    if (url.pathname.endsWith('/fulfillment-series/2026-10-30/commitments')) {
      await route.fulfill({ json: { order_count: 1 } });
      return;
    }
    if (url.pathname.endsWith('/fulfillment-series/2026-10-30/day') && request.method() === 'PUT') {
      const change = request.postDataJSON();
      expect(change).toEqual({ from: '2026-10-31', to: '2026-11-01', revision: 1, order_count: 1 });
      secondDay = change.to;
      await route.fulfill({ json: { ok: true } });
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
    const lastScope = () => requests.filter(url => url.pathname === '/api/v1/orders' && url.searchParams.has('series_key')).at(-1)?.searchParams.get('series_key');
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
    expect(requests.filter(url => url.pathname === '/api/v1/orders' && url.searchParams.has('series_key')).at(-1)?.searchParams.get('date_field')).toBe('serie');
  });

  test(`${path} keeps manually selected history when the current batch changes`, async ({ page }) => {
    const { requests, advance } = await install(page);
    await page.goto(path);
    const lastScope = () => requests.filter(url => url.pathname === '/api/v1/orders' && url.searchParams.has('series_key')).at(-1)?.searchParams.get('series_key');
    await expect.poll(lastScope).toBe('2026-10-30');
    const trigger = page.getByRole('button', { name: /Série du 30 oct/ });
    await trigger.click();
    await page.getByRole('dialog').getByRole('button', { name: /Série du 23 oct/ }).click();
    await expect.poll(lastScope).toBe('2026-10-23');
    advance();
    await page.clock.fastForward(61_000);
    await expect.poll(() => requests.filter(url => url.pathname === '/api/v1/orders/fulfillment-series').length).toBeGreaterThan(1);
    expect(lastScope()).toBe('2026-10-23');
  });
}

test('the optional date can only narrow the selected lot to a real service day', async ({ page }) => {
  const { requests } = await install(page);
  await page.goto('/1/orders/all');
  await expect(page.getByRole('tab', { name: 'Tous', exact: true })).toHaveAttribute('aria-selected', 'true');
  const lastLotRequest = () => requests.filter(url => url.pathname === '/api/v1/orders' && url.searchParams.has('series_key')).at(-1);
  await expect.poll(() => lastLotRequest()?.searchParams.get('series_key')).toBe('2026-10-30');
  expect(lastLotRequest()?.searchParams.has('from')).toBe(false);
  await page.getByRole('button', { name: /Série du 30 oct/ }).click();
  const day = page.getByRole('dialog').getByRole('combobox', { name: 'Date de remise', exact: true });
  await expect(day.locator('option')).toHaveCount(3);
  await day.selectOption('2026-10-31');
  await expect.poll(() => lastLotRequest()?.searchParams.get('from')).toBe('2026-10-31');
  expect(lastLotRequest()?.searchParams.get('series_key')).toBe('2026-10-30');
  expect(lastLotRequest()?.searchParams.get('to')).toBe('2026-10-31');
});

test('a manager reviews promised orders before moving a day and keeps the lot key', async ({ page }) => {
  const { requests } = await install(page);
  await page.goto('/1/orders/all');
  await page.getByRole('button', { name: /Série du 30 oct/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Reporter un jour de remise' }).click();
  await dialog.getByRole('combobox', { name: 'Jour à reporter' }).selectOption('2026-10-31');
  await expect(dialog.getByRole('link', { name: 'Voir les commandes' })).toHaveAttribute(
    'href', '/1/orders/all?series_key=2026-10-30&service_day=2026-10-31',
  );
  await dialog.getByLabel('Nouvelle date').fill('2026-11-01');
  await dialog.getByRole('button', { name: 'Reporter un jour de remise' }).click();
  await expect(page.getByRole('button', { name: /Série du 30 oct.*1 nov/ })).toBeVisible();
  expect(requests.filter(url => url.pathname === '/api/v1/orders').at(-1)?.searchParams.get('series_key')).toBe('2026-10-30');
});

test('an explicit payment-attention link retains its historical service', async ({ page }) => {
  const { requests } = await install(page);
  await page.goto('/1/orders/all?view=payment_attention&from=2026-10-23&to=2026-10-23&date_field=serie');
  await expect.poll(() => requests.filter(url => url.pathname === '/api/v1/orders').at(-1)?.searchParams.get('from')).toBe('2026-10-23');
  await page.clock.fastForward(61_000);
  expect(requests.filter(url => url.pathname === '/api/v1/orders').at(-1)?.searchParams.get('from')).toBe('2026-10-23');
});
