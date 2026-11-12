import { expect, test, type Page } from '@playwright/test';
import { createFixture } from '../redesign/fixtures.mjs';

async function studio(page: Page, locale: 'fr' | 'he' = 'fr', canSign = true) {
  const fixtureOptions = { empty: false, permissions: ['settings.view', 'settings.edit'] };
  const fixture = createFixture(fixtureOptions);
  const writes: { method: string; data: { expected_revision: number; background_color?: string; logo_png?: string; banner_png?: string } }[] = [];
  let design = { revision: 0, background_color: '#FFFFFF', foreground_color: '#15292F', logo_png: null, banner_png: null };
  await page.addInitScript((lang) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-wallet-studio');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Synthetic operator', role: 'owner' }));
    localStorage.setItem('foody_restaurant_ids', '[1]');
    localStorage.setItem('foody-admin-locale', lang);
    localStorage.setItem('foody_admin_theme', lang === 'he' ? 'dark' : 'light');
  }, locale);
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  await page.routeWebSocket('**', socket => socket.close());
  await page.route('**/api/v1/**', async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const rid = Number(req.headers()['x-restaurant-id']);
    if (path.startsWith('/api/v1/loyalty/wallet-studio')) {
      expect(rid).toBe(1);
      expect(req.headers()['authorization']).toBe('Bearer isolated-wallet-studio');
      if (req.method() === 'GET') return route.fulfill({ json: {
        restaurant_id: rid, restaurant_name: 'Bella Italia', can_edit: true, can_sign_test: canSign, design,
        program: { mode: 'visits', threshold: 2, names: { en: 'Bella rewards', fr: 'Les habitués de Bella', he: 'מועדון Bella' } },
      } });
      const data = req.postDataJSON();
      writes.push({ method: req.method(), data });
      if (req.method() === 'PUT') {
        const { expected_revision, ...artwork } = data;
        if (expected_revision !== design.revision) return route.fulfill({ status: 409, json: { error: 'loyalty_conflict' } });
        design = { ...artwork, revision: expected_revision + 1 };
        return route.fulfill({ json: design });
      }
      expect(path).toBe('/api/v1/loyalty/wallet-studio/apple-test');
      return route.fulfill({ contentType: 'application/vnd.apple.pkpass', body: 'synthetic archive from the test API' });
    }
    const response = fixture.response(req.url(), req.method(), req.postDataJSON() ?? {}, rid || 1);
    return route.fulfill({ status: response.status ?? 200, json: response.json ?? {} });
  });
  await page.goto('/1/loyalty/program/wallet');
  return writes;
}

test('edits both previews, saves Bella artwork and downloads the saved Apple test revision', async ({ page }, info) => {
  const writes = await studio(page);
  await expect(page.getByRole('heading', { name: 'Studio Wallet', exact: true })).toBeVisible();
  const generate = page.getByRole('button', { name: 'Générer une carte de test Apple' });
  await expect(generate).toBeDisabled();
  await page.getByLabel('Couleur du fond', { exact: true }).fill('#234F43');
  await page.getByLabel('Couleur du texte', { exact: true }).fill('#FFF2DB');
  const assets = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 144;
    canvas.height = 144;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#FFEDD5';
    ctx.fillRect(0, 0, 144, 144);
    ctx.fillStyle = '#234F43';
    ctx.font = 'bold 58px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText('BI', 72, 91);
    const logo = canvas.toDataURL().split(',')[1];
    canvas.width = 750;
    canvas.height = 288;
    const gradient = ctx.createLinearGradient(0, 0, 750, 250);
    gradient.addColorStop(0, '#234F43');
    gradient.addColorStop(1, '#7E4134');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 750, 288);
    ctx.strokeStyle = '#FFEDD5';
    ctx.lineWidth = 2;
    for (const radius of [68, 92, 116, 140, 164]) {
      ctx.beginPath();
      ctx.arc(622, 195, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    return { logo, banner: canvas.toDataURL().split(',')[1] };
  });
  await page.getByLabel('Logo du restaurant', { exact: true }).setInputFiles({ name: 'bella-logo.png', mimeType: 'image/png', buffer: Buffer.from(assets.logo, 'base64') });
  await expect(page.getByRole('button', { name: 'Retirer Logo du restaurant' })).toBeVisible();
  await page.getByLabel('Bannière de la carte', { exact: true }).setInputFiles({ name: 'bella-banner.png', mimeType: 'image/png', buffer: Buffer.from(assets.banner, 'base64') });
  const apple = page.locator('[data-wallet-preview="apple"]');
  await expect(apple).toHaveCSS('background-color', 'rgb(35, 79, 67)');
  await expect(apple).toHaveCSS('color', 'rgb(255, 242, 219)');
  await expect(apple.locator('img')).toHaveCount(2);
  await page.screenshot({ path: info.outputPath('bella-apple.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('tab', { name: 'Google Wallet' }).click();
  const google = page.locator('[data-wallet-preview="google"]');
  await expect(google).toHaveCSS('background-color', 'rgb(35, 79, 67)');
  await expect(google).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(google.locator('img')).toHaveCount(2);
  await page.screenshot({ path: info.outputPath('bella-google.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
  await expect(page.getByText('Brouillon enregistré.', { exact: true })).toBeVisible();
  expect(writes[0].data).toMatchObject({ expected_revision: 0, background_color: '#234F43', logo_png: assets.logo, banner_png: assets.banner });
  await page.reload();
  await expect(page.getByLabel('Couleur du fond', { exact: true })).toHaveValue('#234F43');
  await generate.click();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Télécharger le .pkpass' }).click();
  expect((await download).suggestedFilename()).toBe('foody-wallet-test.pkpass');
  expect(writes[1]).toEqual({ method: 'POST', data: { expected_revision: 1 } });
});

test('shows the preview in Hebrew on mobile when Apple signing is unavailable', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const writes = await studio(page, 'he', false);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('button', { name: 'יצירת כרטיס בדיקה של Apple' })).toBeDisabled();
  await expect(page.getByRole('tab', { name: 'Google Wallet' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(writes).toHaveLength(0);
  await page.screenshot({ path: info.outputPath('studio-hebrew-mobile.png'), fullPage: true, animations: 'disabled' });
});
