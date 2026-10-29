import assert from 'node:assert/strict';
import test from 'node:test';
import { fulfillmentCatalog, withFulfillmentCatalog, validFulfillment, fulfillmentSaveConfirmed } from '../pos-fulfillment';
import type { POSFulfillment } from '../api';
const legacy:POSFulfillment={prompt:'never',default:'pickup',enabled:['dine_in','pickup','delivery']};
const id='a9c6f72e-f702-4a60-80ef-61298cb2e523';
test('legacy catalogue keeps its default and does not enable the new Pickup preset',()=>{
 const methods=fulfillmentCatalog(legacy);assert.deepEqual(methods.map(m=>m.id),['pickup','dine_in','delivery','collect']);
 const updated=withFulfillmentCatalog(legacy,methods);assert.equal(updated.default,'pickup');assert.deepEqual(updated.enabled,['pickup','dine_in','delivery']);assert.equal(validFulfillment(updated),true);assert.equal(legacy.methods,undefined);
});

test('a save must confirm ordering, names, mapping and additive method data',()=>{
 const value=withFulfillmentCatalog(legacy,[{id,name:'Courier',order_type:'delivery',future_rule:{enabled:true}},...fulfillmentCatalog(legacy)] as NonNullable<POSFulfillment['methods']>,[id,...legacy.enabled]);
 assert.equal(fulfillmentSaveConfirmed(value,structuredClone(value)),true);
 assert.equal(fulfillmentSaveConfirmed(value,undefined),false);
 assert.equal(fulfillmentSaveConfirmed(value,{...value,prompt:'start'}),false);
 assert.equal(fulfillmentSaveConfirmed(value,{...value,methods:value.methods!.map(({id,name,order_type})=>({id,name,order_type}))}),false);
 assert.equal(fulfillmentSaveConfirmed(value,{...value,methods:[...value.methods!].reverse()}),false);
 assert.equal(fulfillmentSaveConfirmed(value,{...value,enabled:value.enabled.slice(1)}),false);
 assert.equal(fulfillmentSaveConfirmed(value,{...value,methods:value.methods!.map(m=>m.id===id?{...m,name:'Other'}:m)}),false);
 assert.equal(fulfillmentSaveConfirmed(undefined,value),true);
});
test('catalogue ordering controls active choice order and default using stable IDs',()=>{
 const methods=[{id,name:'Boutique',order_type:'dine_in' as const},...fulfillmentCatalog(legacy)];
 const value=withFulfillmentCatalog(legacy,methods,[...legacy.enabled,id]);assert.equal(value.default,id);assert.equal(value.enabled[0],id);assert.equal(validFulfillment(value),true);
 const renamed=withFulfillmentCatalog(value,methods.map(m=>m.id===id?{...m,name:'Comptoir'}:m));assert.equal(renamed.default,id);
 const removed=withFulfillmentCatalog(value,methods.filter(m=>m.id!==id));assert.equal(removed.default,'pickup');assert.equal(validFulfillment(removed),true);
});
test('empty, duplicate, unowned-reference-like and malformed catalogues are rejected locally',()=>{
 const base=withFulfillmentCatalog(legacy,fulfillmentCatalog(legacy));
 assert.equal(validFulfillment({...base,enabled:[]}),false);assert.equal(validFulfillment({...base,default:'dine_in'}),false);
 for(const method of [{id,name:'',order_type:'pickup' as const},{id:'bad',name:'Name',order_type:'pickup' as const},{id,name:'Bad\nname',order_type:'pickup' as const}]) assert.equal(validFulfillment(withFulfillmentCatalog(base,[...base.methods!,method],[...base.enabled,method.id])),false);
 assert.equal(validFulfillment({...base,enabled:['foreign'],default:'foreign'}),false);
 assert.equal(validFulfillment(withFulfillmentCatalog(base,Array.from({length:11},()=>base.methods![0]))),false);
});

