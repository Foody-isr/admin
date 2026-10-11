import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

async function install(page: Page, locale = 'en') {
  const fixture = createFixture({ library: true });
  await page.addInitScript(
    ({ locale }) => {
      localStorage.setItem('foody_restaurant_token', 'isolated-ui-fixture');
      localStorage.setItem(
        'foody_restaurant_user',
        JSON.stringify({
          id: 1,
          full_name: 'Demo',
          role: 'owner',
          email: 'demo@foody.test',
        }),
      );
      localStorage.setItem('foody_restaurant_ids', '[1]');
      localStorage.setItem('foody-admin-locale', locale);
    },
    { locale },
  );
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const result = fixture.response(
      request.url(),
      request.method(),
      request.postDataJSON() ?? {},
      1,
    );
    await route.fulfill({
      status: result.status ?? 200,
      json: result.json ?? {},
    });
  });
  await page.route('**/*', (route) =>
    ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort(),
  );
  await page.goto('/1/menu/items/1?tab=availability');
  return fixture;
}

const preparationDialog = (page: Page) =>
  page.getByRole('dialog', { name: 'Item preparation time', exact: true });

test('preparation modal cancels locally, applies a summary, then persists the calendar only on Save', async ({
  page,
}) => {
  const fixture = await install(page);
  await expect(page.locator('.item-execution-section')).toContainText(
    '1 hour 30 minutes',
  );
  await page
    .locator('.item-execution-section')
    .getByRole('button', { name: 'Edit', exact: true })
    .click();
  let dialog = preparationDialog(page);
  await dialog.getByRole('switch').click();
  await dialog
    .getByRole('combobox', { name: 'Minimum preparation time', exact: true })
    .selectOption('240');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.item-execution-section')).toContainText(
    '1 hour 30 minutes',
  );
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page
    .locator('.item-execution-section')
    .getByRole('button', { name: 'Edit', exact: true })
    .click();
  dialog = preparationDialog(page);
  await dialog.getByRole('switch').click();
  await dialog
    .getByRole('combobox', { name: 'Minimum preparation time', exact: true })
    .selectOption('240');
  await dialog.getByRole('button', { name: 'Customize by day' }).click();
  for (const name of ['Thursday', 'Friday', 'Saturday', 'Sunday'])
    await dialog.getByRole('button', { name, exact: true }).click();
  await dialog
    .getByRole('combobox', { name: 'Order deadline' })
    .selectOption('0');
  await dialog
    .getByRole('button', { name: 'Add days with different conditions' })
    .click();
  const sunday = dialog.getByRole('group', { name: 'Schedule 2', exact: true });
  for (const name of ['Thursday', 'Friday', 'Saturday'])
    await sunday.getByRole('button', { name, exact: true }).click();
  await sunday
    .getByRole('combobox', { name: 'Order deadline' })
    .selectOption('2');
  await sunday.getByLabel('Before', { exact: true }).fill('18:00');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  expect(fixture.writes).toEqual([]);
  await expect(page.locator('.item-execution-section')).toContainText(
    '4 hours',
  );
  await expect(page.locator('.item-execution-section')).toContainText('18:00');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL('/1/menu/items');
  expect(fixture.items[0]).toMatchObject({
    preparation_lead_time_minutes: 240,
    preparation_schedule: [
      { days: [1, 2, 3], cutoff_days_before: 0, cutoff_time: '12:00' },
      { days: [0], cutoff_days_before: 2, cutoff_time: '18:00' },
    ],
  });
});

