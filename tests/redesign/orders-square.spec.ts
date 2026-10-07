import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

async function install(page: Page, locale = 'fr', permissions?: string[]) {
  const fixtureOptions = { empty: false, permissions };
  const fixture = createFixture(fixtureOptions);
  const queries: URL[] = [];
  await page.addInitScript(({ locale }) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'owner' }));
    localStorage.setItem('foody_restaurant_ids', '[1,2]');
    localStorage.setItem('foody-admin-locale', locale);
    localStorage.setItem('foody_admin_theme', locale === 'he' ? 'dark' : 'light');
  }, { locale });
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/v1/orders') queries.push(url);
    const result = fixture.response(request.url(), request.method(), request.postDataJSON() ?? {}, Number(request.headers()['x-restaurant-id']) || 1);
    await route.fulfill({ status: result.status ?? 200, json: result.json ?? {} });
  });
  await page.route('**/*', route => ['localhost', '127.0.0.1', 'square-fonts-production-f.squarecdn.com'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  return { fixture, queries };
}

test('Square order scopes, quick filters and row details retain restaurant context', async ({ page }, info) => {
  const { fixture, queries } = await install(page);
  await page.goto('/2/orders/all');
  await expect(page.getByRole('heading', { name: 'Toutes les commandes', exact: true })).toBeVisible();
  const tabs = page.getByRole('tablist');
  await expect(tabs.getByRole('tab')).toHaveCount(5);
  await expect(tabs.getByRole('tab', { name: 'Actives', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('columnheader', { name: 'Source', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Articles', exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole('columnheader', { name: 'N°', exact: true })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Action suivante', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-list-toolbar]').getByRole('button', { name: /État|Tous les filtres/ })).toHaveCount(0);
  const measurements = await page.locator('tbody tr').first().evaluate(row => {
    const cell = row.querySelector('td')!;
    const header = document.querySelector('thead th')!;
    const title = document.querySelector('h1')!;
    return { height: row.getBoundingClientRect().height, marker: getComputedStyle(cell, '::before').content, headerWeight: getComputedStyle(header).fontWeight, titleSize: getComputedStyle(title).fontSize, fontLoaded: document.fonts.check('500 14px "Orders Sans"') };
  });
  expect(measurements).toEqual({ height: 70, marker: 'none', headerWeight: '500', titleSize: '25px', fontLoaded: true });
  expect(await page.locator('tbody tr').evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height))).toEqual(Array(8).fill(70));
  await page.screenshot({ path: info.outputPath('orders-square-fr.png'), fullPage: true });
  await tabs.getByRole('tab', { name: 'Planifiées', exact: true }).click();
  await expect.poll(() => queries.at(-1)?.searchParams.get('is_scheduled')).toBe('true');
  await tabs.getByRole('tab', { name: 'Tous', exact: true }).click();
  await expect.poll(() => queries.at(-1)?.searchParams.has('status')).toBe(false);
  const tools = page.locator('[data-list-toolbar]');
  await tools.getByRole('button', { name: /Statut de paiement/ }).click();
  await page.getByRole('menuitemradio', { name: 'Payé', exact: true }).click();
  await expect.poll(() => queries.at(-1)?.searchParams.get('payment_status')).toBe('paid');
  await tools.getByRole('searchbox').fill('Client');
  await tools.getByRole('button', { name: 'Rechercher', exact: true }).click();
  await expect.poll(() => queries.at(-1)?.searchParams.get('q')).toBe('Client');
  await tools.getByRole('button', { name: 'Tout effacer', exact: true }).click();
  await expect.poll(() => queries.at(-1)?.searchParams.has('payment_status')).toBe(false);
  await expect.poll(() => queries.at(-1)?.searchParams.has('q')).toBe(false);
  await expect(tabs.getByRole('tab', { name: 'Tous', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(tools.getByRole('searchbox')).toHaveValue('');
  expect(queries.every(url => url.searchParams.get('restaurant_id') === '2')).toBe(true);
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await tools.getByRole('searchbox').fill('Équipe');
  await tools.getByRole('button', { name: 'Rechercher', exact: true }).click();
  await page.locator('tbody tr').first().press('Enter');
  await expect(page).toHaveURL(/\/2\/orders\/\d+/);
  expect(fixture.writes).toEqual([]);
});

for (const locale of ['fr', 'he']) test(`orders tabs support keyboard and mobile without overflow: ${locale}`, async ({ page }, info) => {
  const { fixture, queries } = await install(page, locale, ['orders.view']);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/1/orders/all');
  const selected = page.getByRole('tab', { selected: true });
  await selected.focus();
  await selected.press('Home');
  await expect.poll(() => queries.at(-1)?.searchParams.has('status')).toBe(false);
  await page.getByRole('tab', { selected: true }).press(locale === 'he' ? 'ArrowLeft' : 'ArrowRight');
  await expect.poll(() => queries.at(-1)?.searchParams.get('status')).toContain('in_kitchen');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await expect(page.locator('[data-list-toolbar]').getByRole('searchbox')).toBeVisible();
  await expect(page.locator('[data-list-toolbar]').locator('button[aria-haspopup="dialog"]')).toBeVisible();
  await expect(page.locator('main a[href="/1/orders/new"]')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath(`orders-square-${locale}-mobile.png`), fullPage: true });
  expect(fixture.writes).toEqual([]);
});
