import { test, expect, type Page } from '@playwright/test';
import { createFixture } from './fixtures.mjs';

async function install(
  page: Page,
  { locale = 'en', combo = false, delayAvailability = 0 } = {},
) {
  const fixture = createFixture({ library: true });
  if (combo)
    Object.assign(fixture.items[0], { item_type: 'combo', combo_steps: [] });
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
      localStorage.setItem('foody_admin_theme', 'light');
    },
    { locale },
  );
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    if (
      delayAvailability &&
      new URL(req.url()).pathname.endsWith('/availability/rules')
    )
      await new Promise((resolve) => setTimeout(resolve, delayAvailability));
    const result = fixture.response(
      req.url(),
      req.method(),
      req.postDataJSON() ?? {},
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
  return fixture;
}

const sections = [
  'information',
  'pricing',
  'personalizations',
  'customer-facts',
  'availability',
  'recipe',
  'assistant',
];

test('full-page editing preserves drafts and fixed actions while scrolling', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 812 });
  const fixture = await install(page);
  await page.goto('/1/menu/items/1');
  await expect(page.locator('#menu-item-name')).toHaveValue(
    fixture.items[0].name,
  );
  await expect(page.getByRole('tab')).toHaveCount(0);
  for (const id of sections)
    await expect(page.locator(`#item-${id}`)).toBeVisible();
  await page.locator('#menu-item-name').fill('Salad changed');
  await expect(
    page.getByRole('navigation', { name: 'On this page' }),
  ).toHaveCount(0);
  await expect(page.locator('.item-side-card')).toHaveCount(3);
  const dialogBox = await page.getByRole('dialog').boundingBox();
  expect(dialogBox).toMatchObject({ x: 0, y: 0, width: 1440, height: 812 });
  await expect(page.locator('.item-editor-title')).toBeInViewport();
  await page.locator('#item-recipe-title').scrollIntoViewIfNeeded();
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeInViewport();
  expect(await page.getByRole('dialog').evaluate((el) => el.scrollTop)).toBe(0);
  await expect(page.locator('#menu-item-name')).toHaveValue('Salad changed');
  await expect(
    page
      .getByRole('dialog')
      .getByRole('status')
      .filter({ hasText: 'Unsaved changes' }),
  ).toBeVisible();
  expect(fixture.writes).toEqual([]);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL('/1/menu/items');
  expect(fixture.items[0].name).toBe('Salad changed');
});

test('availability edits are staged and saved with the item after visiting another section', async ({
  page,
}) => {
  const fixture = await install(page);
  await page.goto('/1/menu/items/1');
  await page.locator('#menu-item-name').fill('Updated dish');
  await page.getByRole('button', { name: /Always available/ }).click();
  await page.locator('#menu-item-name').scrollIntoViewIfNeeded();
  expect(fixture.writes).toEqual([]);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL('/1/menu/items');
  expect(fixture.items[0]).toMatchObject({
    name: 'Updated dish',
    availability_override: 'force_available',
  });
});

test('cancel discards staged stock and form changes', async ({ page }) => {
  const fixture = await install(page);
  await page.goto('/1/menu/items/1');
  await page.locator('#menu-item-name').fill('Discarded name');
  await page.getByRole('button', { name: /Always available/ }).click();
  await page
    .getByRole('button', { name: 'Cancel', exact: true })
    .last()
    .click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page
    .getByRole('button', { name: 'Discard changes', exact: true })
    .click();
  await expect(page).toHaveURL('/1/menu/items');
  expect(fixture.writes).toEqual([]);
});

test('creation saves customer facts and continues directly into recipe configuration', async ({
  page,
}) => {
  const fixture = await install(page, { delayAvailability: 600 });
  await page.goto('/1/menu/items/new');
  for (const id of sections)
    await expect(page.locator(`#item-${id}`)).toBeVisible();
  await page.locator('#menu-item-name').fill('New dish');
  await page
    .getByRole('textbox', { name: 'Selling price', exact: true })
    .fill('30');
  await page.getByRole('button', { name: 'Sesame', exact: true }).click();
  await page
    .locator('#item-recipe')
    .getByRole('button', { name: 'Save and configure', exact: true })
    .click();
  await expect(page).toHaveURL('/1/menu/items/4?tab=recipe');
  await expect(
    page
      .locator('#item-availability')
      .getByRole('button', { name: /Always available/ }),
  ).toBeVisible();
  await expect(page.locator('#item-recipe-title')).toBeInViewport();
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeInViewport();
  expect(await page.getByRole('dialog').evaluate((el) => el.scrollTop)).toBe(0);
  expect(fixture.items[3]).toMatchObject({
    name: 'New dish',
    price: 30,
    customer_facts: { allergens: ['sesame'] },
  });
  await expect(page.getByRole('tab')).toHaveCount(0);
});

