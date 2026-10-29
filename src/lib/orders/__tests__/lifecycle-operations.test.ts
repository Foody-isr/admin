import assert from 'node:assert/strict';
import test from 'node:test';
import { persistLifecycleIntent, readLifecycleIntents, readLifecycleOperationResult, removeLifecycleIntent, type LifecycleIntent } from '../lifecycle-operations';
class Storage {
  values = new Map<string,string>();
  get length() { return this.values.size; }
  key(index:number) { return Array.from(this.values.keys())[index] ?? null; }
  getItem(key:string) { return this.values.get(key) ?? null; }
  setItem(key:string,value:string) { this.values.set(key,value); }
  removeItem(key:string) { this.values.delete(key); }
}
const context={api_origin:'https://api.synthetic.test',restaurant_id:19,actor_id:1};
const scope={kind:'order' as const,id:'7'};
const make=(id='00000000-0000-4000-8000-000000000001'):LifecycleIntent=>({version:1,context:{...context},created_at:1,command:{request_id:id,scope:{...scope},expected_revision:'a'.repeat(64),action:'serve',unit_keys:['hu_'+'1'.repeat(64)]}});

test('intent is durable and immutable before a request, with only technical scope fields',()=>{
 const storage=new Storage(),intent=make();
 persistLifecycleIntent(storage,intent);
 assert.deepEqual(readLifecycleIntents(storage,context,scope),[intent]);
 assert.throws(()=>persistLifecycleIntent(storage,{...intent,command:{...intent.command,unit_keys:['other']}}));
 assert.deepEqual(readLifecycleIntents(storage,context,scope),[intent]);
 for(const extra of [{...intent,token:'synthetic-secret'},{...intent,context:{...context,token:'synthetic-secret'}},{...intent,command:{...intent.command,customer_name:'Synthetic'}}])
  assert.throws(()=>persistLifecycleIntent(new Storage(),extra as LifecycleIntent));
});

test('actor, restaurant, backend and resource boundaries cannot recover another intention',()=>{
 const storage=new Storage();persistLifecycleIntent(storage,make());
 for(const changed of [{...context,actor_id:2},{...context,restaurant_id:20},{...context,api_origin:'https://other.synthetic.test'}])
  assert.deepEqual(readLifecycleIntents(storage,changed,scope),[]);
 assert.deepEqual(readLifecycleIntents(storage,context,{kind:'order',id:'8'}),[]);
 assert.deepEqual(readLifecycleIntents(storage,context,{kind:'financial_check',id:'7'}),[]);
});

test('concurrent UUIDs never overwrite each other and are reviewed separately',()=>{
 const storage=new Storage(),first=make(),second=make('00000000-0000-4000-8000-000000000002');
 persistLifecycleIntent(storage,first);persistLifecycleIntent(storage,second);
 assert.equal(readLifecycleIntents(storage,context,scope).length,2);
 removeLifecycleIntent(storage,first);
 assert.deepEqual(readLifecycleIntents(storage,context,scope),[second]);
});

test('broken or unavailable storage does not silently turn into a fresh command',()=>{
 const storage=new Storage();persistLifecycleIntent(storage,make());
 storage.setItem(storage.key(0)!, '{broken');
 assert.throws(()=>readLifecycleIntents(storage,context,scope));
 const unavailable=new Storage();unavailable.setItem=()=>{throw new Error('quota')};
 assert.throws(()=>persistLifecycleIntent(unavailable,make()));
 assert.equal(unavailable.length,0);
});

test('unconfirmed lookup keeps the exact UUID and is never interpreted as failed or confirmed',()=>{
 const command=make().command;
 assert.deepEqual(readLifecycleOperationResult({schema_version:2,request_id:command.request_id,scope,state:'unconfirmed'},command),{kind:'unconfirmed'});
 for(const value of [null,{}, {schema_version:2,request_id:command.request_id,scope:{kind:'order',id:'8'},state:'unconfirmed'}, {schema_version:2,request_id:'other',scope,state:'confirmed'}])
  assert.equal(readLifecycleOperationResult(value,command).kind,'unavailable');
 assert.equal(command.request_id,'00000000-0000-4000-8000-000000000001');
});
