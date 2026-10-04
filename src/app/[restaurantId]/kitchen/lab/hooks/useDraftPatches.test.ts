import assert from 'node:assert/strict';
import test from 'node:test';
import { applyPatches } from './useDraftPatches';
import { normalizeLabDraftPayload } from '../normalizePayload';
import type { DraftPayload } from '../types';

const recipe=()=>normalizeLabDraftPayload({components:[{kind:'stock_existing',stock_item_id:'1',qty:100,unit:'g'},{kind:'prep_new',qty:1,unit:'portion',ingredients:[{kind:'stock_existing',stock_item_id:'2',qty:20,unit:'ml'}]}]} as DraftPayload);
test('ignores AI quantity patches targeting absent components or nested ingredients',()=>{const source=recipe();assert.deepEqual(applyPatches(source,[{op:'set_qty',path:'components[9]',new_qty:1},{op:'set_qty',path:'components[1].ingredients[9]',new_qty:1}]),source);});
test('applies zero quantities and nested unit edits without mutating the original recipe',()=>{const source=recipe();const next=applyPatches(source,[{op:'set_qty',path:'components[0]',new_qty:0},{op:'set_qty',path:'components[1].ingredients[0]',new_qty:1,new_unit:'l'}]);assert.equal(next.components[0].qty,0);assert.equal(next.components[1].ingredients![0].unit,'l');assert.equal(source.components[0].qty,100);assert.equal(source.components[1].ingredients![0].unit,'ml');});
test('unsupported AI paths cannot modify unrelated draft fields',()=>{const source=recipe();assert.deepEqual(applyPatches(source,[{op:'set_qty',path:'cost_summary.selling_price',new_qty:0}]),source);});
