import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

const types = ['pickup', 'dine_in', 'delivery'];
function stage(id: number, name: string, kind = 'received') {
  return { id, name, kind, color: '#123456', trigger_payment_confirmed: false, trigger_production_done: false, trigger_courier_assigned: false, trigger_courier_delivered: false, notify_customer: false, customer_message: '' };
}
function flows() {
  return types.map((type, i) => ({ id: i + 1, order_type: type, template_source: 'custom', accept_sends_to_kitchen: false, accept_adds_to_production: false, accept_prompts_whatsapp: false, delivery_reminder_enabled: false, stages: [stage(i * 10 + 1, 'Commande reçue'), { ...stage(i * 10 + 2, 'Préparation avec contrôle des demandes particulières et vérification des allergènes', 'in_progress'), trigger_payment_confirmed: true, trigger_production_done: true }, { ...stage(i * 10 + 3, 'Prête pour le client', 'ready'), notify_customer: true, customer_message: 'Votre commande est prête. Merci !' }] }));
}
async function install(page: Page, options: { locale?: string; permissions?: string[] } = {}) {
  const fixtureOptions = { empty: false, permissions: options.permissions }, fixture = createFixture(fixtureOptions);
  const control = { workflows: flows(), reads: 0, failRead: false, failSave: 0, applyAndFail: false, resetActions: false, gate: null as Promise<void> | null, nextId: 100 };
  const writes: { method: string; body: any; restaurant?: string; type: string }[] = [];
  await page.addInitScript(({ locale }) => { localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture'); localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: 'owner', email: 'demo@foody.test' })); localStorage.setItem('foody_restaurant_ids', '[1,2]'); localStorage.setItem('foody-admin-locale', locale); localStorage.setItem('foody_admin_theme', locale === 'he' ? 'dark' : 'light'); }, { locale: options.locale ?? 'fr' });
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method(), body = request.postDataJSON() ?? {}, restaurant = request.headers()['x-restaurant-id'];
    if (path === '/api/v1/order-workflows') {
      control.reads++;
      if (control.failRead) return route.fulfill({ status: 503, json: { error: 'Synthetic workflow read failure' } });
      return route.fulfill({ json: { workflows: control.workflows } });
    }
    if (path.startsWith('/api/v1/order-workflows/')) {
      const type = path.split('/').at(-1)!;
      writes.push({ method, body, restaurant, type });
      if (control.gate) await control.gate;
      const old = control.workflows.find(wf => wf.order_type === type) ?? flows().find(wf => wf.order_type === type)!;
      const next = method === 'DELETE' ? { ...flows().find(wf => wf.order_type === type)!, template_source: 'full', accept_sends_to_kitchen: control.resetActions } : { ...old, ...body.actions, template_source: 'custom', stages: body.stages.map((stage: any) => ({ ...stage, id: stage.id ?? control.nextId++, name: stage.name.trim() })) };
      const apply = () => { control.workflows = [...control.workflows.filter(wf => wf.order_type !== type), next]; };
      if (control.applyAndFail) apply();
      if (control.failSave) { control.failSave--; return route.fulfill({ status: 503, json: { error: 'Synthetic uncertain workflow write' } }); }
      apply(); return route.fulfill({ json: next });
    }
    const result = fixture.response(request.url(), method, body, Number(restaurant) || 1);
    return route.fulfill({ status: result.status ?? 200, json: result.json ?? {} });
  });
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
  return { control, writes, fixture };
}
const row = (page: Page, index: number) => page.locator(`[data-workflow-stage="${index}"]`);
async function expand(page: Page, index = 0) { await row(page, index).getByRole('button', { expanded: false }).click(); }
const name = (page: Page) => page.getByRole('textbox', { name: 'Nom de l’étape', exact: true });
const save = (page: Page) => page.getByRole('button', { name: 'Enregistrer ce parcours', exact: true });
const verify = (page: Page) => page.getByRole('button', { name: 'Vérifier le parcours enregistré', exact: true });
const typeButton = (page: Page, type: string) => page.getByRole('group', { name: 'Type de service', exact: true }).getByRole('button', { name: new RegExp(type) });
const sendKitchen = (page: Page) => page.getByRole('switch', { name: 'Accepter envoie directement en cuisine', exact: true });

