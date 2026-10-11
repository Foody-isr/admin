import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

async function install(page: Page, options: { locale?: string; permissions?: string[]; empty?: boolean } = {}) {
  const fixtureOptions = { empty: false, permissions: options.permissions };
  const fixture = createFixture(fixtureOptions);
  const settings = { floor_plan_color_indicators: true, table_in_service_color: '#54D6A1', table_yellow_after_minutes: 30, table_red_after_minutes: 60 };
  const makeSection = (id: number, name: string, count: number) => ({ id, name, restaurant_id: 1, sort_order: id, created_at: '2026-10-01', updated_at: '2026-10-01', tables: Array.from({ length: count }, (_, i) => ({ id: id * 100 + i, section_id: id, name: `${name} ${i + 1}`, active: false, seats: 4, code: `synthetic-${id}-${i}` })) });
  const control = { settings, sections: options.empty ? [] : [makeSection(1, 'Terrasse • מרפסת — espace du jardin et grandes tablées familiales', 3), makeSection(2, 'Bar', 0)], settingsReads: 0, sectionReads: 0, gate: null as Promise<void> | null, partialCreate: false };
  const faults = { settingsLoad: 0, settingsSave: 0, sectionsLoad: 0, sectionWrite: 0, afterWriteLoad: 0 };
  const writes: { path: string; method: string; body: any; restaurant?: string }[] = [];
  await page.addInitScript(({ locale }) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'owner', email: 'demo@foody.test' }));
    localStorage.setItem('foody_restaurant_ids', '[1,2]');
    localStorage.setItem('foody-admin-locale', locale); localStorage.setItem('foody_admin_theme', locale === 'he' ? 'dark' : 'light');
  }, { locale: options.locale ?? 'fr' });
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method(), body = request.postDataJSON() ?? {}, restaurant = request.headers()['x-restaurant-id'];
    const send = (json: unknown, status = 200) => route.fulfill({ json, status });
    const fail = () => send({ error: 'Synthetic table settings failure' }, 503);
    const consume = (key: keyof typeof faults) => { if (faults[key] > 0) { faults[key]--; return true; } return false; };
    if (/\/restaurants\/\d+\/settings$/.test(path)) {
      if (method === 'GET') { control.settingsReads++; return consume('settingsLoad') ? fail() : send({ settings: control.settings }); }
      writes.push({ path, method, body, restaurant }); if (control.gate) await control.gate;
      if (consume('settingsSave')) return fail();
      Object.assign(control.settings, body); control.settings.table_in_service_color = control.settings.table_in_service_color.toUpperCase(); return send({ settings: control.settings });
    }
    if (/\/restaurants\/\d+\/sections(?:\/\d+)?$/.test(path)) {
      if (method === 'GET') { control.sectionReads++; return consume('sectionsLoad') ? fail() : send({ sections: control.sections }); }
      writes.push({ path, method, body, restaurant }); if (control.gate) await control.gate;
      const id = Number(path.split('/').pop());
      if (control.partialCreate && method === 'POST') { control.partialCreate = false; control.sections.push(makeSection(9, body.name, 1)); return fail(); }
      if (consume('sectionWrite')) return fail();
      faults.sectionsLoad = faults.afterWriteLoad; faults.afterWriteLoad = 0;
      if (method === 'POST') { const section = makeSection(9, body.name, body.table_count ?? 0); control.sections.push(section); return send({ section }, 201); }
      if (method === 'PUT') { const section = control.sections.find(section => section.id === id)!; section.name = body.name; return send({ section: { ...section, tables: undefined } }); }
      control.sections = control.sections.filter(section => section.id !== id); return send({});
    }
    const result = fixture.response(request.url(), method, body, Number(restaurant) || 1);
    return send(result.json ?? {}, result.status ?? 200);
  });
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  return { fixture, control, faults, writes };
}
const save = (page: Page) => page.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).last();
const hex = (page: Page) => page.getByRole('textbox', { name: 'Couleur hexadécimale', exact: true });
const yellow = (page: Page) => page.getByRole('textbox', { name: 'Passer en jaune après', exact: true });
const sectionName = (page: Page) => page.getByRole('textbox', { name: 'Nom de la section', exact: true });
const create = (page: Page) => page.getByRole('dialog').getByRole('button', { name: 'Créer', exact: true });
const guarded = (page: Page) => page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; });
const notice = (page: Page) => page.locator('main [role=status]').filter({ hasNotText: /^Chargement/ });

