import { expect, test, type Page } from '@playwright/test';
import type { FullServiceSettings } from '../../src/lib/api';
import { createFixture } from './fixtures.mjs';

const firstLabel = 'Automatically select the first variant';
const skipLabel = 'Skip customization when possible';

async function install(page: Page, options: { locale?: string; theme?: string; permissions?: string[] } = {}) {
  const fixtureOptions = { library: true, permissions: options.permissions };
  const fixture = createFixture(fixtureOptions);
  let service: FullServiceSettings = {
    seating_mode: 'optionalSeats', send_and_stay: false, coursing_enabled: true,
    courses: ['Starters', 'Mains'], show_held_on_kds: false, sort_cart: 'course',
    comp_reasons: ['Demo reason'], void_reasons: ['Demo reason'],
  };
  const serviceWrites: { restaurant: string | undefined; value: FullServiceSettings }[] = [];
  await page.addInitScript(({ locale, theme }) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Demo', role: 'owner', email: 'demo@foody.test' }));
    localStorage.setItem('foody_restaurant_ids', '[1]');
    localStorage.setItem('foody-admin-locale', locale);
    localStorage.setItem('foody_admin_theme', theme);
  }, { locale: options.locale ?? 'en', theme: options.theme ?? 'light' });
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = request.postDataJSON() ?? {};
    if (path === '/api/v1/orders/kds/stations') return route.fulfill({ json: { stations: [] } });
    if (path === '/api/v1/restaurants/1/devices') return route.fulfill({ json: { devices: [] } });
    if (path === '/api/v1/restaurants/1/settings') {
      if (request.method() === 'PUT') {
        expect(Object.keys(body).sort()).toEqual(['full_service', 'full_service_base']);
        expect(body.full_service_base).toEqual(service);
        service = body.full_service;
        serviceWrites.push({ restaurant: request.headers()['x-restaurant-id'], value: structuredClone(service) });
      }
      const result = fixture.response(request.url(), 'GET', {}, 1);
      const data = result.json as { settings?: Record<string, unknown> } | undefined;
      return route.fulfill({ json: { settings: { ...data?.settings, full_service: service, pos_settings_merge_supported: true } } });
    }
    const result = fixture.response(request.url(), request.method(), body, 1);
    await route.fulfill({ status: result.status ?? 200, json: result.json ?? {} });
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    // Production bundles keep their build-time API origin; every API path is
    // still handled by the isolated fixture registered above.
    return ['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/v1/') ? route.fallback() : route.abort();
  });
  return { fixture, serviceWrites };
}

test('legacy item defaults are preserved, and checkout changes wait for Save', async ({ page }) => {
  const { fixture } = await install(page);
  await page.goto('/1/menu/items/1');
  const first = page.getByRole('switch', { name: firstLabel, exact: true });
  const skip = page.getByRole('switch', { name: skipLabel, exact: true });
  await expect(first).toBeChecked();
  await expect(skip).not.toBeChecked();
  await first.focus(); await page.keyboard.press('Space');
  await skip.focus(); await page.keyboard.press('Space');
  expect(fixture.writes).toEqual([]);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL('/1/menu/items');
  expect(fixture.items[0]).toMatchObject({ pos_auto_select_first_variant: false, pos_skip_customization: true });
  await page.goto('/1/menu/items/1');
  await expect(first).not.toBeChecked();
  await expect(skip).toBeChecked();
});

test('cancel discards an existing item checkout change', async ({ page }) => {
  const { fixture } = await install(page);
  await page.goto('/1/menu/items/1');
  await page.getByRole('switch', { name: skipLabel, exact: true }).focus();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Cancel', exact: true }).last().click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(page).toHaveURL('/1/menu/items');
  expect(fixture.writes).toEqual([]);
});

