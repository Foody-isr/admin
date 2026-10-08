export type OrderJourneyScreen = "cart" | "checkout" | "confirmation";
export type OrderJourneyColorStyle = "default" | `style-${1 | 2 | 3 | 4 | 5 | 6}`;
export type OrderJourneyColors = Partial<Record<OrderJourneyScreen, OrderJourneyColorStyle>>;

/** Keeps screen assignments limited to shared styles; default inherits the menu. */
export function normalizeOrderJourneyColors(value: unknown): OrderJourneyColors {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  const result: OrderJourneyColors = {};
  for (const screen of ["cart", "checkout", "confirmation"] as const) {
    const id = source[screen];
    if (typeof id === "string" && /^(default|style-[1-6])$/.test(id)) {
      result[screen] = id as OrderJourneyColorStyle;
    }
  }
  return result;
}

/** Resolves each screen independently, so changing payment never recolours the cart. */
export function orderJourneyColorStyle(value: unknown, screen: OrderJourneyScreen, menuStyle: string): string {
  const id = normalizeOrderJourneyColors(value)[screen];
  return id && id !== "default" ? id : menuStyle;
}
