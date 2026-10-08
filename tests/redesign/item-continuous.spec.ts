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

test('editing uses one scroll area; shortcuts preserve drafts and every section stays mounted', async ({
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
  const nav = page.getByRole('navigation', { name: 'On this page' });
  await nav
    .getByRole('button', { name: 'Recipe and cost', exact: true })
    .click();
  await expect(page.locator('#item-recipe-title')).toBeFocused();
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeInViewport();
  expect(await page.getByRole('dialog').evaluate((el) => el.scrollTop)).toBe(0);
  await expect(
    nav.getByRole('button', { name: 'Recipe and cost', exact: true }),
  ).toHaveAttribute('aria-current', 'location');
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
  await page
    .getByRole('navigation', { name: 'On this page' })
    .getByRole('button', { name: 'Item information', exact: true })
    .click();
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
  await page.getByLabel('Content language').selectOption('fr');
  await page.locator('#menu-item-name').fill('Salade traduite');
  await expect(page.locator('#item-pricing')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Sesame', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Content language').selectOption('en');
  await expect(page.locator('#menu-item-name')).toHaveValue(
    'Salade méditerranéenne',
  );
  await page.getByLabel('Content language').selectOption('fr');
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
  await page
    .getByRole('navigation', { name: 'On this page' })
    .getByRole('button', { name: 'Item information', exact: true })
    .click();
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
  await page.getByRole('button', { name: 'By weight', exact: true }).click();
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
