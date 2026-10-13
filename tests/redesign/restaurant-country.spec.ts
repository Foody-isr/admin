import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

async function install(page: Page, locale = 'fr', readOnly = false) {
  const fixture = createFixture({ empty: false });
  const countries: Record<number, string> = { 1: 'IL', 2: 'FR' };
  const control = { failSave: false, countries, writes: [] as { body: Record<string, unknown>; restaurant: string; id: number }[] };
  await page.addInitScript(({ locale }) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Country fixture', role: 'owner', email: 'demo@foody.test' }));
    localStorage.setItem('foody_restaurant_ids', '[1,2]');
    localStorage.setItem('foody-admin-locale', locale);
  }, { locale });
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname, restaurant = request.headers()['x-restaurant-id'], body = request.postDataJSON() ?? {};
    if (path === '/api/v1/users/me' && readOnly) return route.fulfill({ json: { permissions: ['settings.view'], role_name: 'Viewer', user: { id: 1, full_name: 'Country fixture', role: 'owner' } } });
    const match = path.match(/\/restaurants\/(\d+)$/);
    if (match) {
      const id = Number(match[1]);
      if (request.method() === 'PUT') {
        control.writes.push({ body, restaurant, id });
        if (control.failSave) return route.fulfill({ status: 503, json: { error: 'Synthetic country save failure' } });
        if (body.country_code) countries[id] = body.country_code;
      }
      const base = fixture.response(request.url(), 'GET', {}, id).json as { restaurant: Record<string, unknown> };
      return route.fulfill({ json: { restaurant: { ...base.restaurant, country_code: countries[id], timezone: 'Asia/Jerusalem', currency: 'EUR', default_locale: 'he' } } });
    }
    const result = fixture.response(request.url(), request.method(), body, Number(restaurant) || 1);
    return route.fulfill({ json: result.json ?? {}, status: result.status ?? 200 });
  });
  return control;
}

for (const [locale, label] of [['fr', 'Pays'], ['en', 'Country'], ['he', 'מדינה']]) {
  test(`restaurant country is explicit, scoped and persistent · ${locale}`, async ({ page }) => {
    const state = await install(page, locale);
    await page.setViewportSize({ width: locale === 'fr' ? 390 : 1280, height: 900 });
    await page.goto('/1/settings');
    const country = page.getByRole('combobox', { name: label, exact: true });
    await expect(country).toHaveValue('IL');
    await country.selectOption('FR');
    const save = page.locator('form button[type=submit]');
    state.failSave = true;
    await save.click();
    await expect(page.locator('form [role=alert]')).toBeVisible();
    await expect(country).toHaveValue('FR');
    expect(state.countries[1]).toBe('IL');
    state.failSave = false;
    await save.click();
    await expect(save).toBeDisabled();
    expect(state.writes.at(-1)).toEqual({ body: { country_code: 'FR' }, restaurant: '1', id: 1 });
    await page.reload();
    await expect(country).toHaveValue('FR');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('country settings respect view-only permission and the selected restaurant', async ({ page }) => {
  const state = await install(page, 'fr', true);
  await page.goto('/2/settings');
  await expect(page.getByRole('combobox', { name: 'Pays', exact: true })).toHaveValue('FR');
  await expect(page.getByRole('combobox', { name: 'Pays', exact: true })).toBeDisabled();
  expect(state.writes).toHaveLength(0);
});
