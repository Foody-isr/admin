import assert from 'node:assert/strict';
import test from 'node:test';
import { captureLifecycleActor, submitLifecycleV2, verifyLifecycleV2, LifecycleOperationApiError } from '../../api';
import type { LifecycleCommand } from '../lifecycle-operations';
class Storage { values=new Map<string,string>(); getItem(key:string){return this.values.get(key)??null} setItem(key:string,value:string){this.values.set(key,value)} }
const storage=new Storage();
function login(id:number,epoch=1) {
 const token=['synthetic',Buffer.from(JSON.stringify({sub:'user-auth',user_id:id,iat:epoch,exp:4102444800})).toString('base64url'),'signature'].join('.');
 storage.setItem('foody_restaurant_token',token);storage.setItem('foody_restaurant_user',JSON.stringify({id,role:'owner'}));
}
const command:LifecycleCommand={request_id:'00000000-0000-4000-8000-000000000001',scope:{kind:'order',id:'7'},expected_revision:'a'.repeat(64),action:'serve',unit_keys:['hu_'+'1'.repeat(64)]};
const keys=['window','fetch','localStorage','sessionStorage'] as const;
const original=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
test.before(()=>{for(const [key,value] of Object.entries({window:{},localStorage:storage,sessionStorage:new Storage()}))Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});});
test.after(()=>{for(const key of keys){const descriptor=original.get(key);if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];}});

test('profile and JWT must identify the same personal actor before dispatch',()=>{
 login(1);storage.setItem('foody_restaurant_user',JSON.stringify({id:2,role:'owner'}));
 assert.throws(()=>captureLifecycleActor(19,2),/lifecycleContextChanged/);
});

test('401 never silently refreshes or replays a lifecycle mutation',async()=>{
 login(1);const context=captureLifecycleActor(19,1);let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response('{}',{status:401})};
 await assert.rejects(submitLifecycleV2(context,command),error=>error instanceof LifecycleOperationApiError&&error.status===401);
 assert.equal(calls,1);
});

test('actor replacement during a late POST rejects the reply without any second request',async()=>{
 login(1);const context=captureLifecycleActor(19,1);let finish!:(value:Response)=>void;let calls=0,body='';
 globalThis.fetch=async(_input,options)=>{calls++;body=String(options?.body);return new Promise<Response>(resolve=>{finish=resolve})};
 const pending=submitLifecycleV2(context,command);login(2);finish(new Response('{}'));
 await assert.rejects(pending,/lifecycleContextChanged/);
 assert.equal(calls,1);assert.deepEqual(JSON.parse(body),command);
});

test('actor replacement while the body is being decoded also rejects the reply',async()=>{
 login(1);const context=captureLifecycleActor(19,1);let finish!:(value:unknown)=>void;
 globalThis.fetch=async()=>({ok:true,json:()=>new Promise(resolve=>{finish=resolve})}) as Response;
 const pending=submitLifecycleV2(context,command);await new Promise(resolve=>setImmediate(resolve));login(2);finish({state:'confirmed'});
 await assert.rejects(pending,/lifecycleContextChanged/);
});

test('verification is a no-store GET of the original request, and close has its exact separate payload',async()=>{
 login(1);const context=captureLifecycleActor(19,1);const requests:{url:string;options?:RequestInit}[]=[];
 globalThis.fetch=async(input,options)=>{requests.push({url:String(input),options});return new Response('{}')};
 await verifyLifecycleV2(context,command);
 assert.equal(requests[0].options?.method,'GET');assert.equal(requests[0].options?.body,undefined);
 assert.equal(requests[0].options?.cache,'no-store');assert.equal(requests[0].options?.credentials,'omit');assert.equal(requests[0].options?.redirect,'error');
 assert.ok(requests[0].url.includes(`/operations/${command.request_id}?scope=order&id=7`));
 await submitLifecycleV2(context,{...command,action:'close_check',unit_keys:[]});
 assert.ok(requests[1].url.endsWith('/close'));
 assert.deepEqual(JSON.parse(String(requests[1].options?.body)),{request_id:command.request_id,scope:command.scope,expected_revision:command.expected_revision});
});