test('legacy stock links scroll to stock while translations keep shared fields available', async ({
  page,
}) => {
  await install(page);
  await page.goto('/1/menu/items/1?tab=availability');
  await expect(page.locator('#item-availability-title')).toBeInViewport();
  await page
    .getByRole('button', { name: 'Content language', exact: true })
    .click();
  await page
    .getByRole('combobox', { name: 'Content language' })
    .selectOption('fr');
  await page.locator('#menu-item-name').fill('Salade traduite');
  await expect(page.locator('#item-pricing')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Sesame', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Content language', exact: true })
    .click();
  await page
    .getByRole('combobox', { name: 'Content language' })
    .selectOption('en');
  await expect(page.locator('#menu-item-name')).toHaveValue(
    'Salade méditerranéenne',
  );
  await page
    .getByRole('combobox', { name: 'Content language' })
    .selectOption('fr');
  await page.keyboard.press('Escape');
  await expect(page.locator('.item-translations-panel')).toHaveCount(0);
  await expect(page.locator('#menu-item-name')).toHaveValue('Salade traduite');
});

test('combo composition and stock remain on the same page', async ({
  page,
}) => {
  await install(page, { combo: true });
  await page.goto('/1/menu/items/1');
  await expect(page.locator('#menu-item-type')).toHaveValue('combo');
  await expect(page.locator('#item-composition')).toBeVisible();
  await expect(page.locator('#item-availability')).toBeVisible();
  await expect(page.locator('#item-recipe')).toHaveCount(0);
  await expect(page.locator('#item-personalizations')).toHaveCount(0);
});

for (const locale of ['en', 'he'])
  test(`mobile ${locale} keeps every section reachable without horizontal overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await install(page, { locale });
    await page.goto('/1/menu/items/1');
    await expect(page.locator('#menu-item-name')).toBeVisible();
    for (const id of sections)
      await expect(page.locator(`#item-${id}`)).toBeVisible();
    expect(
      await page
        .locator('[data-item-editor-scroll]')
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await page
      .locator('#item-assistant textarea')
      .fill('Demo assistant context');
    await expect(
      page.getByRole('dialog').getByRole('button', {
        name: locale === 'he' ? 'שמור' : 'Save',
        exact: true,
      }),
    ).toBeInViewport();
  });

test('recipe instructions remain staged while moving through the page and save with the article', async ({
  page,
}) => {
  const fixture = await install(page);
  await page.goto('/1/menu/items/1?tab=recipe');
  await page
    .locator('#item-recipe')
    .getByRole('button', { name: /^Instructions/ })
    .click();
  await page
    .locator('#item-recipe textarea')
    .last()
    .fill('Kitchen note changed');
  await page.locator('#menu-item-name').scrollIntoViewIfNeeded();
  expect(fixture.writes).toEqual([]);
  await page.locator('#menu-item-name').fill('Dish with instructions');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL('/1/menu/items');
  expect(fixture.items[0].name).toBe('Dish with instructions');
  expect(fixture.items[0]).toMatchObject({
    recipe_notes: 'Kitchen note changed',
  });
});

