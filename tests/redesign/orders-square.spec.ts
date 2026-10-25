import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

async function install(page: Page, locale = 'fr', permissions?: string[]) {
  const fixtureOptions = { empty: false, permissions };
  const fixture = createFixture(fixtureOptions);
  const queries: URL[] = [];
  await page.addInitScript(({ locale }) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'owner' }));
    localStorage.setItem('foody_restaurant_ids', '[1,2]');
    localStorage.setItem('foody-admin-locale', locale);
    localStorage.setItem('foody_admin_theme', locale === 'he' ? 'dark' : 'light');
  }, { locale });
  // API routes below always fulfill locally, including when testing an optimized build.
  await page.route('**/*', route => ['localhost', '127.0.0.1', 'square-fonts-production-f.squarecdn.com'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/v1/orders') queries.push(url);
    const result = fixture.response(request.url(), request.method(), request.postDataJSON() ?? {}, Number(request.headers()['x-restaurant-id']) || 1);
    await route.fulfill({ status: result.status ?? 200, json: result.json ?? {} });
  });
  return { fixture, queries };
}

test('malformed order links show the existing 404 without loading the list', async ({ page }) => {
  const { queries } = await install(page);
  await page.goto('/1/orders/invalid');
  await expect(page.getByRole('heading', { name: '404', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Toutes les commandes', exact: true })).toHaveCount(0);
  expect(queries).toHaveLength(0);
});

for (const width of [1440, 375]) test(`dine-in without a table stays visible in order scopes and details: ${width}`, async ({ page }) => {
  const { fixture, queries } = await install(page);
  await page.setViewportSize({ width, height: 900 });
  // This is a saved kitchen batch belonging to a named POS check, not an empty
  // OpenTicket container. It keeps its real type without inventing a table.
  Object.assign(fixture.orders[0], {
    customer_name: 'Visiteur sur place', order_type: 'dine_in', order_source: 'manual',
    table_number: '', table_code: '', session_id: null,
    check_id: '9f1d71b8-5a52-4c5c-a496-8e4d9f94d208',
    status: 'in_kitchen', payment_status: 'paid',
  });
  await page.goto('/1/orders/all');
  const row = page.locator('tbody tr').filter({ hasText: 'Visiteur sur place' });
  const tabs = page.getByRole('tablist');
  await expect(tabs.getByRole('tab', { name: 'Actives', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(row).toBeVisible();
  await expect(row).toContainText('Sur place');

  await tabs.getByRole('tab', { name: 'Tous', exact: true }).click();
  await expect.poll(() => queries.at(-1)?.searchParams.has('status')).toBe(false);
  await expect(row).toBeVisible();
  await page.locator('[data-list-toolbar]').getByRole('button', { name: /^Type / }).click();
  await page.getByRole('menuitemradio', { name: 'Sur place', exact: true }).click();
  await expect.poll(() => queries.at(-1)?.searchParams.get('type')).toBe('dine_in');
  await expect(row).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(3);

  await row.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Détails (Sur place)', exact: true })).toBeVisible();
  await expect(dialog.locator('.order-detail-fact').filter({ hasText: /^Table/ })).toHaveCount(0);
  await expect(dialog).not.toContainText('À emporter');
  await page.keyboard.press('Escape');
  await tabs.getByRole('tab', { name: 'Actives', exact: true }).click();
  await expect.poll(() => queries.at(-1)?.searchParams.get('status')).toContain('in_kitchen');
  await expect(row).toBeVisible();
  expect(queries.every(url => url.searchParams.get('restaurant_id') === '1')).toBe(true);
  expect(fixture.writes).toEqual([]);
});

test('typed search filters rows and ignores an older unfiltered response', async ({ page }) => {
  const { queries } = await install(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let initialPending = false;
  await page.route('**/api/v1/orders?**', async route => {
    if (!new URL(route.request().url()).searchParams.has('q')) {
      initialPending = true;
      await gate;
    }
    await route.fallback();
  });
  await page.goto('/1/orders/all');
  await expect.poll(() => initialPending).toBe(true);
  await page.getByRole('searchbox').fill('Client');
  await expect.poll(() => queries.at(-1)?.searchParams.get('q')).toBe('Client');
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect(page.locator('tbody')).not.toContainText('Équipe Foody');
  const oldResponse = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === '/api/v1/orders' && !url.searchParams.has('q');
  });
  release();
  await (await oldResponse).finished();
  // Allow React to process the late response before checking that it was ignored.
  await page.waitForTimeout(300);
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await page.getByRole('searchbox').fill('aucun résultat');
  await expect(page.locator('tbody tr')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Aucune correspondance trouvée', exact: true })).toBeVisible();
  await page.getByRole('searchbox').fill('');
  await expect(page.locator('tbody tr')).toHaveCount(8);
});

test('live orders keep the search applied and failed searches can be retried', async ({ page }) => {
  const { fixture, queries } = await install(page);
  let socket: WebSocketRoute | undefined;
  await page.routeWebSocket('**/ws?**', connection => { socket = connection; });
  await page.goto('/1/orders/all?q=Client');
  await expect(page.getByRole('searchbox')).toHaveValue('Client');
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect.poll(() => socket != null).toBe(true);
  const unrelated = { ...fixture.orders[0], id: 3000, customer_name: 'Autre personne' };
  fixture.orders.push(unrelated);
  const before = queries.length;
  socket!.send(JSON.stringify({ type: 'order.created', payload: unrelated }));
  await expect.poll(() => queries.length).toBeGreaterThan(before);
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect(page.locator('tbody')).not.toContainText('Autre personne');
  const matching = { ...unrelated, id: 3001, customer_name: 'Client ajouté' };
  fixture.orders.push(matching);
  socket!.send(JSON.stringify({ type: 'order.created', payload: matching }));
  await expect(page.locator('tbody tr')).toHaveCount(4);
  await expect(page.locator('tbody')).toContainText('Client ajouté');

  let unavailable = true;
  await page.route('**/api/v1/orders?**', route => unavailable
    ? route.fulfill({ status: 503, json: { error: 'Synthetic outage' } })
    : route.fallback());
  await page.getByRole('searchbox').fill('Équipe');
  await expect(page.locator('#orders-results').getByRole('alert')).toContainText('Impossible de charger ces données');
  await expect(page.locator('tbody tr')).toHaveCount(0);
  unavailable = false;
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect(page.locator('tbody')).toContainText('Équipe Foody');
  await expect(page.locator('tbody')).not.toContainText('Client ajouté');
  expect(queries.at(-1)!.searchParams.get('q')).toBe('Équipe');
  expect(fixture.writes).toEqual([]);
});

for (const width of [1440, 375]) test(`order details preserve a previous série, filters, pagination and scroll: ${width}`, async ({ page }) => {
  const { fixture, queries } = await install(page);
  await page.setViewportSize({ width, height: 812 });
  const template = fixture.orders[0];
  fixture.orders.splice(0, fixture.orders.length, ...Array.from({ length: 60 }, (_, index) => ({
    ...template, id: 2000 + index, order_number: 2000 + index,
    customer_name: 'Client cible', order_type: 'delivery', payment_status: 'paid',
    scheduled_for: '2026-10-09', is_scheduled: true,
  })));
  await page.route('**/api/v1/orders/series?**', route => route.fulfill({ json: {
    series: [{ date: '2026-10-16' }, { date: '2026-10-09' }],
  } }));
  await page.goto('/1/orders/all');
  const toolbar = page.locator('[data-list-toolbar]');
  const date = toolbar.locator('button[aria-haspopup="dialog"]');
  await date.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Séries', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '9', exact: true }).click();
  await expect.poll(() => queries.at(-1)?.searchParams.get('from')).toBe('2026-10-09');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await toolbar.getByRole('searchbox').fill('cible');
  await toolbar.getByRole('button', { name: /^Type / }).click();
  await page.getByRole('menuitemradio', { name: 'Livraison', exact: true }).click();
  await toolbar.getByRole('button', { name: /Statut de paiement/ }).click();
  await page.getByRole('menuitemradio', { name: 'Payé', exact: true }).click();
  await expect.poll(() => queries.at(-1)?.searchParams.get('q')).toBe('cible');
  await expect(page.locator('tbody tr')).toHaveCount(25);
  await page.getByRole('button', { name: 'Suivant', exact: true }).click();
  await expect.poll(() => queries.at(-1)?.searchParams.get('offset')).toBe('25');
  await expect(page.locator('tbody tr').last()).toHaveAttribute('aria-label', /2049/);
  const row = page.locator('tbody tr').last();
  await row.scrollIntoViewIfNeeded();
  const scrollPosition = () => page.evaluate(() => ({
    window: window.scrollY,
    workspace: document.querySelector('[data-workspace-shell]')!.scrollTop,
  }));
  const before = await scrollPosition();
  expect(before.window + before.workspace).toBeGreaterThan(500);
  const queryCount = queries.length;
  await row.click();
  await expect(page).toHaveURL(/\/1\/orders\/2049/);
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await scrollPosition()).toEqual(before);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/1\/orders\/all/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await scrollPosition()).toEqual(before);
  await expect(toolbar.getByRole('searchbox')).toHaveValue('cible');
  await expect(date).toContainText('09/10/2026');
  expect(queries.length).toBe(queryCount);
  expect(queries.at(-1)!.searchParams.get('date_field')).toBe('serie');
  expect(queries.at(-1)!.searchParams.get('type')).toBe('delivery');
  expect(queries.at(-1)!.searchParams.get('payment_status')).toBe('paid');

  await row.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/1\/orders\/all/);
  expect(await scrollPosition()).toEqual(before);
  await page.goForward();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await scrollPosition()).toEqual(before);
  expect(fixture.writes.every(path => path === '/api/v1/display-preferences')).toBe(true);
});

test('Square order scopes, quick filters and row details retain restaurant context', async ({ page }, info) => {
  const { fixture, queries } = await install(page);
  await page.goto('/2/orders/all');
  await expect(page.getByRole('heading', { name: 'Toutes les commandes', exact: true })).toBeVisible();
  const tabs = page.getByRole('tablist');
  await expect(tabs.getByRole('tab')).toHaveCount(5);
  await expect(tabs.getByRole('tab', { name: 'Actives', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('columnheader', { name: 'Source', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Articles', exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole('columnheader', { name: 'N°', exact: true })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Action suivante', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-list-toolbar]').getByRole('button', { name: /État|Tous les filtres/ })).toHaveCount(0);
  const measurements = await page.locator('tbody tr').first().evaluate(row => {
    const cell = row.querySelector('td')!;
    const header = document.querySelector('thead th')!;
    const title = document.querySelector('h1')!;
    return { height: row.getBoundingClientRect().height, marker: getComputedStyle(cell, '::before').content, headerWeight: getComputedStyle(header).fontWeight, titleSize: getComputedStyle(title).fontSize, fontLoaded: document.fonts.check('500 14px "Orders Sans"') };
  });
  expect(measurements).toEqual({ height: 70, marker: 'none', headerWeight: '500', titleSize: '25px', fontLoaded: true });
  expect(await page.locator('tbody tr').evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height))).toEqual(Array(8).fill(70));
  await page.screenshot({ path: info.outputPath('orders-square-fr.png'), fullPage: true });
  await tabs.getByRole('tab', { name: 'Planifiées', exact: true }).click();
  await expect.poll(() => queries.at(-1)?.searchParams.get('is_scheduled')).toBe('true');
  await tabs.getByRole('tab', { name: 'Tous', exact: true }).click();
  await expect.poll(() => queries.at(-1)?.searchParams.has('status')).toBe(false);
  const tools = page.locator('[data-list-toolbar]');
  await tools.getByRole('button', { name: /Statut de paiement/ }).click();
  await page.getByRole('menuitemradio', { name: 'Payé', exact: true }).click();
  await expect.poll(() => queries.at(-1)?.searchParams.get('payment_status')).toBe('paid');
  await tools.getByRole('searchbox').fill('Client');
  await tools.getByRole('button', { name: 'Rechercher', exact: true }).click();
  await expect.poll(() => queries.at(-1)?.searchParams.get('q')).toBe('Client');
  await tools.getByRole('button', { name: 'Tout effacer', exact: true }).click();
  await expect.poll(() => queries.at(-1)?.searchParams.has('payment_status')).toBe(false);
  await expect.poll(() => queries.at(-1)?.searchParams.has('q')).toBe(false);
  await expect(tabs.getByRole('tab', { name: 'Tous', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(tools.getByRole('searchbox')).toHaveValue('');
  expect(queries.every(url => url.searchParams.get('restaurant_id') === '2')).toBe(true);
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await tools.getByRole('searchbox').fill('Équipe');
  await tools.getByRole('button', { name: 'Rechercher', exact: true }).click();
  await page.locator('tbody tr').first().press('Enter');
  await expect(page).toHaveURL(/\/2\/orders\/\d+/);
  expect(fixture.writes).toEqual([]);
});

for (const locale of ['fr', 'he']) test(`orders tabs support keyboard and mobile without overflow: ${locale}`, async ({ page }, info) => {
  const { fixture, queries } = await install(page, locale, ['orders.view']);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/1/orders/all');
  const selected = page.getByRole('tab', { selected: true });
  await selected.focus();
  await selected.press('Home');
  await expect.poll(() => queries.at(-1)?.searchParams.has('status')).toBe(false);
  await page.getByRole('tab', { selected: true }).press(locale === 'he' ? 'ArrowLeft' : 'ArrowRight');
  await expect.poll(() => queries.at(-1)?.searchParams.get('status')).toContain('in_kitchen');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await expect(page.locator('[data-list-toolbar]').getByRole('searchbox')).toBeVisible();
  await expect(page.locator('[data-list-toolbar]').locator('button[aria-haspopup="dialog"]')).toBeVisible();
  await expect(page.locator('main a[href="/1/orders/new"]')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath(`orders-square-${locale}-mobile.png`), fullPage: true });
  expect(fixture.writes).toEqual([]);
});

test('Square payment cells have two lines and workflow badges use the reference palette', async ({ page }, info) => {
  const { fixture } = await install(page);
  fixture.orders[3].status = 'delivered';
  Object.assign(fixture.orders[1], { balance_due: 20 });
  await page.route('**/api/v1/restaurants/1', async route => {
    const { restaurant } = fixture.response(route.request().url()).json as { restaurant: Record<string, unknown> };
    await route.fulfill({ json: { restaurant: { ...restaurant, orders_table_config: {
      order: ['customer', 'created_at', 'payment', 'status'],
      visible: { customer: true, created_at: true, payment: true, status: true, source: false, type: false, items: false, date: false, total: false },
    } } } });
  });
  await page.goto('/1/orders/all');
  await page.getByRole('tab', { name: 'Tous', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(8);
  await page.evaluate(() => document.fonts.ready);
  const dateHeader = page.getByRole('columnheader', { name: 'Date de commande', exact: true });
  expect(await dateHeader.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 255, 255)');
  const row = page.locator('tbody tr').first();
  await expect(row.locator('.orders-payment-amount')).toHaveText('₪80.00');
  await expect(row.locator('.orders-payment-status')).toContainText('Non payé');
  await expect(row.locator('.orders-payment-status')).toContainText('Espèces');
  const amount = (await row.locator('.orders-payment-amount').boundingBox())!;
  const paymentStatus = (await row.locator('.orders-payment-status').boundingBox())!;
  expect(paymentStatus.y).toBeGreaterThanOrEqual(amount.y + amount.height);
  const centers = await page.locator('.orders-payment-amount').evaluateAll(elements => elements.map(element => { const rect = element.getBoundingClientRect(); return rect.x + rect.width / 2; }));
  expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(1);
  for (const [index, background, color] of [[0, 'rgb(255, 242, 229)', 'rgb(164, 92, 26)'], [1, 'rgb(229, 239, 255)', 'rgb(0, 106, 255)'], [2, 'rgb(240, 240, 240)', 'rgb(102, 102, 102)'], [3, 'rgb(240, 240, 240)', 'rgb(102, 102, 102)']] as const) {
    const badge = page.locator('tbody tr').nth(index).locator('.orders-status-badge');
    expect(await badge.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, color: getComputedStyle(element).color, radius: getComputedStyle(element).borderRadius }))).toEqual({ background, color, radius: '999px' });
  }
  await expect(page.locator('tbody tr').nth(1).locator('.orders-payment-status')).toContainText('Partiellement payé');
  expect(await page.locator('tbody tr').evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height))).toEqual(Array(8).fill(70));
  await page.screenshot({ path: info.outputPath('orders-square-payment-status-fr.png'), fullPage: true });
  expect(fixture.writes).toEqual([]);
});
