import assert from 'node:assert/strict';
import test from 'node:test';
import { fulfillmentCatalog, withFulfillmentCatalog, validFulfillment } from '../pos-fulfillment';
import type { POSFulfillment } from '../api';
const legacy:POSFulfillment={prompt:'never',default:'pickup',enabled:['dine_in','pickup','delivery']};
const id='a9c6f72e-f702-4a60-80ef-61298cb2e523';
test('legacy catalogue keeps its default and does not enable the new Pickup preset',()=>{
 const methods=fulfillmentCatalog(legacy);assert.deepEqual(methods.map(m=>m.id),['pickup','dine_in','delivery','collect']);
 const updated=withFulfillmentCatalog(legacy,methods);assert.equal(updated.default,'pickup');assert.deepEqual(updated.enabled,['pickup','dine_in','delivery']);assert.equal(validFulfillment(updated),true);assert.equal(legacy.methods,undefined);
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
