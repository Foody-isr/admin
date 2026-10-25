import type {
  CarteDocument,
  SaleStockLimit,
  SaleStockRow,
  SaleStockSeries,
} from "./api";
/** Copy INITIAL allowances, never last week's remaining quantities or override. */
export function stockLimit(
  row: SaleStockRow,
  source: SaleStockSeries | null = row.config,
): SaleStockLimit {
  const mode = source?.mode ?? "";
  return {
    menu_item_id: row.item.id,
    mode,
    unit:
      source?.unit === "kg"
        ? "g"
        : source?.unit === "l"
          ? "ml"
          : (source?.unit ?? ""),
    override:
      row.config?.override ??
      (row.managed ? "auto" : (row.item.availability_override ?? "auto")),
    expected_revision: row.config?.revision ?? 0,
    quantity:
      mode === "count" || mode === "measure"
        ? (source?.counters.find((c) => c.option_id === 0)?.initial_quantity ??
          0)
        : null,
    options:
      mode === "per_variant"
        ? Object.fromEntries(
            row.sizes.map((size) => [
              size.id,
              source?.counters.find((c) => c.option_id === size.id)
                ?.initial_quantity ?? 0,
            ]),
          )
        : undefined,
  };
}
export function replaceStock(
  doc: CarteDocument,
  limit: SaleStockLimit,
): CarteDocument {
  return {
    ...doc,
    stocks: [
      ...(doc.stocks ?? []).filter(
        (s) => s.menu_item_id !== limit.menu_item_id,
      ),
      limit,
    ],
  };
}
export function moveEntry<T>(values: T[], index: number, delta: number): T[] {
  if (index + delta < 0 || index + delta >= values.length) return values;
  const next = [...values];
  [next[index], next[index + delta]] = [next[index + delta], next[index]];
  return next;
}
export function stockErrors(limit: SaleStockLimit, row: SaleStockRow): boolean {
  if (limit.mode === "") return false;
  const values =
    limit.mode === "per_variant"
      ? row.sizes.map((s) => ({ q: limit.options?.[s.id], id: s.id }))
      : [{ q: limit.quantity, id: 0 }];
  return values.some(
    ({ q, id }) =>
      q == null ||
      !Number.isSafeInteger(q) ||
      q < 0 ||
      q > 2147483647 ||
      q <
        (row.config?.counters.find((c) => c.option_id === id)?.committed ?? 0),
  );
}