for (const locale of ['fr', 'he']) test(`table indicators and sections responsive ${locale}`, async ({ page }, info) => {
  const state = await install(page, { locale }); await page.setViewportSize({ width: locale === 'fr' ? 375 : 1440, height: 1000 });
  await page.goto('/1/restaurant/table-status'); await expect(page.getByRole('switch')).toBeVisible();
  await page.screenshot({ path: info.outputPath(`table-status-${locale}.png`) });
  await page.locator('form ul').scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`table-status-preview-${locale}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.goto('/1/restaurant/sections'); await expect(page.locator('main h2').first()).toContainText('Terrasse');
  await page.screenshot({ path: info.outputPath(`table-sections-${locale}.png`) });
  await page.locator('main button').filter({ has: page.locator('svg.lucide-plus') }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible(); await page.screenshot({ path: info.outputPath(`table-section-dialog-${locale}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy(); expect(state.fixture.unhandled).toEqual([]);
});

test('table indicators load failure offers retry, never default editable values', async ({ page }) => {
  const state = await install(page); state.faults.settingsLoad = 100; await page.goto('/1/restaurant/table-status');
  await expect(page.locator('main [role=alert]')).toBeVisible(); await expect(hex(page)).toHaveCount(0);
  state.faults.settingsLoad = 0; await page.getByRole('button', { name: 'Réessayer', exact: true }).click(); await expect(hex(page)).toHaveValue('#54D6A1'); expect(state.writes).toHaveLength(0);
});

test('table indicators preserve hidden, historical and reversed thresholds without rewriting them', async ({ page }) => {
  const state = await install(page); state.control.settings.table_yellow_after_minutes = 900; state.control.settings.table_red_after_minutes = 10;
  await page.goto('/2/restaurant/table-status'); await expect(yellow(page)).toHaveValue('900'); await expect(page.getByText(/aucun intervalle jaune ne s’affichera/)).toBeVisible();
  await page.getByRole('switch').click(); await expect(yellow(page)).toHaveCount(0); await save(page).click(); await expect(notice(page)).toContainText('Enregistré');
  expect(state.writes).toHaveLength(1); expect(state.writes[0]).toMatchObject({ restaurant: '2', body: { floor_plan_color_indicators: false } });
  await page.getByRole('switch').click(); await expect(yellow(page)).toHaveValue('900');
});

test('table indicators validate the hex field, retry errors and serialize changes', async ({ page }) => {
  const state = await install(page); await page.goto('/1/restaurant/table-status'); await hex(page).fill('red'); await save(page).click(); await expect(hex(page)).toHaveAttribute('aria-invalid', 'true'); await expect(hex(page)).toBeFocused(); expect(state.writes).toHaveLength(0);
  await hex(page).fill('#aabbcc'); state.faults.settingsSave = 1;
  let release!: () => void; state.control.gate = new Promise<void>(resolve => { release = resolve; });
  await save(page).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); }); await expect(hex(page)).toHaveJSProperty('readOnly', true); await expect(page.getByRole('switch')).toBeDisabled(); release(); state.control.gate = null;
  await expect(page.locator('main [role=alert]')).toBeVisible(); expect(await guarded(page)).toBe(true); await expect(hex(page)).toHaveValue('#aabbcc');
  await save(page).click(); await expect(notice(page)).toContainText('Enregistré'); await expect(hex(page)).toHaveValue('#AABBCC'); expect(state.writes).toHaveLength(2); expect(await guarded(page)).toBe(false);
});

