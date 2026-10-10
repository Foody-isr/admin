import { test, expect } from '@playwright/test';

for (const locale of ['fr', 'he']) test(`selection controls preserve keyboard, explicit values and forms in ${locale}`, async ({ page }, info) => {
  await page.addInitScript(locale => { localStorage.setItem('foody-admin-locale', locale); localStorage.setItem('foody_admin_theme', locale === 'he' ? 'dark' : 'light'); }, locale);
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  await page.goto('/design-system');
  const form = page.getByRole('form', { name: 'Selection examples' });
  await expect(form).toBeVisible({ timeout: 30_000 });
  const radios = form.getByRole('radio');
  await radios.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(radios.nth(1)).toBeChecked();
  await expect(radios.nth(1)).toBeFocused();
  await expect(radios.first()).not.toBeChecked();
  const checks = form.locator('input[name="services"]');
  await checks.first().check(); await checks.last().check();
  await checks.first().focus(); await page.keyboard.press('Space');
  await expect(checks.first()).not.toBeChecked(); await expect(checks.last()).toBeChecked();
  const binary = form.locator('#example-switch');
  await binary.locator('[data-value="true"]').click(); await expect(binary).toBeChecked();
  await binary.locator('[data-value="true"]').click(); await expect(binary).toBeChecked();
  await binary.locator('[data-value="false"]').click(); await expect(binary).not.toBeChecked();
  await binary.focus(); await page.keyboard.press('Space'); await expect(binary).toBeChecked();
  await binary.click(); await expect(binary).not.toBeChecked();
  const native = form.locator('input[name="notifications"]'), segments = native.locator('..');
  await segments.locator('[data-value="true"]').click(); await expect(native).toBeChecked();
  await segments.locator('[data-value="false"]').click(); await expect(native).not.toBeChecked();
  await segments.locator('[data-value="false"]').click(); await expect(native).not.toBeChecked();
  await native.focus(); await page.keyboard.press('Space'); await expect(native).toBeChecked();
  await expect(form.getByRole('switch', { name: 'Disabled native switch', exact: true })).toBeDisabled();
  await expect(form.getByRole('switch', { name: 'Disabled switch', exact: true })).toBeDisabled();
  await expect(form.getByRole('checkbox', { name: 'Indeterminate' })).toHaveAttribute('data-state', 'indeterminate');
  expect(await form.evaluate(element => Object.fromEntries(new FormData(element as HTMLFormElement)))).toMatchObject({ mode: 'preorder', services: 'delivery', notifications: 'on' });
  expect(await form.evaluate(element => new FormData(element as HTMLFormElement).has('disabled'))).toBe(false);
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await form.scrollIntoViewIfNeeded();
    expect(await form.evaluate(element => element.scrollWidth <= element.clientWidth && element.getBoundingClientRect().right <= innerWidth)).toBe(true);
    await form.screenshot({ path: info.outputPath(`selections-${locale}-${width}.png`) });
  }
});
