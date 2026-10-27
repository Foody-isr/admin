import assert from 'node:assert/strict';
import test from 'node:test';
import { createMenuItem, updateMenuItem, updateRestaurantSettings, type FullServiceSettings } from '../api';
import { isMeaningfulDraft, type ItemDraftInput } from '../itemDraft';

test('checkout preferences preserve explicit false and restaurant scoping on writes', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const requests: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    return Response.json({ item: { id: 18 }, settings: { full_service: { auto_progression: false } } });
  };
  const itemPreferences = { pos_auto_select_first_variant: false, pos_skip_customization: true };
  await createMenuItem(7, { category_id: 12, name: 'Demo', price: 25, ...itemPreferences });
  await updateMenuItem(7, 18, { ...itemPreferences, pos_skip_customization: false });
  const originalPolicy: FullServiceSettings = {
    seating_mode: 'optionalSeats', send_and_stay: false, coursing_enabled: true,
    auto_progression: true, courses: ['Starters'], show_held_on_kds: false,
    sort_cart: 'course', comp_reasons: ['Demo'], void_reasons: ['Demo'],
  };
  await updateRestaurantSettings(7, { full_service: { ...originalPolicy, auto_progression: false }, full_service_base: originalPolicy });
  assert.equal(requests.length, 3);
  for (const request of requests) assert.equal(request.headers.get('X-Restaurant-ID'), '7');
  assert.equal(requests[0].body.pos_auto_select_first_variant, false);
  assert.equal(requests[0].body.pos_skip_customization, true);
  assert.equal(requests[1].body.pos_skip_customization, false);
  assert.equal((requests[2].body.full_service as Record<string, unknown>).auto_progression, false);
  assert.deepEqual(requests[2].body.full_service_base, originalPolicy);
});

test('checkout-only edits create a recoverable draft without changing legacy defaults', () => {
  const empty: ItemDraftInput = {
    name: '', price: 0, description: '', portion: '', categoryId: 1, isActive: true,
    itemType: 'food_and_beverage', comboSteps: [], selectedGroupIds: [],
    selectedModifierSetIds: [], variantGroups: [], activeTab: 'details',
  };
  assert.equal(isMeaningfulDraft(empty), false);
  assert.equal(isMeaningfulDraft({ ...empty, posAutoSelectFirstVariant: true, posSkipCustomization: false }), false);
  assert.equal(isMeaningfulDraft({ ...empty, posAutoSelectFirstVariant: false }), true);
  assert.equal(isMeaningfulDraft({ ...empty, posSkipCustomization: true }), true);
});
