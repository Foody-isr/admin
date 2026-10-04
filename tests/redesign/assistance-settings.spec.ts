import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

const defaultRules = [
  { type: 'check_in', enabled: true, delay_minutes: 5, overdue_minutes: 10 },
  { type: 'offer_dessert', enabled: false, delay_minutes: 20, overdue_minutes: 10 },
];
async function install(page: Page, options: { locale?: string; permissions?: string[]; aiEnabled?: boolean } = {}) {
  const fixtureOptions = { empty: false, permissions: options.permissions };
  const fixture = createFixture(fixtureOptions);
  const settings = {
    require_order_approval: true, vat_rate: 18,
    ai_assistant_enabled: options.aiEnabled ?? true, ai_assistant_upsell: true, ai_assistant_auto_order: false,
    ai_assistant_guidance: 'Cuisine de démonstration — consignes conservées · מטבח לדוגמה',
    ai_assistant_aliases: 'coca / cola = Coca-Cola\nפיתה = Pita maison',
    ai_assistant_pairings: 'Salade → pita et boisson', ai_assistant_faq: 'Retrait ? — Sur place uniquement.',
    ai_assistant_trigger: 'delay', ai_assistant_trigger_delay: 45,
    table_assistance_rate_limit_enabled: true, table_assistance_rate_limit_max_requests: 5, table_assistance_rate_limit_window_minutes: 10,
  };
  const control = { settings, rules: structuredClone(defaultRules), settingsReads: 0, ruleReads: 0, gate: null as Promise<void> | null };
  const faults = { settingsLoad: 0, rulesLoad: 0, settingsSave: 0, rulesSave: 0 };
  const writes: { path: string; body: any; restaurant?: string }[] = [];
  await page.addInitScript(({ locale }) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'owner', email: 'demo@foody.test' }));
    localStorage.setItem('foody_restaurant_ids', '[1,2]');
    localStorage.setItem('foody-admin-locale', locale);
    localStorage.setItem('foody_admin_theme', locale === 'he' ? 'dark' : 'light');
  }, { locale: options.locale ?? 'fr' });
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method(), body = request.postDataJSON() ?? {}, restaurant = request.headers()['x-restaurant-id'];
    const send = (json: unknown, status = 200) => route.fulfill({ json, status });
    const fail = () => send({ error: 'Synthetic assistance failure' }, 503);
    const consume = (key: keyof typeof faults) => { if (faults[key] > 0) { faults[key]--; return true; } return false; };
    if (/\/restaurants\/\d+\/settings$/.test(path)) {
      if (method === 'GET') { control.settingsReads++; return consume('settingsLoad') ? fail() : send({ settings: control.settings }); }
      writes.push({ path, body, restaurant }); if (control.gate) await control.gate;
      if (consume('settingsSave')) return fail();
      Object.assign(control.settings, body); return send({ settings: control.settings });
    }
    if (/\/restaurants\/\d+\/service-guidance$/.test(path)) {
      if (method === 'GET') { control.ruleReads++; return consume('rulesLoad') ? fail() : send({ rules: control.rules }); }
      writes.push({ path, body, restaurant }); if (control.gate) await control.gate;
      if (consume('rulesSave')) return fail();
      control.rules = body.rules; return send({ rules: control.rules });
    }
    const result = fixture.response(request.url(), method, body, Number(restaurant) || 1);
    return send(result.json ?? {}, result.status ?? 200);
  });
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  return { fixture, control, faults, writes };
}
const save = (page: Page) => page.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).last();
const guidance = (page: Page) => page.getByRole('textbox', { name: 'Consignes pour l’assistant', exact: true });
const checkIn = (page: Page) => page.getByRole('region', { name: 'Vérifier que tout va bien', exact: true });
const checkDelay = (page: Page) => checkIn(page).getByRole('textbox', { name: 'Afficher après le service (minutes)', exact: true });
const maxRequests = (page: Page) => page.getByRole('textbox', { name: 'Nombre maximal de demandes', exact: true });
const guarded = (page: Page) => page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; });
const notice = (page: Page) => page.locator('main [role=status]').filter({ hasNotText: /^Chargement/ });

