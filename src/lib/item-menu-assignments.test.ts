import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CarteDraftState, Menu } from './api';
import { applyItemMenuAssignments, restoreLegacyItemAssignments, saveItemMenuAssignments, type ItemMenuAssignment } from './item-menu-assignments';

function draft(): CarteDraftState {
  return { menu_id: 3, series_key: '', revision: 7, base_revision: 2, base_fingerprint: 'baseline', published_revision: 2, has_draft: true, updated_by_id: 1, is_weekly_rotating: false,
    payload: { name: 'Carte', description: 'Unsaved editorial work', pos_enabled: true, web_enabled: true, follows_restaurant_hours: true, hours: [], stocks: [{ menu_item_id: 99, mode: 'count', unit: '', override: 'auto', quantity: 10, expected_revision: 4 }], groups: [{ key: 'group-4', id: 4, name: 'Dishes', image_url: '', pos_enabled: true, web_enabled: true, is_hidden: false, follows_menu_hours: true, hours: [], banner_focal_x: 50, banner_focal_y: 50, item_ids: [8, 9] }] } };
}
const edit: ItemMenuAssignment = { menuId: 3, seriesKey: '', groupKey: 'group-4', groupName: 'Dishes', selected: true };

test('older item drafts restore exact groups and require review for removed groups', async () => {
  const menus = [{ id: 3, groups: [{ id: 4, name: 'Dishes' }] }] as Menu[];
  assert.deepEqual(await restoreLegacyItemAssignments(1, menus, [4]), [edit]);
  await assert.rejects(restoreLegacyItemAssignments(1, menus, [999]), /itemMenuGroupConflict/);
});

test('only the edited membership changes; order, presentation, stock and the input survive', () => {
  const state = draft();
  const original = structuredClone(state);
  const payload = applyItemMenuAssignments(state, [edit], 5);
  assert.deepEqual(state, original);
  assert.deepEqual(payload.groups[0].item_ids, [8, 9, 5]);
  assert.deepEqual(payload.stocks, original.payload.stocks);
  assert.equal(payload.description, original.payload.description);
  assert.deepEqual(applyItemMenuAssignments({ ...state, payload }, [{ ...edit, selected: false }], 5), original.payload);
});

test('a removed group, wrong series or competing group name requires review', () => {
  for (const change of [{ ...edit, groupKey: 'gone' }, { ...edit, seriesKey: '2026-11-06' }, { ...edit, create: true, groupKey: 'new', groupName: ' dishes ' }]) {
    assert.throws(() => applyItemMenuAssignments(draft(), [change], 5), /itemMenuGroupConflict/);
  }
});

test('a stable temporary group key makes an uncertain save retry idempotent', async () => {
  let state = draft(); let writes = 0;
  const change = { ...edit, groupKey: 'stable-new-key', groupName: 'Desserts', create: true };
  const api = {
    getCarteDraft: async () => structuredClone(state),
    saveCarteDraft: async (_rid: number, _mid: number, _date: string, input: Parameters<typeof import('./api').saveCarteDraft>[3]) => {
      assert.equal(input.revision, 7);
      assert.equal(input.base_fingerprint, 'baseline');
      state = { ...state, payload: input.payload, revision: 8 }; writes++;
      throw new Error('connection lost after persistence');
    },
  };
  await assert.rejects(saveItemMenuAssignments(1, 5, [change], api), /itemMenuDraftSaveFailed/);
  assert.deepEqual(await saveItemMenuAssignments(1, 5, [change], api), ['Carte']);
  assert.equal(writes, 1);
  assert.equal(state.payload.groups.length, 2);
  assert.deepEqual(state.payload.groups[1].item_ids, [5]);
});

test('each save reads the latest carte and does not replay a conflicting write automatically', async () => {
  const state = draft(); let reads = 0; let writes = 0;
  state.payload.groups[0].item_ids.push(77);
  const api = {
    getCarteDraft: async () => { reads++; return structuredClone(state); },
    saveCarteDraft: async (_rid: number, _mid: number, _date: string, input: Parameters<typeof import('./api').saveCarteDraft>[3]) => {
      writes++; assert.deepEqual(input.payload.groups[0].item_ids, [8, 9, 77, 5]); throw new Error('409');
    },
  };
  await assert.rejects(saveItemMenuAssignments(1, 5, [edit], api), /itemMenuDraftSaveFailed/);
  assert.equal(reads, 1); assert.equal(writes, 1);
});

test('a cancelled new group does not create an empty group or a save notice', async () => {
  const api = {
    getCarteDraft: async () => draft(),
    saveCarteDraft: async () => { throw new Error('must not write'); },
  };
  assert.deepEqual(await saveItemMenuAssignments(1, 5, [{ ...edit, groupKey: 'cancelled', create: true, selected: false }], api), []);
});
