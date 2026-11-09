import { expect, test, type Page } from '@playwright/test';
import type { CarteDraftState, CarteDraftInput } from '../../src/lib/api';
import { createFixture } from './fixtures.mjs';

async function install(page: Page, options: { locale?: string; rotating?: boolean; permissions?: string[] } = {}) {
  const fixtureOptions = { library: true, carte: true, permissions: options.permissions };
  const fixture = createFixture(fixtureOptions);
  const menu = fixture.menus[0];
  Object.assign(menu, { publication_enabled: true });
  menu.is_weekly_rotating = !!options.rotating;
  const published = structuredClone(menu);
  const docs = new Map<string, CarteDraftState>();
  const writes: { date: string; body: CarteDraftInput }[] = [];
  const forbidden: string[] = [];
  let rejectSave = false; let loseResponse = false; let rejectLoad = false;
  const initial = (date: string): CarteDraftState => ({
    menu_id: menu.id, series_key: date, revision: 3, base_revision: 2,
    base_fingerprint: 'original-fingerprint', published_revision: 2, has_draft: true, updated_by_id: 1, is_weekly_rotating: !!options.rotating,
    payload: { name: menu.name, description: 'Other editor work', pos_enabled: true, web_enabled: true, follows_restaurant_hours: true, hours: [], stocks: [],
      groups: [
        { key: 'group-1', id: 1, name: 'Plats', image_url: '', pos_enabled: true, web_enabled: true, is_hidden: false, follows_menu_hours: true, hours: [], banner_focal_x: 50, banner_focal_y: 50, item_ids: [2] },
        { key: 'private-group', id: 0, name: 'Desserts du brouillon', image_url: '', pos_enabled: true, web_enabled: true, is_hidden: false, follows_menu_hours: true, hours: [], banner_focal_x: 50, banner_focal_y: 50, item_ids: [3] },
      ],
    },
  });
  await page.addInitScript(({ locale }) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Demo', role: 'owner', email: 'demo@foody.test' }));
    localStorage.setItem('foody_restaurant_ids', '[1]');
    localStorage.setItem('foody-admin-locale', locale);
    localStorage.setItem('foody_admin_theme', 'light');
  }, { locale: options.locale ?? 'fr' });
  await page.route('**/api/v1/**', async route => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
    const match = path.match(/^\/api\/v1\/menu\/menus\/(\d+)\/draft$/);
    if (match) {
      expect(request.headers()['x-restaurant-id']).toBe('1');
      const date = url.searchParams.get('serie_date') ?? '';
      const state = docs.get(date) ?? initial(date);
      if (request.method() === 'PUT') {
        const body = request.postDataJSON(); writes.push({ date, body });
        if (rejectSave || body.revision !== state.revision) return route.fulfill({ status: 409, json: { error: 'revision_conflict' } });
        docs.set(date, { ...state, payload: body.payload, revision: state.revision + 1, has_draft: true });
        if (loseResponse) { loseResponse = false; return route.abort(); }
      } else if (rejectLoad) return route.fulfill({ status: 500, json: { error: 'unavailable' } });
      return route.fulfill({ json: docs.get(date) ?? state });
    }
    if (request.method() !== 'GET' && (/\/groups\//.test(path) || /\/publish/.test(path))) forbidden.push(path);
    if (path === '/api/v1/orders/kds/stations') return route.fulfill({ json: { stations: [] } });
    const response = fixture.response(request.url(), request.method(), request.postDataJSON() ?? {}, 1);
    return route.fulfill({ status: response.status ?? 200, json: response.json ?? {} });
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname.startsWith('/api/v1/') ? route.fallback() : route.abort();
  });
  return { fixture, menu, published, docs, writes, forbidden, reject: (value: boolean) => { rejectSave = value; }, lose: () => { loseResponse = true; }, failLoad: (value: boolean) => { rejectLoad = value; } };
}
const open = (page: Page) => page.getByRole('button', { name: 'Ajouter aux cartes', exact: true }).click();
const done = (page: Page) => page.getByRole('button', { name: 'Terminé', exact: true }).click();
async function createGroup(page: Page, name: string) {
  await page.getByRole('button', { name: 'Créer un groupe de cartes', exact: true }).click();
  await page.getByRole('textbox', { name: 'Nom du groupe de cartes', exact: true }).fill(name);
  await page.getByRole('button', { name: 'Créer un groupe de cartes', exact: true }).click();
}

