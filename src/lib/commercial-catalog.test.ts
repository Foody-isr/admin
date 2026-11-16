import assert from 'node:assert/strict';
import { test } from 'node:test';
import { combineLicenceLimits, commercialSelection } from './commercial-catalog';
import { allowsModulePath } from './module-navigation';
import type { FoodyCommercialCatalog, FoodyModuleAccess } from './api';

test('employee and physical device quantities stay independent; unlimited does not become finite', () => {
  assert.deepEqual(combineLicenceLimits({ pos: 1, chef: 0, kds: 0, employees: 2, pos_devices: 1 }, { pos: 0, chef: 1, kds: 1, employees: 3, pos_devices: null }),
    { pos: 1, chef: 1, kds: 1, employees: 5, pos_devices: null });
});

test('a plan uses its own price and quantities instead of summing its modules', () => {
  const catalog: FoodyCommercialCatalog = { version: 'catalog-1', revision: 1, currency: 'ILS', minimum_trial_days: 14, extra_pos_minor: 14900,
    products: [{ id: 'restaurant', name: { en: 'POS', fr: 'Caisse', he: 'קופה' }, monthly_minor: 59000, included: { pos: 1, chef: 0, kds: 0 } }],
    plans: [{ id: 'team', name: { en: 'Team', fr: 'Équipe', he: 'צוות' }, modules: ['restaurant'], monthly_minor: 65000, included: { pos: 3, chef: 0, kds: 0, employees: 3, pos_devices: 1 }, capabilities: ['pos'], published: true }] };
  const selection = commercialSelection(catalog, [], 'team');
  assert.equal(selection.monthlyMinor, 65000); assert.equal(selection.seats.pos, 3); assert.equal(selection.seats.pos_devices, 1);
});

test('a removed nested capability stays locked despite access to its parent page', () => {
  const access: FoodyModuleAccess = { status: 'active', enforced: true, modules: ['restaurant'], seats: { pos: 1, chef: 0, kds: 0 }, capabilities: ['menu_management'], feature_paths: { '/menu': 'menu_management', '/menu/modifiers': 'modifiers' } };
  assert.equal(allowsModulePath(access, '/5/menu/items'), true);
  assert.equal(allowsModulePath(access, '/5/menu/modifiers?tab=all'), false);
  assert.equal(allowsModulePath(access, '/5/billing'), true);
  assert.equal(allowsModulePath(undefined, '/5/menu/modifiers'), true);
});

test('licence guidance uses the selected French and Hebrew locales', async () => {
  const { localizedCopy } = await import('./i18n');
  assert.equal(localizedCopy('fr', 'foodyLicence_pos_devices'), 'Postes POS physiques');
  assert.equal(localizedCopy('he', 'foodyLicence_pos_devices'), 'עמדות קופה פיזיות');
  assert.equal(localizedCopy('en', 'foodyLicence_employees'), 'Accounts, including owner');
});