for (const locale of ['fr', 'he']) test(`workflow responsive editor and all automations ${locale}`, async ({ page }, info) => {
  const state = await install(page, { locale }); await page.setViewportSize({ width: locale === 'fr' ? 375 : 1440, height: 1000 }); await page.goto('/1/settings/orders/workflow'); await expect(row(page, 1)).toBeVisible(); await page.screenshot({ path: info.outputPath(`workflow-overview-${locale}.png`) }); await expand(page, 1); await row(page, 1).evaluate(el => el.scrollIntoView({ block: 'start' })); await page.screenshot({ path: info.outputPath(`workflow-editor-${locale}.png`) }); await expect(row(page, 1).getByRole('checkbox').nth(0)).toBeChecked(); await expect(row(page, 1).getByRole('checkbox').nth(1)).toBeChecked(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(state.fixture.unhandled).toEqual([]);
});

test('workflow preserves stage identity, colors, multiple triggers and historical first-stage courier flags', async ({ page }) => {
  const state = await install(page); state.control.workflows[0].stages[0].trigger_courier_assigned = true; await page.goto('/1/settings/orders/workflow'); await expand(page); await expect(row(page, 0).getByRole('checkbox', { name: 'Livreur assigné' })).toBeChecked(); await name(page).fill('Nouvelle réception'); await save(page).click(); await expect(save(page)).toBeDisabled(); expect(state.writes[0].body.stages.map((s: any) => s.id)).toEqual([1, 2, 3]); expect(state.writes[0].body.stages[0]).toMatchObject({ color: '#123456', trigger_courier_assigned: true }); expect(state.writes[0].body.stages[1]).toMatchObject({ trigger_payment_confirmed: true, trigger_production_done: true });
});

test('workflow saves only the active service and retains drafts in other services', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/orders/workflow'); await expand(page); await name(page).fill('Brouillon retrait'); await typeButton(page, 'Livraison').click(); await expand(page); await name(page).fill('Brouillon livraison'); await save(page).click(); await expect(save(page)).toBeDisabled(); expect(state.writes).toHaveLength(1); expect(state.writes[0].type).toBe('delivery'); await typeButton(page, 'emporter').click(); await expand(page); await expect(name(page)).toHaveValue('Brouillon retrait'); await expect(save(page)).toBeEnabled(); await name(page).fill('Commande reçue'); await expect(save(page)).toBeDisabled();
});

test('workflow mutation locks inputs, type changes and duplicate writes with restaurant scope', async ({ page }) => {
  const state = await install(page); await page.goto('/2/settings/orders/workflow'); await expand(page); await name(page).fill('Réception 2'); let release!: () => void; state.control.gate = new Promise<void>(resolve => { release = resolve; }); await save(page).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); }); await expect(name(page)).toHaveAttribute('readonly', ''); await expect(sendKitchen(page)).toBeDisabled(); await expect(typeButton(page, 'Livraison')).toBeDisabled(); release(); state.control.gate = null; await expect(save(page)).toBeDisabled(); await expect(page.getByRole('status').filter({ hasText: 'Parcours enregistré' })).toBeVisible(); expect(state.writes).toHaveLength(1); expect(state.writes[0].restaurant).toBe('2');
});

test('workflow initial failures retry and read-only controls are keyboard disabled', async ({ page }) => {
  const state = await install(page, { permissions: ['settings.view'] }); state.control.failRead = true; await page.goto('/1/settings/orders/workflow'); await expect(page.locator('main [role=alert]')).toContainText('Impossible de charger'); state.control.failRead = false; await page.getByRole('button', { name: 'Réessayer', exact: true }).click(); await expand(page); await expect(name(page)).toHaveAttribute('readonly', ''); await expect(sendKitchen(page)).toBeDisabled(); await expect(row(page, 0).getByRole('checkbox').first()).toBeDisabled(); await expect(save(page)).toHaveCount(0); expect(state.writes).toHaveLength(0);
});

test('workflow an absent flow can be created from its empty state', async ({ page }) => {
  const state = await install(page); state.control.workflows = []; await page.goto('/1/settings/orders/workflow'); await page.getByRole('button', { name: 'Ajouter une étape', exact: true }).click(); await expect(name(page)).toBeFocused(); await name(page).fill('Réception'); await save(page).click(); await expect(save(page)).toBeDisabled(); expect(state.writes[0].body.stages).toHaveLength(1); expect(state.control.workflows[0].stages[0].id).toBe(100);
});

test('workflow validates blank names and stage ordering without losing the draft', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/orders/workflow'); await expand(page); await name(page).fill('  '); await save(page).click(); await expect(name(page)).toBeFocused(); await expect(page.locator('main [role=alert]')).toContainText('Donnez un nom'); await name(page).fill('Renommée'); await row(page, 0).getByRole('button', { name: 'Descendre', exact: true }).click(); await save(page).click(); await expect(page.getByRole('combobox', { name: 'Type', exact: true })).toBeFocused(); await expect(page.locator('main [role=alert]')).toContainText('Gardez les types'); await expect(name(page)).toHaveValue('Renommée'); expect(state.writes).toHaveLength(0);
});

