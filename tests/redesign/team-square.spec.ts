import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

async function install(page: Page, options: { locale?: string; theme?: string; permissions?: string[] } = {}) {
  const fixtureOptions = { empty: false, permissions: options.permissions };
  const fixture = createFixture(fixtureOptions);
  await page.addInitScript(({ locale, theme }) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'owner', email: 'demo@foody.test' }));
    localStorage.setItem('foody_restaurant_ids', '[1,2]');
    localStorage.setItem('foody-admin-locale', locale);
    localStorage.setItem('foody_admin_theme', theme);
  }, { locale: options.locale ?? 'fr', theme: options.theme ?? 'light' });
  await page.route('**/*', route => ['localhost', '127.0.0.1', 'square-fonts-production-f.squarecdn.com'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const result = fixture.response(request.url(), request.method(), request.postDataJSON() ?? {}, Number(request.headers()['x-restaurant-id']) || 1);
    await route.fulfill({ status: result.status ?? 200, json: result.json ?? {} });
  });
  return fixture;
}

test('employees follow the measured Square header, search and three-column table', async ({ page }, info) => {
  const fixture = await install(page);
  await page.goto('/1/staff');
  await expect(page.getByRole('heading', { name: 'Employés', exact: true })).toBeVisible();
  await expect(page.locator('table thead th')).toHaveText(['Nom', 'Poste', 'Statut']);
  const search = await page.locator('.team-search input').boundingBox();
  expect(search).toMatchObject({ x: 304, y: 97, width: 280, height: 40 });
  const header = await page.locator('.team-members-table thead').boundingBox();
  expect(header?.height).toBe(64);
  expect(header?.y).toBe(161);
  const add = await page.getByRole('button', { name: 'Ajouter un employé', exact: true }).boundingBox();
  expect(add?.height).toBe(48);
  await expect(page.locator('.team-list-footer')).toContainText('2 employés');
  await page.screenshot({ path: info.outputPath('employees-fr.png'), animations: 'disabled' });
  expect(fixture.writes).toEqual([]);
});

