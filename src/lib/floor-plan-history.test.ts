import assert from 'node:assert/strict';
import test from 'node:test';
import { floorPlanHistoryReducer, type FloorPlanHistory } from './floor-plan-history';

test('a complete drag is one undo step and a new edit clears redo', () => {
  let state: FloorPlanHistory<{ x: number; width: number }> = { present:{ x:10, width:8 }, past:[], future:[] };
  state = floorPlanHistoryReducer(state, { type:'begin' });
  for (const x of [12,14,19]) state = floorPlanHistoryReducer(state, { type:'update', update: p => ({ ...p, x }) });
  state = floorPlanHistoryReducer(state, { type:'end' });
  assert.equal(state.past.length,1);
  state = floorPlanHistoryReducer(state, { type:'undo' });
  assert.equal(state.present.x,10);
  state = floorPlanHistoryReducer(state, { type:'redo' });
  assert.equal(state.present.x,19);
  state = floorPlanHistoryReducer(state, { type:'undo' });
  state = floorPlanHistoryReducer(state, { type:'update', update: p => ({...p, width:12}) });
  assert.equal(state.future.length,0);
});
