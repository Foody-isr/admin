import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  expect,
  test as base,
  type FrameLocator,
  type Locator,
  type Page,
} from '@playwright/test';
import type { FieldContract } from '../../src/components/website-v3/field-contracts';
import {
  seedWebsiteV3Fixture,
  type WebsiteV3FixtureData,
} from './global-setup';

export type { WebsiteV3FixtureData } from './global-setup';

export interface WebsiteV3Fixtures {
  restaurantId: number;
  restaurantSlug: string;
  menuIds: number[];
  serviceIds: number[];
  builderPage: Page;
}

export const webBaseURL = 'http://localhost:3000';

interface InternalFixtures {
  websiteV3Fixture: WebsiteV3FixtureData;
}

/** Reads and validates the deterministic fixture created by the global setup. */
export async function readWebsiteV3Fixture(): Promise<WebsiteV3FixtureData> {
  const fixturePath = path.resolve(process.cwd(), 'test-results/website-v3-fixture.json');
  const raw = await readFile(fixturePath, 'utf8');
  const fixture = JSON.parse(raw) as WebsiteV3FixtureData;

  if (
    !Number.isInteger(fixture.restaurantId) ||
    fixture.restaurantId <= 0 ||
    !fixture.restaurantSlug ||
    !fixture.email ||
    !fixture.password ||
    !Array.isArray(fixture.menuIds) ||
    !Array.isArray(fixture.serviceIds)
  ) {
    throw new Error(`Invalid Website V3 fixture at ${fixturePath}.`);
  }

  return fixture;
}

