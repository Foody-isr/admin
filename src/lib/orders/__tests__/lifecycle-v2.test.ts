import assert from 'node:assert/strict';
import test from 'node:test';
import { formatLifecycleV2Money, readOrderLifecycleV2 } from '../lifecycle-v2';

test('an absent v2 preserves the separate v1 or legacy compatibility path', () => {
  assert.equal(readOrderLifecycleV2(undefined, 7).kind, 'legacy');
});

test('an advertised malformed or unsupported v2 never falls back to v1 or financial status', () => {
  for (const value of [null, {}, { schema_version: 1 }, { schema_version: 3 }]) {
    assert.equal(readOrderLifecycleV2(value, 7).kind, 'unavailable');
  }
});


function facts() {
  const axis = (state: string) => ({ state, evidence: [] });
  return {
    schema_version: 2, scope: { kind: 'order', id: '7' }, identities: { order_ids: [7] }, revision: 'a'.repeat(64),
    commercial: { ...axis('open'), editable: true, closed_at: null },
    payment: { ...axis('paid'), amounts: {
      availability: 'known', currency: 'ILS', minor_unit_exponent: 2,
      total_minor: 1000, captured_minor: 1000, refunded_minor: 250, net_received_minor: 750, balance_due_minor: 0,
    } },
    preparation: { ...axis('ready'), quantities: { total: 2, not_sent: 0, held: 0, in_progress: 0, ready: 2, not_tracked: 0, unknown: 0 } },
    handoff: { ...axis('complete'), tracking: 'tracked', quantities: { total: 2, pending: 0, with_courier: 0, served: 2, picked_up: 0, delivered: 0, not_tracked: 0, unknown: 0 } },
    tracking: { state: 'snapshot', preparation: 'tracked', handoff: 'tracked', captured_at: '2026-10-28T10:00:00Z' },
  };
}

test('v2 retains actual captured, refunded, net and due amounts without rewriting operational facts', () => {
  const result = readOrderLifecycleV2(facts(), 7);
  assert.equal(result.kind, 'available');
  if (result.kind !== 'available') return;
  assert.equal(result.value.payment.amounts.captured_minor, 1000);
  assert.equal(result.value.payment.amounts.refunded_minor, 250);
  assert.equal(result.value.payment.amounts.net_received_minor, 750);
  assert.equal(result.value.payment.amounts.balance_due_minor, 0);
  assert.equal(result.value.preparation.state, 'ready');
  assert.equal(result.value.handoff.state, 'complete');
});

test('partially known money preserves null as unknown, including currency and exponent', () => {
  const value = facts();
  const amounts = { availability: 'partial', currency: null, minor_unit_exponent: null,
    total_minor: 1000, captured_minor: null, refunded_minor: null, net_received_minor: null, balance_due_minor: null };
  const result = readOrderLifecycleV2({ ...value, payment: { ...value.payment, amounts } }, 7);
  assert.equal(result.kind, 'available');
  if (result.kind !== 'available') return;
  assert.deepEqual(result.value.payment.amounts, amounts);
});

test('money values must be explicit nullable safe integers, not strings, missing fields or rounded int64', () => {
  const value = facts();
  for (const change of [{ captured_minor: '1000' }, { refunded_minor: -1 },
    { total_minor: 0.5 }, { balance_due_minor: Number.MAX_SAFE_INTEGER + 1 },
    { currency: '' }, { minor_unit_exponent: 0.5 }]) {
    assert.equal(readOrderLifecycleV2({ ...value, payment: { ...value.payment, amounts: { ...value.payment.amounts, ...change } } }, 7).kind, 'unavailable');
  }
  const { refunded_minor, ...missing } = value.payment.amounts;
  assert.equal(readOrderLifecycleV2({ ...value, payment: { ...value.payment, amounts: missing } }, 7).kind, 'unavailable');
});

test('an order projection cannot silently become a bill, table session or sibling QR order', () => {
  const value = facts();
  for (const scope of [{ kind: 'financial_check', id: '7' }, { kind: 'check', id: '7' },
    { kind: 'table_session', id: '7' }, { kind: 'order', id: '8' }]) {
    assert.equal(readOrderLifecycleV2({ ...value, scope }, 7).kind, 'unavailable');
  }
  assert.equal(readOrderLifecycleV2({ ...value, identities: { order_ids: [7, 8] } }, 7).kind, 'unavailable');
});