for (const locale of ['fr', 'he']) test(`assistance settings AI and table service responsive ${locale}`, async ({ page }, info) => {
  const state = await install(page, { locale }); await page.setViewportSize({ width: locale === 'fr' ? 375 : 1440, height: 1000 });
  await page.goto('/1/settings/ai-assistant'); await expect(page.locator('textarea').first()).toBeVisible();
  await page.screenshot({ path: info.outputPath(`assistant-settings-${locale}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.locator('select').last().scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`assistant-settings-trigger-${locale}.png`) });
  await page.goto('/1/settings/table-assistance'); await expect(page.getByRole('switch').first()).toBeVisible();
  await page.screenshot({ path: info.outputPath(`table-assistance-${locale}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  expect(state.fixture.unhandled).toEqual([]);
});

test('assistant settings recover loading and never offer default values as saved data', async ({ page }) => {
  const state = await install(page); state.faults.settingsLoad = 100; await page.goto('/1/settings/ai-assistant');
  await expect(page.locator('main [role=alert]')).toBeVisible(); await expect(page.locator('textarea')).toHaveCount(0); await expect(save(page)).toBeDisabled();
  state.faults.settingsLoad = 0; await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect(guidance(page)).toHaveValue(state.control.settings.ai_assistant_guidance); expect(state.writes).toHaveLength(0);
});

test('assistant settings retain all knowledge when disabled and save only the nine owned fields', async ({ page }) => {
  const state = await install(page); await page.goto('/2/settings/ai-assistant');
  await guidance(page).fill('Brouillon à conserver');
  await page.getByRole('switch', { name: 'Activer l’assistant IA', exact: true }).click();
  await expect(guidance(page)).toHaveJSProperty('readOnly', true);
  await expect(guidance(page)).toHaveValue('Brouillon à conserver');
  await expect(page.getByText('Activé · enregistré', { exact: true })).toBeVisible();
  await save(page).click(); await expect(notice(page)).toContainText('Enregistré');
  await expect(page.getByText('Désactivé · enregistré', { exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(1); expect(state.writes[0].restaurant).toBe('2');
  expect(Object.keys(state.writes[0].body).sort()).toEqual(Object.keys(state.control.settings).filter(key => key.startsWith('ai_assistant_')).sort());
  expect(state.writes[0].body).toMatchObject({ ai_assistant_enabled: false, ai_assistant_guidance: 'Brouillon à conserver', ai_assistant_aliases: state.control.settings.ai_assistant_aliases, ai_assistant_auto_order: false });
  expect(await guarded(page)).toBe(false);
});

test('assistant settings serialize saves and preserve the draft on failure', async ({ page }) => {
  const state = await install(page); state.faults.settingsSave = 1; await page.goto('/1/settings/ai-assistant'); await guidance(page).fill('Consignes en attente');
  let release!: () => void; state.control.gate = new Promise<void>(resolve => { release = resolve; });
  await save(page).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); }); await expect(guidance(page)).toHaveJSProperty('readOnly', true);
  await expect(page.getByRole('switch').first()).toBeDisabled(); release(); state.control.gate = null;
  await expect(page.locator('main [role=alert]')).toBeVisible(); await expect(guidance(page)).toHaveValue('Consignes en attente'); expect(await guarded(page)).toBe(true);
  await save(page).click(); await expect(notice(page)).toContainText('Enregistré'); expect(state.writes).toHaveLength(2);
});

test('assistant settings preserve the draft across an interface-language change', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/ai-assistant'); await guidance(page).fill('Unchanged local draft');
  const reads = state.control.settingsReads;
  await page.getByRole('button', { name: 'Foody · Profil', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'עברית', exact: true }).click(); await page.keyboard.press('Escape');
  await expect(page.getByRole('textbox', { name: 'הנחיות לעוזר', exact: true })).toHaveValue('Unchanged local draft');
  expect(state.control.settingsReads).toBe(reads); expect(state.writes).toHaveLength(0);
});

test('assistant settings keep zero visible, preserve a hidden delay and explain the current guest behavior', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/ai-assistant');
  const delay = page.getByRole('textbox', { name: 'Délai (secondes)', exact: true }); await delay.fill('0'); await delay.blur(); await expect(delay).toHaveValue('0');
  await expect(page.getByText(/interprète un délai nul comme 45/)).toBeVisible();
  const mode = page.getByRole('combobox', { name: 'Comportement', exact: true }); await mode.focus(); await mode.selectOption('manual');
  await expect(delay).toHaveCount(0); await save(page).click(); await expect(notice(page)).toContainText('Enregistré');
  expect(state.writes[0].body).toMatchObject({ ai_assistant_trigger: 'manual', ai_assistant_trigger_delay: 0 });
  await mode.focus(); await mode.selectOption('delay'); await expect(delay).toHaveValue('0');
});

test('assistant settings keep historical long content and delays instead of truncating unrelated changes', async ({ page }) => {
  const state = await install(page); state.control.settings.ai_assistant_guidance = 'A'.repeat(1200); state.control.settings.ai_assistant_trigger_delay = 900;
  await page.goto('/1/settings/ai-assistant'); await expect(guidance(page)).toHaveValue('A'.repeat(1200));
  await expect(page.getByRole('textbox', { name: 'Délai (secondes)', exact: true })).toHaveValue('900');
  await page.getByRole('switch', { name: 'Suggérer des extras (vente incitative)', exact: true }).click(); await save(page).click(); await expect(notice(page)).toContainText('Enregistré');
  expect(state.writes[0].body).toMatchObject({ ai_assistant_guidance: 'A'.repeat(1200), ai_assistant_trigger_delay: 900, ai_assistant_upsell: false });
});

test('assistant settings confirm reset and protect internal navigation', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/ai-assistant'); await guidance(page).fill('Draft');
  const reset = page.getByRole('button', { name: 'Réinitialiser', exact: true }); await reset.click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler', exact: true }).click(); await expect(reset).toBeFocused(); await expect(guidance(page)).toHaveValue('Draft');
  await page.getByRole('link', { name: 'Sécurité', exact: true }).click(); await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler', exact: true }).click(); await expect(page).toHaveURL(/ai-assistant$/);
  await reset.click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Abandonner les modifications', exact: true }).click();
  await expect(guidance(page)).toHaveValue(state.control.settings.ai_assistant_guidance); expect(await guarded(page)).toBe(false); expect(state.writes).toHaveLength(0);
});

