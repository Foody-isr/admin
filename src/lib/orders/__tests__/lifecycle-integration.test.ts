import assert from 'node:assert/strict';
import test from 'node:test';
import type { Order } from '@/lib/api';
import { displayedOrderStatus, displayedPaymentStatus, lifecycleCollectionAllowed, lifecycleFinancialStateKnown } from '../status-presentation';
import { deriveOrderCapabilities } from '../order-actions';
import { buildStepperStages } from '../workflow-stepper';

function orderWithFacts(over: Partial<Order> = {}): Order {
  return {
    id: 7, restaurant_id: 19, order_type: 'dine_in', status: 'refunded', payment_status: 'refunded',
    total_amount: 20, customer_name: 'Synthetic', customer_phone: '', items: [], created_at: '2026-10-27T10:00:00Z',
    lifecycle: {
      schema_version: 1, scope: { kind: 'order', id: '7' }, identities: { order_ids: [7] },
      commercial: { state: 'closed', evidence: [] }, payment: { state: 'refunded', evidence: [] },
      preparation: { state: 'unknown', evidence: [], quantities: { total: 2, not_sent: 0, held: 0, in_progress: 0, ready: 0, unknown: 2 } },
      handoff: { state: 'complete', tracking: 'unknown', evidence: [{ source: 'order_status', state: 'served' }] },
    }, ...over,
  };
}

test('refund retains proved handoff without claiming unknown kitchen stages completed', () => {
  const order = orderWithFacts();
  assert.equal(displayedOrderStatus(order), 'served');
  assert.equal(displayedPaymentStatus(order), 'refunded');
  const stages = buildStepperStages(order, null, key => key, { cancelledLabel: 'Cancelled' });
  assert.equal(stages.find(stage => stage.kind === 'completed')?.state, 'current');
  assert.equal(stages.find(stage => stage.kind === 'in_progress')?.state, 'pending');
  assert.equal(stages.find(stage => stage.kind === 'ready')?.state, 'pending');
});

test('financial closure and paid status do not imply preparation or handoff', () => {
  const order = orderWithFacts({ status: 'in_kitchen', payment_status: 'paid' });
  order.lifecycle!.payment.state = 'paid';
  order.lifecycle!.handoff.state = 'unknown';
  assert.equal(displayedOrderStatus(order), 'lifecycle_unknown');
  const stages = buildStepperStages(order, null, key => key, { cancelledLabel: 'Cancelled' });
  assert.equal(stages.find(stage => stage.kind === 'completed')?.state, 'pending');
  assert.equal(stages.find(stage => stage.kind === 'ready')?.state, 'pending');
});

test('advertised unavailable or unknown financial facts cannot expose financial fallbacks', () => {
  for (const lifecycle of [null, { ...orderWithFacts().lifecycle!, payment: { state: 'unknown' as const, evidence: [] } }]) {
    const order = orderWithFacts({ status: 'in_kitchen', payment_status: 'unpaid', lifecycle });
    const caps = deriveOrderCapabilities(order, { canManage: true, canOverride: true });
    assert.equal(lifecycleFinancialStateKnown(order), false);
    assert.equal(caps.canTakePayment, false);
    assert.equal(caps.canCloseOrder, false);
    assert.equal(caps.canCorrectPayment, false);
    assert.equal(displayedPaymentStatus(order), 'unknown');
  }
});

test('configured stages retain their names and exact matching operational stage ID', () => {
  const order = orderWithFacts({ status: 'in_kitchen', workflow_stage_id: 12 });
  order.lifecycle!.preparation.state = 'in_progress';
  order.lifecycle!.handoff.state = 'unknown';
  const stages = buildStepperStages(order, { id: 1, order_type: 'dine_in', template_source: 'custom', stages: [
    { id: 11, name: 'Découpe', kind: 'in_progress' },
    { id: 12, name: 'Cuisson', kind: 'in_progress' },
    { id: 13, name: 'Remise', kind: 'completed' },
  ] } as any, key => key, { cancelledLabel: 'Cancelled' });
  assert.deepEqual(stages.map(stage => [stage.label, stage.state]), [['Découpe', 'done'], ['Cuisson', 'current'], ['Remise', 'pending']]);
});


test('explicit disabled handoff tracking is distinct from unknown and omits future handoff stages', () => {
  const order = orderWithFacts({ status: 'ready', payment_status: 'paid' });
  order.lifecycle!.handoff = { state: 'unknown', evidence: [], tracking: 'not_tracked' };
  order.lifecycle!.preparation.state = 'ready';
  const stages = buildStepperStages(order, null, key => key, { cancelledLabel: 'Cancelled' });
  assert.equal(stages.some(stage => stage.kind === 'completed'), false);
  order.lifecycle!.handoff.tracking = 'unknown';
  const unknown = buildStepperStages(order, null, key => key, { cancelledLabel: 'Cancelled' });
  assert.equal(unknown.some(stage => stage.kind === 'completed'), true);
});


test('v1 expected payment keeps existing eligibility without making authorization collectible', () => {
  for (const payment of ['authorized'] as const) {
    const order = orderWithFacts({ status: 'accepted', payment_status: payment });
    order.lifecycle!.payment.state = payment;
    assert.equal(lifecycleCollectionAllowed(order), false);
    assert.equal(deriveOrderCapabilities(order, { canManage: true }).canTakePayment, false);
    if (payment === 'authorized') {
      order.settlement_status = 'held';
      assert.equal(deriveOrderCapabilities(order, { canManage: true }, { onConfirmWeights: true }).canConfirmWeights, true);
    }
  }
  for (const payment of ['unpaid', 'pending', 'partially_paid'] as const) {
    const order = orderWithFacts({ status: 'accepted', payment_status: payment });
    order.lifecycle!.payment.state = payment;
    order.lifecycle!.preparation.state = 'in_progress';
    order.lifecycle!.handoff.state = 'unknown';
    assert.equal(lifecycleCollectionAllowed(order), true);
    assert.equal(deriveOrderCapabilities(order, { canManage: true }).canTakePayment, true);
    assert.equal(displayedOrderStatus(order), 'in_kitchen');
    assert.equal(deriveOrderCapabilities(order, { canManage: true }).canCloseOrder, false);
  }
});
