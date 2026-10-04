import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

const summary = (revenue = 8400) => ({ total_revenue: revenue, total_orders: 84, avg_ticket: revenue / 84, items_sold: 156, start: '2026-10-01', end: '2026-10-31' });
const branches = [{ id: 1, name: 'Atelier Foody — centre et accueil', is_active: true }, { id: 2, name: 'Jardin Foody — événements et cuisine', is_active: true }];
async function install(page: Page, options: { locale?: string; auth?: boolean } = {}) {
  const fixture = createFixture();
  const state = { branches: [...branches], failOverview: false, malformed: false, failTotal: false, failBranch: false, failCurrency: false, mixed: false, euro: false, zero: false, monthGate: null as Promise<void> | null, branchGate: null as Promise<void> | null, reads: [] as { path: string; range: string | null; chain: string | null; rid?: string }[], writes: [] as string[], errors: [] as string[] };
  page.on('pageerror', error => state.errors.push(error.message));
  await page.addInitScript(({ locale, auth }) => {
    if (auth) { localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture'); localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, role: 'manager', full_name: 'Équipe démo', email: 'demo@foody.test' })); localStorage.setItem('foody_restaurant_ids', '[1,2]'); }
    localStorage.setItem('foody-admin-locale', locale); localStorage.setItem('foody_admin_theme', locale === 'he' ? 'dark' : 'light');
  }, { locale: options.locale ?? 'fr', auth: options.auth !== false });
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, rid = request.headers()['x-restaurant-id'];
    if (request.method() !== 'GET') { state.writes.push(path); return route.fulfill({ status: 405, json: {} }); }
    state.reads.push({ path, range: url.searchParams.get('range'), chain: url.searchParams.get('chain_id'), rid });
    if (/\/chains\/\d+\/branches$/.test(path)) return route.fulfill({ status: state.failOverview ? 403 : 200, json: state.malformed ? {} : { chain_id: Number(path.split('/')[4]), chain_name: 'Maison Foody', branches: state.branches, public_enabled: false } });
    if (path === '/api/v1/analytics/period') {
      const range = url.searchParams.get('range'), branch = url.searchParams.get('restaurant_id');
      if (range === 'month' && state.monthGate) await state.monthGate;
      if (branch === '2' && state.branchGate) await state.branchGate;
      const fail = branch ? state.failBranch && branch === '2' : state.failTotal;
      const current = state.zero ? { ...summary(0), total_orders: 0, avg_ticket: 0, items_sold: 0 } : summary(range === 'today' ? 420 : branch === '2' ? 2400 : branch ? 6000 : 8400);
      return route.fulfill({ status: fail ? 503 : 200, json: { current, previous: summary(6000) } });
    }
    if (/\/restaurants\/[12]$/.test(path)) return route.fulfill({ status: state.failCurrency && rid === '2' ? 503 : 200, json: { restaurant: { id: Number(rid), name: 'Demo', currency: state.euro || state.mixed && rid === '2' ? 'EUR' : 'ILS' } } });
    const result = fixture.response(request.url(), request.method(), {}, Number(rid) || 1);
    return route.fulfill({ status: result.status ?? 200, json: result.json ?? {} });
  });
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  return state;
}
const branchRow = (page: Page, id = 2) => page.getByRole('row').filter({ has: page.getByRole('link', { name: branches[id - 1].name, exact: true }) });
const totalSection = (page: Page) => page.getByRole('region', { name: 'Rapports globaux', exact: true });
async function ready(page: Page) { await expect(page.getByRole('button', { name: 'Actualiser', exact: true })).toBeEnabled(); }