test('workflow enforces unique event assignment across steps but permits several events on one step', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/orders/workflow'); await expand(page); await row(page, 0).getByRole('checkbox', { name: 'Paiement confirmé', exact: true }).check(); await save(page).click(); await expect(page.locator('main [role=alert]')).toContainText('déjà associé'); await expect(row(page, 1).getByRole('checkbox', { name: 'Paiement confirmé', exact: true })).toBeFocused(); await row(page, 1).getByRole('checkbox', { name: 'Paiement confirmé', exact: true }).uncheck(); await save(page).click(); await expect(save(page)).toBeDisabled(); expect(state.writes).toHaveLength(1);
});

test('workflow bounds stage counts without hiding the add action at zero', async ({ page }) => {
  const state = await install(page); state.control.workflows[0].stages = Array.from({ length: 12 }, (_, i) => stage(i + 1, `Étape ${i + 1}`)); await page.goto('/1/settings/orders/workflow'); await expect(page.getByRole('button', { name: 'Ajouter une étape', exact: true })).toBeDisabled();
  for (let i = 0; i < 12; i++) { await expand(page); await row(page, 0).getByRole('button', { name: 'Supprimer l’étape', exact: true }).click(); }
  await save(page).click(); await expect(page.locator('main [role=alert]')).toContainText('entre 1 et 12'); await expect(page.getByRole('button', { name: 'Ajouter une étape', exact: true })).toBeEnabled(); expect(state.writes).toHaveLength(0);
});

test('workflow disabled customer notifications retain edited message text', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/orders/workflow'); await expand(page, 2); await page.getByRole('textbox', { name: 'Message au client', exact: true }).fill('Texte conservé שלום'); await row(page, 2).getByRole('switch', { name: 'Prévenir le client', exact: true }).click(); await save(page).click(); await expect(save(page)).toBeDisabled(); expect(state.writes[0].body.stages[2]).toMatchObject({ notify_customer: false, customer_message: 'Texte conservé שלום' });
});

test('workflow unchanged readback unlocks an explicit retry without discarding the draft', async ({ page }) => {
  const state = await install(page); state.control.failSave = 1; await page.goto('/1/settings/orders/workflow'); await expand(page); await name(page).fill('Réception modifiée'); await save(page).click(); await expect(verify(page)).toBeVisible(); await expect(save(page)).toBeDisabled(); await verify(page).click(); await expect(save(page)).toBeEnabled(); await expect(name(page)).toHaveValue('Réception modifiée'); expect(state.writes).toHaveLength(1); await save(page).click(); await expect(save(page)).toBeDisabled(); expect(state.writes).toHaveLength(2);
});

test('workflow applied-but-failed save adopts assigned stage IDs without a second mutation', async ({ page }) => {
  const state = await install(page); state.control.failSave = 1; state.control.applyAndFail = true; await page.goto('/1/settings/orders/workflow'); await page.getByRole('button', { name: 'Ajouter une étape', exact: true }).click(); await name(page).fill('  Nouvelle étape  '); await save(page).click(); await verify(page).click(); await expect(page.getByText('L’enregistrement a été confirmé après vérification.', { exact: true })).toBeVisible(); await expect(save(page)).toBeDisabled(); await expect(name(page)).toHaveValue('Nouvelle étape'); expect(state.writes).toHaveLength(1); await name(page).fill('Nouveau nom'); await save(page).click(); await expect(save(page)).toBeDisabled(); expect(state.writes[1].body.stages[3].id).toBe(100);
});

test('workflow verification can fail and retry without repeating the failed write', async ({ page }) => {
  const state = await install(page); state.control.failSave = 1; await page.goto('/1/settings/orders/workflow'); await sendKitchen(page).click(); await save(page).click(); state.control.failRead = true; await verify(page).click(); await expect(page.getByText(/La vérification a échoué/)).toBeVisible(); await expect(save(page)).toBeDisabled(); state.control.failRead = false; await verify(page).click(); await expect(save(page)).toBeEnabled(); expect(state.writes).toHaveLength(1);
});

