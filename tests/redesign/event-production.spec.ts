import { expect, test } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

for (const mobile of [false, true]) {
  test(`event production retains carte quantities and navigation on ${mobile ? 'mobile' : 'desktop'}`, async ({ page }, info) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const fixture = createFixture();
    const date = '2026-11-04';
    const row = { order_id: 99, customer_name: 'Commande mixte', order_type: 'pickup', is_event: true, cells: { '1': 8 }, units: { '1': 8 } };
    const sheet = (quantity: number) => ({ date,
      categories: [{ id: 1, name: 'Plateaux', measure: 'unit', item_ids: [1] }],
      items: [{ menu_item_id: 1, name: 'Plateau partagé', category_id: 1, measure: 'unit', total: quantity, total_units: quantity, unit: 'u' }],
      orders: [{ ...row, cells: { '1': quantity }, units: { '1': quantity } }],
    });
    await page.addInitScript(() => {
      localStorage.setItem('foody_restaurant_token', 'synthetic-ui-session');
      localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Démo', role: 'manager' }));
      localStorage.setItem('foody_restaurant_ids', '[1]');
      localStorage.setItem('foody-admin-locale', 'fr');
    });
    await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
    await page.route('**/api/v1/**', async route => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      if (path === '/api/v1/users/me') return route.fulfill({ json: { user: { id: 1, role: 'manager' }, role_name: 'Manager', permissions: ['orders.view', 'kitchen.manage', 'settings.edit'] } });
      if (path.endsWith('/production-sheet/days')) return route.fulfill({ json: { days: [{ date, order_count: 1 }] } });
      if (path.endsWith('/production-sheet')) return route.fulfill({ json: { ...sheet(8), sections: [
        { menu_id: 11, name: 'SHABAT', is_catering: false, sheet: sheet(3) },
        { menu_id: 12, name: 'CATERING BASSARI', is_catering: true, sheet: sheet(5) },
      ] } });
      if (path.endsWith('/prepared')) return route.fulfill({ json: { prepared: true } });
      const result = fixture.response(req.url(), req.method(), req.postDataJSON() ?? {}, 1);
      return route.fulfill({ status: result.status ?? 200, json: result.json ?? {} });
    });
    await page.goto(`/1/orders/production?date=${date}`);
    const nav = page.getByRole('navigation', { name: 'Par carte', exact: true });
    await expect(nav.getByRole('link')).toHaveText(['SHABAT', 'CATERING BASSARI']);
    await nav.getByRole('link', { name: 'CATERING BASSARI' }).click();
    await expect(page).toHaveURL(/#production-carte-12$/);
    const shabbat = page.locator('#production-carte-11');
    const catering = page.locator('#production-carte-12');
    await expect(catering).toContainText('Événement / Catering');
    await expect(shabbat).toContainText('Commande mixte');
    await expect(catering).toContainText('Commande mixte');
    if (!mobile) {
      await expect(shabbat.locator('tbody tr').filter({ hasText: 'Commande mixte' }).locator('td').nth(1)).toHaveText('3');
      await expect(catering.locator('tbody tr').filter({ hasText: 'Commande mixte' }).locator('td').nth(1)).toHaveText('5');
      await shabbat.getByRole('checkbox').check();
      await expect(catering.getByRole('checkbox')).toBeChecked();
    }
    await page.screenshot({ path: info.outputPath('event-production.png'), fullPage: true });
  });
}
