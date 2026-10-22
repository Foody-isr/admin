import { test, expect } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

test('configure Number Cake positions for this article with explicit save', async ({ page }) => {
 const fixture = createFixture({ library: true });
 const set = { id: 2, restaurant_id: 1, name: 'Caractère', display_name: 'Caractère', allow_multiple: false, is_required: true, min_selections: 1, max_selections: 1, modifiers: [{ id: 20, name: 'A', is_active: true, action: 'add', price_delta: 0 }] };
 Object.assign(fixture.items[0], { name: 'Number Cake', modifier_sets: [set], option_sets: [{ id: 1, name: 'Format', options: [{ id: 101, name: '1 caractère', is_active: true, price: 55 }, { id: 102, name: '2 caractères', is_active: true, price: 110 }] }] });
 const writes: unknown[] = [];
 await page.addInitScript(() => {
  localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
  localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Demo', role: 'owner', email: 'demo@foody.test' }));
  localStorage.setItem('foody_restaurant_ids', '[1]'); localStorage.setItem('foody-admin-locale', 'fr');
 });
 await page.route('**/api/v1/**', async route => {
  const request = route.request(), path = new URL(request.url()).pathname;
  if (path === '/api/v1/menu/modifier-sets') return route.fulfill({ json: { modifier_sets: [set] } });
  if (path.endsWith('/modifier-sets/2/items/1/overrides') && request.method() === 'PUT') {
   const body = request.postDataJSON(); writes.push(body);
   Object.assign(set, { selection_config: body.selection_config });
   Object.assign(fixture.items[0], { modifier_set_overrides: [{ modifier_set_id: 2, menu_item_id: 1, selection_config: body.selection_config }] });
   return route.fulfill({ status: 204 });
  }
  const result = fixture.response(request.url(), request.method(), request.postDataJSON() ?? {}, 1);
  return route.fulfill({ status: result.status ?? 200, json: result.json ?? {} });
 });
 await page.goto('/1/menu/items/1');
 await page.getByRole('button', { name: 'Conditions et affichage', exact: true }).click();
 await page.getByLabel('Afficher ce groupe selon').selectOption('option:1');
 await page.getByLabel('1 caractère — Positions à remplir', { exact: true }).fill('1');
 await page.getByLabel('2 caractères — Positions à remplir', { exact: true }).fill('2');
 await page.getByLabel('Affichage des choix').selectOption('characters');
 expect(writes).toHaveLength(0);
 await page.screenshot({ path: 'test-results/modifier-positions/admin-number-cake.png', fullPage: true, animations: 'disabled' });
 await page.locator('fieldset').filter({ hasText: 'Afficher ce groupe selon' }).getByRole('button', { name: 'Enregistrer', exact: true }).click();
 await expect.poll(() => writes.length).toBe(1);
 expect(writes[0]).toEqual({ min_selections: 1, max_selections: 1, is_required: true, selection_config: { source: 'option', source_id: 1, presentation: 'characters', choices: [{ id: 101, count: 1 }, { id: 102, count: 2 }] } });
});
