import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';
const checklist = { access: true, contact: true, catalog: true, hours: true, order_mode: true, payment: true, payment_required: true, branding: true, completed: 7, total: 7, ready: true };
const branch = (id: number) => ({ id, name: id === 1 ? 'Atelier Foody' : 'Jardin Foody', public_name: id === 1 ? 'Atelier Foody' : 'Jardin Foody', slug: `foody-demo-${id}`, address: 'Rue de démonstration 12', phone: '0000000000', opening_hours: '', short_description: '', is_active: true, is_current: id === 1, is_primary: id === 1, listing_status: 'live', pickup_enabled: true, delivery_enabled: true, dine_in_enabled: false, manager: { user_id: id + 10, full_name: 'Responsable démo', email: `demo${id}@foody.test` }, publication_checklist: { ...checklist } });
async function install(page: Page, options: { locale?: string; owner?: boolean; standalone?: boolean } = {}) {
  const fixture = createFixture();
  const state = { overview: { chain_id: options.standalone ? null : 3, chain_name: options.standalone ? '' : 'Maison Foody', chain_slug: options.standalone ? '' : 'maison-foody', primary_restaurant_id: 1, public_enabled: false, branches: options.standalone ? [branch(1)] : [branch(1), branch(2)] }, failRead: false, malformed: false, failWrite: false, applyAndFail: false, failAfterWrite: false, gate: null as Promise<void> | null, reads: 0, writes: [] as { path: string; method: string; rid: string | undefined; body: any }[], errors: [] as string[] };
  page.on('pageerror', error => state.errors.push(error.message));
  await page.addInitScript(({ locale }) => { localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture'); localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'manager', email: 'demo@foody.test' })); localStorage.setItem('foody_restaurant_ids', '[1,2]'); localStorage.setItem('foody-admin-locale', locale); localStorage.setItem('foody_admin_theme', locale === 'he' ? 'dark' : 'light'); }, { locale: options.locale ?? 'fr' });
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method(), rid = request.headers()['x-restaurant-id'], body = request.postDataJSON() ?? {};
    if (path === '/api/v1/users/me') return route.fulfill({ json: { role_name: options.owner === false ? 'Custom' : 'Owner', permissions: ['chain.manage'], user: { id: 1, role: 'manager', full_name: 'Équipe démo' } } });
    if (path === '/api/v1/chain/branches' && method === 'GET') { state.reads++; return route.fulfill({ status: state.failRead ? 503 : 200, json: state.malformed ? {} : { ...state.overview, branches: state.overview.branches.map(row => ({ ...row, is_current: row.id === Number(rid) })) } }); }
    if (path.startsWith('/api/v1/chain') || path.endsWith('/resend-invite')) {
      state.writes.push({ path, method, rid, body }); if (state.gate) await state.gate;
      let result: any = {};
      if (!state.failWrite || state.applyAndFail) {
        if (path === '/api/v1/chain/branches' && method === 'POST') { const id = 3; state.overview.branches.push({ ...branch(id), name: body.name, public_name: body.name, address: body.address, is_primary: false, is_current: false, listing_status: 'setup' }); result = { branch_id: id, manager_linked: !!body.manager_email, catalog_copied: !!body.catalog_source_restaurant_id }; }
        else if (/\/chain\/branches\/\d+$/.test(path)) { const row = state.overview.branches.find(row => row.id === Number(path.split('/').pop()))!; Object.assign(row, body); result = { branch: row }; }
        else if (path === '/api/v1/chain') { state.overview.chain_id = 3; state.overview.chain_name = body.name; state.overview.chain_slug = body.slug || 'auto-foody'; if (body.primary_restaurant_id) state.overview.primary_restaurant_id = body.primary_restaurant_id; if (body.primary_branch_name) state.overview.branches[0].public_name = body.primary_branch_name; result = state.overview; }
        else if (path === '/api/v1/chain/publication') { state.overview.public_enabled = body.enabled; result = { public_enabled: body.enabled }; }
        else if (path.endsWith('/resend-invite')) result = { email_status: 'sent' };
      }
      if (state.failAfterWrite) state.failRead = true;
      return route.fulfill({ status: state.failWrite ? 503 : 200, json: state.failWrite ? { error: 'Synthetic uncertain response' } : result });
    }
    const result = fixture.response(request.url(), method, body, Number(rid) || 1); return route.fulfill({ status: result.status ?? 200, json: result.json ?? {} });
  });
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  return state;
}
const modal = (page: Page) => page.getByRole('dialog');
const card = (page: Page, id = 1) => page.getByRole('article').filter({ has: page.getByRole('heading', { name: id === 1 ? 'Atelier Foody' : 'Jardin Foody', exact: true }) });
const next = (page: Page) => modal(page).getByRole('button', { name: 'Continuer', exact: true });
const save = (page: Page) => modal(page).getByRole('button', { name: 'Enregistrer', exact: true });
const verify = (page: Page) => modal(page).getByRole('button', { name: 'Vérifier les informations', exact: true });
async function open(page: Page, rid = 1) { await page.goto(`/${rid}/chain/branches`); await expect(page.getByRole('heading', { name: 'Maison Foody', exact: true })).toBeVisible(); }
async function edit(page: Page, id = 1) { await card(page, id).getByRole('button', { name: 'Modifier', exact: true }).click(); }
async function createReview(page: Page) { await page.getByRole('button', { name: 'Créer une succursale', exact: true }).click(); await modal(page).getByLabel('Nom de la succursale', { exact: true }).fill('Nouvelle démo'); await modal(page).getByLabel('Adresse', { exact: true }).fill('Adresse démo 3'); await next(page).click(); await next(page).click(); await next(page).click(); }

