import { test, expect } from '@playwright/test';
import { createFixture } from './fixtures.mjs';
import type { VariantGroupSyncInput } from '../../src/lib/api';

test('reuse a saved variant group under two titles without sending its original option IDs', async ({ page }) => {
  const fixture = createFixture({ library: true });
  const format = { id: 1, name: 'Format', restaurant_id: 1, sort_order: 0, menu_items: [{ id: 1 }], options: [{ id: 101, name: 'Deux lettres', price: 110, is_active: true }] };
  const flavours = { id: 2, name: 'Saveurs', restaurant_id: 1, sort_order: 1, menu_items: [{ id: 1 }, { id: 2 }], options: [{ id: 201, name: 'Chocolat', price: 0, is_active: true }, { id: 202, name: 'Vanille', price: 0, is_active: true }] };
  let sets = [format, flavours];
  let overrides: unknown[] = [];
  Object.assign(fixture.items[0], { name: 'Letter Cake', option_sets: sets, modifier_sets: [] });
  const writes: { groups: VariantGroupSyncInput[] }[] = [];
  await page.addInitScript(() => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Demo', role: 'owner', email: 'demo@foody.test' }));
    localStorage.setItem('foody_restaurant_ids', '[1]');
    localStorage.setItem('foody-admin-locale', 'fr');
  });
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === '/api/v1/menu/option-sets') return route.fulfill({ json: { option_sets: sets } });
    if (path.endsWith('/option-prices')) return route.fulfill({ json: { item_options: overrides } });
    if (path.endsWith('/variants-sync') && request.method() === 'PUT') {
      const body = request.postDataJSON() as { groups: VariantGroupSyncInput[] };
      writes.push(body);
      // The API resolves a new set for a renamed group and requires every
      // submitted option ID to belong to that set.
      if (body.groups.some(group => !group.option_set_id && group.variants.some(option => option.option_id))) {
        return route.fulfill({ status: 400, json: { details: 'record not found', error: 'could not sync variants' } });
      }
      sets = body.groups.map((group, index) => ({
        id: group.option_set_id ?? index + 10, name: group.name, restaurant_id: 1, sort_order: index,
        menu_items: [{ id: 1 }], selection_role: group.selection_role,
        options: group.variants.map((option, optionIndex) => ({
          ...option, id: option.option_id ?? (index + 10) * 100 + optionIndex,
        })),
      }));
      overrides = sets.flatMap(set => set.options.map(option => ({
        menu_item_id: 1, option_set_id: set.id, option_id: option.id, price: option.price, is_active: option.is_active,
      })));
      Object.assign(fixture.items[0], { option_sets: sets });
      return route.fulfill({ json: { option_sets: sets, overrides } });
    }
    const result = fixture.response(request.url(), request.method(), request.postDataJSON() ?? {}, 1);
    return route.fulfill({ status: result.status ?? 200, json: result.json ?? {} });
  });
  await page.goto('/1/menu/items/1');
  await page.getByRole('region', { name: 'Saveurs', exact: true }).getByLabel("Titre d'ensemble (facultatif)").fill('Saveurs première lettre');
  await page.getByRole('region', { name: 'Saveurs première lettre', exact: true }).getByLabel('Rôle du groupe').selectOption('identity');
  await page.getByRole('button', { name: 'Ajouter un autre ensemble', exact: true }).click();
  await page.getByRole('button', { name: "Groupes d'options enregistrés", exact: true }).last().click();
  await page.getByRole('dialog').last().getByRole('button', { name: /Saveurs/ }).click();
  await page.getByRole('region', { name: 'Saveurs', exact: true }).getByLabel("Titre d'ensemble (facultatif)").fill('Saveurs deuxième lettre');
  await page.getByRole('region', { name: 'Saveurs deuxième lettre', exact: true }).getByLabel('Rôle du groupe').selectOption('identity');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).first().click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].groups[0]).toMatchObject({ option_set_id: 1, variants: [{ option_id: 101, price: 110 }] });
  ['Saveurs première lettre', 'Saveurs deuxième lettre'].forEach((title, index) => {
    expect(writes[0].groups[index + 1]).toMatchObject({
      option_set_id: null, name: title, selection_role: 'identity',
      variants: [{ option_id: null, name: 'Chocolat', price: 0 }, { option_id: null, name: 'Vanille', price: 0 }],
    });
  });
  await expect(page).toHaveURL(/\/1\/menu\/items$/);
  await page.goto('/1/menu/items/1');
  for (const title of ['Saveurs première lettre', 'Saveurs deuxième lettre']) {
    const group = page.getByRole('region', { name: title, exact: true });
    const options = group.getByLabel('Variante', { exact: true });
    await expect(options).toHaveCount(2);
    await expect(options.nth(0)).toHaveValue('Chocolat');
    await expect(options.nth(1)).toHaveValue('Vanille');
    await expect(group.getByLabel('Rôle du groupe')).toHaveValue('identity');
  }
  expect(flavours.name).toBe('Saveurs');
  expect(flavours.options.map(option => option.id)).toEqual([201, 202]);
});

