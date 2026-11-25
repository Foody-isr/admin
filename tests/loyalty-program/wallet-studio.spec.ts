import { expect, test, type Page } from '@playwright/test';
import { createFixture } from '../redesign/fixtures.mjs';
import type { WalletStudioArtwork } from '../../src/lib/api';

async function studio(page: Page, locale: 'fr' | 'he' = 'fr', canSign = true, legacyBanner?: string, manual = false, restaurantName = 'Bella Italia') {
  const fixtureOptions = { empty: false, permissions: ['settings.view', 'settings.edit'] };
  const fixture = createFixture(fixtureOptions);
  const writes: { method: string; path: string; data: Partial<WalletStudioArtwork> & { expected_revision: number; apple_strip_png?: string; google_hero_png?: string; poster_png?: string } }[] = [];
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
        restaurant_id: rid, restaurant_name: restaurantName, can_edit: true, can_sign_test: canSign, design, visit_stamps: manual, composed_visit_stamps: manual, composition_version:manual?1:undefined,
        published_revision: publishedRevision,
        program: { enabled: true, mode: 'visits', threshold: manual?10:2, reward_labels: {fr:'Café glacé',en:'Iced coffee',he:'קפה קר'}, names: { en: 'Bella rewards', fr: 'Les habitués de Bella', he: 'מועדון Bella' } },
      } });
      const data = req.postDataJSON();
      writes.push({ method: req.method(), path, data });
      if (req.method() === 'PUT') {
        const { expected_revision, ...artwork } = data;
        delete artwork.composed_visit_stamps;
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

test('applies a banner layout and color palette to the draft and changes only the sample balance', async ({page}, info) => {
  const writes = await studio(page);
  const source = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 360; canvas.height = 200;
    const ctx=canvas.getContext('2d')!;
    ctx.fillStyle='#f6cf9c';ctx.fillRect(0,0,360,200);
    ctx.fillStyle='#473025';ctx.fillRect(130,45,100,84);
    ctx.fillStyle='#f6cf9c';ctx.fillRect(213,61,9,29);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('Bannière de la carte',{exact:true}).setInputFiles({name:'espresso.png',mimeType:'image/png',buffer:Buffer.from(source,'base64')});
  await page.getByRole('button',{name:'Espresso',exact:true}).click();
  await page.getByRole('button',{name:'Compteur sur l’image',exact:true}).click();
  await expect(page.locator('[data-wallet-banner="apple"] [data-wallet-counter]')).toBeVisible();
  await page.getByRole('slider',{name:'Solde de démonstration'}).fill('0');
  await expect(page.locator('[data-wallet-preview="apple"] [data-wallet-counter]')).toContainText('0');
  await page.screenshot({path:info.outputPath('modeles-wallet.png'),fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'Enregistrer le brouillon'}).click();
  await expect.poll(()=>writes.length).toBe(1);
  expect(writes[0].data).toMatchObject({background_color:'#3E2924',banner_original:source,banner_layout:{shared:{fit:'cover'},apple_counter:'overlay'}});
  expect(writes[0].data).not.toHaveProperty('sample');
});

test('generates from the published website, can undo, then saves original art for both Wallets', async ({ page }, info) => {
  const writes = await studio(page);
  const picture = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#D7EACA';
    ctx.fillRect(0, 0, 384, 128);
    ctx.fillStyle = '#18382A';
    ctx.fillRect(104, 30, 100, 65);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  let imports = 0;
  await page.route('**/loyalty/wallet-studio/website-design*', route => {
    imports++;
    expect(route.request().headers()['x-restaurant-id']).toBe('1');
    return route.fulfill({ json: { restaurant_id: 1, palette: { bg: '#fff', ink: '#000', color_styles: {
      default: 'style-3', styles: [{ id: 'style-3', background: '#D7EACA', title: '#18382A' }],
    } }, logo: picture, banner: picture, missing_images: false } });
  });
  const bg = page.getByLabel('Couleur du fond', { exact: true });
  const generate = page.getByRole('button', { name: "Générer avec l'IA" });
  await bg.fill('#FCDED4');
  await generate.click();
  await expect(bg).toHaveValue('#D7EACA');
  await expect(page.getByLabel('Couleur du texte', { exact: true })).toHaveValue('#18382A');
  await expect(page.locator('[data-wallet-banner="apple"] img')).toBeVisible();
  await page.getByRole('tab', { name: 'Google Wallet' }).click();
  await expect(page.locator('[data-wallet-banner="google"] img')).toBeVisible();
  await page.getByRole('button', { name: 'Annuler la proposition' }).click();
  await expect(bg).toHaveValue('#FCDED4');
  await expect(page.locator('[data-wallet-banner="google"]')).toHaveCount(0);
  expect(writes).toHaveLength(0);
  await generate.click();
  await page.getByRole('tab', { name: 'Apple Wallet' }).click();
  await expect(page.getByRole('button', { name: 'Annuler la proposition' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('generation-site-wallet.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({ method: 'PUT', data: { banner_original: picture, background_color: '#D7EACA',
    banner_layout: { shared: { fit: 'cover' }, google: { fit: 'contain' }, apple_counter: 'below' }, apple_strip_png: expect.any(String), google_hero_png: expect.any(String) } });
  expect(imports).toBe(2);
  await expect(page.getByRole('button', { name: 'Annuler la proposition' })).toHaveCount(0);
});

test('keeps existing artwork on partial or empty imports and rejects the wrong restaurant', async ({ page }) => {
  const writes = await studio(page);
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#336699';
    ctx.fillRect(0, 0, 2, 2);
    return canvas.toDataURL().split(',')[1];
  });
  await page.getByLabel('Bannière de la carte', { exact: true }).setInputFiles({ name: 'food.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
  let result: { restaurant_id: number; missing_images: boolean; logo?: string } = { restaurant_id: 1, missing_images: false };
  await page.route('**/loyalty/wallet-studio/website-design*', route => route.fulfill({ json: result }));
  const generate = page.getByRole('button', { name: "Générer avec l'IA" });
  await generate.click();
  await expect(page.getByText(/aucune couleur ni image/)).toBeVisible();
  result = { restaurant_id: 1, logo: image, missing_images: true };
  await generate.click();
  await expect(page.getByText(/Certaines images du site/)).toBeVisible();
  await expect(page.getByLabel('Couleur du fond', { exact: true })).toHaveValue('#336699');
  await expect(page.locator('[data-wallet-banner="apple"]')).toBeVisible();
  result = { restaurant_id: 2, missing_images: false };
  await generate.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Le design du site' })).toBeVisible();
  await expect(page.getByLabel('Couleur du fond', { exact: true })).toHaveValue('#336699');
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

test('builds both manual models, exports each size, and reopens the editable draft', async ({page})=>{
  const writes=await studio(page,'fr',true,undefined,true);
  const picker=page.locator('[data-wallet-composer]');
  await picker.getByRole('button',{name:'Carnet de table'}).click();
  await expect(page.locator('[data-wallet-poster]')).toBeVisible();
  await picker.getByText('Titre du visuel',{exact:true}).click();
  await picker.getByLabel('Texte sur une ou deux lignes').fill('À notre table');
  const source = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 10; canvas.height = 20;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#134f40';
    context.fillRect(2, 4, 6, 10);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.route('**/api/v1/loyalty/wallet-studio/website-design', route =>
    route.fulfill({json:{restaurant_id:1,banner:source,logo:source,missing_images:false,palette:{bg:'#000000'}}}));
  await page.getByRole('button', {name: 'Utiliser la photo du site'}).click();
  await expect(page.getByRole('button',{name:'Retirer Bannière de la carte'})).toBeVisible();
  await page.getByRole('button',{name:'Enregistrer le brouillon'}).click();
  await expect.poll(()=>writes.filter(w=>w.method==='PUT').length).toBe(1);
  expect(writes[0].data.composition).toMatchObject({template:'table',title:'À notre table'});
  expect(writes[0].data).toMatchObject({background_color:'#FBF1DB',logo_png:null,banner_original:source});
  const dimensions=(s:string|undefined)=>{const bytes=Buffer.from(s!,'base64');return [bytes.readUInt32BE(16),bytes.readUInt32BE(20)];};
  expect(dimensions(writes[0].data.poster_png)).toEqual([1074,1344]);
  expect(dimensions(writes[0].data.apple_strip_png)).toEqual([1125,432]);
  expect(dimensions(writes[0].data.google_hero_png)).toEqual([1032,812]);
  await page.reload();await picker.getByText('Titre du visuel',{exact:true}).click();
  await expect(picker.getByLabel('Texte sur une ou deux lignes')).toHaveValue('À notre table');

  await picker.getByRole('button',{name:'Affiche café'}).click();
  await page.getByRole('button',{name:'Utiliser le logo du site'}).click();
  await expect(page.getByRole('button',{name:'Retirer Logo du restaurant'})).toBeVisible();
  await page.getByLabel('Format Apple').selectOption('classic');
  await expect(page.locator('canvas[data-wallet-art="apple"]')).toBeVisible();
  await page.getByRole('tab',{name:'Google Wallet'}).click();
  await expect(page.locator('canvas[data-wallet-art="google"]')).toBeVisible();
  await expect(page.locator('[data-wallet-preview="google"]')).toContainText('Café glacé');
  await page.getByRole('tab',{name:'Apple Wallet'}).click();
  await page.getByLabel('Format Apple').selectOption('poster');
  await expect(page.locator('[data-wallet-poster]')).toContainText('1 / 10');
  await picker.getByText('Motif et fond',{exact:true}).click();
  await picker.getByLabel('Motif',{exact:true}).selectOption('none');
  await page.getByRole('button',{name:'Enregistrer le brouillon'}).click();
  await expect.poll(()=>writes.filter(w=>w.method==='PUT').length).toBe(2);
  expect(writes[1].data.composition).toMatchObject({template:'cafe',pattern:'none',title:'Coffee\nClub'});
  await picker.getByRole('button',{name:'Classique',exact:true}).click();
  await page.getByRole('button',{name:'Enregistrer le brouillon'}).click();
  await expect.poll(()=>writes.filter(w=>w.method==='PUT').length).toBe(3);
  expect(writes[2].data.composition).toEqual({version:1,template:'classic'});
  expect(writes[2].data.poster_png).toBeUndefined();
});

test('fits two large visit rows under the header while preserving the editable poster and native QR', async ({ page }, info) => {
  const writes = await studio(page, 'fr', true, undefined, true, 'Café du marché');
  const composer = page.locator('[data-wallet-composer]');
  const selectCafe = composer.getByRole('button', { name: 'Affiche café' });
  const toggle = page.getByRole('switch', { name: 'Carte à tampons' });
  const sample = page.getByRole('slider', { name: /Solde de démonstration/ });
  const save = page.getByRole('button', { name: 'Enregistrer le brouillon' });
  await selectCafe.click();
  await page.getByLabel('Bannière de la carte', { exact: true }).setInputFiles('public/images/login/cafe-israel.webp');
  await expect(page.getByRole('button', { name: 'Retirer Bannière de la carte' })).toBeVisible();
  const poster = page.locator('[data-wallet-poster]');
  const canvas = poster.locator('canvas[data-wallet-art="poster"]');
  await composer.getByText('Titre du visuel', { exact: true }).click();
  await composer.getByRole('slider', { name: 'Inclinaison', exact: true }).fill('-9');
  await sample.fill('4');
  await save.click();
  await expect(page.getByText('Brouillon enregistré.', { exact: true })).toBeVisible();
  await expect.poll(() => canvas.evaluate((node: HTMLCanvasElement) => node.width)).toBe(720);
  const decoration = await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL());
  await toggle.check();
  await expect(selectCafe).toHaveAttribute('aria-pressed', 'true');
  const grid = poster.locator('[data-wallet-stamps="10"]');
  await expect(grid.locator('.lucide-check')).toHaveCount(4);
  await expect(grid.locator('.lucide-coffee')).toHaveCount(6);
  await expect(poster).toContainText('4 / 10');
  await expect.poll(() => canvas.evaluate((node: HTMLCanvasElement, previous) => node.toDataURL() !== previous, decoration)).toBe(true);
  const card = (await poster.boundingBox())!;
  const counter = (await poster.getByText('4 / 10', { exact: true }).boundingBox())!;
  const qr = (await poster.locator('svg[aria-label]').boundingBox())!;
  // Measurements are relative to the native poster face, excluding the iPhone screen chrome.
  expect(card.width / card.height).toBeCloseTo(358 / 503, 2);
  expect(qr.width / card.width).toBeCloseTo(0.436, 2);
  expect((qr.y - card.y) / card.height).toBeCloseTo(0.471, 2);
  expect((qr.x + qr.width / 2 - card.x) / card.width).toBeCloseTo(0.5, 2);
  await expect(poster.locator('[data-wallet-footer-surface]')).toHaveCSS('background-color', 'rgb(255, 189, 208)');
  await expect(poster.getByText('Propulsé par Foody')).toHaveCSS('color', 'rgb(79, 33, 15)');
  expect((await poster.getByText('Propulsé par Foody').boundingBox())!.y).toBeGreaterThan(qr.y + qr.height);
  const circles = await grid.locator('circle').evaluateAll(nodes => nodes.map(node => {
    const { left, right, top, bottom, width } = node.getBoundingClientRect();
    return { left, right, top, bottom, width };
  }));
  expect(circles.every(circle => circle.width > card.width * 0.12 && circle.top > counter.y + counter.height && circle.bottom < qr.y)).toBe(true);
  expect(circles[0].left).toBeLessThan(card.x + card.width * 0.15);
  expect(circles[4].right).toBeGreaterThan(card.x + card.width * 0.85);
  expect(circles.map(circle => circle.top)).toEqual([...Array(5).fill(circles[0].top), ...Array(5).fill(circles[5].top)]);
  expect(circles[5].top).toBeGreaterThan(circles[0].bottom);
  await poster.screenshot({ path: info.outputPath('affiche-cafe-4-sur-10.png'), animations: 'disabled' });

  await page.getByLabel('Format Apple').selectOption('classic');
  const strip = page.locator('[data-wallet-preview="apple"]');
  await expect(strip.locator('canvas[data-wallet-art="apple"]')).toBeVisible();
  await expect(strip.locator('[data-wallet-stamps]')).toHaveAttribute('data-stamps-earned', '4');
  const stripArt = (await strip.locator('canvas').boundingBox())!;
  const lastAppleStamp = (await strip.locator('[data-wallet-stamps] circle').last().boundingBox())!;
  expect(lastAppleStamp.width).toBeGreaterThan(stripArt.width * 0.096);
  expect(lastAppleStamp.y + lastAppleStamp.height).toBeLessThan(stripArt.y + stripArt.height * 0.62);
  await expect(strip).toContainText('Récompense');
  await page.getByRole('tab', { name: 'Google Wallet' }).click();
  const google = page.locator('[data-wallet-preview="google"]');
  await expect(google.locator('canvas[data-wallet-art="google"]')).toBeVisible();
  await expect(google.locator('[data-wallet-stamps] rect')).toHaveCount(0);
  await expect(google.locator('[data-wallet-stamps] .lucide-coffee')).toHaveCount(6);
  const googleCanvas = google.locator('canvas[data-wallet-art="google"]');
  await expect.poll(() => googleCanvas.evaluate((node: HTMLCanvasElement) => node.width)).toBe(720);
  const googleArt = (await googleCanvas.boundingBox())!;
  const lastGoogleStamp = (await google.locator('[data-wallet-stamps] circle').last().boundingBox())!;
  expect(lastGoogleStamp.width).toBeGreaterThan(googleArt.width * 0.12);
  expect(lastGoogleStamp.y + lastGoogleStamp.height).toBeLessThan(googleArt.y + googleArt.height * 0.41);
  const googleBackground = await googleCanvas.evaluate((node: HTMLCanvasElement) => node.toDataURL());
  await google.screenshot({ path: info.outputPath('affiche-cafe-google.png'), animations: 'disabled' });
  await sample.fill('10');
  await expect(google.locator('[data-wallet-stamps] .lucide-check')).toHaveCount(10);
  await expect(google).toContainText('10 / 10');
  expect(await googleCanvas.evaluate((node: HTMLCanvasElement, previous) => node.toDataURL() === previous, googleBackground)).toBe(true);
  await save.click();
  await expect(page.getByText('Brouillon enregistré.', { exact: true })).toBeVisible();
  expect(writes[1].data).toMatchObject({ expected_revision: 1, composed_visit_stamps: true,
    composition: { template: 'cafe', pattern: 'waves', title_angle: -9 }, stamp_style: { enabled: true, icon: 'coffee' } });
  for (const key of ['poster_png', 'google_hero_png', 'apple_strip_png'] as const) {
    expect(writes[1].data[key] === writes[0].data[key]).toBe(false);
  }
  await page.getByRole('button', { name: 'Générer une carte de test Apple' }).click();
  await expect(page.getByRole('link', { name: 'Télécharger le .pkpass' })).toBeVisible();
  expect(writes[2].data).toMatchObject({ expected_revision: 2, sample: 10 });
  await page.reload();
  await expect(toggle).toBeChecked();
  await expect(selectCafe).toHaveAttribute('aria-pressed', 'true');
  await toggle.uncheck();
  await expect(poster.locator('[data-wallet-stamps]')).toHaveCount(0);
  await expect.poll(async () => (await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL())) === decoration).toBe(true);
  await toggle.check();
  await composer.getByRole('button', { name: 'Carnet de table' }).click();
  await expect(toggle).toBeChecked();
  await expect(poster.locator('[data-wallet-stamps] circle')).toHaveCount(10);
  await save.click();
  await expect(page.getByText('Brouillon enregistré.', { exact: true })).toBeVisible();
  expect(writes[3].data).toMatchObject({ composition: { template: 'table', pattern: 'gingham' }, stamp_style: { enabled: true } });
});

test('selects restaurant motifs in both Wallet previews and reopens a saved sushi design', async ({ page }, info) => {
  const writes = await studio(page, 'fr', true, undefined, true);
  await page.getByRole('switch', { name: 'Carte à tampons' }).check();
  await page.getByRole('slider', { name: /Solde de démonstration/ }).fill('7');
  const picker = page.getByRole('group', { name: 'Motif des visites restantes' });
  const apple = page.locator('[data-wallet-preview="apple"] [data-wallet-stamps]');
  for (const [name, glyph] of [
    ['Hamburger', 'hamburger'], ['Pizza', 'pizza'], ['Pita falafel', 'falafel'], ['Salade', 'salad'],
    ['Bagel', 'bagel'], ['Brochette', 'skewer'], ['Bol de ramen', 'ramen'],
    ['Glace', 'ice-cream-cone'], ['Cookie', 'cookie'], ['Cocktail', 'martini'], ['Sushi', 'sushi'],
  ]) {
    const choice = picker.getByRole('button', { name, exact: true });
    await choice.click();
    await expect(choice).toHaveAttribute('aria-pressed', 'true');
    await expect(apple.locator('.lucide-' + glyph)).toHaveCount(3);
    await expect(apple.locator('.lucide-check')).toHaveCount(7);
  }
  await picker.screenshot({ path: info.outputPath('motifs-des-tampons.png') });
  await page.getByRole('tab', { name: 'Google Wallet' }).click();
  const google = page.locator('[data-wallet-preview="google"] [data-wallet-stamps]');
  await expect(google.locator('.lucide-sushi')).toHaveCount(3);
  await expect(google.locator('.lucide-check')).toHaveCount(7);
  await page.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
  await expect(page.getByText('Brouillon enregistré.', { exact: true })).toBeVisible();
  expect(writes[0].data.stamp_style).toMatchObject({ enabled: true, icon: 'sushi' });
  await page.reload();
  await expect(picker.getByRole('button', { name: 'Sushi', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('saves visit stamps and signs exactly the simulated balance on the same card', async ({ page }, info) => {
  const writes = await studio(page, 'fr', true, undefined, true, 'Café du marché');
  const stampSwitch = page.getByRole('switch', { name: 'Carte à tampons' });
  await stampSwitch.check();
  await page.getByRole('button', { name: 'Croissant', exact: true }).click();
  await page.getByRole('slider', { name: /Solde de démonstration/ }).fill('7');
  const apple = page.locator('[data-wallet-preview="apple"]');
  await expect(apple.locator('[data-wallet-stamps="10"]')).toHaveAttribute('data-stamps-earned','7');
  await expect(apple).toContainText('7 / 10');
  await expect(apple).toContainText('Café glacé');
  await page.getByLabel('Couleur du fond', { exact: true }).fill('#FBF4E5');
  await page.getByLabel('Couleur du texte', { exact: true }).fill('#432D22');
  await page.getByLabel('Bannière de la carte', { exact: true }).setInputFiles('public/images/login/cafe-israel.webp');
  await page.getByRole('button', { name: 'Cadrer la bannière' }).click();
  await page.getByLabel('Ajustement de l’image').selectOption('cover');
  const appleBanner = apple.locator('[data-wallet-banner="apple"]');
  await expect(appleBanner.getByRole('img')).toBeVisible();
  await expect(appleBanner.locator('[data-wallet-stamps] rect')).toBeVisible();
  await apple.screenshot({ path: info.outputPath('visit-stamps-apple.png') });
  await page.getByRole('tab',{name:'Google Wallet'}).click();
  const google = page.locator('[data-wallet-preview="google"]');
  await expect(google.locator('[data-wallet-stamps="10"]')).toHaveAttribute('data-stamps-earned','7');
  await expect(google.locator('[data-wallet-banner="google"] img')).toBeVisible();
  await page.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
  await expect(page.getByText('Brouillon enregistré.', { exact: true })).toBeVisible();
  expect(writes[0].data.stamp_style).toMatchObject({enabled:true, icon:'croissant',columns:5});
  await page.getByRole('button',{name:'Générer une carte de test Apple'}).click();
  await expect(page.getByRole('link',{name:'Télécharger le .pkpass'})).toBeVisible();
  expect(writes[1].data).toMatchObject({expected_revision:1,sample:7});
  await page.getByRole('slider',{name:/Solde de démonstration/}).fill('10');
  await expect(page.getByRole('link',{name:'Télécharger le .pkpass'})).toHaveCount(0);
  await expect(google.locator('[data-wallet-stamps]')).toHaveAttribute('data-stamps-earned','10');
  await page.reload();
  await expect(stampSwitch).toBeChecked();
  await page.getByRole('button',{name:'QR code d’adhésion',exact:true}).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button',{name:'Télécharger le QR code'}).click();
  expect((await download).suggestedFilename()).toBe('foody-loyalty-1.svg');
});
