import assert from 'node:assert/strict';
import test from 'node:test';
import { lifecycleV2Allows, reviewHandoffSelection } from '../lifecycle-v2';

function read() {
 const unit=(key:string,preparation_state='ready',available_actions=['serve'])=>({key,order_id:7,order_item_id:11,name:'Synthetic',details:[],quantity:1,preparation_state,handoff_state:'pending',available_actions});
 return {kind:'available',value:{schema_version:2,scope:{kind:'order',id:'7'},identities:{order_ids:[7]},revision:'a'.repeat(64),
  actions:[{key:'serve',allowed:true,reason:''},{key:'close_check',allowed:false,reason:'balance_due'}],
  units:[unit('opaque-first'),unit('opaque-second'),{...unit('opaque-held','held',[]),order_item_id:12}]}} as any;
}

test('one selected original physical unit stays one handoff without completing other units',()=>{
 const value=read();
 assert.deepEqual(reviewHandoffSelection(value,'serve',['opaque-second']),['opaque-second']);
 assert.deepEqual(value.value.units.map((unit:any)=>unit.handoff_state),['pending','pending','pending']);
});

test('selection requires both common scope permission and exact eligible unit membership',()=>{
 const value=read();
 assert.equal(lifecycleV2Allows(value,'serve'),true);
 assert.equal(lifecycleV2Allows(value,'close_check'),false);
 assert.equal(lifecycleV2Allows(value,'deliver'),false);
 for(const selected of [[],['opaque-first','opaque-first'],['foreign-unit'],['opaque-held']])
  assert.equal(reviewHandoffSelection(value,'serve',selected),null);
 value.value.actions[0].allowed=false;
 assert.equal(reviewHandoffSelection(value,'serve',['opaque-first']),null);
});

test('legacy, invalid projection and another handoff stage cannot grant a new action',()=>{
 for(const value of [{kind:'legacy'},{kind:'unavailable'}]) {
  assert.equal(lifecycleV2Allows(value as any,'serve'),false);
  assert.equal(reviewHandoffSelection(value as any,'serve',['opaque-first']),null);
 }
 assert.equal(reviewHandoffSelection(read(),'deliver',['opaque-first']),null);
});