test('new checkout preferences survive draft recovery and are saved on creation', async ({ page }) => {
  const { fixture } = await install(page);
  await page.goto('/1/menu/items/new');
  await page.locator('#menu-item-name').fill('New checkout item');
  await page.getByRole('textbox', { name: 'Selling price', exact: true }).fill('25');
  await page.getByRole('switch', { name: firstLabel, exact: true }).focus(); await page.keyboard.press('Space');
  await page.getByRole('switch', { name: skipLabel, exact: true }).focus(); await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('foody.menu.itemDraft.1') ?? '{}').posSkipCustomization)).toBe(true);
  page.once('dialog', dialog => dialog.accept());
  await page.reload();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.getByRole('switch', { name: firstLabel, exact: true })).not.toBeChecked();
  await expect(page.getByRole('switch', { name: skipLabel, exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL('/1/menu/items');
  expect(fixture.items.at(-1)).toMatchObject({ name: 'New checkout item', pos_auto_select_first_variant: false, pos_skip_customization: true });
});

test('automatic progression saves independently with the restaurant service policy', async ({ page }) => {
  const { serviceWrites } = await install(page);
  await page.goto('/1/settings/modes/default/order-entry');
  const progression = page.getByRole('switch', { name: 'Automatic progression', exact: true });
  await expect(progression).not.toBeChecked();
  await progression.check();
  expect(serviceWrites).toEqual([]);
  await page.locator('.pos-editor-head button[type=submit]').click();
  await expect(progression).toBeChecked();
  await expect(page.locator('.pos-editor-head button[type=submit]')).toBeDisabled();
  expect(serviceWrites).toEqual([{ restaurant: '1', value: {
    seating_mode: 'optionalSeats', send_and_stay: false, coursing_enabled: true,
    courses: ['Starters', 'Mains'], show_held_on_kds: false, sort_cart: 'course',
    comp_reasons: ['Demo reason'], void_reasons: ['Demo reason'], auto_progression: true,
  } }]);
});

test('read-only roles cannot change either checkout preference or progression', async ({ page }) => {
  const { fixture, serviceWrites } = await install(page, { permissions: ['menu.view', 'settings.view'] });
  await page.goto('/1/menu/items/1');
  await expect(page.getByRole('switch', { name: firstLabel, exact: true })).toBeDisabled();
  await expect(page.getByRole('switch', { name: skipLabel, exact: true })).toBeDisabled();
  await page.goto('/1/settings/modes/default/order-entry');
  await expect(page.getByRole('switch', { name: 'Automatic progression', exact: true })).toBeDisabled();
  expect(fixture.writes).toEqual([]);
  expect(serviceWrites).toEqual([]);
});

test('dark item dialogs keep close controls and staged stock notices readable', async ({ page }) => {
  const { fixture } = await install(page, { theme: 'dark' });
  Object.assign(fixture.items[0], { immediate_sale_mode: 'standalone', stock_quantity: 10, stock_mode: 'count' });
  await page.goto('/1/menu/items/1');
  await page.locator('.item-stock-quantity').click();
  await page.getByRole('combobox', { name: 'Track availability using', exact: true }).selectOption('recipe');
  const notice = page.locator('.item-settings-notice');
  await expect(notice).toBeVisible();
  for (const locator of [notice, page.locator('.item-settings-close')]) {
    expect(await locator.evaluate(el => ({ background: getComputedStyle(el).backgroundColor, text: getComputedStyle(el).color })))
      .toEqual({ background: 'rgb(38, 38, 38)', text: 'rgb(245, 245, 245)' });
  }
  await page.locator('.item-settings-dialog').getByRole('button', { name: 'Apply', exact: true }).click();
  const status = page.locator('.item-stock-status');
  await expect(status).toHaveAttribute('data-state-tone', 'pending');
  expect(await status.evaluate(el => ({ background: getComputedStyle(el).backgroundColor, text: getComputedStyle(el).color })))
    .toEqual({ background: 'rgb(38, 38, 38)', text: 'rgb(245, 245, 245)' });
  expect(fixture.writes).toEqual([]);
});

for (const locale of ['fr', 'he']) test(`checkout settings remain readable on mobile in ${locale}`, async ({ page }, info) => {
  await install(page, { locale, theme: locale === 'he' ? 'dark' : 'light' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/1/menu/items/1');
  const section = page.locator('#item-checkout');
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByRole('switch')).toHaveCount(2);
  await expect(section).not.toContainText('itemCheckout');
  const colors = await section.evaluate(el => {
    const style = getComputedStyle(el.closest('.item-editor')!);
    return { background: style.backgroundColor, text: style.color };
  });
  expect(colors).toEqual(locale === 'he'
    ? { background: 'rgb(28, 28, 28)', text: 'rgb(245, 245, 245)' }
    : { background: 'rgb(255, 255, 255)', text: 'rgb(26, 26, 26)' });
  expect(await page.locator('[data-item-editor-scroll]').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath(`checkout-${locale}.png`) });
});
