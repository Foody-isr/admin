import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupOrder } from '../group-order';
import type { Order, OrderItem } from '@/lib/api';

const labels = { uncategorized: 'Other', comboFallback: 'Menu' };
const adjustment = (kind: 'comp' | 'void') => ({kind, reason:'Configured reason',at:'2026-10-11T12:00:00Z'});
const line = (id: number, input: Partial<OrderItem> = {}): OrderItem => ({id,menu_item_id:id,name:`Food ${id}`,price:25,quantity:1,...input});
const order = (items: OrderItem[],total: number): Order => ({id:1,items,total_amount:total} as Order);

test('adjusted regular snapshots remain visible and contribute zero to subtotal', () => {
  const comp = line(2,{quantity:2,adjustment:adjustment('comp'),selected_variant_price:25});
  const voided = line(3,{quantity:4,adjustment:adjustment('void')});
  const result=groupOrder(order([line(1),comp,voided],25),labels);
  assert.equal(result.subtotal,25);assert.equal(result.total,25);assert.equal(result.totalUnits,3);
  assert.equal(result.regularItems.length,3);assert.equal(comp.price,25);assert.equal(comp.selected_variant_price,25);
});
test('comped combo base and premiums are excluded without changing the other combo', () => {
  const combo = (id:number,group:string,comp=false) => line(id,{price:3,combo_item_id:100,combo_group:group,combo_price:30,
    ...(comp?{adjustment:adjustment('comp')}:{})});
  const result=groupOrder(order([combo(1,'a'),combo(2,'a'),combo(3,'b',true),combo(4,'b',true)],36),labels);
  assert.deepEqual(result.comboGroups.map(group=>group.price),[36,0]);assert.equal(result.subtotal,36);
  assert.equal(result.comboGroups[1].items[0].combo_price,30);
});
test('legacy combo fallback uses billable regular rows and excludes voided units', () => {
  const result=groupOrder(order([line(1,{price:60,adjustment:adjustment('void')}),line(2,{price:0,combo_item_id:100,combo_group:'g'})],30),labels);
  assert.equal(result.comboGroups[0].price,30);assert.equal(result.subtotal,30);assert.equal(result.totalUnits,1);
});
