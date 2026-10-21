import { expect, test, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';
import type { StaffContactProfile } from '../../src/lib/api';

async function install(page: Page, options: { courier?: boolean; locale?: string; readOnly?: boolean } = {}) {
  const fixtureOptions = { empty: false, permissions: options.readOnly ? ['staff.view'] : undefined };
  const fixture = createFixture(fixtureOptions);
  const member = { ...fixture.staff[1], full_name: 'Employé démo', phone: '+12025550123', address: '1 Rue de démonstration, Ville démo',
    ...(options.courier === false ? {} : { role: 'courier', role_name: 'Courier' }),
    courier_final_address: 'Autre ville démo', courier_final_same_as_address: false, courier_default_end_address: 'Autre ville démo' };
  fixture.staff[1] = member;
  const state = { writes: [] as { rid?: string; path: string; input: StaffContactProfile }[], fail: false };
  await page.addInitScript(({ locale }) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'owner' }));
    localStorage.setItem('foody_restaurant_ids', '[1,2]');
    localStorage.setItem('foody-admin-locale', locale);
  }, { locale: options.locale ?? 'fr' });
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (/\/staff\/\d+\/profile$/.test(path)) {
      const input = request.postDataJSON() as StaffContactProfile;
      state.writes.push({ rid: request.headers()['x-restaurant-id'], path, input });
      if (state.fail) return route.fulfill({ status: 503, json: { error: 'could not update staff profile' } });
      Object.assign(member, input, { courier_default_end_address: input.courier_final_same_as_address ? input.address : input.courier_final_address });
      return route.fulfill({ json: { profile: { id: 77, user_id: member.id, restaurant_id: 1, ...input } } });
    }
    if (path === '/api/v1/public/address-autocomplete') return route.fulfill({ json: { suggestions: [] } });
    const result = fixture.response(request.url(), request.method(), request.postDataJSON() ?? {}, Number(request.headers()['x-restaurant-id']) || 1);
    return route.fulfill({ status: result.status ?? 200, json: result.json ?? {} });
  });
  return state;
}
async function edit(page: Page) {
  await page.goto('/1/staff');
  await page.getByRole('button', { name: 'Employé démo', exact: true }).click();
  await page.getByRole('button', { name: 'Modifier les coordonnées', exact: true }).click();
  return page.getByRole('dialog', { name: 'Modifier les coordonnées', exact: true });
}

test('staff contacts save explicitly with a home-linked courier destination and keep the member identity', async ({ page }) => {
  const state = await install(page);
  const editor = await edit(page);
  await expect(editor.getByLabel('Email de connexion', { exact: true })).toHaveAttribute('readonly', '');
  await expect(editor.getByRole('button', { name: 'Enregistrer', exact: true })).toBeDisabled();
  await editor.getByLabel('Nom complet', { exact: true }).fill('Livreur démo modifié');
  await editor.getByLabel('Téléphone', { exact: true }).fill('+12025550124');
  await editor.getByRole('combobox', { name: 'Adresse du domicile', exact: true }).fill('Nouvelle adresse démo');
  await editor.getByRole('checkbox', { name: 'Même adresse que son domicile', exact: true }).check();
  expect(state.writes).toEqual([]);
  await editor.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  const details = page.getByRole('dialog', { name: 'Livreur démo modifié', exact: true });
  await expect(details).toContainText('+12025550124');
  await expect(details).toContainText('Nouvelle adresse démo');
  expect(state.writes).toEqual([{ rid: '1', path: '/api/v1/restaurants/1/staff/2/profile', input: { full_name: 'Livreur démo modifié', phone: '+12025550124', address: 'Nouvelle adresse démo', courier_final_address: 'Autre ville démo', courier_final_same_as_address: true } }]);
  await details.getByRole('button', { name: 'Modifier les coordonnées', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('checkbox', { name: 'Même adresse que son domicile', exact: true })).toBeChecked();
});

test('a custom final destination survives toggling the home option and phone can be cleared', async ({ page }) => {
  const state = await install(page);
  const editor = await edit(page);
  const same = editor.getByRole('checkbox', { name: 'Même adresse que son domicile', exact: true });
  await same.check(); await same.uncheck();
  await expect(editor.getByRole('combobox', { name: 'Destination finale', exact: true })).toHaveValue('Autre ville démo');
  await editor.getByRole('combobox', { name: 'Destination finale', exact: true }).fill('Ville finale démo');
  await editor.getByLabel('Téléphone', { exact: true }).fill('');
  await editor.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Employé démo', exact: true })).toContainText('Ville finale démo');
  expect(state.writes[0].input).toMatchObject({ phone: '', courier_final_address: 'Ville finale démo', courier_final_same_as_address: false });
});

test('failed saves retain input and closing requires discarding unsaved edits', async ({ page }) => {
  const state = await install(page); state.fail = true;
  const editor = await edit(page);
  await editor.getByLabel('Téléphone', { exact: true }).fill('+12025550124');
  await editor.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('Votre saisie est conservée');
  await expect(editor.getByLabel('Téléphone', { exact: true })).toHaveValue('+12025550124');
  await editor.getByRole('button', { name: 'Fermer', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(editor.getByLabel('Téléphone', { exact: true })).toHaveValue('+12025550124');
  state.fail = false;
  await editor.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Employé démo', exact: true })).toContainText('+12025550124');
  expect(state.writes).toHaveLength(2);
});

test('using the home address requires one and cancellation never writes', async ({ page }) => {
  const state = await install(page);
  const editor = await edit(page);
  await editor.getByRole('combobox', { name: 'Adresse du domicile', exact: true }).fill('');
  await editor.getByRole('checkbox', { name: 'Même adresse que son domicile', exact: true }).check();
  await expect(editor.getByRole('button', { name: 'Enregistrer', exact: true })).toBeDisabled();
  await editor.getByRole('button', { name: 'Fermer', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Abandonner les modifications', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Employé démo', exact: true })).toBeVisible();
  expect(state.writes).toEqual([]);
});

test('non-couriers have contact editing without courier-only settings', async ({ page }) => {
  const state = await install(page, { courier: false });
  const editor = await edit(page);
  await expect(editor.getByRole('checkbox', { name: 'Même adresse que son domicile', exact: true })).toHaveCount(0);
  await editor.getByLabel('Téléphone', { exact: true }).fill('+12025550124');
  await editor.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Employé démo', exact: true })).toContainText('+12025550124');
  expect(state.writes[0].input).not.toHaveProperty('courier_final_address');
});

test('staff readers can inspect contacts without an edit action', async ({ page }) => {
  const state = await install(page, { readOnly: true });
  await page.goto('/1/staff');
  await page.getByRole('button', { name: 'Employé démo', exact: true }).click();
  const details = page.getByRole('dialog');
  await expect(details).toContainText('Autre ville démo');
  await expect(details.getByRole('button', { name: 'Modifier les coordonnées', exact: true })).toHaveCount(0);
  expect(state.writes).toEqual([]);
});

test('Hebrew mobile courier profile preserves RTL and fits the viewport', async ({ page }, info) => {
  await install(page, { locale: 'he' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/1/staff');
  await page.getByRole('button', { name: 'Employé démo', exact: true }).click();
  await page.getByRole('button', { name: 'עריכת פרטי קשר', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'עריכת פרטי קשר', exact: true });
  await expect(editor).toHaveAttribute('dir', 'rtl');
  expect(await editor.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('staff-profile-he-mobile.png'), animations: 'disabled' });
});
