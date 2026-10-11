import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';
import type { CateringOffer } from '../../src/lib/api';

async function install(page: Page, locale = 'fr', canEdit = true) {
  const fixture = createFixture();
  const state = {
    view: { enabled: true, status: 'none', total: 1000, deposit_paid: 300, balance_due: 700, held_amount: 0, captured: 0, can_create: true, checkout_url: '' },
    uncertain: false, writes: [] as string[], errors: [] as string[],
    offers: [] as CateringOffer[],
  };
  page.on('pageerror', error => state.errors.push(error.message));
  await page.addInitScript(({ locale }) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'manager' }));
    localStorage.setItem('foody_restaurant_ids', '[1]');
    localStorage.setItem('foody-admin-locale', locale);
    localStorage.setItem('foody_admin_theme', 'light');
  }, { locale });
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method();
    if (path === '/api/v1/users/me') return route.fulfill({ json: { role_name: 'Custom', permissions: canEdit ? ['catering.view', 'catering.manage'] : ['catering.view'], user: { id: 1, role: 'manager' } } });
    if (path === '/api/v1/catering/services') return route.fulfill({ json: { services: [{ id: 2, name: 'Réception', pricing_model: 'custom_quote', deposit_pct: 0 }] } });
    if (path === '/api/v1/catering/services/2/offers') {
      if (method === 'POST') { state.writes.push(path); const offer = { ...request.postDataJSON(), id: 9, service_id: 2, restaurant_id: 1 }; state.offers.push(offer); return route.fulfill({ json: offer }); }
      return route.fulfill({ json: { offers: state.offers } });
    }
    if (path === '/api/v1/catering/services/2/groups') return route.fulfill({ json: { groups: [] } });
    if (path === '/api/v1/catering/services/2/items') return route.fulfill({ json: { items: [] } });
    if (path === '/api/v1/catering/events') return route.fulfill({ json: { events: [{ id: 7, quote_id: 8, service_id: 2, customer_name: 'Client démo', customer_phone: '', service_name: 'Réception', event_date: '2026-11-01', event_city: 'Tel Aviv', deposit_amount: 300, balance_hold_enabled: true, assigned_location_name: 'Atelier Foody' }] } });
    if (path.includes('/balance-hold')) {
      expect(request.headers()['x-restaurant-id']).toBe('1');
      if (method === 'POST') {
        expect(request.postDataJSON()).toEqual({ confirm: true });
        state.writes.push(path);
        if (path.endsWith('/balance-hold')) Object.assign(state.view, { status: 'pending', can_create: false, checkout_url: 'https://hpp.example/hold' });
        if (path.endsWith('/refresh') && state.view.status === 'pending') Object.assign(state.view, { status: 'authorized', held_amount: 700, checkout_url: '' });
        if (path.endsWith('/capture')) Object.assign(state.view, state.uncertain ? { status: 'capture_unknown' } : { status: 'capture_completed', captured: 700, balance_due: 0, held_amount: 0 });
        if (state.uncertain && path.endsWith('/capture')) return route.fulfill({ status: 409, json: { error: 'Synthetic unconfirmed result' } });
      }
      return route.fulfill({ json: state.view });
    }
    const result = fixture.response(request.url(), method, request.postDataJSON() ?? {}, 1);
    return route.fulfill({ status: result.status ?? 200, json: result.json ?? {} });
  });
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  return state;
}

test('manual authorization, verification and exact balance capture', async ({ page }, info) => {
  const state = await install(page);
  await page.goto('/1/catering/events');
  await page.getByRole('button', { name: 'Gérer le solde' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Acompte encaissé', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Créer le lien de préautorisation' }).click();
  expect(state.writes).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(dialog.getByLabel('Lien de préautorisation client')).toHaveValue('https://hpp.example/hold');
  await expect(dialog.getByRole('button', { name: /Encaisser le solde/ })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Vérifier le statut' }).click();
  await expect(dialog.getByText('Solde garanti, non encaissé')).toBeVisible();
  await page.screenshot({ path: info.outputPath('catering-balance-fr.png'), animations: 'disabled' });
  await dialog.getByRole('button', { name: /Encaisser le solde/ }).click();
  await dialog.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(dialog.getByText('Solde encaissé', { exact: true }).last()).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Encaisser le solde/ })).toHaveCount(0);
  expect(state.writes.filter(path => path.endsWith('/capture'))).toHaveLength(1);
  expect(state.errors).toEqual([]);
});

test('offer policy defaults off and requires a partial collected deposit', async ({ page }, info) => {
  const state = await install(page);
  await page.goto('/1/catering/services/2');
  await page.getByRole('button', { name: 'Ajouter une offre', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Titre de l’offre').fill('Réception sur mesure');
  await dialog.getByRole('button', { name: /^Devis sur mesure/ }).click();
  const checkbox = dialog.getByRole('checkbox', { name: /Garantir le solde restant/ });
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await expect(dialog.getByRole('button', { name: 'Enregistrer', exact: true })).toBeDisabled();
  await dialog.getByLabel('Acompte (%)', { exact: true }).fill('30');
  await expect(dialog.getByRole('button', { name: 'Enregistrer', exact: true })).toBeEnabled();
  await page.screenshot({ path: info.outputPath('catering-offer-policy-fr.png'), animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.offers[0].balance_hold_enabled).toBe(true);
  expect(state.offers[0].deposit_pct).toBe(30);
  expect(state.offers[0].pricing_model).toBe('custom_quote');
  expect(state.errors).toEqual([]);
});

test('uncertain capture is not replayed and blocks another mutation', async ({ page }) => {
  const state = await install(page);
  Object.assign(state.view, { status: 'authorized', held_amount: 700, can_create: false }); state.uncertain = true;
  await page.goto('/1/catering/events');
  await page.getByRole('button', { name: 'Gérer le solde' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /Encaisser le solde/ }).click();
  await dialog.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Ne créez pas un autre débit');
  await expect(dialog.getByRole('button', { name: /Encaisser le solde|Libérer la garantie/ })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Vérifier le statut' }).click();
  expect(state.writes.filter(path => path.endsWith('/capture'))).toHaveLength(1);
});

test('view-only staff see no financial action, Hebrew mobile stays within viewport', async ({ page }, info) => {
  const state = await install(page, 'he', false);
  Object.assign(state.view, { status: 'authorized', held_amount: 700, can_create: false });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/1/catering/events');
  await page.getByRole('button', { name: 'ניהול יתרה' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('היתרה אושרה במסגרת, אך לא נגבתה')).toBeVisible();
  await expect(dialog.getByRole('button', { name: /גביית יתרה|שחרור מסגרת|יצירת קישור/ })).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('catering-balance-he-mobile.png'), animations: 'disabled' });
  expect(state.writes).toHaveLength(0);
  expect(state.errors).toEqual([]);
});