test('assistant settings are readable and copyable without edit permission', async ({ page }) => {
  const state = await install(page, { permissions: ['settings.view'] }); await page.goto('/1/settings/ai-assistant');
  await expect(guidance(page)).toHaveJSProperty('readOnly', true); await expect(guidance(page)).toBeEnabled();
  await expect(page.getByRole('switch').first()).toBeDisabled(); await expect(save(page)).toHaveCount(0); expect(state.writes).toHaveLength(0);
});

for (const reason of ['settings', 'rules', 'incomplete'] as const) test(`table assistance refuses incomplete initial state: ${reason}`, async ({ page }) => {
  const state = await install(page);
  if (reason === 'settings') state.faults.settingsLoad = 100;
  else if (reason === 'rules') state.faults.rulesLoad = 100;
  else state.control.rules.splice(1);
  await page.goto('/1/settings/table-assistance'); await expect(page.locator('main [role=alert]')).toBeVisible();
  await expect(page.getByRole('switch')).toHaveCount(0); await expect(save(page)).toBeDisabled();
  state.faults.settingsLoad = 0; state.faults.rulesLoad = 0; state.control.rules = structuredClone(defaultRules);
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click(); await expect(maxRequests(page)).toHaveValue('5'); expect(state.writes).toHaveLength(0);
});

