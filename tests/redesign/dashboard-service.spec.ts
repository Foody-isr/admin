import { expect, test, type Page } from '@playwright/test';
import { createDashboardFixture } from './dashboard-fixture.mjs';

const referenceDate = new Date('2026-10-08T12:00:00Z');
async function install(page: Page, options: { empty?: boolean; permissions?: string[]; locale?: string; theme?: string } = {}) {
  const fixture = createDashboardFixture({ ...options, referenceDate });
  const requests: URL[] = [];
  await page.clock.install({ time: referenceDate });
  await page.addInitScript(({ locale, theme }) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'owner', email: 'demo@foody.test' }));
    localStorage.setItem('foody_restaurant_ids', '[1]');
    localStorage.setItem('foody-admin-locale', locale);
    localStorage.setItem('foody_admin_theme', theme);
  }, { locale: options.locale ?? 'fr', theme: options.theme ?? 'light' });
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    requests.push(new URL(request.url()));
    const result = fixture.response(request.url(), request.method(), request.postDataJSON() ?? {}, Number(request.headers()['x-restaurant-id']) || 1);
    await route.fulfill({ status: 'status' in result ? result.status ?? 200 : 200, json: result.json ?? {} });
  });
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  return { fixture, requests };
}

async function open(page: Page) {
  await page.goto('/1/dashboard');
  await expect(page.locator('.dashboard-home')).toHaveAttribute('aria-busy', 'false');
}

