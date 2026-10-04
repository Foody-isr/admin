import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

async function install(page: Page, { locale = 'en', passkey = true, theme = 'light' } = {}) {
  const fixture = createFixture();
  await page.addInitScript(({ locale, passkey, theme }) => {
    localStorage.setItem('foody-admin-locale', locale);
    localStorage.setItem('foody_admin_theme', theme);
    if (window.PublicKeyCredential) {
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = async () => passkey;
    }
  }, { locale, passkey, theme });
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const result = fixture.response(request.url(), request.method(), request.postDataJSON() ?? {});
    await route.fulfill({ status: result.status ?? 200, json: result.json ?? {} });
  });
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  return fixture;
}

test('login reference geometry and empty/filled floating labels', async ({ page }, info) => {
  const fixture = await install(page);
  await page.setViewportSize({ width: 1440, height: 718 });
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Sign in with a passkey' })).toBeVisible();
  const email = page.getByLabel('Email', { exact: true });
  const field = await email.boundingBox();
  expect(field).toEqual({ x: 65, y: 296, width: 590, height: 64 });
  const button = await page.getByRole('button', { name: 'Continue', exact: true }).boundingBox();
  expect(button).toEqual({ x: 65, y: 392, width: 590, height: 48 });
  expect(await page.locator('aside').boundingBox()).toMatchObject({ x: 720, width: 720 });
  await page.screenshot({ path: info.outputPath('login-empty-desktop.png'), animations: 'disabled' });
  await email.fill('demo@foody.test');
  await email.blur();
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('demo@foody.test');
  await expect(page.locator('#login-email + label')).toHaveCSS('font-size', '14px');
  await page.screenshot({ path: info.outputPath('login-filled-desktop.png'), animations: 'disabled' });
  expect(fixture.writes).toEqual([]);
});

test('email step validates locally, focuses password and allows changing identity safely', async ({ page }) => {
  const fixture = await install(page, { passkey: false });
  await page.goto('/login');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.locator('#login-password')).toHaveCount(0);
  await page.getByLabel('Email', { exact: true }).fill('demo@foody.test');
  await page.getByLabel('Email', { exact: true }).press('Enter');
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
  expect(fixture.writes).toEqual([]);
  await page.getByLabel('Password', { exact: true }).fill('unsent-local-password');
  await page.getByRole('button', { name: 'Show password · Password' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Email', { exact: true })).toBeFocused();
  await page.getByLabel('Email', { exact: true }).fill('another@foody.test');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
  expect(fixture.writes).toEqual([]);
});

for (const remember of [true, false]) test(`password sign-in remembers session: ${remember}`, async ({ page }) => {
  await install(page, { passkey: false });
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('demo@foody.test');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill('demo-local');
  await page.getByLabel('Keep me signed in').setChecked(remember);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('/select-restaurant');
  expect(await page.evaluate(() => ({ local: !!localStorage.getItem('foody_restaurant_token'), session: !!sessionStorage.getItem('foody_restaurant_token') }))).toEqual({ local: remember, session: !remember });
});

test('passkey failure leaves email and password sign-in available', async ({ page }) => {
  await install(page);
  await page.route('**/api/v1/auth/webauthn/login/begin', route => route.fulfill({ status: 503, json: { error: 'Local fixture unavailable' } }));
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('demo@foody.test');
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expect(page.locator('#login-error')).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('demo@foody.test');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
  await expect(page.locator('#login-error')).toHaveCount(0);
});

test('dismissing a passkey prompt does not display a failure or lose the email', async ({ page }) => {
  await install(page);
  await page.addInitScript(() => { navigator.credentials.get = async () => { throw new DOMException('Dismissed in test', 'NotAllowedError'); }; });
  await page.route('**/api/v1/auth/webauthn/login/begin', route => route.fulfill({ json: { session_id: 'local-only', options: { publicKey: { challenge: 'bG9jYWwtdGVzdA', rpId: 'localhost', userVerification: 'required' } } } }));
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('demo@foody.test');
  const key = page.getByRole('button', { name: 'Sign in with a passkey' });
  await key.click();
  await expect(key).toBeEnabled();
  await expect(page.locator('#login-error')).toHaveCount(0);
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('demo@foody.test');
});

for (const variant of [
  { locale: 'fr', width: 1440, height: 718 },
  { locale: 'he', width: 1440, height: 718, theme: 'dark' },
  { locale: 'fr', width: 375, height: 812 },
  { locale: 'he', width: 375, height: 812, theme: 'dark' },
  { locale: 'en', width: 768, height: 1024 },
  { locale: 'en', width: 1024, height: 768 },
]) test(`login responsive ${variant.locale} ${variant.width}`, async ({ page }, info) => {
  const fixture = await install(page, variant);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize(variant);
  await page.goto('/login');
  await expect(page.locator('main h1')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await expect(page.locator('main')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.screenshot({ path: info.outputPath('login.png'), animations: 'disabled', fullPage: true });
  await page.locator('#login-email').fill('demo@foody.test');
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('#login-password')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: info.outputPath('password.png'), animations: 'disabled', fullPage: true });
  expect(errors).toEqual([]);
  expect(fixture.writes).toEqual([]);
});

test('passkey signs in without email through the existing server challenge and finish endpoints', async ({ page }) => {
  const fixture = await install(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', transport: 'internal', hasResidentKey: true,
    hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true,
  } });
  let finish: Record<string, any> | undefined;
  await page.route('**/api/v1/auth/webauthn/login/begin', route => route.fulfill({ json: {
    session_id: 'local-only', options: { publicKey: {
      challenge: 'c3ludGhldGljLWNoYWxsZW5nZS1mb29keQ', rpId: 'localhost', userVerification: 'required', timeout: 10000,
    } },
  } }));
  await page.route('**/api/v1/auth/webauthn/login/finish?session_id=local-only', route => {
    finish = route.request().postDataJSON();
    const result = fixture.response('http://localhost/api/v1/auth/login', 'POST', { email: 'demo@foody.test', password: 'demo-local' });
    return route.fulfill({ json: result.json });
  });
  await page.goto('/login');
  // Create a test-only resident credential on Chromium's virtual authenticator.
  await page.evaluate(async () => {
    await navigator.credentials.create({ publicKey: {
      challenge: new TextEncoder().encode('isolated-login-test'), rp: { name: 'Local fixture', id: 'localhost' },
      user: { id: new TextEncoder().encode('local-user'), name: 'demo@foody.test', displayName: 'Local fixture' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' }, timeout: 10000,
    } });
  });
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expect(page).toHaveURL('/select-restaurant');
  expect(finish?.type).toBe('public-key');
  expect(finish?.response.signature).toBeTruthy();
  expect(await page.evaluate(() => localStorage.getItem('foody.passkey.device'))).toBe('1');
});
