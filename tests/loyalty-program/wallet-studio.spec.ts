import { expect, test, type Page } from '@playwright/test';
import { createFixture } from '../redesign/fixtures.mjs';
import type { WalletStudioArtwork } from '../../src/lib/api';

async function studio(page: Page, locale: 'fr' | 'he' = 'fr', canSign = true, legacyBanner?: string) {
  const fixtureOptions = { empty: false, permissions: ['settings.view', 'settings.edit'] };
  const fixture = createFixture(fixtureOptions);
  const writes: { method: string; path: string; data: Partial<WalletStudioArtwork> & { expected_revision: number; apple_strip_png?: string; google_hero_png?: string } }[] = [];
  let design: WalletStudioArtwork & { revision: number } = { revision: legacyBanner ? 1 : 0, background_color: '#FFFFFF', foreground_color: '#15292F', logo_png: null, banner_png: legacyBanner ?? null };
  let publishedRevision = 0;
  await page.addInitScript((lang) => {
    localStorage.setItem('foody_restaurant_portal_session', 'fp1p.e30.fixture.00');
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
      expect(req.headers()['authorization']).toBe('Bearer fp1p.e30.fixture.00');
      if (req.method() === 'GET') return route.fulfill({ json: {
        restaurant_id: rid, restaurant_name: 'Bella Italia', can_edit: true, can_sign_test: canSign, design,
        published_revision: publishedRevision,
        program: { enabled: true, mode: 'visits', threshold: 2, names: { en: 'Bella rewards', fr: 'Les habitués de Bella', he: 'מועדון Bella' } },
      } });
      const data = req.postDataJSON();
      writes.push({ method: req.method(), path, data });
      if (req.method() === 'PUT') {
        const { expected_revision, ...artwork } = data;
        if (expected_revision !== design.revision) return route.fulfill({ status: 409, json: { error: 'loyalty_conflict' } });
        design = { ...artwork, banner_original: artwork.banner_png ? artwork.banner_original ?? design.banner_original : undefined, revision: expected_revision + 1 };
        return route.fulfill({ json: design });
      }
      if (path.endsWith('/publish')) {
        if (data.expected_revision !== design.revision) return route.fulfill({ status: 409, json: { error: 'loyalty_conflict' } });
        publishedRevision = design.revision;
        return route.fulfill({ json: { published_revision: publishedRevision } });
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
  const publish = page.getByRole('button', { name: 'Publier le visuel' });
  await expect(generate).toBeDisabled();
  await expect(publish).toBeDisabled();
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
  const showName = page.getByRole('switch', { name: 'Afficher le nom du restaurant' });
  await expect(showName).toBeChecked();
  await expect(apple.getByText('Bella Italia', { exact: true })).toBeVisible();
  await showName.uncheck();
  await expect(apple.getByText('Bella Italia', { exact: true })).toHaveCount(0);
  await expect(apple.getByRole('link', { name: 'Propulsé par Foody' })).toHaveAttribute('href', /^https:\/\/foody-pos\.co\.il\//);
  await expect(apple).toHaveCSS('background-color', 'rgb(35, 79, 67)');
  await expect(apple).toHaveCSS('color', 'rgb(255, 242, 219)');
  await expect(apple.locator('img')).toHaveCount(2);
  await page.screenshot({ path: info.outputPath('bella-apple.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('tab', { name: 'Google Wallet' }).click();
  const google = page.locator('[data-wallet-preview="google"]');
  await expect(google).toHaveCSS('background-color', 'rgb(35, 79, 67)');
  await expect(google).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(google.locator('img')).toHaveCount(2);
  await expect(google).toContainText('Les habitués de Bella');
  await expect(google.getByRole('link', { name: 'Propulsé par Foody' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('bella-google.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
  await expect(page.getByText('Brouillon enregistré.', { exact: true })).toBeVisible();
  await expect(page.getByText('À publier', { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0].data).toMatchObject({ expected_revision: 0, background_color: '#234F43', hide_restaurant_name: true });
  for (const asset of [writes[0].data.logo_png, writes[0].data.banner_png]) {
    expect(Buffer.from(asset!, 'base64').subarray(1, 4).toString()).toBe('PNG');
  }
  await page.reload();
  await expect(page.getByLabel('Couleur du fond', { exact: true })).toHaveValue('#234F43');
  await expect(showName).not.toBeChecked();
  await expect(apple.getByRole('img', { name: 'Bannière de la carte' })).toBeVisible();
  await generate.click();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Télécharger le .pkpass' }).click();
  expect((await download).suggestedFilename()).toBe('foody-wallet-test.pkpass');
  expect(writes[1]).toEqual({ method: 'POST', path: '/api/v1/loyalty/wallet-studio/apple-test', data: { expected_revision: 1 } });
  await publish.click();
  await expect(page.getByText('Visuel de la carte publié.', { exact: true })).toBeVisible();
  expect(writes[2]).toEqual({ method: 'POST', path: '/api/v1/loyalty/wallet-studio/publish', data: { expected_revision: 1 } });
  await expect(page.getByRole('link', { name: 'Ouvrir la page Fidélité client' })).toHaveAttribute('href', /\/r\/1\/account\/loyalty$/);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copier le lien d’adhésion' }).click();
  await expect(page.getByText('Copié', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/r\/1\/account\/loyalty$/);
  await page.reload();
  await expect(page.getByText('Publié', { exact: true })).toBeVisible();
  await expect(publish).toBeDisabled();
  await page.getByLabel('Couleur du fond', { exact: true }).fill('#123456');
  await expect(publish).toBeDisabled();
  await page.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
  await expect(publish).toBeEnabled();
  await expect(page.getByText('Modifications à publier', { exact: true })).toBeVisible();
});

test('shows the preview in Hebrew on mobile when Apple signing is unavailable', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const writes = await studio(page, 'he', false);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('button', { name: 'יצירת כרטיס בדיקה של Apple' })).toBeDisabled();
  await expect(page.getByRole('tab', { name: 'Google Wallet' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'מופעל על ידי Foody' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(writes).toHaveLength(0);
  await page.screenshot({ path: info.outputPath('studio-hebrew-mobile.png'), fullPage: true, animations: 'disabled' });
});

test('resizes a large banner and keeps the saved image through a failed replacement', async ({ page }) => {
  const writes = await studio(page);
  const file = page.getByLabel('Bannière de la carte', { exact: true });
  const banner = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 2600;
    canvas.height = 900;
    const context = canvas.getContext('2d')!;
    const pixels = context.createImageData(canvas.width, canvas.height);
    let seed = 42;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      pixels.data[i] = seed >>> 24;
      pixels.data[i + 1] = seed >>> 16 & 255;
      pixels.data[i + 2] = seed >>> 8 & 255;
      pixels.data[i + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
  });
  const buffer = Buffer.from(banner, 'base64');
  expect(buffer.byteLength).toBeGreaterThan(1024 * 1024);
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Bannière de la carte', { exact: true }).click();
  await (await chooser).setFiles({ name: 'restaurant.jpg', mimeType: 'image/jpeg', buffer });
  const apple = page.locator('[data-wallet-preview="apple"]');
  const google = page.locator('[data-wallet-preview="google"]');
  for (const [tab, card] of [['Apple Wallet', apple], ['Google Wallet', google]] as const) {
    await page.getByRole('tab', { name: tab }).click();
    const image = card.getByRole('img', { name: 'Bannière de la carte' });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBe(2600);
    expect((await image.boundingBox())!.height).toBeGreaterThan(40);
  }
  await page.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
  await expect(page.getByText('Brouillon enregistré.', { exact: true })).toBeVisible();
  expect(Buffer.from(writes[0].data.banner_png!, 'base64').byteLength).toBeLessThan(1024 * 1024);
  expect(writes[0].data.banner_original === banner).toBe(true);
  await page.reload();
  const saved = apple.getByRole('img', { name: 'Bannière de la carte' });
  await expect(saved).toBeVisible();
  await file.setInputFiles({ name: 'illisible.png', mimeType: 'image/png', buffer: Buffer.from('invalid image') });
  await expect(file).toHaveAccessibleDescription('Cette image est illisible. Essayez un autre fichier.');
  expect(await saved.getAttribute('src') === 'data:image/jpeg;base64,' + banner).toBe(true);
  await file.setInputFiles({ name: 'trop-grande.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
  await expect(file).toHaveAccessibleDescription('Ce fichier dépasse 10 Mo. Choisissez une image plus petite.');
  expect(await saved.getAttribute('src') === 'data:image/jpeg;base64,' + banner).toBe(true);
  const webp = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 12;
    return canvas.toDataURL('image/webp').split(',')[1];
  });
  await file.setInputFiles({ name: 'nouvelle-banniere.webp', mimeType: 'image/webp', buffer: Buffer.from(webp, 'base64') });
  await expect.poll(() => saved.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBe(40);
  await expect(file).toHaveAttribute('aria-invalid', 'false');
  await page.getByRole('button', { name: 'Retirer Bannière de la carte' }).click();
  await expect(saved).toHaveCount(0);
  await page.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
  await expect(page.getByText('Brouillon enregistré.', { exact: true })).toBeVisible();
  expect(writes[1].data.banner_png).toBeNull();
});

test('opening the editor keeps the saved legacy frame until the first adjustment', async ({ page }) => {
  const source = await page.evaluate(() => document.createElement('canvas').toDataURL('image/png').split(',')[1]);
  const writes = await studio(page, 'fr', true, source);
  await page.getByRole('tab', { name: 'Google Wallet' }).click();
  const banner = page.locator('[data-wallet-banner="google"]');
  await expect(banner).toHaveCSS('aspect-ratio', '1032 / 336');
  await page.getByRole('button', { name: 'Cadrer la bannière' }).click();
  await expect(banner).toHaveCSS('aspect-ratio', '1032 / 336');
  await expect(page.getByRole('button', { name: 'Enregistrer le brouillon' })).toBeDisabled();
  await page.getByLabel('Ajustement de l’image').selectOption('contain');
  await expect(banner).toHaveCSS('aspect-ratio', '1032 / 812');
  await expect(page.getByRole('button', { name: 'Enregistrer le brouillon' })).toBeEnabled();
  expect(writes).toHaveLength(0);
});

test('preserves a square original, separate Wallet frames and the Apple counter across saves', async ({ page }) => {
  const writes = await studio(page);
  const source = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 600;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ed182f';
    ctx.fillRect(0, 0, 600, 600);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('Bannière de la carte', { exact: true }).setInputFiles({ name: 'cafe.png', mimeType: 'image/png', buffer: Buffer.from(source, 'base64') });
  const edit = page.getByRole('button', { name: 'Cadrer la bannière' });
  const apple = page.locator('[data-wallet-banner="apple"]');
  const device = page.getByLabel('Wallet à modifier');
  await edit.click();
  await expect(page.getByLabel('Ajustement de l’image')).toHaveValue('contain');
  await expect(apple.locator('[data-wallet-counter]')).toHaveCount(0);
  await expect(apple.getByRole('img')).toBeVisible();
  const area = (await apple.boundingBox())!;
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width, area.y + area.height / 2);
  await page.mouse.up();
  await expect(page.getByLabel('Position horizontale')).toHaveValue('100');
  await page.getByLabel('Position du compteur Apple').selectOption('overlay');
  await expect(apple.locator('[data-wallet-counter]')).toContainText('Visites');
  await device.selectOption('google');
  await page.getByRole('switch', { name: 'Cadrage propre à Google' }).check();
  await page.getByLabel('Ajustement de l’image').selectOption('cover');
  await page.getByRole('slider', { name: 'Zoom', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await device.selectOption('apple');
  await expect(page.getByLabel('Position horizontale')).toHaveValue('100');
  await expect(page.getByRole('slider', { name: 'Zoom', exact: true })).toHaveValue('1');
  await page.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
  await expect(page.getByText('Brouillon enregistré.', { exact: true })).toBeVisible();
  const first = writes[0].data;
  expect(first.banner_original === source).toBe(true);
  expect(first.banner_layout).toMatchObject({ shared: { fit: 'contain', x: 100 }, google: { fit: 'cover', zoom: 1.05 }, apple_counter: 'overlay' });
  const pixels = await page.evaluate(async images => Promise.all(images.map(async data => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + data;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return [img.width, img.height, ctx.getImageData(2, 2, 1, 1).data[3], ctx.getImageData(img.width - 3, 2, 1, 1).data[3]];
  })), [first.apple_strip_png!, first.google_hero_png!]);
  expect(pixels).toEqual([[1125, 432, 0, 255], [1032, 812, 255, 255]]);
  await page.reload();
  await edit.click();
  await expect(page.getByLabel('Position du compteur Apple')).toHaveValue('overlay');
  await device.selectOption('google');
  await expect(page.getByLabel('Ajustement de l’image')).toHaveValue('cover');
  await page.getByRole('switch', { name: 'Cadrage propre à Google' }).uncheck();
  await expect(page.getByLabel('Position horizontale')).toHaveValue('100');
  await page.getByRole('button', { name: 'Réinitialiser le cadrage' }).click();
  await page.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
  await expect(page.getByText('Brouillon enregistré.', { exact: true })).toBeVisible();
  expect(writes[1].data.banner_original).toBeUndefined();
  await page.reload();
  await expect(apple.getByRole('img')).toHaveAttribute('src', 'data:image/png;base64,' + source);
});