test('published and private groups can be selected; only the draft changes on Save', async ({ page }) => {
  const f = await install(page);
  await page.goto('/1/menu/items/1'); await open(page);
  await page.getByRole('checkbox', { name: 'Plats', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Desserts du brouillon', exact: true }).check();
  await done(page); expect(f.writes).toEqual([]); expect(f.fixture.writes).toEqual([]);
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Article enregistré', exact: true })).toBeVisible();
  expect(f.writes).toHaveLength(1);
  expect(f.docs.get('')?.payload.groups.map(group => group.item_ids)).toEqual([[2, 1], [3, 1]]);
  expect(f.docs.get('')?.payload.description).toBe('Other editor work');
  expect(f.menu.groups.map(group => ({ id: group.id, name: group.name, itemIds: group.items.map(item => item.id) }))).toEqual(f.published.groups.map(group => ({ id: group.id, name: group.name, itemIds: group.items.map(item => item.id) })));
  expect(f.forbidden).toEqual([]);
  await done(page); await expect(page).toHaveURL('/1/menu/items', { timeout: 30_000 });
});

test('creating a group keeps the article form and auto-selects it without writing', async ({ page }) => {
  const f = await install(page);
  await page.goto('/1/menu/items/new');
  await page.locator('#menu-item-name').fill('Article de test');
  await page.getByRole('textbox', { name: 'Prix de vente', exact: true }).fill('28');
  await open(page); await createGroup(page, 'Poissons');
  await expect(page.getByRole('checkbox', { name: /Poissons/ })).toBeChecked();
  await page.screenshot({ path: test.info().outputPath('inline-group-fr.png'), animations: 'disabled' });
  await createGroup(page, ' poissons ');
  await expect(page.getByRole('alert')).toContainText('déjà utilisé');
  await page.getByRole('button', { name: 'Annuler', exact: true }).last().click();
  await done(page);
  await expect(page.locator('#menu-item-name')).toHaveValue('Article de test');
  expect(f.writes).toEqual([]); expect(f.fixture.writes).toEqual([]);
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Article enregistré', exact: true })).toBeVisible();
  const created = f.fixture.items.at(-1)!;
  expect(f.docs.get('')?.payload.groups.at(-1)).toMatchObject({ id: 0, name: 'Poissons', item_ids: [created.id] });
  expect(f.forbidden).toEqual([]);
});

test('cancelling article creation never creates the staged group', async ({ page }) => {
  const f = await install(page);
  await page.goto('/1/menu/items/new'); await page.locator('#menu-item-name').fill('Annulé');
  await open(page); await createGroup(page, 'Groupe annulé'); await done(page);
  await page.getByRole('button', { name: 'Annuler', exact: true }).last().click();
  await page.getByRole('button', { name: 'Abandonner', exact: true }).click();
  await expect(page).toHaveURL('/1/menu/items', { timeout: 30_000 });
  expect(f.writes).toEqual([]); expect(f.fixture.writes).toEqual([]);
});

test('local draft recovery restores the article and its new group', async ({ page }) => {
  const f = await install(page);
  await page.goto('/1/menu/items/new'); await page.locator('#menu-item-name').fill('Brouillon repris');
  await page.getByRole('textbox', { name: 'Prix de vente', exact: true }).fill('28');
  await open(page); await createGroup(page, 'Groupe repris'); await done(page);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('foody.menu.itemDraft.1') ?? '{}').menuAssignments?.[0]?.groupName)).toBe('Groupe repris');
  page.once('dialog', dialog => dialog.accept()); await page.reload();
  await page.getByRole('button', { name: 'Reprendre', exact: true }).click();
  await expect(page.locator('#menu-item-name')).toHaveValue('Brouillon repris');
  await open(page); await expect(page.getByRole('checkbox', { name: /Groupe repris/ })).toBeChecked();
  expect(f.writes).toEqual([]);
});

test('an uncertain draft save retries without duplicating the article or group', async ({ page }) => {
  const f = await install(page); f.lose();
  await page.goto('/1/menu/items/new'); await page.locator('#menu-item-name').fill('Reprise après erreur');
  await page.getByRole('textbox', { name: 'Prix de vente', exact: true }).fill('28');
  await open(page); await createGroup(page, 'Groupe unique'); await done(page);
  const before = f.fixture.items.length;
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('alert').first()).toContainText('n’ont pas pu être confirmées');
  await expect(page.locator('#menu-item-name')).toHaveValue('Reprise après erreur');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Article enregistré', exact: true })).toBeVisible();
  expect(f.fixture.items).toHaveLength(before + 1); expect(f.writes).toHaveLength(1);
  expect(f.docs.get('')?.payload.groups.filter(group => group.name === 'Groupe unique')).toHaveLength(1);
});

test('rotating selections stay scoped to their explicit series', async ({ page }) => {
  const f = await install(page, { rotating: true });
  await page.goto('/1/menu/items/1'); await open(page);
  const series = page.getByRole('combobox', { name: /·/ });
  const days = f.fixture.batchConfig.upcoming_cycles.map(cycle => cycle.fulfillment_days[0]?.date).filter(Boolean);
  expect(days.length).toBeGreaterThan(1);
  await page.getByRole('checkbox', { name: 'Plats', exact: true }).check();
  await series.selectOption(days[1]);
  await page.getByRole('checkbox', { name: 'Desserts du brouillon', exact: true }).check();
  await done(page); await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Article enregistré', exact: true })).toBeVisible();
  expect(f.writes.map(write => write.date)).toEqual(days.slice(0, 2));
  expect(f.docs.get(days[0])?.payload.groups[1].item_ids).toEqual([3]);
  expect(f.docs.get(days[1])?.payload.groups[0].item_ids).toEqual([2]);
});