test('workflow divergent server version requires review and adoption preserves other service drafts', async ({ page }, info) => {
  const state = await install(page); await page.goto('/1/settings/orders/workflow'); await typeButton(page, 'Livraison').click(); await expand(page); await name(page).fill('Livraison locale'); await typeButton(page, 'emporter').click(); await expand(page); await name(page).fill('Retrait local'); state.control.failSave = 1; await save(page).click(); state.control.workflows[0].stages[0].name = 'Réception modifiée ailleurs'; await verify(page).click(); await expect(save(page)).toBeDisabled(); await page.getByText('Consulter le parcours enregistré', { exact: true }).click(); await expect(page.getByText('Réception modifiée ailleurs', { exact: true })).toBeVisible(); await page.screenshot({ path: info.outputPath('workflow-recovery-fr.png') }); await page.getByRole('button', { name: 'Reprendre le parcours enregistré', exact: true }).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler', exact: true }).click(); await expect(name(page)).toHaveValue('Retrait local'); await page.getByRole('button', { name: 'Reprendre le parcours enregistré', exact: true }).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Reprendre le parcours enregistré', exact: true }).click(); await expect(name(page)).toHaveValue('Réception modifiée ailleurs'); await typeButton(page, 'Livraison').click(); await expand(page); await expect(name(page)).toHaveValue('Livraison locale'); expect(state.writes).toHaveLength(1);
});

test('workflow reset uses a confirmation and the actual returned guided actions', async ({ page }, info) => {
  const state = await install(page); state.control.resetActions = true; await page.goto('/1/settings/orders/workflow'); await page.getByRole('button', { name: 'Réinitialiser au parcours par défaut', exact: true }).click(); await page.screenshot({ path: info.outputPath('workflow-reset-fr.png') }); expect(state.writes).toHaveLength(0); await page.getByRole('alertdialog').getByRole('button', { name: 'Réinitialiser', exact: true }).click(); await expect(sendKitchen(page)).toHaveAttribute('aria-checked', 'true'); await expect(page.getByText('Le parcours par défaut a été rétabli.', { exact: true })).toBeVisible(); expect(state.writes[0].method).toBe('DELETE');
});

test('workflow uncertain reset reads the actual version without claiming a completed reset', async ({ page }) => {
  const state = await install(page); state.control.failSave = 1; state.control.applyAndFail = true; state.control.resetActions = true; await page.goto('/1/settings/orders/workflow'); await page.getByRole('button', { name: 'Réinitialiser au parcours par défaut', exact: true }).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Réinitialiser', exact: true }).click(); await verify(page).click(); await expect(page.getByText('Le parcours par défaut a été rétabli.', { exact: true })).toHaveCount(0); await expect(page.getByRole('button', { name: 'Reprendre le parcours enregistré', exact: true })).toBeVisible(); expect(state.writes).toHaveLength(1);
});

test('workflow draft guards, local discard and locale change do not reload or erase other drafts', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/orders/workflow'); await expand(page); await name(page).fill('Brouillon durable'); const reads = state.control.reads; await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Horaires et disponibilité', exact: true }).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler', exact: true }).click(); await expect(name(page)).toHaveValue('Brouillon durable'); await page.getByRole('button', { name: 'Abandonner les modifications', exact: true }).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Abandonner les modifications', exact: true }).click(); await expand(page); await expect(name(page)).toHaveValue('Commande reçue'); await name(page).fill('Brouillon durable'); await page.getByRole('button', { name: 'Foody · Profil', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'עברית', exact: true }).click(); await page.keyboard.press('Escape'); await expect(page.locator('#workflow-pickup-0-name')).toHaveValue('Brouillon durable'); expect(state.control.reads).toBe(reads); expect(state.writes).toHaveLength(0);
});

test('workflow catering preset keeps stage identities and saves delivery guidance only for delivery', async ({ page }) => {
  const state = await install(page); await page.goto('/1/settings/orders/workflow'); await page.getByRole('button', { name: 'Appliquer le preset traiteur', exact: true }).click(); await save(page).click(); await expect(save(page)).toBeDisabled(); expect(state.writes[0].body.actions).toEqual({ accept_sends_to_kitchen: true, accept_adds_to_production: true, accept_prompts_whatsapp: true, delivery_reminder_enabled: false }); expect(state.writes[0].body.stages.map((s: any) => s.id)).toEqual([1, 2, 3]); await typeButton(page, 'Livraison').click(); await page.getByRole('button', { name: 'Appliquer le preset traiteur', exact: true }).click(); await save(page).click(); await expect(save(page)).toBeDisabled(); expect(state.writes[1].body.actions.delivery_reminder_enabled).toBe(true);
});

test('workflow legacy link preserves the restaurant and English labels', async ({ page }) => {
  const state = await install(page, { locale: 'en' }); await page.goto('/2/restaurant/workflow'); await expect(page).toHaveURL(/\/2\/settings\/orders\/workflow$/); await expand(page); await page.getByRole('textbox', { name: 'Step name', exact: true }).fill('Receiving'); await page.getByRole('button', { name: 'Save this flow', exact: true }).click(); await expect(page.getByRole('button', { name: 'Save this flow', exact: true })).toBeDisabled(); expect(state.writes[0].restaurant).toBe('2'); await expect(page.getByText('Flow saved', { exact: true })).toBeVisible();
});
