import { test, expect } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

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