test('configure descriptive variant positions in the variants editor and keep the format price', async ({ page }) => {
  const fixture = createFixture({ library: true });
  const sets = [
    { id: 1, name: 'Format', restaurant_id: 1, sort_order: 0, menu_items: [{ id: 1 }], options: [{ id: 101, name: '1 caractère', price: 55, is_active: true }, { id: 102, name: '2 caractères', price: 110, is_active: true }] },
    { id: 2, name: 'Caractère', restaurant_id: 1, sort_order: 1, menu_items: [{ id: 1 }], options: [{ id: 201, name: 'A', price: 999, is_active: true }] },
  ];
  Object.assign(fixture.items[0], { name: 'Number Cake', option_sets: sets, modifier_sets: [] });
  const writes: { groups: Array<{ selection_role: string; selection_config: unknown; variants: Array<{ price: number }> }> }[] = [];
  await page.addInitScript(() => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Demo', role: 'owner', email: 'demo@foody.test' }));
    localStorage.setItem('foody_restaurant_ids', '[1]'); localStorage.setItem('foody-admin-locale', 'fr');
  });
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === '/api/v1/menu/option-sets') return route.fulfill({ json: { option_sets: sets } });
    if (path.endsWith('/variants-sync') && request.method() === 'PUT') { writes.push(request.postDataJSON()); return route.fulfill({ json: { option_sets: sets, overrides: [] } }); }
    const result = fixture.response(request.url(), request.method(), request.postDataJSON() ?? {}, 1);
    return route.fulfill({ status: result.status ?? 200, json: result.json ?? {} });
  });
  await page.goto('/1/menu/items/1');
  const character = page.getByRole('region', { name: 'Caractère', exact: true });
  await character.getByLabel('Rôle du groupe').selectOption('identity');
  await character.getByLabel('Afficher ce groupe selon').selectOption('1');
  await character.getByLabel('1 caractère — Positions à remplir', { exact: true }).fill('1');
  await character.getByLabel('2 caractères — Positions à remplir', { exact: true }).fill('2');
  await character.getByRole('button', { name: 'Ajouter les chiffres et lettres', exact: true }).click();
  await expect(character.getByLabel('Affichage des choix')).toHaveValue('characters');
  expect(writes).toHaveLength(0);
  await page.screenshot({ path: 'test-results/modifier-positions/admin-variant-positions.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).first().click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].groups[0].variants.map(option => option.price)).toEqual([55, 110]);
  expect(writes[0].groups[1].selection_role).toBe('identity');
  expect(writes[0].groups[1].selection_config).toEqual({ source: 'option', source_id: 1, presentation: 'characters', choices: [{ id: 101, count: 1 }, { id: 102, count: 2 }] });
  expect(writes[0].groups[1].variants).toHaveLength(36);
  expect(writes[0].groups[1].variants.every(option => option.price === 0)).toBe(true);
});