for (const locale of ['fr', 'he']) test(`chain branches responsive ${locale}`, async ({ page }, info) => {
  const state = await install(page, { locale }); await page.setViewportSize({ width: locale === 'fr' ? 375 : 1440, height: 1000 }); await open(page); await page.screenshot({ path: info.outputPath(`chain-branches-${locale}.png`), fullPage: true, animations: 'disabled' });
  if (locale === 'fr') { await card(page, 2).scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('chain-branches-list-fr.png'), animations: 'disabled' }); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(state.errors).toEqual([]); expect(state.writes).toEqual([]);
});
test('chain branches distinguishes unreadable list from setup and supports retry', async ({ page }) => {
  const state = await install(page); state.failRead = true; await page.goto('/1/chain/branches'); await expect(page.getByText('Impossible de charger les établissements.', { exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Créer l’enseigne', exact: true })).toHaveCount(0);
  state.failRead = false; state.malformed = true; await page.getByRole('button', { name: 'Réessayer', exact: true }).click(); await expect(page.getByText('Impossible de charger les établissements.', { exact: true })).toBeVisible(); state.malformed = false; await page.getByRole('button', { name: 'Réessayer', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Maison Foody', exact: true })).toBeVisible();
});
test('chain branches custom manager can inspect but cannot use owner-only mutations', async ({ page }) => {
  const state = await install(page, { owner: false }); await open(page); await expect(page.getByText(/L’identité de l’enseigne, la création/)).toBeVisible();
  for (const label of ['Créer une succursale', 'Réglages de l’enseigne', 'Modifier', 'Renvoyer l’invitation', 'Masquer']) await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0); expect(state.writes).toEqual([]);
});
test('chain branches shows unknown readiness and hours honestly', async ({ page }) => {
  const state = await install(page); delete (state.overview.branches[1] as any).publication_checklist; state.overview.branches[1].listing_status = 'setup'; await open(page); await card(page, 2).locator('summary').click(); await expect(card(page, 2).getByText('Liste de configuration indisponible.', { exact: true })).toBeVisible(); await expect(card(page, 2).getByRole('button', { name: 'Publier', exact: true })).toBeDisabled(); await expect(card(page, 2).getByText('Horaires non renseignés', { exact: true })).toBeVisible();
});
test('chain branches edit preserves draft on cancel, then saves with restaurant 2 scope', async ({ page }, info) => {
  const state = await install(page); await open(page, 2); await page.setViewportSize({ width: 375, height: 1000 }); await edit(page, 2); await modal(page).getByLabel('Nom public de la succursale', { exact: true }).fill('Jardin modifié'); await modal(page).getByLabel('URL de la succursale', { exact: true }).fill('jardin-modifie'); await page.screenshot({ path: info.outputPath('chain-branch-edit-fr.png') });
  await page.keyboard.press('Escape'); await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler', exact: true }).click(); await expect(modal(page).getByLabel('Nom public de la succursale', { exact: true })).toHaveValue('Jardin modifié');
  await save(page).click(); await expect(modal(page)).toHaveCount(0); await expect(page.getByRole('heading', { name: 'Jardin modifié', exact: true })).toBeVisible(); expect(state.writes).toHaveLength(1); expect(state.writes[0]).toMatchObject({ method: 'PATCH', path: '/api/v1/chain/branches/2', rid: '2', body: { public_name: 'Jardin modifié', slug: 'jardin-modifie' } });
});
test('chain branches edit serializes requests and locks closing', async ({ page }) => {
  const state = await install(page); await open(page); await edit(page); await modal(page).getByLabel('Nom public de la succursale', { exact: true }).fill('Atelier modifié'); let release!: () => void; state.gate = new Promise(resolve => { release = resolve; }); await save(page).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(modal(page).getByRole('button', { name: 'Fermer', exact: true })).toBeDisabled(); await expect(modal(page).getByLabel('Nom public de la succursale', { exact: true })).toBeDisabled(); release(); state.gate = null; await expect(modal(page)).toHaveCount(0); expect(state.writes).toHaveLength(1);
});
for (const applied of [true, false]) test(`chain branches uncertain edit verifies without repeating PATCH ${applied}`, async ({ page }) => {
  const state = await install(page); state.failWrite = true; state.applyAndFail = applied; await open(page); await edit(page); await modal(page).getByLabel('Nom public de la succursale', { exact: true }).fill('Atelier modifié'); await save(page).click(); await expect(verify(page)).toBeVisible();
  state.failRead = true; await verify(page).click(); await expect(modal(page).getByText('Impossible de charger les établissements.', { exact: true })).toBeVisible(); state.failRead = false; state.failWrite = false; await verify(page).click();
  if (applied) await expect(modal(page)).toHaveCount(0); else { await expect(modal(page).getByLabel('Nom public de la succursale', { exact: true })).toHaveValue('Atelier modifié'); await expect(save(page)).toBeEnabled(); }
  expect(state.writes).toHaveLength(1);
});
test('chain branches successful save then unreadable list retries only GET', async ({ page }) => {
  const state = await install(page); state.failAfterWrite = true; await open(page); await edit(page); await modal(page).getByLabel('Nom public de la succursale', { exact: true }).fill('Atelier modifié'); await save(page).click(); await expect(modal(page)).toHaveCount(0); await expect(page.getByText('Impossible de charger les établissements.', { exact: true })).toBeVisible(); state.failRead = false; await page.getByRole('button', { name: 'Réessayer', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Atelier modifié', exact: true })).toBeVisible(); expect(state.writes).toHaveLength(1);
});
test('chain branches wizard Enter advances and validates email before review', async ({ page }) => {
  const state = await install(page); await open(page); await page.getByRole('button', { name: 'Créer une succursale', exact: true }).click(); await modal(page).getByLabel('Nom de la succursale', { exact: true }).fill('Nouvelle démo'); await modal(page).getByLabel('Adresse', { exact: true }).fill('Adresse démo'); await modal(page).getByLabel('Adresse', { exact: true }).press('Enter'); await expect(modal(page).getByRole('radiogroup')).toBeVisible(); expect(state.writes).toEqual([]);
  await next(page).click(); await modal(page).getByLabel('E-mail du responsable', { exact: true }).fill('incorrect'); await next(page).click(); await expect(modal(page).getByLabel('E-mail du responsable', { exact: true })).toBeVisible(); expect(state.writes).toEqual([]);
});
test('chain branches create copies selected catalog with optional manager exactly once', async ({ page }, info) => {
  const state = await install(page); await page.setViewportSize({ width: 375, height: 1000 }); await open(page); await page.getByRole('button', { name: 'Créer une succursale', exact: true }).click(); await modal(page).getByLabel('Nom de la succursale', { exact: true }).fill('Nouvelle démo'); await modal(page).getByLabel('Adresse', { exact: true }).fill('Adresse démo 3'); await next(page).click(); await modal(page).getByRole('radio', { name: /Jardin Foody/ }).check(); await next(page).click(); await modal(page).getByLabel('Nom du responsable', { exact: true }).fill('Manager démo'); await modal(page).getByLabel('E-mail du responsable', { exact: true }).fill('manager@foody.test'); await next(page).click(); await page.screenshot({ path: info.outputPath('chain-branch-create-review-fr.png') });
  await modal(page).getByRole('button', { name: 'Créer une succursale', exact: true }).click(); await expect(modal(page)).toHaveCount(0); await expect(page.getByRole('heading', { name: 'Nouvelle démo', exact: true })).toBeVisible(); expect(state.writes).toEqual([{ path: '/api/v1/chain/branches', method: 'POST', rid: '1', body: { name: 'Nouvelle démo', address: 'Adresse démo 3', manager_name: 'Manager démo', manager_email: 'manager@foody.test', catalog_source_restaurant_id: 2 } }]);
});
for (const applied of [true, false]) test(`chain branches uncertain creation cannot repeat automatically ${applied}`, async ({ page }) => {
  const state = await install(page); state.failWrite = true; state.applyAndFail = applied; await open(page); await createReview(page); await modal(page).getByRole('button', { name: 'Créer une succursale', exact: true }).click(); await expect(verify(page)).toBeVisible(); await expect(modal(page).getByRole('button', { name: 'Créer une succursale', exact: true })).toHaveCount(0);
  state.failWrite = false; await verify(page).click(); await expect(modal(page).getByRole('button', { name: 'Retour à la liste', exact: true })).toBeVisible(); expect(state.writes).toHaveLength(1);
});
test('chain branches setup is separate from branch creation and preserves current restaurant', async ({ page }) => {
  const state = await install(page, { standalone: true }); await page.goto('/1/chain/branches'); await page.getByRole('button', { name: 'Créer l’enseigne', exact: true }).click(); await modal(page).getByLabel('Nom de l’enseigne', { exact: true }).fill('Nouvelle enseigne'); await next(page).click(); await modal(page).getByRole('button', { name: /Créer/, exact: false }).click(); await expect(modal(page)).toHaveCount(0); await expect(page.getByRole('heading', { name: 'Nouvelle enseigne', exact: true })).toBeVisible(); expect(state.writes).toHaveLength(1); expect(state.writes[0]).toMatchObject({ method: 'POST', path: '/api/v1/chain', rid: '1', body: { name: 'Nouvelle enseigne', slug: 'nouvelle-enseigne', primary_branch_name: 'Atelier Foody' } }); expect(state.overview.branches).toHaveLength(1);
});
test('chain branches chain settings change the primary site through the existing contract', async ({ page }) => {
  const state = await install(page); await open(page); await page.getByRole('button', { name: 'Réglages de l’enseigne', exact: true }).click(); await modal(page).getByLabel('Nom de l’enseigne', { exact: true }).fill('Enseigne renommée'); await modal(page).getByRole('combobox').selectOption('2'); await save(page).click(); await expect(modal(page)).toHaveCount(0); expect(state.writes).toHaveLength(1); expect(state.writes[0]).toMatchObject({ method: 'PATCH', path: '/api/v1/chain', rid: '1', body: { name: 'Enseigne renommée', slug: 'maison-foody', primary_restaurant_id: 2 } });
});
test('chain branches global and individual publication serialize their scoped changes', async ({ page }) => {
  const state = await install(page); await open(page); await page.getByRole('button', { name: 'Activer la commande globale', exact: true }).click(); await expect(page.getByRole('button', { name: 'Désactiver la commande globale', exact: true })).toBeVisible(); await card(page, 2).getByRole('button', { name: 'Masquer', exact: true }).click(); await expect(card(page, 2).getByRole('button', { name: 'Publier', exact: true })).toBeVisible(); expect(state.writes).toEqual([{ method: 'PATCH', path: '/api/v1/chain/publication', rid: '1', body: { enabled: true } }, { method: 'PATCH', path: '/api/v1/chain/branches/2', rid: '1', body: { listing_status: 'hidden' } }]);
});
test('chain branches invite uses the target restaurant and never repeats on uncertain response', async ({ page }) => {
  const state = await install(page); state.failWrite = true; await open(page); await card(page, 2).getByRole('button', { name: 'Renvoyer l’invitation', exact: true }).click(); await expect(page.getByText(/L’envoi de l’invitation n’est pas confirmé/)).toBeVisible(); expect(state.writes).toEqual([{ method: 'POST', path: '/api/v1/restaurants/2/staff/12/resend-invite', rid: '2', body: {} }]);
});

test('chain branches verification recognizes cleared optional fields omitted by the API', async ({ page }) => {
  const state = await install(page); state.failWrite = true; state.applyAndFail = true; await open(page); await edit(page);
  await modal(page).getByLabel('Téléphone', { exact: true }).fill(''); await save(page).click(); await expect(verify(page)).toBeVisible();
  delete (state.overview.branches[0] as any).phone; delete (state.overview.branches[0] as any).short_description;
  state.failWrite = false; await verify(page).click(); await expect(modal(page)).toHaveCount(0); expect(state.writes).toHaveLength(1);
});
test('chain branches uncertain chain settings reconcile with saved identity', async ({ page }) => {
  const state = await install(page); state.failWrite = true; state.applyAndFail = true; await open(page); await page.getByRole('button', { name: 'Réglages de l’enseigne', exact: true }).click(); await modal(page).getByLabel('Nom de l’enseigne', { exact: true }).fill('Enseigne modifiée'); await save(page).click(); await expect(verify(page)).toBeVisible(); state.failWrite = false; await verify(page).click(); await expect(modal(page)).toHaveCount(0); expect(state.writes).toHaveLength(1);
});
test('chain branches failed publication refresh never repeats the write', async ({ page }) => {
  const state = await install(page); state.failWrite = true; state.applyAndFail = true; state.failAfterWrite = true; await open(page); await page.getByRole('button', { name: 'Activer la commande globale', exact: true }).click(); await expect(page.getByText('Impossible de charger les établissements.', { exact: true })).toBeVisible(); state.failRead = false; await page.getByRole('button', { name: 'Réessayer', exact: true }).click(); await expect(page.getByRole('button', { name: 'Désactiver la commande globale', exact: true })).toBeVisible(); expect(state.writes).toHaveLength(1);
});
