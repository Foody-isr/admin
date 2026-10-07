import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

async function install(page: Page, locale = 'fr', restricted = false) {
  const fixtureOptions = { empty: false, permissions: restricted ? ['orders.view'] : undefined };
  const fixture = createFixture(fixtureOptions);
  await page.addInitScript(({ locale }) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'owner' }));
    localStorage.setItem('foody_restaurant_ids', '[1,2]');
    localStorage.setItem('foody-admin-locale', locale);
    localStorage.setItem('foody_admin_theme', locale === 'he' ? 'dark' : 'light');
  }, { locale });
  await page.route('**/*', route => ['localhost', '127.0.0.1', 'square-fonts-production-f.squarecdn.com'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const response = fixture.response(request.url(), request.method(), request.postDataJSON() ?? {}, Number(request.headers()['x-restaurant-id']) || 1);
    await route.fulfill({ status: response.status ?? 200, json: response.json ?? {} });
  });
  return fixture;
}

for (const variant of [
  { locale: 'fr', width: 1440, height: 1000 },
  { locale: 'fr', width: 375, height: 812 },
  { locale: 'he', width: 1024, height: 900 },
]) test(`Square detail drawer, single scroll and safe close: ${variant.locale}-${variant.width}`, async ({ page }, info) => {
  const fixture = await install(page, variant.locale);
  await page.setViewportSize(variant);
  await page.goto('/1/orders/1048?q=Client');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Client démo', exact: true })).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.width).toBe(Math.min(444, variant.width));
  expect(box!.height).toBe(variant.height);
  expect(box!.x).toBe(variant.locale === 'he' ? 0 : variant.width - box!.width);
  const scroll = page.locator('[data-order-detail-scroll]');
  expect(await scroll.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  const toolbarButton = dialog.getByRole('button').first();
  const top = (await toolbarButton.boundingBox())!.y;
  await page.screenshot({ path: info.outputPath('detail-top.png') });
  await scroll.evaluate(el => el.scrollTop = el.scrollHeight);
  expect((await toolbarButton.boundingBox())!.y).toBe(top);
  await page.screenshot({ path: info.outputPath('detail-bottom.png') });
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/1\/orders\/all\?q=Client/);
  expect(fixture.writes).toEqual([]);
});

test('overflow preserves payment and reference actions; nested dialog returns to detail', async ({ page }) => {
  const fixture = await install(page);
  await page.goto('/1/orders/1048');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Actions', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Modifier', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Envoyer la confirmation', exact: true })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Encaisser', exact: true }).click();
  await expect(page.getByRole('dialog', { includeHidden: true })).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  await page.getByRole('menuitem', { name: /Activité/ }).click();
  await expect(page.getByRole('dialog', { includeHidden: true })).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  expect(fixture.writes).toEqual([]);
});

test('limited role hides management utilities and primary actions', async ({ page }) => {
  const fixture = await install(page, 'fr', true);
  await page.goto('/1/orders/1048');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button').filter({ hasText: /Marquer|Accepter/ })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Actions', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /Encaisser|Modifier|Corriger|Supprimer/ })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: /Activité/ })).toBeVisible();
  expect(fixture.writes).toEqual([]);
});

test('delivery facts and the settled payment method remain truthful in the compact layout', async ({ page }) => {
  const fixture = await install(page);
  Object.assign(fixture.orders[0], {
    order_type: 'delivery', delivery_address: '10 rue Démo', delivery_city: 'Ville démo',
    delivery_floor: '2', delivery_apt: '4', courier_name: 'Coursier démo', courier_phone: '+15550101010',
    courier_assigned_at: '2026-10-07T12:00:00Z', payment_status: 'paid',
    external_metadata: { payment_method: 'credit_card' },
  });
  await page.goto('/1/orders/1048');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/10 rue Démo/)).toBeVisible();
  await expect(dialog.getByText('Coursier démo', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('link', { name: '+15550101010', exact: true })).toHaveAttribute('href', 'tel:+15550101010');
  const payment = dialog.locator('section[aria-labelledby$="payment-summary"]');
  await expect(payment).toContainText('Carte');
  await expect(payment).not.toContainText('À encaisser en espèces');
  expect(await page.locator('[data-order-detail-scroll]').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(fixture.writes).toEqual([]);
});
