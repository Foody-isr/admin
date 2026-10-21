import { expect, test, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

async function install(page: Page, requiresPIN: boolean, locale = 'fr') {
  const fixture = createFixture();
  const payloads: Record<string, unknown>[] = [];
  await page.addInitScript(locale => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('foody-admin-locale', locale); }, locale);
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const result = fixture.response(request.url(), request.method(), request.postDataJSON() ?? {});
    if (new URL(request.url()).pathname === '/api/v1/auth/validate-invite') {
      return route.fulfill({ json: { ...result.json, kind: 'staff_setup', pos_pin_required: requiresPIN } });
    }
    if (new URL(request.url()).pathname === '/api/v1/auth/setup-account') payloads.push(request.postDataJSON());
    await route.fulfill({ status: result.status ?? 200, json: result.json ?? {} });
  });
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  return { fixture, payloads };
}

async function passwordAndProfile(page: Page) {
  await page.goto('/setup-account?token=staff-demo');
  await page.locator('#setup-password').fill('synthetic-password');
  await page.locator('#setup-confirmPassword').fill('synthetic-password');
  await page.locator('form button[type="submit"]').click();
  await expect(page.locator('#setup-fullName')).toBeVisible();
}

for (const locale of ['fr', 'he', 'en'] as const) {
  test(`courier activates an existing invitation without a POS code ${locale}`, async ({ page }) => {
    const { payloads } = await install(page, false, locale);
    await page.setViewportSize({ width: 390, height: 844 });
    await passwordAndProfile(page);
    await page.locator('form button[type="submit"]').click();
    await expect(page.locator('form')).toHaveCount(0);
    await expect(page.locator('#setup-posPin')).toHaveCount(0);
    await expect(page.locator('.card a[href="/login"]')).toBeVisible();
    await expect(page.getByRole('status')).toContainText({ fr: 'Votre compte est prêt', he: 'החשבון שלך מוכן', en: 'Your account is ready' }[locale]!);
    expect(payloads).toEqual([{ token: 'staff-demo', password: 'synthetic-password', full_name: 'Équipe démo' }]);
    expect(await page.evaluate(() => localStorage.getItem('foody_restaurant_token'))).toBeNull();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
}

test('cashier keeps PIN validation and can retry a duplicate code on the same invitation', async ({ page }) => {
  const { payloads } = await install(page, true);
  await passwordAndProfile(page);
  await page.locator('form button[type="submit"]').click();
  await expect(page.locator('#setup-posPin')).toBeVisible();
  await page.locator('#setup-posPin').fill('4821');
  await page.locator('#setup-confirmPosPin').fill('5932');
  await expect(page.locator('form button[type="submit"]')).toBeDisabled();
  await page.locator('#setup-confirmPosPin').fill('4821');
  let duplicate = true;
  await page.route('**/api/v1/auth/setup-account', route => duplicate ? route.fulfill({ status: 400, json: { error: 'setup_pos_pin_in_use' } }) : route.fallback());
  await page.locator('form button[type="submit"]').click();
  await expect(page.locator('main').getByRole('alert')).toContainText('Ce code caisse est déjà utilisé');
  await expect(page.locator('main').getByRole('alert')).toContainText('Votre invitation reste valide');
  await expect(page.locator('#setup-posPin')).toHaveValue('4821');
  duplicate = false;
  await page.locator('#setup-posPin').fill('5932');
  await page.locator('#setup-confirmPosPin').fill('5932');
  await page.locator('form button[type="submit"]').click();
  await expect(page.locator('form')).toHaveCount(0);
  expect(payloads).toEqual([{ token: 'staff-demo', password: 'synthetic-password', full_name: 'Équipe démo', pos_pin: '5932' }]);
});

for (const [code, message] of [
  ['setup_invite_expired', 'Cette invitation a expiré'],
  ['setup_invite_used', 'Cette invitation a déjà été utilisée'],
  ['setup_invite_context_missing', 'Cette invitation ne permet pas d’identifier le restaurant'],
]) {
  test(`old invitation has actionable recovery ${code}`, async ({ page }) => {
    const { payloads } = await install(page, false);
    await page.route('**/api/v1/auth/validate-invite*', route => route.fulfill({ status: 400, json: { error: code } }));
    await page.goto('/setup-account?token=staff-demo');
    await expect(page.locator('main').getByRole('alert')).toContainText(message);
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    expect(payloads).toEqual([]);
  });
}

test('a courier can retry a service failure without losing the invitation draft', async ({ page }) => {
  const { payloads } = await install(page, false);
  await passwordAndProfile(page);
  let fail = true;
  await page.route('**/api/v1/auth/setup-account', route => fail ? route.fulfill({ status: 500, json: { error: 'account setup failed', details: null } }) : route.fallback());
  await page.locator('form button[type="submit"]').click();
  await expect(page.locator('main').getByRole('alert')).toContainText('La configuration du compte n’a pas abouti');
  await expect(page.locator('#setup-fullName')).toHaveValue('Équipe démo');
  fail = false;
  await page.locator('form button[type="submit"]').click();
  await expect(page.locator('form')).toHaveCount(0);
  expect(payloads[0]).not.toHaveProperty('pos_pin');
});

test('staff profile shows that a courier POS code is not required', async ({ page }) => {
  const { fixture } = await install(page, false);
  Object.assign(fixture.staff[1], { role: 'courier', role_name: 'Courier', pos_pin_required: false });
  await page.addInitScript(() => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'owner', email: 'demo@foody.test' }));
    localStorage.setItem('foody_restaurant_ids', '[1,2]');
  });
  await page.goto('/1/staff');
  await page.getByRole('button', { name: /Responsable démo/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Non requis pour ce rôle');
});

test('new POS permissions during activation explain how to reopen the missing PIN step', async ({ page }) => {
  await install(page, false);
  await passwordAndProfile(page);
  await page.route('**/api/v1/auth/setup-account', route => route.fulfill({ status: 400, json: { error: 'setup_pos_pin_invalid' } }));
  await page.locator('form button[type="submit"]').click();
  await expect(page.locator('main').getByRole('alert')).toContainText('Vos autorisations ont changé. Rechargez cette invitation');
  await expect(page.locator('#setup-fullName')).toHaveValue('Équipe démo');
});
