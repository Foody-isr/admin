import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

async function install(page: Page, options: { locale?: string; permissions?: string[]; dark?: boolean } = {}) {
  const fixtureOptions = { empty: false, permissions: options.permissions };
  const fixture = createFixture(fixtureOptions);
  await page.addInitScript(({ locale, dark }) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'owner', email: 'demo@foody.test' }));
    localStorage.setItem('foody_restaurant_ids', '[1,2]');
    localStorage.setItem('foody-admin-locale', locale);
    localStorage.setItem('foody_admin_theme', dark ? 'dark' : 'light');
  }, { locale: options.locale ?? 'fr', dark: options.dark ?? false });
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const result = fixture.response(request.url(), request.method(), request.postDataJSON() ?? {}, Number(request.headers()['x-restaurant-id']) || 1);
    if (result.json && new URL(request.url()).pathname === '/api/v1/chain/branches') Object.assign(result.json, { chain_slug: 'foody-demo', primary_restaurant_id: 1 });
    await route.fulfill({ status: result.status ?? 200, json: result.json ?? {} });
  });
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  return fixture;
}

test('section arrows reveal on hover or keyboard focus without changing the current page', async ({ page }, info) => {
  await install(page);
  await page.goto('/1/dashboard');
  const sidebar = page.locator('aside');
  const section = sidebar.getByRole('button', { name: 'Articles et cartes', exact: true });
  const arrow = section.locator('.restaurant-nav-chevron');
  await expect(arrow).toHaveCSS('opacity', '0');
  await expect(section).toHaveCSS('font-size', '14px');
  await expect(section).toHaveCSS('font-weight', '600');
  await expect(section).toHaveCSS('color', 'rgb(23, 23, 23)');
  await page.screenshot({ path: info.outputPath('sidebar-fr.png'), animations: 'disabled' });
  await section.hover();
  await expect(arrow).toHaveCSS('opacity', '1');
  await section.click();
  await expect(section).toHaveAttribute('aria-expanded', 'true');
  await expect(page).toHaveURL(/\/1\/dashboard$/);
  await page.mouse.move(800, 700);
  await expect(arrow).toHaveCSS('opacity', '0');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(section).toBeFocused();
  await expect(arrow).toHaveCSS('opacity', '1');
});

test('restaurant opens the right account panel, traps focus and restores its trigger', async ({ page }, info) => {
  const fixture = await install(page);
  await page.goto('/1/dashboard');
  const trigger = page.locator('aside').getByRole('button', { name: 'Atelier Foody', exact: true });
  await expect(trigger.locator('svg')).toHaveCount(1);
  await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
  await trigger.click();
  const panel = page.getByRole('dialog', { name: 'Profil', exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Titulaire', { exact: true })).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Paramètres du compte' })).toHaveAttribute('href', '/1/settings');
  await expect(panel.getByRole('button', { name: 'Fermer' })).toBeFocused();
  await expect(panel).toHaveCSS('width', '464px');
  await expect.poll(async () => Math.round((await panel.boundingBox())!.x)).toBe(976);
  await page.screenshot({ path: info.outputPath('account-fr.png'), animations: 'disabled' });
  await page.keyboard.press('Shift+Tab');
  await expect(panel.getByRole('button', { name: 'Déconnexion' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(panel.getByRole('button', { name: 'Fermer' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(panel.getByRole('button', { name: 'Fermer' })).toBeFocused();
  await page.locator('.account-panel-overlay').click({ position: { x: 500, y: 700 } });
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(fixture.writes).toEqual([]);
});

test('branches remain a single direct destination and retain branch switching and global reports', async ({ page }) => {
  await install(page);
  await page.goto('/1/dashboard');
  const branches = page.locator('aside').getByRole('link', { name: 'Succursales', exact: true });
  await expect(branches).toHaveAttribute('href', '/1/chain/branches');
  await branches.click();
  await expect(branches).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Succursales', exact: true })).toBeVisible();
  await expect(page.locator('main').getByRole('link', { name: 'Global (chaîne)', exact: true })).toHaveAttribute('href', '/chain/1/dashboard');
  const branch = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Jardin Foody' }) });
  await branch.getByRole('link', { name: 'Ouvrir l’Admin', exact: true }).click();
  await expect(page).toHaveURL(/\/2\/dashboard$/);
  await expect(page.locator('aside').getByRole('button', { name: 'Jardin Foody', exact: true })).toBeVisible();
});

test('restricted staff can open their account but do not see unauthorized branch or account settings links', async ({ page }) => {
  await install(page, { permissions: ['orders.view'] });
  await page.goto('/1/dashboard');
  await expect(page.locator('aside').getByRole('link', { name: 'Succursales', exact: true })).toHaveCount(0);
  await page.locator('aside').getByRole('button', { name: 'Atelier Foody', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Paramètres du compte' })).toHaveCount(0);
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Déconnexion' })).toBeVisible();
});

for (const locale of ['fr', 'he']) test(`mobile account and navigation preserve focus and fit the viewport ${locale}`, async ({ page }, info) => {
  await install(page, { locale, dark: locale === 'he' });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/1/dashboard');
  const trigger = page.locator('header').getByRole('button', { name: 'Atelier Foody', exact: true });
  await trigger.click();
  const panel = page.locator('.account-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveCSS('width', '375px');
  await page.screenshot({ path: info.outputPath(`account-mobile-${locale}.png`), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.locator('header').getByRole('button', { name: locale === 'fr' ? 'Articles et cartes' : 'פריטים ותפריטים', exact: true }).click();
  const sidebar = page.locator('aside');
  await sidebar.getByRole('button', { name: 'Atelier Foody', exact: true }).click();
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sidebar.getByRole('button', { name: 'Atelier Foody', exact: true })).toBeFocused();
  await expect(sidebar).toBeVisible();
  await sidebar.getByRole('button', { name: 'Atelier Foody', exact: true }).click();
  await panel.locator('a[href="/1/settings"]').click();
  await expect(page).toHaveURL(/\/1\/settings$/);
  await expect(sidebar).toHaveCount(0);
  await expect(panel).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