/** Signs in through Foodyadmin's password form with the deterministic owner. */
export async function loginWebsiteV3Owner(page: Page, fixture: WebsiteV3FixtureData): Promise<void> {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(fixture.email);
  await page.locator('input[type="password"]').fill(fixture.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(new RegExp(`/${fixture.restaurantId}/(?:dashboard|website-v3)(?:[/?#]|$)`));
}

/** Waits until the Website V3 preview has acknowledged the current draft revision. */
export async function waitForPreviewReady(page: Page): Promise<void> {
  await expect(page.getByText('Aperçu à jour', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

/** Returns the live foodyweb iframe used by the canonical Website V3 renderer. */
export function previewFrame(page: Page): FrameLocator {
  return page.frameLocator('iframe[title^="Aperçu de "]');
}

/** Selects a builder page by its exact rail title. */
export async function selectBuilderPage(page: Page, title: string): Promise<void> {
  await page.locator('aside button').filter({ hasText: title }).first().click();
  await waitForPreviewReady(page);
}

/** Opens one of the three inspector tabs. */
export async function openInspectorTab(
  page: Page,
  tab: 'Contenu' | 'Apparence' | 'Réglages',
): Promise<void> {
  await page.getByRole('button', { name: tab, exact: true }).click();
}

/** Waits until the current full-draft autosave has completed. */
export async function waitForDraftSaved(page: Page): Promise<void> {
  await expect(page.getByText('Brouillon enregistré', { exact: false })).toBeVisible();
}

/** Acknowledges the current content on both preview devices, as required before publish. */
export async function coverBothPreviewDevices(page: Page): Promise<void> {
  for (const device of ['Aperçu ordinateur', 'Aperçu mobile'] as const) {
    await page.getByRole('button', { name: device, exact: true }).click();
    await waitForPreviewReady(page);
  }
}

/** Publishes after both preview devices have acknowledged the latest content. */
export async function publishCurrentDraft(page: Page): Promise<void> {
  await waitForDraftSaved(page);
  await coverBothPreviewDevices(page);
  const publish = page.getByRole('button', { name: 'Publier', exact: true });
  await expect(publish).toBeEnabled();
  await publish.click();
  await expect(page.getByRole('status')).toContainText('Le site est publié');
}

/** Opens a canonical public Website V3 route on foodyweb. */
export async function openPublicPage(
  page: Page,
  restaurantSlug: string,
  pageSlug = '',
): Promise<void> {
  const suffix = pageSlug ? `/${encodeURIComponent(pageSlug)}` : '';
  await page.goto(`${webBaseURL}/r/${encodeURIComponent(restaurantSlug)}${suffix}`);
}

/** Mutates a registered builder control using its deterministic contract value. */
export async function mutateContractControl(
  page: Page,
  contract: FieldContract,
): Promise<{ control: Locator; changed: boolean }> {
  const controls = page.locator(`[data-field-id="${contract.id}"]`);
  await expect(controls.first()).toBeVisible();
  const control =
    contract.id === 'section.is_visible'
      ? page.locator('input[data-field-id="section.is_visible"]')
      : contract.id === 'section.content.social_links'
      ? controls.filter({ visible: true }).first()
      : controls.filter({ visible: true }).last();
  const tag = await control.evaluate((element) => element.tagName.toLowerCase());
  const inputType = await control.getAttribute('type');
  const before = await controlValue(control, tag, inputType);

  if (tag === 'fieldset' && Array.isArray(contract.testValue)) {
    const selected = new Set(contract.testValue.map(Number));
    const checkboxes = await control.locator('input[type="checkbox"]').all();
    for (let index = 0; index < checkboxes.length; index += 1) {
      const checkbox = checkboxes[index];
      await checkbox.setChecked(index < selected.size);
    }
  } else if (inputType === 'checkbox') {
    await control.setChecked(Boolean(contract.testValue));
  } else if (tag === 'select') {
    await control.selectOption(String(contract.testValue));
  } else if (tag === 'button') {
    await control.click();
  } else {
    const serialized =
      typeof contract.testValue === 'string'
        ? contract.testValue
        : JSON.stringify(contract.testValue);
    await control.fill(serialized);
    if (contract.editor.commit === 'blur') await control.blur();
  }
  return {
    control,
    changed: JSON.stringify(before) !== JSON.stringify(await controlValue(control, tag, inputType)),
  };
}

async function controlValue(
  control: Locator,
  tag: string,
  inputType: string | null,
): Promise<unknown> {
  if (tag === 'fieldset') {
    return control.locator('input[type="checkbox"]').evaluateAll((checkboxes) =>
      checkboxes.map((checkbox) => (checkbox as HTMLInputElement).checked),
    );
  }
  if (inputType === 'checkbox') return control.isChecked();
  return control.inputValue();
}

/** Asserts one field-specific renderer expectation against preview or public DOM. */
export async function assertContractOutput(
  root: Page | FrameLocator,
  contract: FieldContract,
  surface: 'preview' | 'public',
): Promise<void> {
  const expectation = contract[surface];
  const target = root.locator(expectation.selector).first();
  switch (expectation.assertion) {
    case 'text':
      if (expectation.selector === 'title') {
        await expect
          .poll(() => root.locator('html').evaluate(() => document.title))
          .toContain(expectation.expected);
        return;
      }
      await expect(target).toContainText(expectation.expected);
      return;
    case 'attribute':
      if (isJson(expectation.expected)) {
        const actual = await target.getAttribute(expectation.name);
        expect(JSON.parse(actual ?? 'null')).toEqual(JSON.parse(expectation.expected));
        return;
      }
      await expect(target).toHaveAttribute(expectation.name, expectation.expected);
      return;
    case 'css':
      await expect(target).toHaveCSS(expectation.name, expectation.expected);
      return;
    case 'visible':
      if (expectation.expected === 'true') await expect(target).toBeVisible();
      else await expect(target).toBeHidden();
      return;
    case 'count':
      await expect(root.locator(expectation.selector)).toHaveCount(Number(expectation.expected));
  }
}

function isJson(value: string): boolean {
  try {
    JSON.parse(value);
    return value.trim().startsWith('{') || value.trim().startsWith('[');
  } catch {
    return false;
  }
}

export const websiteV3Test = base.extend<WebsiteV3Fixtures & InternalFixtures>({
  websiteV3Fixture: async ({}, use) => {
    await use(await seedWebsiteV3Fixture());
  },
  restaurantId: async ({ websiteV3Fixture }, use) => {
    await use(websiteV3Fixture.restaurantId);
  },
  restaurantSlug: async ({ websiteV3Fixture }, use) => {
    await use(websiteV3Fixture.restaurantSlug);
  },
  menuIds: async ({ websiteV3Fixture }, use) => {
    await use(websiteV3Fixture.menuIds);
  },
  serviceIds: async ({ websiteV3Fixture }, use) => {
    await use(websiteV3Fixture.serviceIds);
  },
  builderPage: async ({ page, websiteV3Fixture }, use) => {
    await loginWebsiteV3Owner(page, websiteV3Fixture);
    await page.goto(`/${websiteV3Fixture.restaurantId}/website-v3`);
    await waitForPreviewReady(page);
    await use(page);
  },
});

export { expect };
