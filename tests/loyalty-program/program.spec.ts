import { test, expect, type Page } from '@playwright/test';
import { createFixture } from '../redesign/fixtures.mjs';
const id = '11111111-1111-4111-8111-111111111111';
const content = { en: { name: 'Synthetic loyalty', terms: 'Synthetic terms for test.' }, fr: { name: 'Fidélité de démonstration', terms: 'Conditions synthétiques pour le test.' }, he: { name: 'מועדון לדוגמה', terms: 'תנאים לדוגמה בלבד.' } };
const base = { id, version_id: id, revision: 1, enabled: false, rules: { mode: 'visits', currency: 'ILS', spend_step_minor: 0, units_per_step: 1, minimum_purchase_minor: 0, reward_threshold: 5, reward_type: 'fixed', reward_amount_minor: 1250, reward_validity_days: 0, terms_version: 'v1' }, content, updated_at: '2026-11-01T08:00:00Z' };

async function setup(page: Page, options: { existing?: boolean; readOnly?: boolean; locked?: boolean; locale?: string; mode?: string } = {}) {
  const fixtureOptions = { empty: false, permissions: ['settings.view', 'settings.edit', 'menu.view'] }, fixture = createFixture(fixtureOptions);
  const posts: any[] = [], acks = new Map<string, any>(); let current: any = options.existing ? structuredClone(base) : null;
  await page.addInitScript(({ locale }) => { localStorage.setItem('foody_restaurant_token', 'isolated-program-fixture'); if (!localStorage.getItem('foody_restaurant_user')) localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Synthetic operator', role: 'owner' })); localStorage.setItem('foody_restaurant_ids', '[1,2]'); localStorage.setItem('foody-admin-locale', locale); localStorage.setItem('foody_admin_theme', locale === 'he' ? 'dark' : 'light'); }, { locale: options.locale ?? 'fr' });
  await page.route('**/*', route => ['localhost', '127.0.0.1', 'square-fonts-production-f.squarecdn.com'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  await page.routeWebSocket('**', socket => socket.close());
  await page.route('**/api/v1/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname, rid = Number(req.headers()['x-restaurant-id']);
    if (path === '/api/v1/loyalty/program') {
      expect(req.headers()['authorization']).toContain('isolated-program-fixture'); expect([1, 2]).toContain(rid);
      if (req.method() === 'GET') return route.fulfill({ json: { program: current, can_manage_program: !options.readOnly, identity_locked: !!options.locked, restaurant_currency: 'ILS' } });
      const input = req.postDataJSON(); posts.push(input);
      if (options.mode === 'stale' && posts.length === 1) { current = structuredClone(base); return route.fulfill({ status: 409, json: { error: 'loyalty_conflict' } }); }
      if (options.mode === 'failure') return route.fulfill({ status: 500, json: { error: 'synthetic private SQL provider data' } });
      if (!acks.has(input.request_id)) { current = { ...structuredClone(base), id: current?.id ?? id, revision: input.expected_revision + 1, enabled: input.enabled, rules: input.rules, content: input.content }; acks.set(input.request_id, structuredClone(current)); }
      if (options.mode === 'lost' && posts.length === 1) return route.abort('failed');
      return route.fulfill({ json: { program: acks.get(input.request_id) } });
    }
    const response = fixture.response(req.url(), req.method(), req.postDataJSON() ?? {}, rid || 1); return route.fulfill({ status: response.status ?? 200, json: response.json ?? {} });
  });
  await page.goto('/1/loyalty/program'); return { posts, fixture, replaceProgram: (next: any) => { current = structuredClone(next); } };
}
async function fill(page: Page) {
  await page.getByLabel('Mode d’acquisition', { exact: true }).selectOption('visits');
  await page.getByLabel('Unités nécessaires à une récompense', { exact: true }).fill('5');
  await page.getByLabel('Montant de la remise (ILS)', { exact: true }).fill('12,50');
  await page.getByLabel('Version des conditions', { exact: true }).fill('v1');
  for (const [language, value] of Object.entries({ English: content.en, Français: content.fr, עברית: content.he })) { await page.getByLabel(`Nom — ${language}`, { exact: true }).fill(value.name); await page.getByLabel(`Conditions — ${language}`, { exact: true }).fill(value.terms); }
}
async function save(page: Page) { await page.getByRole('button', { name: 'Enregistrer la configuration', exact: true }).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Confirmer la configuration', exact: true }).click(); }

test('a complete visits program needs explicit confirmation and preserves exact money', async ({ page }, info) => {
  const state = await setup(page); await expect(page.getByRole('heading', { name: 'Programme de fidélité', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Programme de fidélité', exact: true })).toHaveAttribute('href', '/1/loyalty/program');
  await expect(page.getByRole('link', { name: 'Studio Wallet', exact: true })).toHaveAttribute('href', '/1/loyalty/program/wallet');
  await expect(page.getByText('Aucun programme configuré', { exact: true })).toBeVisible();
  expect(state.posts).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Enregistrer la configuration', exact: true })).toBeDisabled(); await fill(page);
  await page.screenshot({ path: info.outputPath('program-desktop.png'), fullPage: true, animations: 'disabled' });
  await save(page); await expect(page.getByText('La configuration a été enregistrée.', { exact: false })).toBeVisible();
  expect(state.posts).toHaveLength(1); expect(state.posts[0].rules).toMatchObject({ mode: 'visits', spend_step_minor: 0, units_per_step: 1, reward_amount_minor: 1250 }); expect(state.posts[0].enabled).toBe(false); expect(state.fixture.writes).toEqual([]);
});
test('lost response survives reload and resumes exactly the original configuration', async ({ page }) => {
  const state = await setup(page, { mode: 'lost' }); await fill(page); await save(page); await expect(page.getByText('Le résultat n’est pas confirmé.', { exact: false })).toBeVisible(); await page.reload();
  await expect(page.getByRole('button', { name: 'Reprendre la demande d’origine', exact: true })).toBeVisible(); expect(state.posts).toHaveLength(1);
  await page.getByRole('button', { name: 'Reprendre la demande d’origine', exact: true }).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Reprendre la demande d’origine', exact: true }).click();
  await expect(page.getByText('La configuration a été enregistrée.', { exact: false })).toBeVisible(); expect(state.posts).toHaveLength(2); expect(state.posts[1]).toEqual(state.posts[0]);
});
test('read-only authority hides saving and membership locks terms while allowing names', async ({ page }) => {
  await setup(page, { existing: true, readOnly: true, locked: true }); await expect(page.getByText('Vos droits actuels permettent uniquement la consultation.')).toBeVisible(); await expect(page.getByRole('button', { name: 'Enregistrer la configuration', exact: true })).toHaveCount(0); await expect(page.getByLabel('Nom — Français', { exact: true })).toBeDisabled();
});
test('current membership locks mode and terms without freezing the program name', async ({ page }) => {
  await setup(page, { existing: true, locked: true }); await expect(page.getByLabel('Mode d’acquisition', { exact: true })).toBeDisabled(); await expect(page.getByLabel('Conditions — Français', { exact: true })).toBeDisabled(); await expect(page.getByLabel('Nom — Français', { exact: true })).toBeEnabled();
});
test('stale rejection requires explicit reload and review before a different request', async ({ page }) => {
  const state = await setup(page, { mode: 'stale' }); await fill(page); await save(page); await expect(page.getByText('Cette demande a été refusée.', { exact: false })).toBeVisible(); expect(state.posts).toHaveLength(1);
  await page.getByRole('button', { name: 'Recharger et vérifier', exact: true }).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Recharger et vérifier', exact: true }).click();
  await expect(page.getByLabel('Nom — Français', { exact: true })).toBeEnabled(); expect(state.posts).toHaveLength(1); await page.getByLabel('Nom — Français', { exact: true }).fill('Programme revu'); await save(page);
  await expect(page.getByText('La configuration a été enregistrée.', { exact: false })).toBeVisible(); expect(state.posts[1].program_id).toBe(id); expect(state.posts[1].expected_revision).toBe(1); expect(state.posts[1].request_id).not.toBe(state.posts[0].request_id);
});
test('storage failure blocks before transport and actor changes remove the form', async ({ page }) => {
  const state = await setup(page); await fill(page); await page.evaluate(() => { Storage.prototype.setItem = function () { throw new Error('quota'); }; }); await save(page);
  await expect(page.getByText('La demande d’origine ne peut pas être conservée', { exact: false })).toBeVisible(); expect(state.posts).toHaveLength(0);
  await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage'))); // Same actor is still allowed to read; no replacement is sent.
  expect(state.posts).toHaveLength(0);
});
test('another actor cannot view or adopt the original configuration', async ({ page }) => {
  const state = await setup(page, { mode: 'lost' }); await fill(page); await save(page); await expect(page.getByText('Le résultat n’est pas confirmé.', { exact: false })).toBeVisible();
  await page.evaluate(() => { localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 2, full_name: 'Other operator', role: 'owner' })); window.dispatchEvent(new StorageEvent('storage')); });
  await expect(page.getByText('Vous n’avez plus accès à ce programme.', { exact: true })).toBeVisible(); await expect(page.getByLabel('Nom — Français', { exact: true })).toHaveCount(0); expect(state.posts).toHaveLength(1);
});
test('mobile Hebrew dark configuration fits the viewport and translated fields', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); await setup(page, { existing: true, locale: 'he' }); await expect(page.locator('html')).toHaveAttribute('dir', 'rtl'); await expect(page.getByRole('heading', { name: 'תוכנית מועדון', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath('program-hebrew-mobile.png'), animations: 'disabled' });
});
test('English form masks technical errors and never auto-replays', async ({ page }) => {
  const state = await setup(page, { existing: true, locale: 'en', mode: 'failure' }); await page.getByLabel('Name — English', { exact: true }).fill('Reviewed synthetic name'); await page.getByRole('button', { name: 'Save configuration', exact: true }).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm configuration', exact: true }).click();
  await expect(page.getByText('The result is not confirmed.', { exact: false })).toBeVisible(); await expect(page.getByText('synthetic private SQL provider data')).toHaveCount(0); expect(state.posts).toHaveLength(1);
});


test('points and a sized product use exact catalog option identity and explicit activation', async ({ page }) => {
  const state = await setup(page); await fill(page);
  Object.assign(state.fixture.items[2], { option_sets: [{ id: 9, selection_role: 'price', options: [{ id: 91, name: 'Grande taille', is_active: true }] }] });
  await page.getByLabel('Mode d’acquisition', { exact: true }).selectOption('points');
  await page.getByLabel('Par montant dépensé (ILS)', { exact: true }).fill('10'); await page.getByLabel('Points acquis', { exact: true }).fill('2');
  await page.getByLabel('Type de récompense', { exact: true }).selectOption('item'); await page.getByLabel('Produit', { exact: true }).selectOption('3'); await page.getByLabel('Taille ou option', { exact: true }).selectOption('91');
  await page.getByRole('switch', { name: 'Programme actif', exact: true }).check(); await save(page);
  await expect(page.getByText('La configuration a été enregistrée.', { exact: false })).toBeVisible(); expect(state.posts[0].rules).toMatchObject({ mode: 'points', spend_step_minor: 1000, units_per_step: 2, reward_item_id: 3, reward_variant_id: 91, reward_amount_minor: 0 }); expect(state.posts[0].enabled).toBe(true);
});
test('replaying an old enabled acknowledgement displays the newer paused program', async ({ page }) => {
  const state = await setup(page, { mode: 'lost' }); await fill(page); await page.getByRole('switch', { name: 'Programme actif', exact: true }).check(); await save(page); await expect(page.getByText('Le résultat n’est pas confirmé.', { exact: false })).toBeVisible();
  state.replaceProgram({ ...structuredClone(base), revision: 2, enabled: false, content: { ...structuredClone(content), fr: { ...content.fr, name: 'Programme actuel suspendu' } } });
  await page.reload(); await page.getByRole('button', { name: 'Reprendre la demande d’origine', exact: true }).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Reprendre la demande d’origine', exact: true }).click();
  await expect(page.getByLabel('Nom — Français', { exact: true })).toHaveValue('Programme actuel suspendu'); await expect(page.getByRole('switch', { name: 'Programme actif', exact: true })).not.toBeChecked(); expect(state.posts[1]).toEqual(state.posts[0]);
});
