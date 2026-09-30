import type { KitchenPrepSummary, KitchenStockSummary } from './api';

/** Prioritizes independent discrepancies and negative balances, never fake waste. */
export function kitchenStockPriority(row: KitchenStockSummary): number {
  if (row.unexplained_qty != null && Math.abs(row.unexplained_qty) > 0.001) return 3;
  if (row.expected_remaining < -0.001) return 2;
  if (row.waste_qty > 0.001) return 1;
  return 0;
}

/** Sorts a copy so independent stock discrepancies are presented first. */
export function priorityKitchenStocks(rows: KitchenStockSummary[]): KitchenStockSummary[] {
  return [...rows].sort((a, b) => kitchenStockPriority(b) - kitchenStockPriority(a) || b.production_usage + b.order_usage - a.production_usage - a.order_usage);
}

/** Keeps negative preparation balances and unfinished objectives above routine rows. */
export function priorityKitchenPreparations(rows: KitchenPrepSummary[]): KitchenPrepSummary[] {
  const priority = (row: KitchenPrepSummary) => row.remaining_qty < -0.001 ? 3
    : row.waste_qty > 0.001 ? 2
    : row.target_qty != null && row.produced_qty < row.target_qty ? 1 : 0;
  return [...rows].sort((a, b) => priority(b) - priority(a));
}