test('table indicators protect navigation, reset and interface language changes', async ({ page }) => {
  const state = await install(page); await page.goto('/1/restaurant/table-status'); await yellow(page).fill('45'); const reads = state.control.settingsReads;
  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: 'Compte', exact: true }).click();
  await page.getByRole('link', { name: 'Sécurité', exact: true }).click(); await expect(page.getByRole('alertdialog')).toBeVisible(); await page.getByRole('button', { name: 'Annuler', exact: true }).click(); await expect(yellow(page)).toHaveValue('45');
  await page.getByRole('button', { name: 'Réinitialiser', exact: true }).click(); await page.getByRole('button', { name: 'Abandonner les modifications', exact: true }).click(); await expect(yellow(page)).toHaveValue('30');
  await hex(page).fill('#123456'); await page.getByRole('button', { name: 'Atelier Foody', exact: true }).click(); await page.getByRole('dialog').getByRole('combobox').selectOption('he'); await page.keyboard.press('Escape');
  await expect(page.getByRole('textbox', { name: 'קוד צבע הקסדצימלי', exact: true })).toHaveValue('#123456'); expect(state.control.settingsReads).toBe(reads);
});

test('table indicators require settings edit, not tables manage', async ({ page }) => {
  const state = await install(page, { permissions: ['settings.view', 'tables.manage'] }); await page.goto('/1/restaurant/table-status');
  await expect(hex(page)).toHaveJSProperty('readOnly', true); await expect(page.getByRole('switch')).toBeDisabled(); await expect(save(page)).toHaveCount(0); expect(state.writes).toHaveLength(0);
});

test('sections load failure and empty creation remain distinct', async ({ page }) => {
  const state = await install(page, { empty: true }); state.faults.sectionsLoad = 100; await page.goto('/1/restaurant/sections');
  await expect(page.locator('main [role=alert]')).toBeVisible(); await expect(page.getByRole('button', { name: 'Nouvelle section', exact: true })).toBeDisabled();
  state.faults.sectionsLoad = 0; await page.getByRole('button', { name: 'Réessayer', exact: true }).click(); await page.getByRole('button', { name: 'Nouvelle section', exact: true }).last().click();
  await expect(page.getByRole('textbox', { name: 'Tables initiales', exact: true })).toHaveValue('0'); await sectionName(page).fill('  Jardin  '); await create(page).click(); await expect(notice(page)).toContainText('Section créée.');
  expect(state.writes[0].body).toEqual({ name: 'Jardin', label: 'Jardin' }); await expect(page.getByText('Tables visibles : 0', { exact: true })).toBeVisible();
});

test('sections create keeps focus, supports cancellation and rejects duplicate names', async ({ page }) => {
  const state = await install(page); await page.goto('/1/restaurant/sections'); const trigger = page.getByRole('button', { name: 'Nouvelle section', exact: true }); await trigger.click(); await expect(sectionName(page)).toBeFocused(); await sectionName(page).fill(' bar '); await create(page).click(); await expect(sectionName(page)).toHaveAttribute('aria-invalid', 'true'); expect(state.writes).toHaveLength(0);
  await page.keyboard.press('Escape'); await expect(page.getByRole('alertdialog')).toBeVisible(); await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler', exact: true }).click(); await expect(sectionName(page)).toHaveValue(' bar ');
  await page.getByRole('dialog').getByRole('button', { name: 'Annuler', exact: true }).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Abandonner les modifications', exact: true }).click(); await expect(trigger).toBeFocused();
});

test('sections serialize creation and recover an acknowledged write by GET only', async ({ page }) => {
  const state = await install(page); await page.goto('/2/restaurant/sections'); await page.getByRole('button', { name: 'Nouvelle section', exact: true }).click(); await sectionName(page).fill('Jardin'); await page.getByRole('textbox', { name: 'Tables initiales', exact: true }).fill('4');
  state.faults.afterWriteLoad = 1; let release!: () => void; state.control.gate = new Promise<void>(resolve => { release = resolve; });
  await create(page).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); }); await expect(sectionName(page)).toHaveJSProperty('readOnly', true); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toBeVisible(); release(); state.control.gate = null;
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(notice(page)).toContainText('Section créée.'); await expect(page.locator('main [role=alert]')).toContainText('confirmée');
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click(); await expect(page.getByText('Tables visibles : 4', { exact: true })).toBeVisible(); expect(state.writes).toHaveLength(1); expect(state.writes[0]).toMatchObject({ restaurant: '2', body: { name: 'Jardin', label: 'Jardin', table_count: 4 } });
});

