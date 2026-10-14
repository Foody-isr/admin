import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

async function install(page: Page, options: { locale?: string; readonly?: boolean; fail?: boolean } = {}) {
  const fixtureOptions = { empty: false, permissions: options.readonly ? ['settings.view'] : undefined }, fixture = createFixture(fixtureOptions);
  const control = { fail: !!options.fail, stale: false, events: [{ id: 'closure-fixture', title: 'Travaux de cuisine', kind: 'closure', start_date: '2026-10-20', end_date: '2026-10-25', all_day: true, start_time: '', end_time: '', location: '', notes: 'Notes internes de démonstration', closed_services: ['pickup', 'delivery'], updated_at: '2026-10-14T09:00:00Z' }] as any[], writes: [] as any[] };
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'));
  await page.addInitScript(({ locale, readonly }) => {
    localStorage.setItem('foody_restaurant_token', 'isolated-calendar-fixture');
    localStorage.setItem('foody_restaurant_user', JSON.stringify({ id: 1, full_name: 'Équipe démo', role: readonly ? 'manager' : 'owner', email: 'demo@foody.test' }));
    localStorage.setItem('foody_restaurant_ids', '[1,2]'); localStorage.setItem('foody-admin-locale', locale); localStorage.setItem('foody_admin_theme', 'light');
  }, { locale: options.locale ?? 'fr', readonly: options.readonly ?? false });
  await page.route('**/api/v1/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname, method = req.method(), body = req.postDataJSON() ?? {}, rid = req.headers()['x-restaurant-id'];
    if (/\/restaurants\/\d+\/calendar\/conflicts$/.test(path)) return route.fulfill({ json: { orders: 2, catering: 1 } });
    if (/\/restaurants\/\d+\/calendar(?:\/[^/]+)?$/.test(path)) {
      if (method === 'GET') return route.fulfill(control.fail ? { status: 503, json: { error: 'calendar_failed' } } : { json: { events: control.events, timezone: 'Asia/Jerusalem', week_start_day: 0 } });
      control.writes.push({ method, body, rid });
      if (control.stale) return route.fulfill({ status: 409, json: { error: 'calendar_changed' } });
      if (method === 'DELETE') { control.events = control.events.filter(event => event.id !== path.split('/').pop()); return route.fulfill({ json: { deleted: true } }); }
      const event = { ...body, id: method === 'POST' ? body.id : path.split('/').pop(), updated_at: '2026-10-14T12:01:00Z' };
      control.events = [...control.events.filter(value => value.id !== event.id), event];
      return route.fulfill({ json: { event } });
    }
    if (/\/catering\/events$/.test(path)) return route.fulfill({ json: { events: [{ id: 9, quote_id: 8, event_date: '2026-10-24T00:00:00Z', event_type: 'Buffet', event_city: 'Lieu de démonstration', service_name: 'Buffet de réception', status: 'deposit_paid', created_at: '2026-10-01T00:00:00Z' }] } });
    const result = fixture.response(req.url(), method, body, Number(rid) || 1);
    return route.fulfill({ json: result.json ?? {}, status: result.status ?? 200 });
  });
  await page.route('**/*', route => ['localhost', '127.0.0.1', 'square-fonts-production-f.squarecdn.com'].includes(new URL(route.request().url()).hostname) || route.request().url().includes('/api/v1/') ? route.fallback() : route.abort());
  return control;
}

async function visit(page: Page) { await page.goto('/1/calendar'); await expect(page.getByRole('heading', { name: 'Calendrier du restaurant', exact: true })).toBeVisible(); await page.getByRole('combobox', { name: 'Affichage du calendrier' }).selectOption('month'); }