test('stock dialog preserves cancelled values, warns when ready-stock sale becomes incompatible', async ({
  page,
}) => {
  const fixture = await install(page);
  await page
    .locator('#item-availability')
    .getByRole('button', { name: 'Actions' })
    .click();
  await page
    .getByRole('button', { name: 'Stock tracking', exact: true })
    .click();
  let dialog = page.getByRole('dialog', {
    name: 'Stock tracking',
    exact: true,
  });
  await dialog
    .getByRole('combobox', { name: 'Track availability using' })
    .selectOption('count');
  await dialog.getByRole('spinbutton').fill('12');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(fixture.writes).toEqual([]);
  await page
    .locator('#item-availability')
    .getByRole('button', { name: 'Actions' })
    .click();
  await page
    .getByRole('button', { name: 'Stock tracking', exact: true })
    .click();
  dialog = page.getByRole('dialog', { name: 'Stock tracking', exact: true });
  await expect(
    dialog.getByRole('combobox', { name: 'Track availability using' }),
  ).toHaveValue('recipe');
  await dialog
    .getByRole('combobox', { name: 'Track availability using' })
    .selectOption('count');
  await dialog.getByRole('spinbutton').fill('12');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await page
    .locator('.item-execution-section')
    .getByRole('button', { name: 'Edit', exact: true })
    .click();
  await preparationDialog(page)
    .getByRole('combobox', { name: 'Items already prepared' })
    .selectOption('surplus');
  await preparationDialog(page)
    .getByRole('button', { name: 'Apply', exact: true })
    .click();
  await page
    .locator('#item-availability')
    .getByRole('button', { name: 'Actions' })
    .click();
  await page
    .getByRole('button', { name: 'Stock tracking', exact: true })
    .click();
  await dialog
    .getByRole('combobox', { name: 'Track availability using' })
    .selectOption('recipe');
  await expect(dialog.getByRole('status')).toContainText(
    'restore the preparation conditions',
  );
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL('/1/menu/items');
  expect(fixture.items[0]).toMatchObject({
    stock_quantity: 12,
    stock_mode: 'count',
    immediate_sale_mode: 'surplus',
  });
});

for (const locale of ['fr', 'he'])
  test(`mobile ${locale} settings fit the screen with a reachable apply action`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await install(page, locale);
    await page.locator('.item-execution-section button').click();
    const dialog = page.locator('.item-settings-dialog');
    await dialog.getByRole('switch').click();
    await dialog.locator('.item-settings-stack > .item-settings-link').click();
    await expect(dialog.locator('.item-settings-primary')).toBeInViewport();
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    expect(await dialog.getAttribute('dir')).toBe(
      locale === 'he' ? 'rtl' : 'ltr',
    );
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  });

test('French summary separates weekday conditions and keeps a simple delay on one line', async ({
  page,
}) => {
  await install(page, 'fr');
  const summary = page.locator('.item-preparation-summary');
  await expect(summary.locator('p')).toHaveCount(1);
  await expect(summary.locator('span')).toHaveCount(0);
  await page
    .locator('.item-execution-section')
    .getByRole('button', { name: 'Modifier', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Temps de préparation de l’article',
    exact: true,
  });
  await dialog.getByRole('switch').click();
  await dialog
    .getByRole('combobox', {
      name: 'Temps de préparation minimum',
      exact: true,
    })
    .selectOption('240');
  await dialog
    .getByRole('button', { name: 'Personnaliser selon les jours' })
    .click();
  for (const name of ['jeudi', 'vendredi', 'samedi', 'dimanche'])
    await dialog.getByRole('button', { name, exact: true }).click();
  await dialog
    .getByRole('combobox', { name: 'Date limite de commande' })
    .selectOption('0');
  await dialog
    .getByRole('button', { name: 'Ajouter des jours avec d’autres conditions' })
    .click();
  const sunday = dialog.getByRole('group', { name: 'Créneau 2', exact: true });
  for (const name of ['jeudi', 'vendredi', 'samedi'])
    await sunday.getByRole('button', { name, exact: true }).click();
  await sunday
    .getByRole('combobox', { name: 'Date limite de commande' })
    .selectOption('2');
  await sunday.getByLabel('Avant', { exact: true }).fill('18:00');
  await dialog.getByRole('button', { name: 'Appliquer', exact: true }).click();
  await expect(summary.locator('p')).toHaveCount(2);
  await expect(summary.locator('strong').nth(0)).toHaveText(
    'Du lundi au mercredi :',
  );
  await expect(summary.locator('span').nth(1)).toHaveText(
    'Commander avant vendredi à 18:00.',
  );
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await summary.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    const first = await summary.locator('p').nth(0).boundingBox();
    const second = await summary.locator('p').nth(1).boundingBox();
    expect(second!.y).toBeGreaterThan(first!.y + first!.height);
  }
});
