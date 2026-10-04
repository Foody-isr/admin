import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

async function install(page: Page, options: { locale?: string; theme?: string; permissions?: string[] } = {}) {
  const fixtureOptions = { empty: false, permissions: options.permissions };
  const fixture = createFixture(fixtureOptions);
  const inactive = { ...fixture.items[0], id: 91, name: 'Article inactif de démonstration', is_active: false };
  fixture.items.push(inactive);
  fixture.categories[0].items.push(inactive);
  await page.addInitScript(({ locale, theme }) => {
    localStorage.setItem('foody_restaurant_token','isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user',JSON.stringify({ id:1, full_name:'Équipe démo', role:'owner', email:'demo@foody.test' }));
    localStorage.setItem('foody_restaurant_ids','[1,2]');
    localStorage.setItem('foody-admin-locale',locale);
    localStorage.setItem('foody_admin_theme',theme);
  }, { locale:options.locale ?? 'fr', theme:options.theme ?? 'light' });
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/v1/stock/supplies') return route.fulfill({ json: { supplies: [{ batch_id: 'demo', supplier_name: 'Fournisseur démo', item_count: 2, total_cost: 80, created_at: '2026-10-04T08:00:00Z', created_by_id: 1 }] } });
    if (path === '/api/v1/stock/import/drafts') return route.fulfill({ json: { drafts: [] } });
    const result = fixture.response(request.url(), request.method(), request.postDataJSON() ?? {}, Number(request.headers()['x-restaurant-id']) || 1);
    await route.fulfill({ status:result.status ?? 200, json:result.json ?? {} });
  });
  await page.route('**/*', route => ['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  return fixture;
}

test('articles use the six-control reference rail and no category tabs or KPI cards', async ({ page }, info) => {
  const fixture = await install(page);
  await page.goto('/1/menu/items');
  const rail = page.locator('[data-list-toolbar]');
  await expect(rail.getByRole('searchbox')).toBeVisible();
  await expect(rail.getByRole('button')).toHaveCount(5);
  await expect(rail.getByRole('button',{name:'État Actif',exact:true})).toBeVisible();
  await expect(rail.getByRole('button',{name:'Créer un article',exact:true})).toBeVisible();
  const geometry = await rail.locator('input,button').evaluateAll(elements => elements.map(element => { const r=element.getBoundingClientRect(); return { x:r.x, y:r.y, height:r.height }; }));
  expect(geometry.every(rect => rect.height === 48)).toBe(true);
  expect(new Set(geometry.map(rect => rect.y)).size).toBe(1);
  expect(geometry[0].x).toBe(312);
  expect(geometry[0].y).toBe(48);
  await expect(page.locator('main [data-rail-active]')).toHaveCount(0);
  await expect(page.locator('main').getByRole('button',{name:'Cuisine',exact:true})).toHaveCount(0);
  expect(await rail.getByRole('button',{name:'Créer un article',exact:true}).evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(23, 23, 23)');
  await page.screenshot({ path:info.outputPath('articles-reference-fr.png'), animations:'disabled' });
  expect(fixture.writes).toEqual([]);
});

test('category filtering is drafted, discarded on Escape and applied explicitly', async ({ page }, info) => {
  const fixture = await install(page);
  await page.goto('/1/menu/items');
  const category = page.locator('[data-list-toolbar]').getByRole('button',{name:'Catégorie',exact:true});
  await category.click();
  await page.getByRole('dialog').getByRole('checkbox',{name:'Cuisine',exact:true}).check();
  await page.screenshot({ path:info.outputPath('articles-category-fr.png'), animations:'disabled' });
  await page.keyboard.press('Escape');
  await expect(category).toBeFocused();
  await expect(page.locator('table').getByText('קפה הפוך · Cappuccino',{exact:true})).toBeVisible();
  await category.click();
  await expect(page.getByRole('dialog').getByRole('checkbox',{name:'Cuisine',exact:true})).not.toBeChecked();
  await page.getByRole('dialog').getByRole('checkbox',{name:'Cuisine',exact:true}).check();
  await page.getByRole('dialog').getByRole('button',{name:'Appliquer',exact:true}).click();
  await expect(page.locator('table').getByText('קפה הפוך · Cappuccino',{exact:true})).toHaveCount(0);
  await expect(page.locator('table').getByText('Salade méditerranéenne',{exact:true})).toBeVisible();
  expect(fixture.writes).toEqual([]);
});

test('status menu is immediate and supports keyboard multi-selection', async ({ page }, info) => {
  await install(page);
  await page.goto('/1/menu/items');
  await page.getByRole('button',{name:'État Actif',exact:true}).click();
  await expect(page.getByRole('menuitemcheckbox',{name:'Tous les statuts'})).toHaveAttribute('aria-checked','mixed');
  await page.screenshot({ path:info.outputPath('articles-state-fr.png'), animations:'disabled' });
  await page.getByRole('menuitemcheckbox',{name:'Inactif',exact:true}).click();
  await page.getByRole('menuitemcheckbox',{name:'Actif',exact:true}).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('table').getByText('Article inactif de démonstration',{exact:true})).toBeVisible();
  await expect(page.locator('table').getByText('Salade méditerranéenne',{exact:true})).toHaveCount(0);
});

test('all filters use a nested drawer and Apply keeps category and status in sync', async ({ page }, info) => {
  await install(page);
  await page.goto('/1/menu/items');
  await page.getByRole('button',{name:'Tous les filtres',exact:true}).click();
  const drawer = page.getByRole('dialog');
  await page.screenshot({ path:info.outputPath('articles-filters-fr.png'), animations:'disabled' });
  await drawer.getByRole('button',{name:/^Catégorie/}).click();
  await drawer.getByRole('checkbox',{name:'Cuisine',exact:true}).check();
  await drawer.getByRole('button',{name:'Retour',exact:true}).click();
  await drawer.getByRole('button',{name:/^État/}).click();
  await drawer.getByRole('checkbox',{name:'Inactif',exact:true}).check();
  await drawer.getByRole('checkbox',{name:'Actif',exact:true}).uncheck();
  await drawer.getByRole('button',{name:'Appliquer',exact:true}).click();
  await expect(page.getByRole('button',{name:'État Inactif',exact:true})).toBeVisible();
  await expect(page.locator('table tbody tr').filter({hasText:'Article inactif de démonstration'})).toHaveCount(1);
});

test('settings expand without navigation and retain the global app destinations', async ({ page }, info) => {
  const fixture = await install(page);
  await page.goto('/1/menu/items');
  const nav = page.getByRole('navigation',{name:'Navigation principale'});
  const settings = nav.getByRole('button',{name:'Paramètres',exact:true});
  await settings.click();
  await expect(page).toHaveURL(/\/menu\/items$/);
  await nav.getByRole('button',{name:'Restaurant',exact:true}).click();
  await expect(page).toHaveURL(/\/menu\/items$/);
  await nav.getByRole('link',{name:'Horaires et disponibilité',exact:true}).click();
  await expect(page).toHaveURL(/\/settings\/orders\/availability$/);
  await expect(nav.getByRole('link',{name:'Tableau de bord',exact:true})).toBeVisible();
  await expect(nav.getByRole('button',{name:'Articles et cartes',exact:true})).toBeVisible();
  await expect(nav.getByRole('link',{name:'Horaires et disponibilité',exact:true})).toHaveAttribute('aria-current','page');
  await settings.click();
  await expect(settings).toHaveAttribute('aria-expanded','false');
  await settings.click();
  await page.screenshot({ path:info.outputPath('settings-integrated-fr.png'), animations:'disabled' });
  expect(fixture.writes).toEqual([]);
});

for (const variant of [{ locale:'fr', theme:'light', width:375 }, { locale:'he', theme:'dark', width:1440 }]) {
  test(`reference rail and filter panel support ${variant.locale} at ${variant.width}`, async ({ page }, info) => {
    await install(page,variant);
    await page.setViewportSize({ width:variant.width, height:950 });
    await page.goto('/1/menu/items');
    await expect(page.locator('[data-list-toolbar]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path:info.outputPath(`articles-${variant.locale}-${variant.width}.png`), animations:'disabled' });
    await page.locator('[data-list-toolbar]').getByRole('button',{name:variant.locale === 'fr' ? 'Tous les filtres' : 'כל הסינונים',exact:true}).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.keyboard.press('Escape');
  });
}

for (const path of ['kitchen/stock', 'kitchen/prep', 'menu/menus', 'staff', 'orders/all', 'settings/devices', 'marketing/discounts', 'kitchen/supplies', 'kitchen/suppliers?tab=suppliers', 'kitchen/suppliers?tab=orders', 'settings/team', 'menu/modifiers']) {
  test(`shared reference toolbar: ${path}`, async ({ page }, info) => {
    const fixture = await install(page);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/1/${path}`);
    const rail = page.locator('[data-list-toolbar]');
    await expect(rail.getByRole('searchbox')).toBeVisible();
    await expect(rail.locator('button,a')).toHaveCount(5);
    const controls = await rail.locator('input,button,a').evaluateAll(elements => elements.map(element => { const r = element.getBoundingClientRect(); return { y:r.y, height:r.height }; }));
    expect(controls.every(rect => rect.height === 48)).toBe(true);
    expect(new Set(controls.map(rect => rect.y)).size).toBe(1);
    await rail.getByRole('button', { name:'Tous les filtres', exact:true }).click();
    await expect(page.getByRole('dialog').getByRole('heading', { name:'Filtrer par', exact:true })).toBeVisible();
    await page.keyboard.press('Escape');
    await rail.getByRole('button', { name:'Actions', exact:true }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.screenshot({ path:info.outputPath(`${path.replaceAll('/', '-')}-fr.png`), animations:'disabled' });
    expect(errors).toEqual([]);
    expect(fixture.writes).toEqual([]);
  });
}

test('order payment and status filters apply once and closing discards the draft', async ({ page }) => {
  const fixture = await install(page);
  const queries: URL[] = [];
  page.on('request', request => { const url = new URL(request.url()); if (url.pathname === '/api/v1/orders') queries.push(url); });
  await page.goto('/1/orders/all');
  await expect(page.locator('[data-list-toolbar]')).toBeVisible();
  await page.getByRole('button', { name:'Tous les filtres', exact:true }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('button', { name:/Statut de paiement/ }).click();
  await drawer.getByRole('radio', { name:'Payé', exact:true }).check();
  await page.keyboard.press('Escape');
  expect(queries.at(-1)?.searchParams.get('payment_status')).not.toBe('paid');
  await page.getByRole('button', { name:'Tous les filtres', exact:true }).click();
  await drawer.getByRole('button', { name:/Statut de paiement/ }).click();
  await expect(drawer.getByRole('radio', { name:'Payé', exact:true })).not.toBeChecked();
  await drawer.getByRole('radio', { name:'Payé', exact:true }).check();
  await drawer.getByRole('button', { name:'Appliquer', exact:true }).click();
  await expect.poll(() => queries.at(-1)?.searchParams.get('payment_status')).toBe('paid');
  expect(fixture.writes).toEqual([]);
});

for (const path of ['staff/devices', 'staff/shifts']) {
  test(`reference list without an unsupported create action: ${path}`, async ({ page }) => {
    const fixture = await install(page);
    await page.goto(`/1/${path}`);
    const rail = page.locator('[data-list-toolbar]');
    await expect(rail.getByRole('searchbox')).toBeVisible();
    await expect(rail.getByRole('button')).toHaveCount(4);
    await rail.getByRole('button', { name: 'Tous les filtres', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    expect(fixture.writes).toEqual([]);
    expect(fixture.unhandled).toEqual([]);
  });
}

test('legacy modifier removal retains explicit confirmation after flattening the table', async ({ page }) => {
  const fixture = await install(page);
  Object.assign(fixture.items[0], { modifiers: [{ id: 7, name: 'Supplément démo', action: 'add', category: 'Extras', price_delta: 2 }] });
  await page.goto('/1/menu/modifiers');
  await page.getByRole('button', { name: 'Supprimer · Supplément démo', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Supplément démo', exact: true })).toBeVisible();
  expect(fixture.writes).toEqual([]);
});


test('discarded shift dates cannot be applied later through a different quick filter', async ({ page }) => {
  await install(page);
  const queries: string[] = [];
  page.on('request', request => { const url = new URL(request.url()); if (url.pathname.endsWith('/shifts')) queries.push(url.search); });
  await page.goto('/1/staff/shifts');
  await expect(page.locator('table tbody tr')).toHaveCount(3);
  const original = queries.at(-1);
  await page.getByRole('button', { name: 'Tous les filtres', exact: true }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('button', { name: /^Date/ }).click();
  await drawer.getByLabel('De', { exact: true }).fill('2026-01-01');
  await page.keyboard.press('Escape');
  await page.locator('[data-list-toolbar]').getByRole('button', { name: 'Rôle', exact: true }).click();
  await drawer.getByRole('checkbox', { name: 'Manager', exact: true }).check();
  await drawer.getByRole('button', { name: 'Appliquer', exact: true }).click();
  await expect(page.locator('table tbody tr')).toHaveCount(3);
  expect(queries.at(-1)).toBe(original);
  await page.getByRole('button', { name: 'Tous les filtres', exact: true }).click();
  await drawer.getByRole('button', { name: /^Date/ }).click();
  await expect(drawer.getByLabel('De', { exact: true })).not.toHaveValue('2026-01-01');
});


test('a staff reader can open the integrated team list without general settings or role management', async ({ page }) => {
  const fixture = await install(page, { permissions: ['staff.view'] });
  await page.goto('/1/settings/team');
  await expect(page.locator('table').getByText('Équipe démo', { exact: true })).toBeVisible();
  await page.locator('[data-list-toolbar]').getByRole('button', { name: 'Actions', exact: true }).click();
  await expect(page.getByRole('menuitem')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Général', exact: true })).toHaveCount(0);
  expect(fixture.writes).toEqual([]);
});

test('article column picker keeps variants and quick creation aligned when optional columns are hidden', async ({ page }, info) => {
  const fixture = await install(page);
  Object.assign(fixture.items[0], { variant_groups: [{ id: 1, variants: [{ id: 1, name: 'Grande portion', price: 62, is_active: true }] }] });
  await page.goto('/1/menu/items');
  const picker = page.getByRole('button', { name: 'Colonnes', exact: true });
  await picker.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('dialog', { name: 'Colonnes', exact: true });
  await expect(menu.getByRole('checkbox')).toHaveCount(4);
  expect((await picker.boundingBox())?.width).toBe(32);
  expect((await page.locator('thead tr').boundingBox())?.height).toBe(48);
  expect((await picker.locator('span').boundingBox())?.width).toBe(22);
  await page.screenshot({ path: info.outputPath('articles-columns-fr.png'), animations: 'disabled' });
  for (const name of ['Images', 'Catégorie', 'Disponibilité', 'Prix']) await menu.getByRole('checkbox', { name, exact: true }).uncheck();
  await page.keyboard.press('Escape');
  await expect(picker).toBeFocused();
  const row = page.locator('tbody tr').filter({ hasText: 'Salade méditerranéenne' });
  await expect(row.locator('td')).toHaveCount(3);
  await expect(row.locator('[data-mobile-primary] svg')).toHaveCount(0);
  await row.getByRole('button', { name: 'Développer la ligne Salade méditerranéenne', exact: true }).click();
  await expect(page.locator('tbody tr').filter({ hasText: 'Grande portion' }).locator('td')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Création rapide', exact: true }).locator('..')).toHaveAttribute('colspan', '3');
  await page.getByRole('button', { name: 'Création rapide', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Nom (requis)', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Catégorie', exact: true })).toBeVisible();
  await expect(page.getByLabel('Prix', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  await picker.click();
  await menu.getByRole('button', { name: 'Rétablir les colonnes par défaut' }).click();
  await page.keyboard.press('Escape');
  await expect(row.locator('td')).toHaveCount(6);
  await expect(page.locator('tbody tr').filter({ hasText: 'Grande portion' }).locator('td')).toHaveCount(6);
  expect(fixture.writes).toEqual([]);
});

test('personal article columns persist for this browser user and restaurant without write permissions', async ({ page }) => {
  const fixture = await install(page, { permissions: ['menu.view'] });
  await page.addInitScript(() => {
    localStorage.setItem('foody.items.columns.2.1', JSON.stringify({ price: false }));
    localStorage.setItem('foody.items.columns.1.2', JSON.stringify({ price: false }));
  });
  await page.goto('/1/menu/items');
  await expect(page.getByRole('columnheader', { name: 'Prix', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Colonnes', exact: true }).click();
  await page.getByRole('dialog', { name: 'Colonnes' }).getByRole('checkbox', { name: 'Prix', exact: true }).uncheck();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('tbody').getByText('Salade méditerranéenne', { exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Prix', exact: true })).toHaveCount(0);
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('foody.items.columns.1.1')))!).price).toBe(false);
  expect(fixture.writes).toEqual([]);
});

test('invalid stored article columns fall back to a usable table', async ({ page }) => {
  await install(page);
  await page.addInitScript(() => localStorage.setItem('foody.items.columns.1.1', '{broken'));
  await page.goto('/1/menu/items');
  await expect(page.getByRole('columnheader', { name: 'Prix', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Colonnes', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Colonnes' }).getByRole('checkbox', { name: 'Prix', exact: true })).toBeChecked();
});

test('unavailable browser storage reports that article column choices were not saved', async ({ page }) => {
  const fixture = await install(page);
  await page.goto('/1/menu/items');
  await page.getByRole('button', { name: 'Colonnes', exact: true }).click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('foody.items.columns.')) throw new DOMException('Storage unavailable', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  const menu = page.getByRole('dialog', { name: 'Colonnes' });
  await menu.getByRole('checkbox', { name: 'Prix', exact: true }).uncheck();
  await expect(menu.getByRole('status')).toContainText('n’a pas pu être enregistrée');
  await expect(page.getByRole('columnheader', { name: 'Prix', exact: true })).toHaveCount(0);
  expect(fixture.writes).toEqual([]);
});

test('navigation starts with the restaurant, keeps profile access and uses a black symbol favicon', async ({ page }) => {
  const fixture = await install(page);
  await page.goto('/1/menu/items');
  const sidebar = page.locator('aside');
  await expect(sidebar.locator('svg[viewBox="0 0 348 128"], svg[viewBox="0 0 100 100"]')).toHaveCount(0);
  await expect(sidebar.getByRole('button', { name: 'Atelier Foody', exact: true })).toBeVisible();
  await sidebar.getByRole('button', { name: 'Foody · Profil', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Profil', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sidebar.getByRole('button', { name: 'Foody · Profil', exact: true })).toBeFocused();
  await sidebar.getByRole('button', { name: 'Réduire le menu', exact: true }).click();
  const profile = sidebar.getByRole('button', { name: 'Foody · Profil', exact: true });
  expect((await profile.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await profile.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Profil', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  const favicon = page.locator('link[rel="icon"]');
  await expect(favicon).toHaveCount(1);
  await expect(favicon).toHaveAttribute('href', '/brand/favicon.svg?v=c2-mono');
  const response = await page.request.get('/brand/favicon.svg?v=c2-mono');
  expect(await response.text()).toContain('fill="#171717"');
  expect(fixture.writes).toEqual([]);
});

test('orders retain their shared column options behind the circular header control', async ({ page }) => {
  const fixture = await install(page);
  await page.goto('/1/orders/all');
  const picker = page.getByRole('button', { name: 'Colonnes', exact: true });
  await picker.click();
  await expect(page.getByRole('dialog', { name: 'Colonnes' })).toContainText("S'applique à toute l'équipe de ce restaurant.");
  await expect(page.getByRole('dialog', { name: 'Colonnes' }).getByRole('checkbox').first()).toBeVisible();
  expect((await picker.locator('span').boundingBox())?.width).toBe(22);
  await page.keyboard.press('Escape');
  await expect(picker).toBeFocused();
  expect(fixture.writes).toEqual([]);
});

test('article column controls stay within the Hebrew desktop viewport', async ({ page }, info) => {
  await install(page, { locale: 'he' });
  await page.goto('/1/menu/items');
  await page.getByRole('button', { name: 'עמודות', exact: true }).click();
  const menu = page.getByRole('dialog', { name: 'עמודות', exact: true });
  await expect(menu).toHaveAttribute('dir', 'rtl');
  const bounds = (await menu.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(32);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(1440);
  await menu.getByRole('checkbox', { name: 'תמונות', exact: true }).uncheck();
  await page.screenshot({ path: info.outputPath('articles-columns-he.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'עמודות', exact: true })).toBeFocused();
});