test('create, reload, edit and delete a closure with scoped persistence', async ({ page }) => {
  const control = await install(page); await visit(page);
  await page.getByRole('button', { name: 'Ajouter un événement', exact: true }).first().click();
  const drawer = page.getByRole('dialog');
  await drawer.getByLabel('Titre de l’événement', { exact: true }).fill('Vacances d’automne');
  await drawer.getByLabel('Type d’événement', { exact: true }).selectOption('closure');
  await drawer.getByLabel('Date de début', { exact: true }).fill('2026-10-20');
  await drawer.getByLabel('Date de fin incluse', { exact: true }).fill('2026-10-25');
  await expect(drawer.getByText('2 commande(s) programmée(s) et 1 événement(s) traiteur confirmé(s) sur ces dates.')).toBeVisible();
  await drawer.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(drawer).not.toBeVisible();
  expect(control.writes[0].rid).toBe('1'); expect(control.writes[0].body.closed_services).toEqual(['pickup', 'delivery', 'dine_in']);
  await page.getByRole('button', { name: 'Actions du calendrier', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Recharger le calendrier', exact: true }).click();
  const day = page.locator('[data-calendar-date="2026-10-25"]');
  await expect(day.getByRole('button', { name: 'Vacances d’automne', exact: true })).toBeVisible();
  await day.getByRole('button', { name: 'Vacances d’automne', exact: true }).click();
  await drawer.getByLabel('Titre de l’événement', { exact: true }).fill('Vacances confirmées');
  await drawer.getByRole('checkbox', { name: 'Livraison', exact: true }).uncheck();
  await drawer.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(drawer).not.toBeVisible(); expect(control.writes[1].body.updated_at).toBeTruthy(); expect(control.writes[1].body.closed_services).toEqual(['pickup', 'dine_in']);
  await day.getByRole('button', { name: 'Vacances confirmées', exact: true }).click();
  await drawer.getByRole('button', { name: 'Supprimer l’événement', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer l’événement', exact: true }).click();
  await expect(drawer).not.toBeVisible(); expect(control.writes[2].method).toBe('DELETE');
});

test('stale edits keep the editor open and show a translated error', async ({ page }) => {
  const control = await install(page); await visit(page);
  await page.locator('[data-calendar-date="2026-10-20"]').getByRole('button', { name: 'Travaux de cuisine', exact: true }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByLabel('Titre de l’événement', { exact: true }).fill('Travaux déplacés'); control.stale = true;
  await drawer.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(drawer.getByRole('alert')).toContainText('modifié par une autre personne');
  await expect(drawer.getByLabel('Titre de l’événement', { exact: true })).toHaveValue('Travaux déplacés');
});

test('read-only agenda retains catering references and no edit action', async ({ page }) => {
  const control = await install(page, { readonly: true }); await visit(page);
  await expect(page.getByRole('button', { name: 'Ajouter un événement', exact: true })).toHaveCount(0);
  await page.locator('[data-calendar-date="2026-10-20"]').getByRole('button', { name: 'Travaux de cuisine', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Titre de l’événement', { exact: true })).toBeDisabled();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Enregistrer', exact: true })).toHaveCount(0);
  expect(control.writes).toHaveLength(0);
});

test('failed load is explicit and prevents new events', async ({ page }) => {
  await install(page, { fail: true }); await page.goto('/1/calendar');
  await expect(page.getByRole('alert').filter({ hasText: 'Impossible de charger le calendrier' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ajouter un événement', exact: true })).toHaveCount(0);
});

for (const locale of ['fr', 'he']) test(`calendar layout and event editor ${locale}`, async ({ page }, info) => {
  await install(page, { locale }); await page.setViewportSize({ width: locale === 'fr' ? 1440 : 390, height: locale === 'fr' ? 714 : 844 });
  await page.goto('/1/calendar');
  await expect(page.getByRole('heading', { name: locale === 'fr' ? 'Calendrier du restaurant' : 'לוח השנה של המסעדה', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: locale === 'fr' ? 'Affichage du calendrier' : 'תצוגת לוח השנה' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: info.outputPath(`calendar-${locale}.png`), fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (locale === 'fr') {
    expect((await page.locator('[data-calendar-notice]').boundingBox())!.height).toBe(42);
    expect((await page.locator('[data-calendar-notice]').boundingBox())!.y).toBe(46);
    expect((await page.locator('[data-calendar-period]').boundingBox())!.height).toBe(48);
    expect((await page.locator('[data-calendar-toolbar]').boundingBox())!.y).toBe(166);
    expect((await page.locator('[data-calendar-grid="week"]').boundingBox())!.y).toBe(232);
    expect((await page.locator('[data-calendar-grid="week"] th').first().boundingBox())!.width).toBe(148);
    for (const row of await page.locator('[data-calendar-grid="week"] tbody tr').all()) expect((await row.boundingBox())!.height).toBe(72);
    await expect(page.locator('[data-calendar-grid="week"] tbody th').nth(1)).toContainText('Traiteur');
    expect(await page.getByRole('combobox', { name: 'Filtrer les événements' }).evaluate((select: HTMLSelectElement) => {
      const style = getComputedStyle(select), canvas = document.createElement('canvas'), context = canvas.getContext('2d')!;
      context.font = style.font;
      return context.measureText(select.selectedOptions[0].text).width <= select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    })).toBe(true);
    await page.getByRole('combobox', { name: 'Affichage du calendrier' }).selectOption('month');
    await expect(page.locator('[data-calendar-date="2026-10-24"]').getByRole('link', { name: 'Buffet de réception' })).toHaveAttribute('href', '/1/catering/events');
  }
  await page.getByRole('button', { name: locale === 'fr' ? 'Ajouter un événement' : 'הוספת אירוע', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  if (locale === 'fr') {
    const dialog = (await page.locator('[data-calendar-dialog]').boundingBox())!;
    expect(dialog.width).toBe(600);
    expect(dialog.x).toBe(420);
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Enregistrer', exact: true })).toBeInViewport();
  }
  await page.screenshot({ path: info.outputPath(`calendar-editor-${locale}.png`), animations: 'disabled' });
});

test('day timeline preserves overlaps and adds an event at the clicked hour', async ({ page }, info) => {
  const control = await install(page);
  control.events.push({ ...control.events[0], id: 'timed-a', title: 'Préparation du buffet', kind: 'other', all_day: false, start_date: '2026-10-14', end_date: '2026-10-14', start_time: '03:00', end_time: '04:00', closed_services: [] });
  control.events.push({ ...control.events[1], id: 'timed-b', title: 'Réception fournisseur', start_time: '03:30', end_time: '04:30' });
  await page.setViewportSize({ width: 1440, height: 714 });
  await page.goto('/1/calendar');
  await page.getByRole('combobox', { name: 'Affichage du calendrier' }).selectOption('day');
  const first = (await page.getByRole('button', { name: 'Préparation du buffet', exact: true }).boundingBox())!;
  const second = (await page.getByRole('button', { name: 'Réception fournisseur', exact: true }).boundingBox())!;
  expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
  await page.screenshot({ path: info.outputPath('calendar-day-fr.png'), animations: 'disabled' });
  await page.getByRole('button', { name: /Ajouter un événement · Autre événement · .* · 5:00/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Heure de début', { exact: true })).toHaveValue('05:00');
  await expect(dialog.getByLabel('Heure de fin', { exact: true })).toHaveValue('06:00');
  await expect(dialog.getByLabel('Date de début', { exact: true })).toHaveValue('2026-10-14');
  await dialog.getByLabel('Titre de l’événement', { exact: true }).fill('Réception à 5 h');
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  expect(control.writes[0].body.all_day).toBe(false);
  expect(control.writes[0].body.start_time).toBe('05:00');
  await expect(page.getByRole('button', { name: 'Réception à 5 h', exact: true })).toBeVisible();
});

test('week navigation, filters and unsaved-dialog protection retain their behavior', async ({ page }) => {
  await install(page); await page.goto('/1/calendar');
  await expect(page.locator('[data-calendar-grid="week"]')).toBeVisible();
  await page.getByRole('button', { name: 'Période suivante', exact: true }).click();
  await page.getByRole('combobox', { name: 'Filtrer les événements' }).selectOption('closure');
  await expect(page.locator('[data-calendar-grid="week"] tbody tr')).toHaveCount(1);
  await page.locator('[data-calendar-date="2026-10-20"]').getByRole('button', { name: 'Travaux de cuisine', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Date de début', { exact: true }).fill('');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Enregistrer', exact: true })).toBeDisabled();
  await page.getByRole('dialog').getByLabel('Date de début', { exact: true }).fill('2026-10-20');
  await page.getByRole('dialog').getByLabel('Titre de l’événement', { exact: true }).fill('Travaux modifiés');
  await page.getByRole('dialog').getByRole('button', { name: 'Fermer', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Titre de l’événement', { exact: true })).toHaveValue('Travaux modifiés');
});