test('employee search, sorting, role filtering and export use the visible team', async ({ page }) => {
  const fixture = await install(page);
  await page.goto('/1/staff');
  await page.getByRole('searchbox', { name: 'Rechercher', exact: true }).fill('coordination');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Rechercher', exact: true }).fill('');
  await page.getByRole('button', { name: 'Nom', exact: true }).click();
  await expect(page.locator('thead th').first()).toHaveAttribute('aria-sort', 'descending');
  await page.getByRole('button', { name: 'Poste', exact: true }).click();
  await page.getByRole('dialog').getByRole('checkbox', { name: 'Gérant', exact: true }).check();
  await page.getByRole('dialog').getByRole('button', { name: 'Appliquer', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter', exact: true }).click();
  expect((await downloading).suggestedFilename()).toBe('foody-team-1.csv');
  expect(fixture.writes).toEqual([]);
});

test('member details keep role, invitation and PIN status; owner cannot be removed', async ({ page }) => {
  const fixture = await install(page);
  await page.goto('/1/staff');
  await page.getByRole('button', { name: 'Équipe démo', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('owner@foody.test');
  await expect(page.getByRole('dialog')).toContainText('Configuré');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Supprimer', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Équipe démo', exact: true })).toBeFocused();
  await page.getByRole('button', { name: /Responsable démo/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Non configuré');
  await page.getByRole('dialog').getByRole('combobox').selectOption('2');
  await expect.poll(() => fixture.staff[1].role_id).toBe(2);
  await page.getByRole('dialog').getByRole('button', { name: 'Renvoyer l’invitation de configuration', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('status')).toBeVisible();
});

test('employee invitation retains failed input and reports the actual email result', async ({ page }, info) => {
  const fixture = await install(page);
  await page.goto('/1/staff');
  await page.getByRole('button', { name: 'Ajouter un employé', exact: true }).click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel('Nom complet', { exact: true }).fill('Employé de démonstration');
  await editor.getByLabel('Email', { exact: true }).fill('new@foody.test');
  let fail = true;
  await page.route('**/api/v1/restaurants/1/staff/invite', async route => {
    if (fail) return route.fulfill({ status: 503, json: { error: 'Invitation indisponible (test)' } });
    const result = fixture.response(route.request().url(), 'POST', route.request().postDataJSON(), 1);
    return route.fulfill({ json: result.json });
  });
  await editor.getByRole('button', { name: 'Inviter', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('Invitation indisponible');
  await expect(editor.getByLabel('Nom complet', { exact: true })).toHaveValue('Employé de démonstration');
  await page.screenshot({ path: info.outputPath('employee-profile-fr.png'), animations: 'disabled' });
  fail = false;
  await editor.getByRole('button', { name: 'Inviter', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: /new@foody.test/ })).toBeVisible();
  expect(fixture.staff.at(-1)?.full_name).toBe('Employé de démonstration');
});

test('permissions use the Square banner and searchable table; PIN manager only reads setup', async ({ page }, info) => {
  const fixture = await install(page);
  await page.goto('/1/roles');
  await expect(page.getByRole('heading', { name: 'Autorisations', exact: true })).toBeVisible();
  await expect(page.locator('table thead th')).toHaveText(['Nom', 'Accès', 'Membres de l’équipe']);
  expect(await page.locator('.team-passcodes').boundingBox()).toMatchObject({ x: 312, y: 98, height: 104 });
  expect(await page.locator('.team-search input').boundingBox()).toMatchObject({ x: 312, y: 226, width: 280, height: 48 });
  expect((await page.locator('.team-roles-table').boundingBox())?.y).toBe(292);
  await page.screenshot({ path: info.outputPath('permissions-fr.png'), animations: 'disabled' });
  await page.getByRole('searchbox').fill('événementielle');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('searchbox').fill('aucun résultat');
  await expect(page.locator('tbody tr')).toHaveCount(0);
  await page.getByRole('button', { name: 'Gérer les codes confidentiels', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Non configuré');
  await page.getByRole('dialog').getByRole('link', { name: /Responsable démo/ }).click();
  await expect(page).toHaveURL('/1/staff?member=2');
  await expect(page.getByRole('dialog')).toContainText('coordination@foody.test');
  expect(fixture.writes).toEqual([]);
});

test('permission changes save exactly the chosen keys and preserve system role identity', async ({ page }, info) => {
  const fixture = await install(page);
  await page.goto('/1/roles');
  await page.getByRole('button', { name: 'Gérant', exact: true }).click();
  const editor = page.getByRole('dialog');
  await expect(editor.getByLabel('Nom', { exact: true })).toBeDisabled();
  const boxes = editor.getByRole('checkbox');
  await boxes.last().check();
  await page.screenshot({ path: info.outputPath('permissions-editor-fr.png'), animations: 'disabled' });
  await editor.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(fixture.roles[0].name).toBe('Manager');
  expect(fixture.roles[0].permissions.map(value => value.permission)).toContain('staff.manage');
});

test('closing a changed permission set requires discarding', async ({ page }) => {
  const fixture = await install(page);
  await page.goto('/1/roles');
  await page.getByRole('button', { name: 'Créer un ensemble d’autorisations', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Nom', { exact: true }).fill('Brouillon');
  await page.getByRole('dialog').getByRole('button', { name: 'Fermer', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Nom', { exact: true })).toHaveValue('Brouillon');
  expect(fixture.writes).toEqual([]);
});

for (const variant of [
  { locale: 'fr', theme: 'light', width: 375, height: 812 },
  { locale: 'he', theme: 'dark', width: 1440, height: 900 },
]) test(`team workspaces and editors fit ${variant.locale} ${variant.width}`, async ({ page }, info) => {
  await install(page, variant);
  await page.setViewportSize(variant);
  for (const path of ['staff', 'roles']) {
    await page.goto(`/1/${path}`);
    await expect(page.locator('.team-page-header')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`${path}-${variant.locale}.png`), animations: 'disabled' });
    await page.locator('.team-page-actions > button').last().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`${path}-editor-${variant.locale}.png`), animations: 'disabled' });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
});

test('staff readers see details but no staff or permission mutation controls', async ({ page }) => {
  const fixture = await install(page, { permissions: ['staff.view'] });
  await page.goto('/1/staff');
  await expect(page.getByRole('heading', { name: 'Employés', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ajouter un employé', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /Responsable démo/ }).click();
  await expect(page.getByRole('dialog').getByRole('combobox')).toHaveCount(0);
  await expect(page.getByRole('dialog').getByRole('button', { name: /invitation/i })).toHaveCount(0);
  await page.keyboard.press('Escape');
  expect(fixture.writes).toEqual([]);
});

test('staff managers can inspect permission sets without editing permissions', async ({ page }) => {
  const fixture = await install(page, { permissions: ['staff.manage'] });
  await page.goto('/1/roles');
  await expect(page.getByRole('heading', { name: 'Autorisations', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Créer un ensemble d’autorisations', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Gérant', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Enregistrer', exact: true })).toHaveCount(0);
  for (const checkbox of await page.getByRole('dialog').getByRole('checkbox').all()) await expect(checkbox).toBeDisabled();
  expect(fixture.writes).toEqual([]);
});


test('new permission sets keep their draft after a failed save and persist only on explicit save', async ({ page }) => {
  const fixture = await install(page);
  await page.goto('/1/roles');
  await page.getByRole('button', { name: 'Créer un ensemble d’autorisations', exact: true }).click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel('Nom', { exact: true }).fill('Équipe de démonstration');
  await editor.getByRole('checkbox').last().check();
  expect(fixture.writes).toEqual([]);
  let fail = true;
  await page.route('**/api/v1/restaurants/1/roles', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    if (fail) return route.fulfill({ status: 503, json: { error: 'Enregistrement indisponible (test)' } });
    const result = fixture.response(route.request().url(), 'POST', route.request().postDataJSON(), 1);
    return route.fulfill({ json: result.json });
  });
  await editor.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('Enregistrement indisponible');
  await expect(editor.getByLabel('Nom', { exact: true })).toHaveValue('Équipe de démonstration');
  await expect(editor.getByRole('checkbox').last()).toBeChecked();
  fail = false;
  await editor.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(fixture.roles.at(-1)?.permissions.map(value => value.permission)).toEqual(['staff.manage']);
});