test('by-weight pricing retains its rate and estimate without presenting size pricing', async ({
  page,
}) => {
  const fixture = await install(page);
  Object.assign(fixture.optionSets[0], { menu_items: [fixture.items[0]] });
  await page.goto('/1/menu/items/1');
  await page
    .getByRole('combobox', { name: 'Pricing', exact: true })
    .selectOption('by_weight');
  await page
    .getByRole('textbox', { name: 'Price per kg', exact: true })
    .fill('64');
  await page
    .getByRole('textbox', { name: 'Estimated weight', exact: true })
    .fill('250');
  await expect(
    page
      .locator('#item-pricing')
      .getByRole('button', { name: /Add another set/ }),
  ).toHaveCount(0);
  await expect(
    page.locator('#item-pricing').getByRole('textbox', { name: /^Portion/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL('/1/menu/items');
  expect(fixture.items[0]).toMatchObject({
    pricing_mode: 'by_weight',
    price_per_kg: 64,
    estimated_weight_grams: 250,
  });
});

test('a temporary type change retains the staged recipe when returning to an article', async ({
  page,
}) => {
  const fixture = await install(page);
  await page.goto('/1/menu/items/1?tab=recipe');
  await page
    .locator('#item-recipe')
    .getByRole('button', { name: /^Instructions/ })
    .click();
  await page
    .locator('#item-recipe textarea')
    .last()
    .fill('Retained kitchen draft');
  await page.locator('#menu-item-type').selectOption('combo');
  await page
    .getByRole('button', { name: 'Switch to Combo', exact: true })
    .click();
  await expect(page.locator('#item-recipe')).toBeHidden();
  await page.locator('#menu-item-type').selectOption('food_and_beverage');
  await expect(page.locator('#item-recipe textarea').last()).toHaveValue(
    'Retained kitchen draft',
  );
  expect(fixture.writes).toEqual([]);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL('/1/menu/items');
  expect(fixture.items[0]).toMatchObject({
    recipe_notes: 'Retained kitchen draft',
    item_type: 'food_and_beverage',
  });
});

test('variant fields align their values and preserve the 64px field height', async ({
  page,
}) => {
  const fixture = await install(page);
  Object.assign(fixture.optionSets[0], { menu_items: [fixture.items[0]] });
  await page.goto('/1/menu/items/1');
  const row = page.locator('.item-variant-group fieldset').first();
  await row.scrollIntoViewIfNeeded();
  const geometry = await row.locator('.item-field').evaluateAll((fields) =>
    fields.map((field) => ({
      height: field.getBoundingClientRect().height,
      valueTop: field.querySelector('input, select')!.getBoundingClientRect()
        .top,
    })),
  );
  expect(geometry).toHaveLength(4);
  for (const field of geometry) {
    expect(field.height).toBe(64);
    expect(Math.abs(field.valueTop - geometry[0].valueTop)).toBeLessThanOrEqual(
      1,
    );
  }
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeInViewport();
});

test('customer notes use a horizontal switch and save their single setting', async ({
  page,
}) => {
  const fixture = await install(page, { locale: 'fr' });
  await page.goto('/1/menu/items/1');
  const notes = page.getByRole('switch', {
    name: 'Autoriser une note du client',
  });
  await notes.scrollIntoViewIfNeeded();
  await expect(notes).toBeChecked();
  const box = await notes.boundingBox();
  expect(box!.width).toBeGreaterThan(box!.height * 1.5);
  await page.getByText('Autoriser une note du client', { exact: true }).click();
  await expect(notes).not.toBeChecked();
  expect(fixture.writes).toEqual([]);
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page).toHaveURL('/1/menu/items');
  expect(fixture.items[0]).toMatchObject({ allow_notes: false });
});

test('French variant statuses fit at desktop, tablet and mobile widths', async ({
  page,
}) => {
  const fixture = await install(page, { locale: 'fr' });
  Object.assign(fixture.optionSets[0], { menu_items: [fixture.items[0]] });
  await page.goto('/1/menu/items/1');
  const status = page.locator('.item-variant-status select').first();
  await status.selectOption('inactive');
  for (const width of [1440, 1100, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await status.scrollIntoViewIfNeeded();
    const geometry = await status.evaluate((select: HTMLSelectElement) => {
      const style = getComputedStyle(select);
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d')!;
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      return {
        width: select.clientWidth,
        textWidth: context.measureText(select.selectedOptions[0].text).width,
        pageWidth: document.documentElement.scrollWidth,
      };
    });
    // Reserve room for the native arrow and a gap after the longest label.
    expect(geometry.width - geometry.textWidth).toBeGreaterThanOrEqual(24);
    expect(geometry.pageWidth).toBeLessThanOrEqual(width);
  }
});

test('photo preview traps focus, preserves drafts and stages removal until save', async ({
  page,
}) => {
  const fixture = await install(page);
  fixture.items[0].image_url = '/brand/favicon.svg';
  await page.goto('/1/menu/items/1');
  await page.locator('#menu-item-name').fill('Photo draft');
  const preview = page.getByRole('button', { name: 'Item photo', exact: true });
  await preview.click();
  const dialog = page.getByRole('dialog', { name: 'Item photo', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('img')).toHaveCSS('object-fit', 'contain');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(preview).toBeFocused();
  await expect(page.locator('#menu-item-name')).toHaveValue('Photo draft');
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Change photo', exact: true }).click();
  const chooser = await chooserPromise;
  expect(chooser.isMultiple()).toBe(false);
  await chooser.setFiles([]);
  await preview.click();
  await dialog
    .getByRole('button', { name: 'Remove image', exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Add photo', exact: true }),
  ).toBeVisible();
  expect(fixture.writes).toEqual([]);
  expect(fixture.items[0].image_url).toBe('/brand/favicon.svg');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL('/1/menu/items');
  expect(fixture.items[0].image_url).toBe('');
});

test('removing only a photo prompts before discarding the change', async ({
  page,
}) => {
  const fixture = await install(page);
  fixture.items[0].image_url = '/brand/favicon.svg';
  await page.goto('/1/menu/items/1');
  await page.getByRole('button', { name: 'Item photo', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Item photo', exact: true })
    .getByRole('button', { name: 'Remove image' })
    .click();
  await page
    .locator('.item-editor-header')
    .getByRole('button', { name: 'Cancel', exact: true })
    .last()
    .click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  expect(fixture.writes).toEqual([]);
  expect(fixture.items[0].image_url).toBe('/brand/favicon.svg');
});

test('a new item can preview and remove a selected photo before creation', async ({
  page,
}) => {
  const fixture = await install(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/1/menu/items/new');
  await page.locator('#menu-item-name').fill('New dish without photo');
  await page
    .getByRole('textbox', { name: 'Selling price', exact: true })
    .fill('30');
  const file = {
    name: 'preview.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=',
      'base64',
    ),
  };
  await page.locator('input[type="file"]').setInputFiles(file);
  await page.getByRole('button', { name: 'Item photo', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Item photo', exact: true });
  await expect(dialog).toBeInViewport();
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await dialog.getByRole('button', { name: 'Remove image' }).click();
  await expect(
    page.getByRole('button', { name: 'Add photo', exact: true }),
  ).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveValue('');
  expect(fixture.writes).toEqual([]);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL('/1/menu/items');
  expect(fixture.items[3]).toMatchObject({ name: 'New dish without photo' });
  expect(fixture.items[3].image_url || '').toBe('');
});
