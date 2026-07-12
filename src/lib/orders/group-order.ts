// Canonical grouping + totals math for an order's line items.
//
// An order's rows arrive flat, but every surface that shows an order (the detail
// drawer, the printed ticket, the WhatsApp recap, foodyweb's receipt page) has to
// reassemble the same two structures from them:
//
//   - category groups — regular items bucketed by their snapshotted category,
//     in first-seen order, with uncategorized rows falling to the end.
//   - combo groups    — items sharing a `combo_group`, collapsed into one priced
//     line. Combo step items store price = price_delta (0 for non-premium picks),
//     so a combo's base price lives on `combo_price` — or, for orders created by
//     older clients that never sent it, only in the order total.
//
// This module is the single implementation of that math. It is pure: callers pass
// their own localized labels in and do their own rendering.

import type { Order, OrderItem } from '@/lib/api';

export interface OrderCategoryGroup {
  /** Category name, or '__other__' for the uncategorized bucket. */
  key: string;
  /** Localized label to display (the uncategorized bucket resolves to labels.uncategorized). */
  label: string;
  items: OrderItem[];
}

export interface OrderComboGroup {
  /** The `combo_group` key the items share. */
  key: string;
  /** Combo name, or labels.comboFallback when the row carries none. */
  name: string;
  /** The combo's step items (each priced at its delta, not its menu price). */
  items: OrderItem[];
  /** What the combo actually costs: base price + the sum of its premium deltas. */
  price: number;
}

export interface GroupedOrder {
  /** Items that are not part of a combo. */
  regularItems: OrderItem[];
  categoryGroups: OrderCategoryGroup[];
  comboGroups: OrderComboGroup[];
  /**
   * Items subtotal BEFORE discount and delivery fee, derived so the displayed
   * lines always reconcile: subtotal − discountAmount + deliveryFee = total.
   */
  subtotal: number;
  deliveryFee: number;
  discountAmount: number;
  /** The order's charged total (delivery fee and discount already applied). */
  total: number;
  /** Number of lines as displayed: regular items + one line per combo. */
  displayedLineCount: number;
  /** Sum of every row's quantity, combo step items included. */
  totalUnits: number;
}

export interface GroupOrderLabels {
  /** Label for the bucket of items with no category snapshot. */
  uncategorized: string;
  /** Label for a combo whose rows carry no combo_name. */
  comboFallback: string;
}

/** Reassemble an order's flat item rows into category groups, combo groups and reconciled totals. */
export function groupOrder(order: Order, labels: GroupOrderLabels): GroupedOrder {
  const allItems: OrderItem[] = order.items ?? [];
  const regularItems = allItems.filter((i) => !i.combo_group);

  // ─── Combo groups ───────────────────────────────────────────────────────────
  const comboMap = new Map<string, OrderItem[]>();
  for (const item of allItems) {
    if (item.combo_group) {
      const group = comboMap.get(item.combo_group) ?? [];
      group.push(item);
      comboMap.set(item.combo_group, group);
    }
  }
  const comboEntries = Array.from(comboMap.entries());

  // ─── Category groups (first-seen order, uncategorized last) ──────────────────
  const categoryOrder: string[] = [];
  const itemsByCategory = new Map<string, OrderItem[]>();
  for (const it of regularItems) {
    const key = it.category_name && it.category_name.trim() !== '' ? it.category_name : '__other__';
    if (!itemsByCategory.has(key)) {
      itemsByCategory.set(key, []);
      categoryOrder.push(key);
    }
    itemsByCategory.get(key)!.push(it);
  }
  const otherIdx = categoryOrder.indexOf('__other__');
  if (otherIdx >= 0 && categoryOrder.length > 1) {
    categoryOrder.splice(otherIdx, 1);
    categoryOrder.push('__other__');
  }
  const categoryGroups: OrderCategoryGroup[] = categoryOrder.map((key) => ({
    key,
    label: key === '__other__' ? labels.uncategorized : key,
    items: itemsByCategory.get(key)!,
  }));

  // ─── Combo pricing ──────────────────────────────────────────────────────────
  const regularTotal = regularItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const comboDeltasTotal = comboEntries.reduce(
    (s, [, items]) => s + items.reduce((gs, i) => gs + i.price * i.quantity, 0),
    0,
  );
  // Fallback for orders created before the server sent combo_price: split what's
  // left of the order total evenly across the combos.
  const remainingForCombos = Math.max(0, (order.total_amount ?? 0) - regularTotal - comboDeltasTotal);
  const comboCount = comboEntries.length;
  const basePriceFor = (items: OrderItem[]): number => {
    const fromServer = items[0]?.combo_price;
    if (fromServer && fromServer > 0) return fromServer;
    return comboCount > 0 ? remainingForCombos / comboCount : 0;
  };

  const comboGroups: OrderComboGroup[] = comboEntries.map(([key, items]) => {
    const deltas = items.reduce((gs, i) => gs + i.price * i.quantity, 0);
    return {
      key,
      name: items[0]?.combo_name || labels.comboFallback,
      items,
      price: basePriceFor(items) + deltas,
    };
  });

  // ─── Totals ─────────────────────────────────────────────────────────────────
  const combosSubtotal = comboGroups.reduce((s, g) => s + g.price, 0);
  const total = order.total_amount ?? regularTotal + combosSubtotal;
  const deliveryFee = order.delivery_fee ?? 0;
  const discountAmount = order.discount_amount ?? 0;
  // Derive the subtotal from the total so the displayed lines always add up. With
  // neither a fee nor a discount, the item sum is exact and avoids inheriting any
  // rounding drift from total_amount.
  const subtotal =
    deliveryFee > 0 || discountAmount > 0
      ? total + discountAmount - deliveryFee
      : regularTotal + combosSubtotal;

  return {
    regularItems,
    categoryGroups,
    comboGroups,
    subtotal,
    deliveryFee,
    discountAmount,
    total,
    displayedLineCount: regularItems.length + comboGroups.length,
    totalUnits: allItems.reduce((s, i) => s + i.quantity, 0),
  };
}