test('preorder home uses service totals and creation-day intake without a daily empty chart', async ({ page }, info) => {
  const { requests } = await install(page);
  await open(page);
  await expect(page.getByText('Services prévus : vendredi 9 octobre')).toBeVisible();
  await expect(page.locator('.dashboard-operation-metrics')).toHaveCount(0);
  await expect(page.locator('.dashboard-metrics > div').first()).toContainText('14');
  await expect(page.locator('.dashboard-revenue strong')).toContainText('9');
  await expect(page.locator('.dashboard-chart-bar')).toHaveCount(3);
  await expect(page.locator('.dashboard-change')).toHaveCount(0);
  await expect(page.locator('.dashboard-volume, .dashboard-prompt, .dashboard-money')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Plan de production', exact: true })).toHaveAttribute('href', '/1/orders/production?date=2026-10-09');
  await expect(page.locator('.dashboard-attention').getByRole('link')).toHaveAttribute('href', '/1/orders/all?view=payment_attention&from=2026-10-09&to=2026-10-09&date_field=serie');
  const orderRequests = requests.filter(url => url.pathname === '/api/v1/orders');
  expect(orderRequests.length).toBeGreaterThanOrEqual(4);
  for (const request of orderRequests.slice(-4)) {
    expect(request.searchParams.get('from')).toBe('2026-10-09');
    expect(request.searchParams.get('date_field')).toBe('serie');
    expect(request.searchParams.get('restaurant_id')).toBe('1');
  }
  expect(requests.some(url => url.pathname === '/api/v1/analytics/comparison')).toBe(false);
  await page.screenshot({ path: info.outputPath('dashboard-service-fr.png'), fullPage: true });
});

test('switching to today changes operational scope and persists the chosen basis', async ({ page }) => {
  const { requests } = await install(page);
  await open(page);
  await page.locator('.dashboard-header').getByRole('button', { name: /Série/ }).click();
  await page.getByRole('button', { name: "Aujourd'hui", exact: true }).click();
  await expect(page.locator('.dashboard-volume')).toBeVisible();
  await expect(page.locator('.dashboard-metrics > div').first()).toContainText('0');
  await expect(page.locator('.dashboard-revenue strong')).toContainText('0,00');
  await expect(page.getByText('Aucune action urgente en attente.')).toBeVisible();
  const current = requests.filter(url => url.pathname === '/api/v1/orders').slice(-4);
  expect(current.every(url => url.searchParams.get('from') === '2026-10-08' && !url.searchParams.has('date_field'))).toBe(true);
  await page.reload();
  await expect(page.locator('.dashboard-volume')).toBeVisible();
  await expect(page.locator('.dashboard-header p')).toContainText('Commandes passées');
});

test('a previous service can be selected and survives a reload without N/A badges', async ({ page }) => {
  await install(page); await open(page);
  await page.locator('.dashboard-header').getByRole('button', { name: /Série/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: '2', exact: true }).click();
  await expect(page.locator('.dashboard-metrics > div').first()).toContainText('16');
  await expect(page.locator('.dashboard-header p')).toContainText('vendredi 2 octobre');
  await expect(page.locator('.dashboard-home')).not.toContainText('N/A');
  await page.reload();
  await expect(page.locator('.dashboard-header p')).toContainText('vendredi 2 octobre');
});

test('failed operational reads show an unavailable notice, and retry restores the action', async ({ page }) => {
  await install(page);
  let fail = true;
  await page.route('**/api/v1/orders?**', route => fail ? route.fulfill({ status: 503, json: { error: 'Synthetic outage' } }) : route.fallback());
  await open(page);
  await expect(page.locator('.dashboard-attention').getByRole('link')).toHaveCount(0);
  await expect(page.getByText('Le statut des commandes en direct est momentanément indisponible.')).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect(page.locator('.dashboard-attention')).toContainText('1 paiement demande votre attention.');
  await expect(page.locator('.dashboard-attention').getByRole('link')).toBeVisible();
});

test('roles without order access never fetch customer orders or show operational shortcuts', async ({ page }) => {
  const { requests } = await install(page, { permissions: ['menu.edit'] }); await open(page);
  await expect(page.locator('.dashboard-operations, .dashboard-recent')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Plan de production', exact: true })).toHaveCount(0);
  expect(requests.some(url => url.pathname === '/api/v1/orders')).toBe(false);
});

test('empty service has zero totals without invented comparisons', async ({ page }) => {
  await install(page, { empty: true }); await open(page);
  await expect(page.locator('.dashboard-metrics > div').first()).toContainText('0');
  await expect(page.locator('.dashboard-change, .dashboard-chart-bar')).toHaveCount(0);
  await expect(page.getByText('Aucune action urgente en attente.')).toBeVisible();
});

test('payment shortcut includes an unpaid preorder before acceptance', async ({ page }) => {
  const { fixture, requests } = await install(page);
  fixture.orders.find(order => order.id === 2213)!.status = 'scheduled';
  await open(page);
  await page.locator('.dashboard-attention').getByRole('link').click();
  await expect(page).toHaveURL(/view=payment_attention.*date_field=serie/);
  await expect.poll(() => requests.filter(url => url.pathname === '/api/v1/orders' && url.searchParams.get('payment_status') === 'unpaid,pending,partially_paid').at(-1)?.searchParams.get('status')).toContain('scheduled');
});

for (const variant of [
  { name: 'fr-mobile', locale: 'fr', theme: 'light', width: 375 },
  { name: 'he-dark', locale: 'he', theme: 'dark', width: 1440 },
  { name: 'en-tablet', locale: 'en', theme: 'light', width: 768 },
]) test(`service dashboard fits ${variant.name}`, async ({ page }, info) => {
  await page.setViewportSize({ width: variant.width, height: 1000 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await install(page, variant); await open(page);
  await expect(page.locator('.dashboard-chart-bar')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath(`${variant.name}.png`), fullPage: true });
});

test('Square-style tooltip shows the dated metric on hover and keyboard focus', async ({ page }, info) => {
  await install(page); await open(page);
  const bar = page.locator('.dashboard-chart-bar').first();
  const tooltip = page.locator('.dashboard-chart-tooltip');
  await expect(page.locator('.dashboard-chart-current').last()).toHaveCSS('background-color', 'rgb(204, 225, 255)');
  await bar.hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveCSS('background-color', 'rgb(26, 26, 26)');
  await expect(tooltip.locator(':scope > .dashboard-tooltip-period')).toHaveCount(1);
  await expect(tooltip).toContainText('5 oct. 2026');
  await expect(tooltip.locator(':scope > .dashboard-tooltip-period strong')).toHaveText('Ventes brutes');
  await expect(tooltip.locator(':scope > .dashboard-tooltip-period span')).toContainText('1');
  await page.screenshot({ path: info.outputPath('dashboard-blue-tooltip.png'), fullPage: true });
  await page.mouse.move(0, 0);
  await bar.focus();
  await expect(tooltip).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);
});

test('comparison tooltip separates the actual dates and values of both periods', async ({ page }) => {
  await install(page); await open(page);
  await page.locator('.dashboard-header').getByRole('button', { name: /Série/ }).click();
  await page.getByRole('button', { name: '7 derniers jours', exact: true }).click();
  const bar = page.locator('.dashboard-performance .dashboard-chart-bar').first();
  const tooltip = page.locator('.dashboard-chart-tooltip');
  await expect(page.locator('.dashboard-performance .dashboard-chart-previous').last()).toHaveCSS('background-color', 'rgb(204, 225, 255)');
  await expect(page.locator('.dashboard-performance .dashboard-chart-previous').last()).toHaveCSS('opacity', '0.5');
  await bar.hover();
  await expect(tooltip).toBeVisible();
  const periods = tooltip.locator(':scope > .dashboard-tooltip-period');
  await expect(periods).toHaveCount(2);
  await expect(periods.nth(0)).toContainText('5 oct. 2026');
  await expect(periods.nth(1)).toContainText('28 sept. 2026');
  await expect(periods.nth(0).locator('span')).toHaveText(/1\s*360,00\s*₪/);
  await expect(periods.nth(1).locator('span')).toHaveText(/1\s*280,00\s*₪/);
});

test.describe('touch chart', () => {
  test.use({ hasTouch: true });
  test('tooltip opens on tap, stays inside the viewport and closes on a second tap', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await install(page); await open(page);
    const bar = page.locator('.dashboard-chart-bar').last();
    const tooltip = page.locator('.dashboard-chart-tooltip');
    await bar.tap();
    await expect(tooltip).toBeVisible();
    const bounds = await tooltip.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
    await bar.tap();
    await expect(tooltip).toHaveCount(0);
  });
});