for (const [locale, width] of [['fr', 375], ['he', 1440], ['en', 768]] as const) test(`chain report responsive ${locale}`, async ({ page }, info) => {
  const state = await install(page, { locale }); await page.setViewportSize({ width, height: 1000 }); await page.goto('/chain/3/dashboard');
  await expect(page.getByRole('heading', { name: 'Maison Foody', exact: true })).toBeVisible(); await expect(branchRow(page).getByText('₪2,400', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath(`chain-dashboard-${locale}.png`), animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('link', { name: branches[1].name, exact: true })).toHaveAttribute('href', '/2/dashboard');
  await page.getByRole('link', { name: branches[1].name, exact: true }).focus(); await expect(page.getByRole('link', { name: branches[1].name, exact: true })).toBeFocused();
  expect(state.errors).toEqual([]); expect(state.writes).toEqual([]);
});
test('chain report scopes totals to chain and branch details to each restaurant', async ({ page }) => {
  const state = await install(page); await page.goto('/chain/7/dashboard'); await ready(page);
  const reads = state.reads.filter(read => read.path === '/api/v1/analytics/period');
  expect(reads.some(read => read.chain === '7' && !read.rid && read.range === 'month')).toBe(true);
  for (const rid of ['1', '2']) expect(reads.some(read => read.rid === rid && !read.chain)).toBe(true);
  expect(state.writes).toEqual([]);
});
for (const failure of ['failOverview', 'failTotal', 'malformed'] as const) test(`chain report retries ${failure} without false empty state`, async ({ page }) => {
  const state = await install(page); state[failure] = true; await page.goto('/chain/3/dashboard');
  await expect(page.getByText('Impossible de charger le rapport de l’enseigne.', { exact: true })).toBeVisible(); await expect(totalSection(page)).toHaveCount(0);
  state[failure] = false; await page.getByRole('button', { name: 'Réessayer', exact: true }).click(); await ready(page); await expect(totalSection(page).getByText('₪8,400', { exact: true })).toBeVisible();
});
test('chain report branch failure leaves global and other branch figures usable and retries', async ({ page }) => {
  const state = await install(page); state.failBranch = true; await page.goto('/chain/3/dashboard');
  await expect(branchRow(page).getByText('Chiffres indisponibles pour cet établissement.', { exact: true })).toBeVisible(); await expect(totalSection(page).getByText('₪8,400', { exact: true })).toBeVisible();
  await expect(branchRow(page).getByText('—', { exact: true })).toHaveCount(3); await expect(branchRow(page, 1).getByText('₪6,000', { exact: true })).toBeVisible();
  state.failBranch = false; await page.getByRole('button', { name: 'Réessayer', exact: true }).click(); await ready(page); await expect(branchRow(page).getByText('₪2,400', { exact: true })).toBeVisible();
});
test('chain report loads other branches while one is pending', async ({ page }) => {
  const state = await install(page); let release!: () => void; state.branchGate = new Promise(resolve => { release = resolve; });
  await page.goto('/chain/3/dashboard'); await expect(branchRow(page, 1).getByText('₪6,000', { exact: true })).toBeVisible(); await expect(branchRow(page).getByRole('status')).toBeVisible();
  release(); state.branchGate = null; await ready(page);
});
test('chain report ignores older period response after a quick change', async ({ page }) => {
  const state = await install(page); let release!: () => void; state.monthGate = new Promise(resolve => { release = resolve; }); await page.goto('/chain/3/dashboard');
  await expect.poll(() => state.reads.some(read => read.path === '/api/v1/analytics/period' && read.range === 'month')).toBe(true);
  await page.getByRole('group', { name: 'Période' }).getByRole('button', { name: "Aujourd'hui", exact: true }).click(); await ready(page); await expect(totalSection(page).getByText('₪420', { exact: true })).toBeVisible();
  const oldResponse = page.waitForResponse(response => response.url().includes('/analytics/period?') && response.url().includes('range=month'));
  release(); state.monthGate = null; await (await oldResponse).finished(); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); await expect(page.getByRole('group', { name: 'Période' }).getByRole('button', { name: "Aujourd'hui", exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(totalSection(page).getByText('₪8,400', { exact: true })).toHaveCount(0); expect(state.writes).toEqual([]);
});
test('chain report shows verified common currency instead of default ILS', async ({ page }) => {
  const state = await install(page); state.euro = true; await page.goto('/chain/3/dashboard'); await ready(page); await expect(totalSection(page).getByText('€8,400', { exact: true })).toBeVisible();
});
test('chain report keeps distinct currencies per branch and hides invalid monetary aggregation', async ({ page }) => {
  const state = await install(page); state.mixed = true; await page.goto('/chain/3/dashboard'); await ready(page);
  await expect(totalSection(page).getByText(/Ces établissements utilisent des devises différentes/)).toBeVisible(); await expect(totalSection(page).getByText('—', { exact: true })).toHaveCount(2);
  await expect(branchRow(page).getByText('€2,400', { exact: true })).toBeVisible(); await expect(branchRow(page, 1).getByText('₪6,000', { exact: true })).toBeVisible();
});
test('chain report missing currency hides only unverified amounts and recovers', async ({ page }) => {
  const state = await install(page); state.failCurrency = true; await page.goto('/chain/3/dashboard'); await expect(page.getByRole('button', { name: 'Réessayer', exact: true })).toBeEnabled();
  await expect(totalSection(page).getByText('—', { exact: true })).toHaveCount(2); await expect(branchRow(page).getByText('84', { exact: true })).toBeVisible();
  state.failCurrency = false; await page.getByRole('button', { name: 'Réessayer', exact: true }).click(); await ready(page); await expect(totalSection(page).getByText('₪8,400', { exact: true })).toBeVisible();
});
test('chain report distinguishes empty membership and true zero activity', async ({ page }) => {
  const state = await install(page); state.branches = []; await page.goto('/chain/3/dashboard'); await expect(page.getByText('Aucun établissement accessible dans cette enseigne.', { exact: true })).toBeVisible(); await expect(totalSection(page)).toHaveCount(0);
  state.branches = [...branches]; state.zero = true; await page.reload(); await ready(page); await expect(totalSection(page).getByText('₪0', { exact: true })).toHaveCount(2); await expect(totalSection(page).getByText('0', { exact: true })).toHaveCount(2);
});
test('chain report unauthenticated visit does not request chain or financial data', async ({ page }) => {
  const state = await install(page, { auth: false }); await page.goto('/chain/3/dashboard'); await expect(page).toHaveURL(/\/login$/);
  expect(state.reads.some(read => read.path.includes('/analytics/') || read.path.includes('/chains/'))).toBe(false);
});
test('chain report invalid chain parameter does not call APIs', async ({ page }) => {
  const state = await install(page); await page.goto('/chain/invalid/dashboard'); await expect(page.getByText('Impossible de charger le rapport de l’enseigne.', { exact: true })).toBeVisible(); expect(state.reads).toEqual([]);
});

 test('chain report long names stay readable at narrow width and larger text', async ({ page }) => {
  const state = await install(page); state.branches = [{ ...branches[0], name: 'Établissement' + 'a'.repeat(90) }];
  await page.setViewportSize({ width: 320, height: 1000 }); await page.goto('/chain/3/dashboard'); await ready(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = '20px'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('link', { name: state.branches[0].name, exact: true })).toBeVisible();
});