test('table assistance retries only unconfirmed reminders after a partial save', async ({ page }) => {
  const state = await install(page); state.faults.rulesSave = 1; await page.goto('/2/settings/table-assistance');
  await maxRequests(page).fill('8'); await checkDelay(page).fill('12'); await save(page).click();
  await expect(page.locator('main [role=alert]')).toContainText('limites de demandes sont enregistrées');
  await expect(maxRequests(page)).toHaveValue('8'); await expect(checkDelay(page)).toHaveValue('12'); expect(await guarded(page)).toBe(true);
  await save(page).click(); await expect(notice(page)).toContainText('Enregistré');
  expect(state.writes.map(row => row.path.split('/').at(-1))).toEqual(['settings', 'service-guidance', 'service-guidance']);
  expect(state.writes.every(row => row.restaurant === '2')).toBe(true);
  expect(state.writes[0].body).toEqual({ table_assistance_rate_limit_enabled: true, table_assistance_rate_limit_max_requests: 8, table_assistance_rate_limit_window_minutes: 10 });
  expect(state.writes[2].body.rules).toEqual([{ ...defaultRules[0], delay_minutes: 12 }, defaultRules[1]]); expect(await guarded(page)).toBe(false);
});

test('table assistance does not start the second write if policy saving failed', async ({ page }) => {
  const state = await install(page); state.faults.settingsSave = 1; await page.goto('/1/settings/table-assistance');
  await maxRequests(page).fill('9'); await checkDelay(page).fill('11'); await save(page).click(); await expect(page.locator('main [role=alert]')).toBeVisible();
  expect(state.writes).toHaveLength(1); await expect(checkDelay(page)).toHaveValue('11');
  await save(page).click(); await expect(notice(page)).toContainText('Enregistré');
  expect(state.writes.map(row => row.path.split('/').at(-1))).toEqual(['settings', 'settings', 'service-guidance']);
});

test('table assistance saves only changed APIs and freezes inputs while writing', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/table-assistance'); await checkDelay(page).fill('180');
  let release!: () => void; state.control.gate = new Promise<void>(resolve => { release = resolve; });
  await save(page).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(checkDelay(page)).toHaveJSProperty('readOnly', true); await expect(page.getByRole('switch').first()).toBeDisabled();
  release(); await expect(notice(page)).toContainText('Enregistré'); expect(state.writes).toHaveLength(1); expect(state.writes[0].path).toContain('service-guidance');
});

test('table assistance disabling limits preserves their values and updates the explanation', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/table-assistance'); await maxRequests(page).fill('20');
  await page.getByRole('textbox', { name: 'Fenêtre de temps (minutes)', exact: true }).fill('60');
  await page.getByRole('switch', { name: 'Limiter les demandes sans réponse', exact: true }).click();
  await expect(maxRequests(page)).toHaveJSProperty('readOnly', true); await save(page).click(); await expect(notice(page)).toContainText('Enregistré');
  expect(state.writes[0].body).toEqual({ table_assistance_rate_limit_enabled: false, table_assistance_rate_limit_max_requests: 20, table_assistance_rate_limit_window_minutes: 60 });
  expect(state.writes).toHaveLength(1);
});

test('table assistance draft survives language changes and reset returns to the last acknowledged phases', async ({ page }) => {
  const state = await install(page); state.faults.rulesSave = 1; await page.goto('/1/settings/table-assistance');
  await maxRequests(page).fill('8'); await checkDelay(page).fill('12'); await save(page).click(); await expect(page.locator('main [role=alert]')).toBeVisible();
  const reads = state.control.settingsReads;
  await page.getByRole('button', { name: 'Foody · Profil', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'English', exact: true }).click(); await page.keyboard.press('Escape');
  await expect(page.getByRole('textbox', { name: 'Maximum requests', exact: true })).toHaveValue('8'); expect(state.control.settingsReads).toBe(reads);
  await page.getByRole('button', { name: 'Reset', exact: true }).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Maximum requests', exact: true })).toHaveValue('8');
  await expect(page.getByRole('region', { name: 'Check that everything is going well', exact: true }).getByRole('textbox', { name: 'Show after serving (minutes)', exact: true })).toHaveValue('5'); expect(await guarded(page)).toBe(false);
});

test('table assistance read-only settings remain named and copyable', async ({ page }) => {
  const state = await install(page, { permissions: ['settings.view'] }); await page.goto('/1/settings/table-assistance');
  await expect(maxRequests(page)).toHaveJSProperty('readOnly', true); await expect(maxRequests(page)).toBeEnabled();
  await expect(page.getByRole('switch').first()).toBeDisabled(); await expect(save(page)).toHaveCount(0); expect(state.writes).toHaveLength(0);
});