test('sections preserve tables after rename response without a preload', async ({ page }) => {
  const state = await install(page); await page.goto('/1/restaurant/sections'); await page.getByRole('button', { name: /^Renommer.*Terrasse/ }).click(); await sectionName(page).fill('Salle principale'); state.faults.afterWriteLoad = 1; await save(page).click();
  await expect(notice(page)).toContainText('Section renommée.'); await expect(page.getByText('Tables visibles : 3', { exact: true })).toBeVisible(); await expect(page.locator('main h2').first()).toHaveText('Salle principale');
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click(); expect(state.writes).toHaveLength(1); expect(state.writes[0].body).toEqual({ name: 'Salle principale' });
});

test('sections partial creation requires readback and never repeats the POST automatically', async ({ page }) => {
  const state = await install(page); await page.goto('/1/restaurant/sections'); await page.getByRole('button', { name: 'Nouvelle section', exact: true }).click(); await sectionName(page).fill('Jardin'); await page.getByRole('textbox', { name: 'Tables initiales', exact: true }).fill('4'); state.control.partialCreate = true; await create(page).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Certaines modifications peuvent déjà exister'); await expect(create(page)).toBeDisabled(); await expect(sectionName(page)).toHaveValue('Jardin');
  await page.getByRole('button', { name: 'Actualiser et vérifier la liste', exact: true }).click(); await expect(page.getByRole('dialog').getByText(/Tables visibles : 1/)).toBeVisible(); await create(page).click(); await expect(sectionName(page)).toHaveAttribute('aria-invalid', 'true'); expect(state.writes).toHaveLength(1);
});

test('sections write failure retains draft and requires deliberate retry after readback', async ({ page }) => {
  const state = await install(page); await page.goto('/1/restaurant/sections'); await page.getByRole('button', { name: 'Nouvelle section', exact: true }).click(); await sectionName(page).fill('Jardin'); state.faults.sectionWrite = 1; await create(page).click(); await expect(create(page)).toBeDisabled();
  await page.getByRole('button', { name: 'Actualiser et vérifier la liste', exact: true }).click(); await create(page).click(); await expect(page.getByRole('alertdialog')).toBeVisible(); expect(state.writes).toHaveLength(1);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Envoyer de nouveau', exact: true }).click(); await expect(notice(page)).toContainText('Section créée.'); expect(state.writes).toHaveLength(2);
});

test('sections deletion describes the full scope and reload retry never repeats DELETE', async ({ page }) => {
  const state = await install(page); await page.goto('/1/restaurant/sections'); const remove = page.getByRole('button', { name: /^Supprimer.*Terrasse/ }); await remove.click(); await expect(page.getByRole('alertdialog')).toContainText('y compris les tables absentes de votre liste visible'); await page.getByRole('button', { name: 'Annuler', exact: true }).click(); await expect(remove).toBeFocused(); expect(state.writes).toHaveLength(0);
  state.faults.afterWriteLoad = 1; await remove.click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer', exact: true }).click(); await expect(notice(page)).toContainText('Suppression de la section confirmée.'); await expect(remove).toHaveCount(0); await page.getByRole('button', { name: 'Réessayer', exact: true }).click(); expect(state.writes).toHaveLength(1); expect(state.writes[0].method).toBe('DELETE');
});

test('sections cannot be changed with settings edit alone', async ({ page }) => {
  const state = await install(page, { permissions: ['settings.view', 'settings.edit'] }); await page.goto('/1/restaurant/sections'); await expect(page.locator('main h2').first()).toContainText('Terrasse'); await expect(page.getByRole('button', { name: 'Nouvelle section', exact: true })).toHaveCount(0); await expect(page.getByRole('button', { name: /^Supprimer.*Terrasse/ })).toHaveCount(0); expect(state.writes).toHaveLength(0);
});

test('English table settings remain labelled and use the same values', async ({ page }) => {
  const state = await install(page, { locale: 'en' }); await page.goto('/1/restaurant/table-status'); await expect(page.getByRole('textbox', { name: 'Hex colour', exact: true })).toHaveValue('#54D6A1'); await page.goto('/1/restaurant/sections'); await page.getByRole('button', { name: 'New section', exact: true }).click(); await expect(page.getByRole('textbox', { name: 'Initial tables', exact: true })).toHaveValue('0'); expect(state.writes).toHaveLength(0);
});
