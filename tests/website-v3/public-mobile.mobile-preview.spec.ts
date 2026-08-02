import { expect, test } from '@playwright/test';
import {
  loginWebsiteV3Owner,
  readWebsiteV3Fixture,
  webBaseURL,
} from './helpers';

test('published Website V3 pages render without horizontal overflow on mobile', async ({ page }) => {
  const fixture = await readWebsiteV3Fixture();
  const routes = [
    { slug: '', selector: '[data-page-title]' },
    { slug: 'brunch-order', selector: '[data-group-id]' },
    { slug: 'office-catering', selector: '[data-catering-service]' },
  ];

  for (const route of routes) {
    const suffix = route.slug ? `/${route.slug}` : '';
    await page.goto(`${webBaseURL}/r/${fixture.restaurantSlug}${suffix}`);
    await expect(page.locator(route.selector).first()).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      )
      .toBe(true);
  }
});

test('website builder remains unavailable on mobile', async ({ page }) => {
  const fixture = await readWebsiteV3Fixture();

  await loginWebsiteV3Owner(page, fixture);
  await page.goto(`/${fixture.restaurantId}/website-v3`);

  await expect(
    page.getByRole('heading', { name: 'Ouvrez le builder sur un écran plus large' }),
  ).toBeVisible();
  await expect(page.locator('iframe[title^="Aperçu de "]')).toHaveCount(0);
});
