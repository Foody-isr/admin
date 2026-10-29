import assert from 'node:assert/strict';
import test from 'node:test';
import type { Order } from '@/lib/api';
import { displayedOrderStatus, displayedPaymentStatus } from '../status-presentation';
import { deriveOrderCapabilities } from '../order-actions';

function order():Order {
 const axis=(state:string)=>({state,evidence:[]});
 return {id:7,restaurant_id:19,order_type:'dine_in',status:'served',payment_status:'paid',total_amount:10,customer_name:'Synthetic',customer_phone:'',items:[],created_at:'2026-10-28T10:00:00Z',
 lifecycle_v2:{schema_version:2,scope:{kind:'order',id:'7'},identities:{order_ids:[7]},revision:'a'.repeat(64),
 commercial:{...axis('closed'),editable:false,closed_at:'2026-10-28T10:00:00Z'},
 payment:{...axis('partially_refunded'),amounts:{availability:'known',currency:'ILS',minor_unit_exponent:2,total_minor:1000,captured_minor:1000,refunded_minor:250,net_received_minor:750,balance_due_minor:0}},
 preparation:{...axis('held'),quantities:{total:2,not_sent:0,held:2,in_progress:0,ready:0,not_tracked:0,unknown:0}},
 handoff:{...axis('pending'),tracking:'tracked',quantities:{total:2,pending:2,with_courier:0,served:0,picked_up:0,delivered:0,not_tracked:0,unknown:0}},
 tracking:{state:'snapshot',preparation:'tracked',handoff:'tracked',captured_at:'2026-10-28T10:00:00Z'},actions:[]}} as unknown as Order;
}

test('v2 operational facts replace legacy served independently from partial refund and closure',()=>{
 const value=order();
 assert.equal(displayedOrderStatus(value),'lifecycle_held');
 assert.equal(displayedPaymentStatus(value),'partially_refunded');
});

test('v2 absent staff actions grant no inferred edit, collection, cancellation or handoff',()=>{
 const value={...order(),status:'in_kitchen',payment_status:'unpaid'} as Order;
 const caps=deriveOrderCapabilities(value,{canManage:true,canOverride:true});
 assert.equal(caps.primary,null);
 assert.equal(caps.canEditOrder,false);
 assert.equal(caps.canTakePayment,false);
 assert.equal(caps.canCancelOrder,false);
 assert.equal(caps.canCloseOrder,false);
});

test('malformed advertised v2 cannot be replaced by v1, paid flags or global food status',()=>{
 const value={...order(),lifecycle_v2:null} as unknown as Order;
 assert.equal(displayedOrderStatus(value),'lifecycle_unknown');
 assert.equal(displayedPaymentStatus(value),'unknown');
 const caps=deriveOrderCapabilities(value,{canManage:true});
 assert.equal(caps.primary,null);
 assert.equal(caps.canTakePayment,false);
 assert.equal(caps.canCloseOrder,false);
});

test('manual collection uses the recorded due only, with exact dialog currency and precision',async()=>{
 const { manualCollectionAmount }=await import('../status-presentation');
 const value=order();
 value.lifecycle_v2!.payment.amounts.balance_due_minor=400;
 assert.equal(manualCollectionAmount(value,'ILS'),4);
 assert.equal(value.total_amount,10);
 assert.equal(manualCollectionAmount(value,'USD'),undefined);
 value.lifecycle_v2!.payment.amounts.minor_unit_exponent=3;
 assert.equal(manualCollectionAmount(value,'ILS'),undefined);
 value.lifecycle_v2!.payment.amounts.minor_unit_exponent=2;
 value.lifecycle_v2!.payment.amounts.balance_due_minor=null;
 value.lifecycle_v2!.payment.amounts.availability='partial';
 assert.equal(manualCollectionAmount(value,'ILS'),undefined);
 assert.equal(manualCollectionAmount({...value,lifecycle_v2:undefined,balance_due:3},'ILS'),3);
});

test('prepared Sumit checkout keeps its provider guards when lifecycle v2 otherwise allows normal editing and collection',()=>{
 const value=order();
 value.status='accepted';
 value.payment_status='pending';
 value.lifecycle_v2!.commercial={state:'open',evidence:[],editable:true,closed_at:null};
 value.lifecycle_v2!.payment.state='pending';
 value.lifecycle_v2!.payment.amounts={availability:'known',currency:'ILS',minor_unit_exponent:2,total_minor:1000,captured_minor:0,refunded_minor:0,net_received_minor:0,balance_due_minor:1000};
 value.lifecycle_v2!.actions=[{key:'edit',allowed:true,reason:''},{key:'collect_payment',allowed:true,reason:''}];
 const permissions={canManage:true,canOverride:true,currencyCode:'ILS'};
 const handlers={onToggleForceProduction:true,onCorrectPayment:true,onReactivate:true};
 const ordinary=deriveOrderCapabilities(value,permissions,handlers);
 assert.equal(ordinary.canEditOrder,true);
 assert.equal(ordinary.canTakePayment,true);
 for(const mode of ['link','card']) {
  const prepared={...value,external_metadata:{internal_checkout:{mode}}};
  const caps=deriveOrderCapabilities(prepared,permissions,handlers);
  assert.equal(caps.canEditOrder,false,mode);
  assert.equal(caps.canTakePayment,false,mode);
  assert.equal(caps.canCorrectPayment,false,mode);
  assert.equal(caps.canForceProduction,false,mode);
  const cancelled={...prepared,status:'rejected',lifecycle_v2:{...value.lifecycle_v2!,commercial:{state:'cancelled' as const,evidence:[],editable:false,closed_at:null}}} as Order;
  assert.equal(deriveOrderCapabilities(cancelled,permissions,handlers).canReactivate,false,mode);
 }
});