test('prompt, complete active ordering and C1 controls match server validation',()=>{
 const base=withFulfillmentCatalog(legacy,fulfillmentCatalog(legacy));
 for(const prompt of ['never','start','checkout'] as const) assert.equal(validFulfillment({...base,prompt}),true);
 assert.equal(validFulfillment({...base,prompt:'unexpected' as POSFulfillment['prompt']}),false);
 assert.equal(validFulfillment({...base,enabled:[base.enabled[0],base.enabled[2],base.enabled[1]]}),false);
 for(const control of ['\u0080','\u0085','\u009f']) {
  const method={id,name:`Bad${control}name`,order_type:'pickup' as const};
  assert.equal(validFulfillment(withFulfillmentCatalog(base,[...base.methods!,method],[...base.enabled,id])),false);
 }
});

test('customer screen preferences preserve absent, true and explicit false through catalogue edits',()=>{
 const methods=[{id,name:'Counter',order_type:'pickup' as const,show_customer_information:true},...fulfillmentCatalog(legacy)];
 const value=withFulfillmentCatalog(legacy,methods,[id,...legacy.enabled]);
 const renamed=withFulfillmentCatalog(value,fulfillmentCatalog(value).map(method=>method.id===id?{...method,name:'Collection'}:method));
 assert.equal(renamed.methods?.[0].show_customer_information,true);
 assert.equal(Object.hasOwn(renamed.methods![1],'show_customer_information'),false);
 assert.equal(validFulfillment(renamed),true);
 const disabled=withFulfillmentCatalog(renamed,renamed.methods!.map(method=>method.id===id?{...method,show_customer_information:false}:method));
 assert.equal(validFulfillment(disabled),true);
 assert.equal(fulfillmentSaveConfirmed(disabled,structuredClone(disabled)),true);
 assert.equal(fulfillmentSaveConfirmed(disabled,{...disabled,methods:disabled.methods!.map(({show_customer_information,...method})=>method)}),false);
 assert.equal(fulfillmentSaveConfirmed(disabled,renamed),false);
 assert.equal(validFulfillment({...disabled,methods:disabled.methods!.map(method=>({...method,show_customer_information:'yes' as unknown as boolean}))}),false);
});


test('tracking controls preserve absent, true and explicit false by stable method ID', () => {
 const methods=[{id,name:'Counter',order_type:'pickup' as const,track_preparation:false,track_handoff:true},...fulfillmentCatalog(legacy)];
 const value=withFulfillmentCatalog(legacy,methods,[id,...legacy.enabled]);
 const renamed=withFulfillmentCatalog(value,fulfillmentCatalog(value).map(method=>method.id===id?{...method,name:'Collection'}:method));
 assert.equal((renamed.methods![0] as unknown as Record<string,unknown>).track_preparation,false);
 assert.equal((renamed.methods![0] as unknown as Record<string,unknown>).track_handoff,true);
 assert.equal(Object.hasOwn(renamed.methods![1],'track_preparation'),false);
 assert.equal(Object.hasOwn(renamed.methods![1],'track_handoff'),false);
 assert.equal(validFulfillment(renamed),true);
 assert.equal(fulfillmentSaveConfirmed(renamed,structuredClone(renamed)),true);
 for(const field of ['track_preparation','track_handoff']) {
  const truncated={...renamed,methods:renamed.methods!.map(method=>{const copy={...method} as unknown as Record<string,unknown>;delete copy[field];return copy;})};
  assert.equal(fulfillmentSaveConfirmed(renamed,truncated as unknown as POSFulfillment),false);
 }
});

test('tracking configuration rejects malformed values instead of silently treating them as tracked', () => {
 const base=withFulfillmentCatalog(legacy,fulfillmentCatalog(legacy));
 for(const field of ['track_preparation','track_handoff'])
  for(const invalid of ['false',0,1,null,{},[]]) {
   const methods=base.methods!.map((method,index)=>index===0?{...method,[field]:invalid}:method);
   assert.equal(validFulfillment({...base,methods}),false,`${field}:${JSON.stringify(invalid)}`);
  }
});