test('public v2 rejects parent identities, staff units, staff actions and internal event histories', () => {
  const value = facts();
  assert.equal(readOrderLifecycleV2(value, 7, true).kind, 'available');
  for (const extra of [{ units: [] }, { actions: [] }, { events: [] },
    { identities: { order_ids: [7], check_id: 'synthetic-parent' } },
    { identities: { order_ids: [7], financial_check_ids: ['synthetic-parent'] } }]) {
    assert.equal(readOrderLifecycleV2({ ...value, ...extra }, 7, true).kind, 'unavailable');
  }
});


test('physical quantity partitions and review revisions are exact', () => {
 const value=facts();
 for(const revision of ['', 'a'.repeat(63), 'A'.repeat(64), 'not-a-revision'])
  assert.equal(readOrderLifecycleV2({...value,revision},7).kind,'unavailable');
 for(const quantities of [
  {...value.preparation.quantities,ready:1},
  {...value.preparation.quantities,held:-1},
  {...value.preparation.quantities,ready:0.5},
 ]) assert.equal(readOrderLifecycleV2({...value,preparation:{...value.preparation,quantities}},7).kind,'unavailable');
 assert.equal(readOrderLifecycleV2({...value,handoff:{...value.handoff,quantities:{...value.handoff.quantities,served:1}}},7).kind,'unavailable');
});

test('staff physical unit keys cannot duplicate financial shares or name a sibling order', () => {
 const value=facts();
 const unit={key:'hu_'+ '1'.repeat(64),order_id:7,order_item_id:11,name:'Synthetic item',details:[],quantity:1,preparation_state:'ready',handoff_state:'served',available_actions:[]};
 const second={...unit,key:'hu_'+ '2'.repeat(64)};
 const valid={...value,units:[unit,second]};
 assert.equal(readOrderLifecycleV2(valid,7).kind,'available');
 for(const units of [[unit,unit],[unit,{...second,order_id:8}],[unit,{...second,quantity:2}],[unit,{...second,available_actions:['financial_close_unknown']} ]])
  assert.equal(readOrderLifecycleV2({...value,units},7).kind,'unavailable');
});


test('known monetary availability requires all recorded amounts and an explicit currency exponent', () => {
 const value=facts();
 for(const field of ['currency','minor_unit_exponent','total_minor','captured_minor','refunded_minor','net_received_minor','balance_due_minor'])
  assert.equal(readOrderLifecycleV2({...value,payment:{...value.payment,amounts:{...value.payment.amounts,[field]:null}}},7).kind,'unavailable',field);
});

test('v2 partial refund is distinct from an unpaid balance and preserves actual money', () => {
 const value=facts();
 const result=readOrderLifecycleV2({...value,payment:{...value.payment,state:'partially_refunded'}},7);
 assert.equal(result.kind,'available');
 if(result.kind!=='available')return;
 assert.equal(result.value.payment.state,'partially_refunded');
 assert.equal(result.value.payment.amounts.balance_due_minor,0);
 assert.equal(result.value.payment.amounts.refunded_minor,250);
});


test('recorded money uses the explicit exponent, preserves large minor units, and never defaults a currency', () => {
 const value=facts().payment.amounts as any;
 assert.equal(formatLifecycleV2Money({...value,currency:null},'captured_minor','en-US'),undefined);
 assert.equal(formatLifecycleV2Money({...value,minor_unit_exponent:null},'captured_minor','en-US'),undefined);
 assert.equal(formatLifecycleV2Money({...value,captured_minor:null},'captured_minor','en-US'),undefined);
 assert.match(formatLifecycleV2Money({...value,currency:'JPY',minor_unit_exponent:0,captured_minor:1234},'captured_minor','en-US')!,/1,234/);
 assert.match(formatLifecycleV2Money({...value,currency:'KWD',minor_unit_exponent:3,captured_minor:981},'captured_minor','en-US')!,/0\.981/);
 assert.match(formatLifecycleV2Money({...value,captured_minor:Number.MAX_SAFE_INTEGER},'captured_minor','en-US')!,/90,071,992,547,409\.91/);
});
