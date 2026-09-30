import type { DailyPlanItem, PrepItem } from '@/lib/api';

/** Calculates a production suggestion for an explicit remaining-service target. */
export function serviceProductionNeed(item: PrepItem, required: number): DailyPlanItem {
  const shortfall = Math.max(0, required - item.quantity);
  return {
    prep_item_id: item.id, prep_item_name: item.name, unit: item.unit,
    current_qty: item.quantity, required_qty: required, shortfall_qty: shortfall,
    batches_needed: item.yield_per_batch > 0 ? Math.ceil(shortfall / item.yield_per_batch) : 0,
    yield_per_batch: item.yield_per_batch, shelf_life_hours: item.shelf_life_hours,
    category: item.category, priority: shortfall > 0 ? 'high' : 'low',
  };
}