test('draft load failure offers retry and keeps the article mounted', async ({ page }) => {
  const f = await install(page); f.failLoad(true);
  await page.goto('/1/menu/items/new'); await page.locator('#menu-item-name').fill('Toujours ici'); await open(page);
  await expect(page.getByRole('dialog').getByRole('alert').first()).toContainText('Impossible de charger');
  f.failLoad(false); await page.getByRole('button', { name: 'Réessayer', exact: true }).first().click();
  await expect(page.getByRole('checkbox', { name: 'Plats', exact: true })).toBeEnabled();
  await done(page); await expect(page.locator('#menu-item-name')).toHaveValue('Toujours ici');
  expect(f.writes).toEqual([]);
});

test('read-only users cannot edit memberships or create groups', async ({ page }) => {
  const f = await install(page, { permissions: ['menu.view'] });
  await page.goto('/1/menu/items/1');
  await expect(page.getByRole('button', { name: 'Ajouter aux cartes', exact: true })).toBeDisabled();
  expect(f.writes).toEqual([]); expect(f.fixture.writes).toEqual([]);
});

test('a partial create keeps group choices editable for conflict recovery', async ({ page }) => {
  const f = await install(page); f.reject(true);
  await page.goto('/1/menu/items/new'); await page.locator('#menu-item-name').fill('Article conservé');
  await page.getByRole('textbox', { name: 'Prix de vente', exact: true }).fill('28');
  await open(page); await createGroup(page, 'Premier groupe'); await done(page);
  const before = f.fixture.items.length;
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('alert').first()).toContainText('n’ont pas pu être confirmées');
  await expect(page.getByRole('button', { name: 'Ajouter aux cartes', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Supprimer · Premier groupe', exact: true }).click();
  await open(page); await createGroup(page, 'Groupe corrigé'); await done(page);
  f.reject(false); await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Article enregistré', exact: true })).toBeVisible();
  expect(f.fixture.items).toHaveLength(before + 1);
  expect(f.docs.get('')?.payload.groups.at(-1)?.name).toBe('Groupe corrigé');
});

test('removing a choice after an uncertain save also removes its persisted membership', async ({ page }) => {
  const f = await install(page); f.lose();
  await page.goto('/1/menu/items/new'); await page.locator('#menu-item-name').fill('Affectation corrigée');
  await page.getByRole('textbox', { name: 'Prix de vente', exact: true }).fill('28');
  await open(page); await createGroup(page, 'Groupe déjà enregistré'); await done(page);
  const before = f.fixture.items.length;
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('alert').first()).toContainText('n’ont pas pu être confirmées');
  await page.getByRole('button', { name: 'Supprimer · Groupe déjà enregistré', exact: true }).click();
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Article enregistré', exact: true })).toBeVisible();
  expect(f.fixture.items).toHaveLength(before + 1);
  expect(f.docs.get('')?.payload.groups.at(-1)).toMatchObject({ name: 'Groupe déjà enregistré', item_ids: [] });
});

test('removing a draft membership waits for Save and retains other items', async ({ page }) => {
  const f = await install(page);
  await page.goto('/1/menu/items/2'); await open(page);
  await expect(page.getByRole('checkbox', { name: 'Plats', exact: true })).toBeChecked();
  await page.getByRole('checkbox', { name: 'Plats', exact: true }).uncheck();
  await done(page); expect(f.writes).toEqual([]);
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Article enregistré', exact: true })).toBeVisible();
  expect(f.docs.get('')?.payload.groups.map(group => group.item_ids)).toEqual([[], [3]]);
});

test('the Hebrew mobile picker creates a group without overflow or navigation', async ({ page }) => {
  const f = await install(page, { locale: 'he' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/1/menu/items/new'); await page.locator('#menu-item-name').fill('פריט לדוגמה');
  await page.getByRole('button', { name: 'הוסף לתפריטים', exact: true }).click();
  await page.getByRole('button', { name: 'צור קבוצת תפריט', exact: true }).click();
  await page.getByRole('textbox', { name: 'שם קבוצה', exact: true }).fill('מנות ראשונות');
  await page.getByRole('button', { name: 'צור קבוצת תפריט', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: /מנות ראשונות/ })).toBeChecked();
  expect(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('inline-group-mobile-he.png'), animations: 'disabled' });
  expect(f.writes).toEqual([]); expect(f.fixture.writes).toEqual([]);
});
